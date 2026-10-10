"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
function profile() {
  return {
    ...blank(),
    name: "Ada Synthetic",
    version: 1,
    age: 40,
    reviewAcknowledged: true,
    facts: [
      fact("concern", "Tired for two weeks", {
        say: "I feel tired.",
        topic: "Reason for visit",
        kw: ["bring", "tired"],
      }),
      fact("secret", "Misses the evening dose", {
        say: "I miss the evening dose.",
        topic: "Medication adherence",
        kw: ["miss", "skip"],
        gate: 1,
        deflect: "I would rather not discuss that yet.",
      }),
      fact("diet", "Eats canned soup daily", {
        say: "I eat canned soup most days.",
        topic: "Diet",
        kw: ["eat", "diet"],
      }),
      fact("chart", "LDL 195, units and date unspecified", {
        vis: "chart",
        sec: "labs",
        ehr: "labs",
        say: "",
        topic: "Lipid results",
        kw: ["ldl"],
      }),
    ],
    artifacts: [],
    obj: [
      {
        id: "o1",
        t: "Elicit adherence barrier",
        w: 60,
        ty: "fact",
        f: ["secret"],
        tip: "Ask kindly.",
      },
      {
        id: "o2",
        t: "Take a diet history",
        w: 40,
        ty: "fact",
        f: ["diet"],
        tip: "Ask about a typical day of eating.",
      },
    ],
    sources: [],
  };
}
test("Coaching names missed findings by topic only and never leaks their content", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  await engine.ask(enc, "What brings you in today?", "q1");
  await engine.ask(enc, "Do you skip doses?", "q2");
  await engine.complete(enc);
  const c = enc.assessment.coaching;
  assert.deepEqual(
    c.findings.elicited.map((f) => f.label),
    ["Tired for two weeks"],
  );
  assert.equal(c.findings.total, 4);
  assert.deepEqual(c.findings.missed.map((m) => m.topic).sort(), [
    "Diet",
    "Lipid results",
    "Medication adherence",
  ]);
  const adherence = c.findings.missed.find(
    (m) => m.topic === "Medication adherence",
  );
  assert.equal(adherence.heldBack, true);
  assert.equal(adherence.objective, "Elicit adherence barrier");
  // Objective-linked topics lead the list.
  assert.ok(c.findings.missed[0].objective && c.findings.missed[1].objective);
  const sent = JSON.stringify(engine.publicView(enc).assessment.coaching);
  for (const hidden of [
    "evening dose",
    "canned soup",
    "LDL 195",
    '"secret"',
    '"diet"',
  ])
    assert.ok(!sent.includes(hidden), hidden);
  assert.equal(c.objectivePercent, 0);
  assert.equal(c.nextSteps[0].source, "objective");
  assert.match(c.nextSteps[0].text, /Elicit adherence barrier: Ask kindly\./);
  assert.ok(
    c.nextSteps.some((s) => /Return to "Medication adherence"/.test(s.text)),
  );
  // Every cited event exists in the encounter record.
  const ids = new Set(enc.events.map((e) => e.id));
  const cited = [
    ...c.findings.elicited,
    ...c.findings.missed,
    ...c.flow.observations,
    ...c.nextSteps,
  ].flatMap((x) => x.evidence || []);
  assert.ok(cited.length > 0 && cited.every((id) => ids.has(id)));
});
test("Sequence feedback records rapport before a guarded disclosure", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  await engine.ask(enc, "What brings you in today?", "q1");
  await engine.ask(enc, "Do you skip doses?", "q2");
  await engine.ask(
    enc,
    "I understand, and there is no judgment. Do you ever miss a dose?",
    "q3",
  );
  engine.openSection(enc, "labs");
  await engine.complete(enc);
  const c = enc.assessment.coaching;
  assert.equal(c.flow.questions, 3);
  assert.equal(c.flow.steps.filter((s) => s.kind === "question").length, 3);
  assert.equal(c.flow.steps[1].heldBack, true);
  assert.deepEqual(c.flow.steps[2].gained, ["Misses the evening dose"]);
  const texts = c.flow.observations.map((o) => o.text);
  assert.ok(texts.some((t) => /first question was an open invitation/.test(t)));
  assert.ok(
    texts.some((t) =>
      /"Medication adherence" was held back at question 2 and shared at question 3, after you acknowledged the patient's perspective at question 3/.test(
        t,
      ),
    ),
  );
  assert.ok(
    texts.some((t) => /chart was first opened after question 3/.test(t)),
  );
  assert.equal(c.objectivePercent, 60);
  assert.deepEqual(
    c.findings.missed.map((m) => m.topic),
    ["Diet"],
  );
  assert.match(c.nextSteps[0].text, /Take a diet history/);
});
test("Rewording suggestions target recorded questions and reject invented content", async () => {
  const cloud = require("../lib/cloud");
  const { rewriteCandidates, validRewrites } = require("../lib/feedback");
  const saved = { ...cloud },
    prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  try {
    const enc = engine.create(profile());
    await engine.ask(enc, "Are you tired?", "q1");
    await engine.ask(
      enc,
      "Why didn't you take your pills? Do you skip doses?",
      "q2",
    );
    await engine.complete(enc);
    const candidates = rewriteCandidates(enc, enc.assessment.coaching.flow);
    assert.deepEqual(
      candidates.map((c) => c.turn),
      [2, 1],
    );
    assert.match(candidates[0].issue, /judgmental/);
    assert.match(candidates[1].issue, /opening question was narrow/);
    // Local mode makes no model call and offers no suggestions.
    assert.deepEqual(enc.assessment.coaching.rewrites, []);
    const [q2, q1] = candidates;
    const kept = validRewrites(
      {
        rewrites: [
          {
            id: q2.eventId,
            rewrite:
              "Many people find it hard to take every dose. How has it been for you?",
            why: "Normalizes before asking.",
          },
          {
            id: q1.eventId,
            rewrite: "You have been tired for 3 weeks, right?",
            why: "Adds a duration.",
          },
          {
            id: "not-a-real-event",
            rewrite: "What brings you in?",
            why: "Open.",
          },
          { id: q1.eventId, rewrite: "", why: "Empty." },
        ],
      },
      candidates,
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].turn, 2);
    assert.throws(() => validRewrites({}, candidates));
    // With a model available, accepted suggestions are attached to the assessment.
    process.env.AI_ENABLED = "true";
    cloud.rubric = async () => {
      throw new Error("rubric not under test");
    };
    cloud.rephrase = async (items) => ({
      rewrites: items.map((i) => ({
        id: i.id,
        rewrite: "What brings you in today?",
        why: "Open invitation.",
      })),
    });
    const { assess } = require("../lib/assessment");
    const again = await assess(enc);
    assert.equal(again.coaching.rewrites.length, 2);
    assert.equal(again.provider, "local-provisional");
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});
test("A rejected rubric draft gets one corrected revision, then falls back", async () => {
  const cloud = require("../lib/cloud");
  const { assess, anchors } = require("../lib/assessment");
  const saved = { ...cloud },
    prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  try {
    const enc = engine.create(profile());
    const draft = () => ({
      domains: anchors.map((a) => ({
        domain: a.domain,
        score: 1,
        reason: "Not observed.",
        evidence: [],
        next: "Review.",
      })),
      strengths: [],
      gaps: [],
      concerns: [
        {
          text: "Domains 6 and 7 rated 1 trigger faculty review.",
          evidence: [],
        },
      ],
    });
    const seen = [];
    cloud.rephrase = async () => ({ rewrites: [] });
    cloud.rubric = async (input) => {
      seen.push(input.reviewerCorrection || null);
      return draft();
    };
    let reviews = 0;
    cloud.json = async (system, input) => {
      // The restated faculty-review rule never reaches the grounding review.
      assert.deepEqual(input.candidateFeedback.concerns, []);
      return ++reviews === 1
        ? { supported: false, reason: "Domain 3 claims no follow-up." }
        : { supported: true, reason: "" };
    };
    const fixed = await assess(enc);
    assert.equal(fixed.provider, "bedrock");
    assert.equal(fixed.revised, true);
    assert.equal(fixed.failure, null);
    assert.equal(seen[0], null);
    assert.match(seen[1], /Domain 3 claims no follow-up/);
    seen.length = 0;
    cloud.json = async () => ({ supported: false, reason: "Still wrong." });
    const failed = await assess(enc);
    assert.equal(seen.length, 2);
    assert.equal(failed.provider, "local-provisional");
    assert.equal(failed.revised, false);
    assert.match(failed.failure, /Still wrong/);
    // Deterministic coaching is present either way.
    assert.ok(failed.coaching.findings.total > 0);
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});
test("A missing action may be worded naturally but must still be stated", () => {
  const { validateFeedback } = require("../lib/assessment");
  const enc = {
    events: [{ id: "E1" }],
    p: { rubricApplicable: [1, 2, 3, 4, 5, 6, 7] },
  };
  const feedback = (reason) => ({
    domains: [1, 2, 3, 4, 5, 6, 7].map((domain) => ({
      domain,
      score: 1,
      reason,
      evidence: [],
      next: "Try again.",
    })),
    strengths: [],
    gaps: [],
    concerns: [],
  });
  for (const reason of [
    "Not observed.",
    "No summary or plan was observed.",
    "The chart values were not reviewed.",
    "Closure was absent.",
  ])
    assert.doesNotThrow(() => validateFeedback(feedback(reason), enc), reason);
  assert.throws(
    () => validateFeedback(feedback("The student asked good questions."), enc),
    /Missing actions must be stated explicitly/,
  );
});
test("A rewording keeps its reason only when the reason is sound", () => {
  const { validRewrites } = require("../lib/feedback");
  const candidates = [
    { eventId: "E1", turn: 1, question: "Are you tired?", issue: "Narrow." },
  ];
  const base = { id: "E1", rewrite: "What brings you in today?" };
  const reason =
    "A yes-or-no question limits the answer to one word. An open invitation leaves room for the main concern.";
  assert.equal(
    validRewrites({ rewrites: [{ ...base, reason }] }, candidates)[0].reason,
    reason,
  );
  // A missing reason, or one with an invented number, is dropped; the rewrite stays.
  for (const extra of [
    {},
    { reason: "" },
    { reason: "Tired for 3 weeks was assumed." },
  ]) {
    const result = validRewrites(
      { rewrites: [{ ...base, ...extra }] },
      candidates,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].reason, "");
    assert.equal(result[0].rewrite, "What brings you in today?");
  }
});
test("A finished visit can have its coaching and wording rebuilt", async () => {
  const cloud = require("../lib/cloud");
  const { refreshCoaching } = require("../lib/assessment");
  const saved = { ...cloud },
    prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  try {
    const enc = engine.create(profile());
    await engine.ask(enc, "Are you tired?", "q1");
    await assert.rejects(refreshCoaching(enc), /Finish the encounter first/);
    await engine.complete(enc);
    const rubricBefore = JSON.stringify(enc.assessment.domains);
    // Simulate a visit saved before these fields existed.
    delete enc.assessment.coaching.rewrites;
    delete enc.assessment.coaching.wordingAt;
    enc.assessment.coaching.flow.steps.forEach((s) => delete s.credited);
    process.env.AI_ENABLED = "true";
    cloud.rephrase = async (items) => ({
      rewrites: items.map((i) => ({
        id: i.id,
        rewrite: "What brings you in today?",
        reason: "An open invitation leaves room for the main concern.",
      })),
    });
    await refreshCoaching(enc);
    const c = enc.assessment.coaching;
    assert.equal(c.rewrites.length, 1);
    assert.match(c.rewrites[0].reason, /open invitation/);
    assert.ok(c.wordingAt);
    assert.ok(Array.isArray(c.flow.steps[0].credited));
    assert.equal(JSON.stringify(enc.assessment.domains), rubricBefore);
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});
