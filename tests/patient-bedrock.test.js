"use strict";
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const { compose } = require("../lib/patient-service");
const { tempDb } = require("../test/helpers");

const APPROVED = "I've been thirsty and tired for months.";
const HIDDEN = "The hidden dose is 500 mg.";
const facts = [
  {
    id: "d1",
    label: "Chief complaint: thirst and fatigue",
    kw: ["bring", "today"],
    vis: "ask",
    gate: 0,
    say: APPROVED,
    deflect: "",
  },
  {
    id: "secret",
    label: "Hidden dose",
    kw: ["payday"],
    vis: "ask",
    gate: 2,
    say: HIDDEN,
    deflect: "I take it like I said.",
  },
];

function reply(text) {
  return {
    stopReason: "end_turn",
    output: { message: { content: [{ text: JSON.stringify({ text }) }] } },
  };
}

describe("patient requests through Bedrock", { concurrency: false }, () => {
  let box;
  let prior;
  const original = BedrockRuntimeClient.prototype.send;

  before(() => {
    box = tempDb();
    prior = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "true";
  });

  after(() => {
    BedrockRuntimeClient.prototype.send = original;
    if (prior == null) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = prior;
    box.cleanup();
  });

  function ask(request, trust = 0) {
    return compose(box.db, {
      request,
      trust,
      case_facts: { facts },
    });
  }

  test("sends only the approved line and keeps a Bedrock reply that repeats it", async () => {
    const calls = [];
    BedrockRuntimeClient.prototype.send = async (command) => {
      calls.push(command.input);
      return reply(APPROVED);
    };

    const result = await ask("What brings you in today?");
    assert.equal(result.provider, "bedrock");
    assert.equal(result.fact_id, "d1");
    assert.equal(result.reply, APPROVED);
    assert.equal(calls.length, 1);
    const payload = calls[0].messages[0].content[0].text;
    assert.match(payload, /thirsty and tired/);
    assert.doesNotMatch(payload, /500/);
    assert.doesNotMatch(payload, /hidden dose/i);
  });

  test("discards a Bedrock reply that adds a hidden fact", async () => {
    BedrockRuntimeClient.prototype.send = async () => reply(HIDDEN);

    const result = await ask("What brings you in today?");
    assert.equal(result.provider, "approved");
    assert.equal(result.reply, APPROVED);
    assert.doesNotMatch(result.reply, /500/);
  });

  test("does not give Bedrock a gated fact, and keeps the deflection", async () => {
    const calls = [];
    BedrockRuntimeClient.prototype.send = async (command) => {
      calls.push(command.input);
      return reply("I take it like I said.");
    };

    const result = await ask("What gets in the way of payday?");
    assert.equal(result.fact_id, "secret");
    assert.equal(result.trust_hold, true);
    assert.equal(result.provider, "bedrock");
    assert.equal(result.reply, "I take it like I said.");
    const payload = calls[0].messages[0].content[0].text;
    assert.match(payload, /like I said/);
    assert.doesNotMatch(payload, /500/);
    assert.doesNotMatch(payload, /hidden dose/i);
  });

  test("keeps the approved line when Bedrock is unavailable", async () => {
    BedrockRuntimeClient.prototype.send = async () => {
      throw new Error("network down");
    };

    const result = await ask("What brings you in today?");
    assert.equal(result.provider, "approved");
    assert.equal(result.reply, APPROVED);
  });

  test("does not call Bedrock when AI is disabled", async () => {
    process.env.AI_ENABLED = "false";
    let called = false;
    BedrockRuntimeClient.prototype.send = async () => {
      called = true;
      return reply("Invented clinical detail.");
    };

    const result = await ask("What brings you in today?");
    assert.equal(called, false);
    assert.equal(result.provider, "approved");
    assert.equal(result.reply, APPROVED);
    process.env.AI_ENABLED = "true";
  });
});
