"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const cloud = require("../lib/cloud");
const { validateFeedback } = require("../lib/assessment");
test("AI_PROVIDER selects the Claude API only when explicitly set", () => {
  const saved = { ...process.env };
  try {
    delete process.env.AI_PROVIDER;
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.ANTHROPIC_MODEL;
    assert.equal(cloud.provider(), "bedrock");
    assert.equal(cloud.model(), "us.anthropic.claude-sonnet-4-6");
    process.env.AI_PROVIDER = "something-else";
    assert.equal(cloud.provider(), "bedrock");
    process.env.AI_PROVIDER = "anthropic";
    assert.equal(cloud.provider(), "anthropic");
    assert.equal(cloud.model(), "claude-opus-5-5");
    process.env.ANTHROPIC_MODEL = "claude-haiku-5-5";
    assert.equal(cloud.model(), "claude-haiku-5-5");
  } finally {
    for (const key of ["AI_PROVIDER", "BEDROCK_MODEL_ID", "ANTHROPIC_MODEL"])
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
  }
});
test("A missing action may be worded naturally but must still be stated", () => {
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
