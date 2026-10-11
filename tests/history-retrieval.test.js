"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../lib/engine");
const cloud = require("../lib/cloud");
const {
  rosterProfiles,
  selectionTopics,
  restoreRosterDialogue,
} = require("../lib/roster-profiles");

function legacy(id = "yvette") {
  const p = rosterProfiles().find((p) => p.id === id);
  p.facts = p.facts.filter((f) => f.id !== "authored-history");
  delete p.rosterDialogueRevision;
  for (const f of p.facts) delete f.topic;
  return { ...p, version: 1 };
}

test("All legacy roster selectors recover distinct neutral topics without changing clinical snapshots", () => {
  for (const p of rosterProfiles()) {
    const old = legacy(p.id);
    const before = structuredClone(old);
    const topics = selectionTopics(old);
    assert.equal(topics.length, old.facts.length);
    assert.ok(
      topics.every(
        (t) => t.topic && !["hx", "meds", "labs", "notes"].includes(t.topic),
      ),
      p.name,
    );
    assert.deepEqual(old, before);
    for (const f of p.facts.filter((f) => f.gate > 0)) {
      const data = JSON.stringify(topics);
      assert.ok(!data.includes(f.say), f.id);
      assert.ok(!data.includes(f.label), f.id);
    }
  }
  const edited = legacy();
  edited.facts[0].say = "Faculty changed this scenario.";
  assert.equal(selectionTopics(edited)[0].topic, "Unspecified patient topic");
  edited.facts[0].topic = "Faculty-authored topic";
  assert.equal(selectionTopics(edited)[0].topic, "Faculty-authored topic");
});

test("New roster versions restore only explicitly authored history without ungating sensitive details", async () => {
  process.env.AI_ENABLED = "false";
  for (const source of rosterProfiles()) {
    const p = legacy(source.id);
    const prior = structuredClone(p.facts);
    assert.equal(restoreRosterDialogue(p, source), true);
    for (const f of prior) {
      const actual = p.facts.find((item) => item.id === f.id);
      for (const key of ["label", "say", "gate", "vis", "deflect"])
        assert.equal(actual[key], f[key]);
    }
    assert.equal(restoreRosterDialogue(p, source), false);
  }
  const source = rosterProfiles().find((p) => p.id === "yvette");
  const enc = engine.create({ ...source, version: 3 });
  await engine.ask(enc, "Can you tell me your medical history?", "history");
  assert.equal(enc.transcript.at(-1).text, "I have heart failure.");
  assert.equal(enc.disclosed.ya3, undefined);
  assert.equal(enc.disclosed.ya5, undefined);
  await engine.ask(enc, "Tell me more", "memory");
  assert.match(enc.transcript.at(-1).text, /heart failure/);
  const edited = legacy();
  edited.facts[0].say = "A faculty edit";
  const before = structuredClone(edited);
  assert.equal(restoreRosterDialogue(edited, source), false);
  assert.deepEqual(edited, before);
});

test("Yvette answers broad medication, diet and symptom questions during provider failure", async () => {
  const saved = { ...cloud };
  const prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  try {
    cloud.guard = async () => {};
    cloud.select = async (topics) => {
      assert.match(
        topics.find((t) => t.id === "ya2").topic,
        /medication routine/i,
      );
      assert.match(topics.find((t) => t.id === "ya3").topic, /adherence/i);
      assert.equal(topics.find((t) => t.id === "ya7").kind, "chart record");
      throw new Error("Provider unavailable");
    };
    for (const [q, id] of [
      ["What medicines are you taking?", "ya2"],
      ["What medications do you use?", "ya2"],
      ["What do you eat normally?", "ya4"],
      ["What symptoms have you been having?", "ya1"],
    ]) {
      const enc = engine.create(legacy());
      await engine.ask(enc, q, "probe");
      assert.deepEqual(enc.transcript.at(-1).factIds, [id]);
      assert.equal(enc.transcript.at(-1).provider, "local-fallback");
      assert.equal(enc.disclosed.ya3, undefined);
      assert.doesNotMatch(enc.transcript.at(-1).text, /640|40 mg|skip/i);
    }
    const unknown = engine.create(legacy());
    await engine.ask(unknown, "What is your past medical history?", "history");
    assert.ok(
      engine.isUnknownReply(unknown.transcript.at(-1).text),
      "Missing patient-known history must not be small talk or invented from faculty summary",
    );
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});

test("Guarded and guardrail-blocked questions cannot use broad medication fallback", async () => {
  const saved = { ...cloud };
  const prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  try {
    cloud.guard = async () => {};
    cloud.select = async () => ({
      factIds: ["ya3"],
      empathy: false,
      openQuestion: false,
      judgmental: false,
    });
    const enc = engine.create(legacy());
    await engine.ask(enc, "Do you miss medications?", "guarded");
    assert.equal(
      enc.transcript.at(-1).text,
      enc.p.facts.find((f) => f.id === "ya3").deflect,
    );
    assert.deepEqual(enc.transcript.at(-1).factIds, []);
    cloud.guard = async () => {
      throw Object.assign(new Error("Blocked"), { name: "GuardrailBlocked" });
    };
    await engine.ask(enc, "What medications do you use?", "blocked");
    assert.equal(enc.transcript.at(-1).provider, "blocked");
    assert.ok(engine.isUnknownReply(enc.transcript.at(-1).text));
    assert.deepEqual(enc.transcript.at(-1).factIds, []);
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});
