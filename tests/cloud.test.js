"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const cloud = require("../lib/cloud");
const response = (value, stopReason = "end_turn") => ({
  stopReason,
  output: { message: { content: [{ text: JSON.stringify(value) }] } },
});

test("Rich-case drafting allows a complete response and retains independent grounding review", async () => {
  const original = BedrockRuntimeClient.prototype.send;
  const oldModel = process.env.BEDROCK_MODEL_ID,
    oldStructured = process.env.BEDROCK_STRUCTURED_OUTPUTS;
  process.env.BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-6";
  process.env.BEDROCK_STRUCTURED_OUTPUTS = "true";
  const calls = [];
  BedrockRuntimeClient.prototype.send = async (command) => {
    calls.push(command.input);
    if (calls.length === 1)
      return response({
        name: "Patient",
        age: 59,
        facts: [{ label: "Concern", say: "I feel tired." }],
      });
    return response({ supported: true });
  };
  try {
    const draft = await cloud.draft(
      "Name: Patient. Age: 59. I feel tired.",
      [],
    );
    assert.equal(draft.age, 59);
    assert.equal(
      calls.length,
      2,
      "Extraction still requires a separate grounding review",
    );
    assert.ok(calls[0].inferenceConfig.maxTokens >= 8000);
    assert.ok(
      calls[0].system[0].text.includes("Exclude faculty-only metadata"),
    );
    assert.ok(calls[1].system[0].text.includes("Reject ANY new"));
    assert.ok(
      calls[1].outputConfig?.textFormat.structure.jsonSchema.schema.includes(
        '"supported"',
      ),
      "Supported Claude models enforce the grounding-review JSON shape",
    );
  } finally {
    BedrockRuntimeClient.prototype.send = original;
    if (oldModel === undefined) delete process.env.BEDROCK_MODEL_ID;
    else process.env.BEDROCK_MODEL_ID = oldModel;
    if (oldStructured === undefined)
      delete process.env.BEDROCK_STRUCTURED_OUTPUTS;
    else process.env.BEDROCK_STRUCTURED_OUTPUTS = oldStructured;
  }
});

test("Incomplete output and unsupported drafts are rejected with safe actionable reasons", async () => {
  const original = BedrockRuntimeClient.prototype.send;
  try {
    BedrockRuntimeClient.prototype.send = async () =>
      response({}, "max_tokens");
    await assert.rejects(cloud.draft("Synthetic case", []), {
      code: "MODEL_OUTPUT_LIMIT",
    });
    BedrockRuntimeClient.prototype.send = async () =>
      response({}, "guardrail_intervened");
    await assert.rejects(cloud.draft("Synthetic case", []), {
      code: "MODEL_BLOCKED",
    });
    let stage = 0;
    BedrockRuntimeClient.prototype.send = async () =>
      response(
        ++stage === 1
          ? { name: "Patient", facts: [] }
          : { supported: false, reason: "Private source contents" },
      );
    await assert.rejects(cloud.draft("Synthetic case", []), {
      code: "DRAFT_UNSUPPORTED",
    });
    BedrockRuntimeClient.prototype.send = async () => ({
      output: {
        message: { content: [{ text: "unfinished secret model output" }] },
      },
    });
    await assert.rejects(cloud.json("Test", {}), {
      code: "MODEL_INVALID_JSON",
    });
  } finally {
    BedrockRuntimeClient.prototype.send = original;
  }
  assert.match(
    cloud.draftFailure({ code: "MODEL_OUTPUT_LIMIT" }).message,
    /output limit/,
  );
  assert.match(
    cloud.draftFailure({ name: "ExpiredTokenException" }).message,
    /expired/,
  );
  assert.match(
    cloud.draftFailure({ code: "ECONNRESET" }).message,
    /interrupted/,
  );
  assert.equal(
    cloud
      .draftFailure({ name: "Error", message: "private secrets" })
      .message.includes("private secrets"),
    false,
  );
});
