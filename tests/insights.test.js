"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const insights = require("../lib/insights");
const { anchors } = require("../lib/assessment");
let seq = 0;
// A completed encounter with just the fields the summaries read.
function visit({
  studentId = "s1",
  name = "Pat",
  age = 50,
  gender = "female",
  ethnicity = "",
  total = 14,
  empathy = 2,
  objectives = 50,
  attemptId = null,
  provider = "bedrock",
  open = 1,
  questions = 4,
}) {
  const id = "enc" + ++seq;
  const events = [];
  for (let i = 0; i < questions; i++) {
    events.push({ id: `${id}-q${i}`, type: "student", text: "?" });
    events.push({
      id: `${id}-c${i}`,
      type: "communication",
      openQuestion: i < open,
      empathy: false,
      judgmental: false,
    });
  }
  return {
    id,
    studentId,
    attemptId,
    status: "complete",
    createdAt: "2026-10-10T10:00:00.000Z",
    completedAt: `2026-10-10T10:${String(10 + seq).padStart(2, "0")}:00.000Z`,
    p: { id: "p-" + name, name, age, gender, ethnicity },
    events,
    assessment: {
      provider,
      total,
      denominator: 28,
      domains: anchors.map((a) => ({
        domain: a.domain,
        score: a.domain === 2 ? empathy : 2,
      })),
      coaching: {
        objectivePercent: objectives,
        findings: { elicited: [1], total: 4 },
      },
    },
  };
}
function store(encounters, extra = {}) {
  return {
    state: {
      students: {
        s1: { id: "s1", alias: "Student A" },
        s2: { id: "s2", alias: "Student B" },
      },
      encounters: Object.fromEntries(encounters.map((e) => [e.id, e])),
      attempts: {},
      groups: {},
      ...extra,
    },
  };
}
test("Variance levels follow the widest rubric or empathy gap between patient groups", () => {
  const s = store([
    visit({ gender: "female", total: 21, empathy: 3 }),
    visit({ gender: "female", total: 21, empathy: 3 }),
    visit({ gender: "male", total: 14, empathy: 2 }),
    visit({ gender: "male", total: 14, empathy: 2, age: 70 }),
  ]);
  const board = insights.facultyView(s, anchors);
  const a = board.students.find((x) => x.student.id === "s1");
  assert.equal(a.kpis.n, 4);
  assert.equal(a.kpis.rubricPct, 62.5);
  const gender = a.variance.dimensions.find((d) => d.id === "gender");
  assert.equal(gender.level, "notable");
  assert.equal(gender.smallSample, true);
  assert.deepEqual(
    gender.groups.map((g) => [g.label, g.n, g.rubricPct]),
    [
      ["Female", 2, 75],
      ["Male", 2, 50],
    ],
  );
  assert.match(gender.summary, /Female patients and .* Male patients/);
  // Visits in the lower-scoring group carry the flag; the others do not.
  assert.deepEqual(
    a.encounters
      .map((m) => [m.gender, m.biasFlags.some((f) => f.id === "gender")])
      .sort(),
    [
      ["Female", false],
      ["Female", false],
      ["Male", true],
      ["Male", true],
    ],
  );
  assert.equal(a.biasRated, true);
  // The student's own copy names the flag without the faculty comparison.
  const own = insights.studentView(s, "s1", anchors).me;
  assert.equal(
    own.encounters.find((m) => m.gender === "Male").biasFlags[0].label,
    "Gender variance",
  );
  // Nothing recorded for ethnicity, so nothing is claimed.
  const ethnicity = a.variance.dimensions.find((d) => d.id === "ethnicity");
  assert.equal(ethnicity.level, "insufficient");
  assert.equal(a.variance.overall, "notable");
  // A student with no visits is never rated.
  const b = board.students.find((x) => x.student.id === "s2");
  assert.equal(b.variance.overall, "insufficient");
  assert.equal(b.kpis.n, 0);
  // One student with data is not a cohort.
  assert.equal(board.cohort, null);
});
test("Equal performance across groups is minimal, and provisional ratings are not compared", () => {
  const same = insights.dimension(
    "gender",
    "Gender",
    [
      visit({ gender: "female" }),
      visit({ gender: "female" }),
      visit({ gender: "male" }),
      visit({ gender: "male" }),
    ].map(insights.metrics),
    (m) => m.gender,
  );
  assert.equal(same.level, "minimal");
  // One visit with each group is listed but never rated.
  const thin = insights.dimension(
    "gender",
    "Gender",
    [
      visit({ gender: "female", total: 28 }),
      visit({ gender: "male", total: 7 }),
    ].map(insights.metrics),
    (m) => m.gender,
  );
  assert.equal(thin.level, "insufficient");
  assert.equal(thin.groups.length, 2);
  assert.match(thin.summary, /Too few visits to rate/);
  const provisional = insights.dimension(
    "gender",
    "Gender",
    [
      visit({
        gender: "female",
        provider: "local-provisional",
        objectives: 80,
      }),
      visit({ gender: "male", provider: "local-provisional", objectives: 20 }),
    ].map(insights.metrics),
    (m) => m.gender,
    1,
  );
  // Placeholder rubric scores are ignored; objectives still give a signal.
  assert.equal(provisional.groups[0].rubricPct, null);
  assert.equal(provisional.widest.key, "objectivePct");
  assert.equal(provisional.level, "notable");
});
test("A student sees only their own released visits and no variance analysis", () => {
  const held = visit({ attemptId: "a1", total: 28 });
  const s = store(
    [visit({ total: 14 }), held, visit({ studentId: "s2", total: 7 })],
    {
      attempts: {
        a1: { id: "a1", studentId: "s1", status: "active", trials: [] },
      },
    },
  );
  const mine = insights.studentView(s, "s1", anchors);
  assert.equal(mine.me.encounters.length, 1);
  assert.equal(mine.me.kpis.rubricPct, 50);
  const sent = JSON.stringify(mine);
  // Field names, quoted: rubric wording may itself use these words.
  for (const hidden of [
    '"variance"',
    '"notes"',
    '"limitations"',
    '"occupation"',
    '"judgmentalLines"',
    held.id,
  ])
    assert.ok(!sent.includes(hidden), hidden);
  // Faculty see the held visit too.
  const faculty = insights.facultyView(s, anchors);
  assert.equal(
    faculty.students.find((x) => x.student.id === "s1").encounters.length,
    2,
  );
  // Two students with scored visits make a cohort.
  assert.equal(faculty.cohort.students, 2);
  assert.throws(() => insights.studentView(s, "nobody", anchors));
});
test("Matched comparison groups are compared trial against trial", () => {
  const one = visit({
    name: "Omar",
    ethnicity: "African-American",
    attemptId: "a1",
    total: 21,
    empathy: 3,
  });
  const two = visit({
    name: "Alex",
    ethnicity: "White",
    attemptId: "a1",
    total: 14,
    empathy: 2,
  });
  const s = store([one, two], {
    groups: {
      g1: { id: "g1", title: "Dyslipidemia comparison", kind: "comparison" },
    },
    attempts: {
      a1: {
        id: "a1",
        studentId: "s1",
        groupId: "g1",
        status: "complete",
        trials: [{ encounterId: one.id }, { encounterId: two.id }],
      },
    },
  });
  const v = insights.variance(s, s.state.students.s1);
  assert.equal(v.comparisons.length, 1);
  assert.deepEqual(v.comparisons[0].differs, ["ethnicity"]);
  assert.equal(v.comparisons[0].level, "notable");
  assert.equal(v.overall, "notable");
});
test("Occupation, weight and substance groups are read from the case, or set by faculty", () => {
  const read = insights.tagsOf({
    original: {
      background: "Small aircraft mechanic",
      notes: "BMI of 31. Smokes ten cigarettes a day.",
    },
  });
  assert.deepEqual(read, {
    occupation: "Manual or trade work",
    weight: "BMI 30 or above",
    substance: "Substance use in the case",
  });
  // Nothing in the case means no group, not a guess.
  assert.equal(insights.tagsOf({ original: {} }).weight, "");
  assert.equal(insights.tagsOf({}).substance, "");
  // Faculty tags win over the automatic reading.
  assert.equal(
    insights.tagsOf({
      original: { background: "Mechanic" },
      biasTags: { occupation: "Skilled trade" },
    }).occupation,
    "Skilled trade",
  );
  const s = store([
    visit({ name: "A", total: 21 }),
    visit({ name: "A", total: 21 }),
    visit({ name: "B", total: 7 }),
    visit({ name: "B", total: 7 }),
  ]);
  for (const e of Object.values(s.state.encounters))
    e.p.original = {
      background: e.p.name === "A" ? "Office manager" : "Warehouse worker",
    };
  const v = insights.variance(s, s.state.students.s1);
  assert.deepEqual(
    v.dimensions.map((d) => d.id),
    ["age", "ethnicity", "occupation", "gender", "substance", "weight"],
  );
  const occupation = v.dimensions.find((d) => d.id === "occupation");
  assert.equal(occupation.level, "notable");
  assert.equal(occupation.basis, "text");
  assert.equal(occupation.examples[0].group, "Manual or trade work");
});
test("Faculty notes are saved per student and validated", () => {
  const s = store([]);
  const saved = insights.saveNotes(s, "s1", {
    text: "Discuss pacing.",
    flagged: true,
  });
  assert.equal(saved.text, "Discuss pacing.");
  assert.equal(saved.flagged, true);
  assert.equal(
    insights.facultyView(s, anchors).students[0].notes.text,
    "Discuss pacing.",
  );
  // Modules are assigned per student; the student sees only their own.
  insights.assignModule(s, "s1", "age", true);
  assert.deepEqual(
    insights.studentView(s, "s1", anchors).me.modules.map((m) => m.code),
    ["Mod #508"],
  );
  assert.equal(insights.studentView(s, "s2", anchors).me.modules.length, 0);
  assert.equal(
    insights.assignModule(s, "s1", "age", false).filter((m) => m.assignedAt)
      .length,
    0,
  );
  assert.throws(() => insights.assignModule(s, "s1", "nothing", true));
  insights.saveNotes(s, null, { text: "Demo visits." });
  assert.ok(s.state.facultyNotes[insights.UNASSIGNED]);
  assert.throws(() => insights.saveNotes(s, "nobody", { text: "x" }));
  assert.throws(() => insights.saveNotes(s, "s1", { text: 5 }));
});
