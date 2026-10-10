"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  blank,
  seedFromStarter,
  fact,
  importCsv,
  csvRows,
  validate,
  documentAwarenessFacts,
} = require("../lib/profiles");
function ready() {
  const p = blank();
  p.name = "Fresh Patient";
  p.age = 42;
  p.facts = [
    fact("concern", "Fatigue", {
      say: "I feel tired.",
      kw: ["tired"],
      reviewed: true,
    }),
  ];
  p.sources = [
    {
      id: "faculty",
      title: "Synthetic faculty scenario",
      excerpt: "Explicitly authored fatigue.",
      reviewed: true,
    },
  ];
  p.obj = [
    {
      id: "objective",
      t: "Explore fatigue",
      w: 100,
      ty: "fact",
      f: ["concern"],
      tip: "Ask about the concern.",
    },
  ];
  p.reviewAcknowledged = true;
  return p;
}
test("CSV preserves eight UUIDs, original notes, quoted commas and spelling normalization", () => {
  const data = fs.readFileSync("corpus/faculty-patients.csv", "utf8"),
    patients = importCsv(data);
  assert.equal(patients.length, 8);
  assert.equal(new Set(patients.map((p) => p.id)).size, 8);
  assert.equal(
    patients.find((p) => p.name === "Omar Sinclair").id,
    "b5814549-fd2b-42a2-af78-9b681ad6f268",
  );
  assert.equal(patients[0].ethnicity, "Asian Indian");
  assert.ok(patients[0].original.notes.includes("1-2 times"));
  assert.ok(
    patients.every(
      (p) =>
        !p.reviewAcknowledged &&
        !p.facts.some((f) => /no allergies/i.test(f.say)),
    ),
  );
  assert.ok(
    patients.every((p) => validate(p).some((i) => i.severity === "error")),
  );
});
test("CSV supports multiline, escaped quotes, rejects malformed rows", () => {
  const rows = csvRows('a,b\r\n"one,two","line 1\nline 2 ""quoted"""\r\n');
  assert.equal(rows[0].a, "one,two");
  assert.ok(rows[0].b.includes("line 2"));
  assert.throws(() => csvRows("a,b\nx"));
  assert.throws(() => csvRows('a,b\n"x,y'));
  assert.equal(
    importCsv("patient-name,age\nSynthetic Missing,\n")[0].age,
    null,
  );
});
test("Starter fields seed identity and a faculty-authored opening concern", () => {
  const empty = seedFromStarter({});
  assert.equal(empty.name, "New Patient");
  assert.equal(empty.facts.length, 0);
  const p = seedFromStarter({
    name: "Pat Rivera",
    age: "33",
    personality: "Calm",
    concern: "I get winded on stairs.",
  });
  assert.equal(p.name, "Pat Rivera");
  assert.equal(p.age, 33);
  assert.equal(p.intro, "Hello, I'm Pat.");
  assert.equal(p.facts[0].id, "concern");
  assert.equal(p.facts[0].say, "I get winded on stairs.");
});
test("Ready profile publishes only with explicit review and mapped objectives", () => {
  const p = ready();
  assert.equal(validate(p).filter((i) => i.severity === "error").length, 0);
  p.facts[0].reviewed = false;
  assert.equal(
    validate(p).filter((i) => i.severity === "error").length,
    0,
    "The whole-profile acknowledgment covers record review",
  );
  p.reviewAcknowledged = false;
  assert.ok(validate(p).some((i) => i.message.includes("review")));
  p.reviewAcknowledged = true;
  p.obj[0].f = ["missing"];
  assert.ok(validate(p).some((i) => i.message.includes("fact IDs")));
});
test("Report dates can stay unspecified; explicit document dates are extracted without guessing", () => {
  const { documentDate, approveRecords } = require("../lib/profiles");
  const p = ready();
  p.artifacts = [
    {
      id: "note",
      title: "Prior note",
      src: "faculty",
      date: "",
      sec: "notes",
      release: "section",
      unlock: [],
      facts: ["concern"],
      reviewed: false,
    },
  ];
  assert.equal(validate(p).filter((i) => i.severity === "error").length, 0);
  approveRecords(p);
  assert.equal(p.artifacts[0].reviewed, true);
  assert.equal(p.artifacts[0].date, "");
  assert.equal(documentDate("Note date: 2026-10-10"), "2026-10-10");
  assert.equal(documentDate("No date supplied."), "");
  assert.equal(documentDate("Date: 2026-02-30"), "");
  assert.equal(documentDate("Date: 2026-10-10 Date: 2026-10-11"), "");
});
test("Missing measurement metadata warns without blocking; weights and gates stay validated", () => {
  const p = ready();
  p.facts[0].lab = true;
  assert.ok(
    validate(p).some(
      (i) => i.severity === "warning" && i.message.includes("measurement"),
    ),
  );
  assert.equal(validate(p).filter((i) => i.severity === "error").length, 0);
  assert.equal(p.facts[0].unit, undefined);
  p.facts[0].unit = "mmHg";
  p.facts[0].ref = "Faculty reference";
  p.facts[0].date = "2026-10-10";
  p.facts[0].gate = 1;
  assert.ok(validate(p).some((i) => i.message.includes("deflection")));
  p.facts[0].deflect = "Not yet.";
  p.obj[0].w = 0;
  assert.ok(validate(p).some((i) => i.message.includes("100")));
});
test("Sparse faculty cases publish without invented age, sources or objectives", async () => {
  const p = ready();
  p.age = null;
  p.obj = [];
  p.sources = [];
  p.facts[0].lab = true;
  p.artifacts = [
    {
      id: "lab",
      title: "Undated result",
      src: "Faculty authored",
      sec: "labs",
      facts: ["concern"],
      rows: [{ name: "Supplied test", value: "123" }],
    },
  ];
  assert.equal(validate(p).filter((i) => i.severity === "error").length, 0);
  const engine = require("../lib/engine");
  const enc = engine.create(p);
  assert.match(
    enc.p.facts.find((f) => f.id === "$identity").say,
    /age hasn't been specified/,
  );
  const rubric = require("../lib/caseRubric");
  assert.equal(rubric.forProfile(p), null);
  await engine.complete(enc);
  assert.equal(enc.assessment.coaching.objectivePercent, null);
  assert.equal(enc.assessment.objectives.length, 0);
  p.age = -1;
  assert.ok(
    validate(p).some(
      (i) => i.severity === "error" && i.message.includes("Age"),
    ),
  );
});
test("Document awareness names the attached record without copying result values", () => {
  const [diary] = documentAwarenessFacts([
    {
      id: "vb-lab",
      kind: "lab",
      title: "Headache diary summary",
      date: "2026-09-28",
      sec: "labs",
      src: "Note N-0928",
      rows: [{ name: "Headache days", value: "26" }],
    },
  ]);
  assert.match(diary.say, /headache diary/i);
  assert.match(diary.say, /September 28/);
  assert.doesNotMatch(diary.say, /26/);
  assert.ok(diary.kw.includes("journal"));
  const [labs] = documentAwarenessFacts([
    {
      id: "np-lab",
      kind: "lab",
      title: "Respiratory check RT-1008",
      date: "2026-10-08",
      sec: "labs",
      rows: [{ name: "Peak flow", value: "210" }],
    },
  ]);
  assert.match(labs.say, /respiratory check/i);
  assert.doesNotMatch(labs.say, /210|journal/i);
});
module.exports = { ready };
