"use strict";
// Fixed schemas keep Bedrock's schema cache reusable across patients and encounters.
const text = { type: "string" };
const refs = { type: "array", items: text };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const item = object({ text, evidence: refs });
const audit = object({ supported: { type: "boolean" }, reason: text });
const claims = object({
  supported: { type: "boolean" },
  reason: text,
  claims: {
    type: "array",
    items: object({
      claim: text,
      factId: text,
      quote: text,
      inferred: { type: "boolean" },
    }),
  },
});
const rubric = object({
  domains: {
    type: "array",
    items: object({
      domain: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7] },
      score: {
        anyOf: [{ type: "integer", enum: [1, 2, 3, 4] }, { type: "null" }],
      },
      reason: text,
      evidence: refs,
      next: text,
    }),
  },
  strengths: { type: "array", items: item },
  gaps: { type: "array", items: item },
  concerns: { type: "array", items: item },
});
const rewrites = object({
  rewrites: {
    type: "array",
    items: object({ id: text, rewrite: text, reason: text }),
  },
});
const checklist = object({
  criteria: {
    type: "array",
    items: object({
      id: text,
      status: {
        type: "string",
        enum: ["met", "partly", "not_met", "not_observable"],
      },
      reason: text,
      evidence: refs,
    }),
  },
});
module.exports = { audit, claims, rubric, rewrites, checklist };
