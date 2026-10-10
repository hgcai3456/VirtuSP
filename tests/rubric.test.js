"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine"),
  cloud = require("../lib/cloud");
const { anchors, rubricInfo, describe } = require("../lib/assessment");
const caseRubric = require("../lib/caseRubric");
const organizer = require("../corpus/encounter_evaluation_rubric.json");
function profile(extra = {}) {
  return {
    ...blank(),
    name: "Sam Synthetic",
    version: 1,
    age: 9,
    facts: [
      fact("concern", "Trouble hearing in class", {
        say: "I can't hear my teacher.",
        topic: "Reason for visit",
        kw: ["bring", "hear"],
      }),
    ],
    artifacts: [],
    obj: [],
    sources: [],
    ...extra,
  };
}
test("Encounter rubric matches the organizer file word for word", () => {
  assert.equal(anchors.length, 7);
  organizer.domains.forEach((d, i) => {
    assert.equal(anchors[i].domain, d.id);
    assert.equal(anchors[i].name, d.name);
    assert.equal(anchors[i].strong, d.descriptors["4"]);
    assert.equal(anchors[i].competent, d.descriptors["3"]);
    assert.equal(anchors[i].developing, d.descriptors["2"]);
    assert.equal(anchors[i].absent, d.descriptors["1"]);
    assert.equal(anchors[i].triggersReview, d.triggers_review_if_score_1);
  });
  assert.equal(rubricInfo.title, organizer.title);
  assert.equal(rubricInfo.instructions, organizer.instructions);
  assert.equal(rubricInfo.maxTotal, 28);
  assert.equal(rubricInfo.interpretation, organizer.scoring.interpretation);
  assert.deepEqual(rubricInfo.reviewDomains, [6, 7]);
  assert.deepEqual(
    rubricInfo.scale.map((r) => r.label),
    ["Strong", "Competent", "Developing", "Unsafe or absent"],
  );
  const two = describe({ domain: 1, score: 2 });
  assert.equal(two.label, "Developing");
  assert.equal(two.descriptor, organizer.domains[0].descriptors["2"]);
  assert.equal(two.nextLevel.label, "Competent");
  assert.equal(two.nextLevel.descriptor, organizer.domains[0].descriptors["3"]);
  assert.equal(describe({ domain: 1, score: 4 }).nextLevel, null);
  assert.equal(describe({ domain: 3, score: null }).label, "Not applicable");
  assert.equal(describe({ domain: 6, score: 1 }).triggersReview, true);
});
test("Completed encounters carry the rubric text and level wording", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile({ age: 40 }));
  await engine.complete(enc);
  const a = enc.assessment;
  assert.equal(a.rubric.title, "Patient Encounter Performance Rubric");
  assert.equal(a.domains[0].label, "Unsafe or absent");
  assert.equal(a.domains[0].levels.length, 4);
  assert.equal(a.caseRubric, null);
});
test("Pediatric hearing rubric applies by age or by explicit choice", () => {
  const rubric = caseRubric.rubrics.find(
    (r) => r.id === "pediatric-hearing-treatment",
  );
  assert.equal(
    rubric.sections.reduce((sum, s) => sum + s.points, 0),
    100,
  );
  assert.deepEqual(
    rubric.sections.map((s) => s.points),
    [10, 30, 30, 30],
  );
  for (const s of rubric.sections)
    assert.ok(
      Math.abs(s.criteria.reduce((sum, c) => sum + c.share, 0) - 1) < 1e-9,
      s.title,
    );
  assert.equal(caseRubric.forProfile(profile()).id, rubric.id);
  assert.equal(caseRubric.forProfile(profile({ age: 17 })).id, rubric.id);
  assert.equal(caseRubric.forProfile(profile({ age: 18 })), null);
  assert.equal(caseRubric.forProfile(profile({ age: null })), null);
  assert.equal(caseRubric.forProfile(profile({ caseRubric: "none" })), null);
  assert.equal(
    caseRubric.forProfile(profile({ age: 40, caseRubric: rubric.id })).id,
    rubric.id,
  );
});
test("Case rubric scoring validates evidence and computes points", async () => {
  const saved = { ...cloud },
    prior = process.env.AI_ENABLED;
  const rubric = caseRubric.rubrics[0];
  try {
    process.env.AI_ENABLED = "false";
    const enc = engine.create(profile());
    await engine.ask(
      enc,
      "Hello, I'm a student clinician. What brings you in?",
      "q1",
    );
    const said = enc.events.find((e) => e.type === "student").id;
    // Local mode lists the checklist without points.
    const local = await caseRubric.score(enc);
    assert.equal(local.total, null);
    assert.equal(local.provider, "not-scored");
    assert.equal(local.sections[1].criteria.length, 5);
    assert.ok(
      local.sections.every((s) =>
        s.criteria.every((c) => c.status === "not_scored"),
      ),
    );
    const all = rubric.sections.flatMap((s) => s.criteria);
    const answer = (overrides = {}) => ({
      criteria: all.map((c) => ({
        id: c.id,
        status: "not_met",
        reason: "Not observed.",
        evidence: [],
        ...(overrides[c.id] || {}),
      })),
    });
    process.env.AI_ENABLED = "true";
    cloud.checklist = async () =>
      answer({
        "intro-professional": {
          status: "met",
          reason: "Introduced role.",
          evidence: [said],
        },
        "intro-empathetic-language": {
          status: "partly",
          reason: "Polite.",
          evidence: [said],
        },
        "needs-communication-challenge": {
          status: "met",
          reason: "Asked the concern.",
          evidence: [said],
        },
        "expectations-answer-questions": {
          status: "not_observable",
          reason: "The patient asked no questions.",
        },
      });
    const scored = await caseRubric.score(enc);
    assert.equal(scored.provider, "bedrock");
    assert.equal(scored.sections[0].earned, 7.5);
    assert.equal(scored.sections[1].earned, 7.5);
    assert.equal(scored.total, 15);
    assert.equal(scored.max, 92.5);
    assert.equal(scored.fullPoints, 100);
    // Credit without evidence, invented evidence, a missing criterion and a
    // disallowed "not observable" are all rejected and leave it unscored.
    for (const bad of [
      answer({ "intro-professional": { status: "met", evidence: [] } }),
      answer({
        "intro-professional": { status: "met", evidence: ["made-up"] },
      }),
      { criteria: answer().criteria.slice(1) },
      answer({ "needs-educational": { status: "not_observable" } }),
    ]) {
      cloud.checklist = async () => bad;
      const failed = await caseRubric.score(enc);
      assert.equal(failed.total, null);
      assert.ok(failed.failure);
    }
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});
