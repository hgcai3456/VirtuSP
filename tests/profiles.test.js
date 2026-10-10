"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  blank,
  fact,
  importCsv,
  csvRows,
  validate,
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
});
test("Ready profile publishes only with explicit review and mapped objectives", () => {
  const p = ready();
  assert.equal(validate(p).filter((i) => i.severity === "error").length, 0);
  p.facts[0].reviewed = false;
  assert.ok(validate(p).some((i) => i.message.includes("review")));
  p.facts[0].reviewed = true;
  p.obj[0].f = ["missing"];
  assert.ok(validate(p).some((i) => i.message.includes("fact IDs")));
});
test("Measurement data requires units, context, date; weights and gates validated", () => {
  const p = ready();
  p.facts[0].lab = true;
  assert.ok(validate(p).some((i) => i.message.includes("measurements")));
  p.facts[0].unit = "mmHg";
  p.facts[0].ref = "Faculty reference";
  p.facts[0].date = "2026-10-10";
  p.facts[0].gate = 1;
  assert.ok(validate(p).some((i) => i.message.includes("deflection")));
  p.facts[0].deflect = "Not yet.";
  p.obj[0].w = 0;
  assert.ok(validate(p).some((i) => i.message.includes("100")));
});
module.exports = { ready };
