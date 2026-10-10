"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
const { ChatTracker } = require("../lib/chat-tracker");
const { createApp } = require("../server");

function profile() {
  return {
    ...blank(),
    name: "Ada Synthetic",
    version: 1,
    age: 40,
    reviewAcknowledged: true,
    facts: [
      fact("concern", "Tired", {
        say: "I feel tired.",
        topic: "Reason for visit",
        kw: ["bring", "tired"],
      }),
      fact("secret", "Missed doses", {
        say: "I miss the evening dose.",
        topic: "Medication adherence",
        kw: ["miss", "skip"],
        gate: 1,
        deflect: "I would rather not discuss that yet.",
      }),
    ],
    sources: [],
  };
}

test("chat tracker records the typed request and the spoken reply", async () => {
  process.env.AI_ENABLED = "false";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-chat-"));
  const file = path.join(dir, "chat-tracker.csv");
  const tracker = new ChatTracker(file);
  const enc = engine.create(profile());
  assert.equal(tracker.record(enc, 0), null);
  const before = enc.transcript.length;
  await engine.ask(enc, 'What brings you in, "today"?', "one");
  const row = tracker.record(enc, before);
  assert.equal(row.request, 'What brings you in, "today"?');
  assert.equal(row.response, "I feel tired.");
  assert.equal(row.patient, "Ada Synthetic");
  assert.equal(tracker.record(enc, before), null);
  const held = enc.transcript.length;
  await engine.ask(enc, "Do you skip doses?", "two");
  tracker.record(enc, held);
  const text = await fs.readFile(file, "utf8");
  assert.match(text, /What brings you in, ""today""\?/);
  assert.match(text, /I feel tired\./);
  assert.doesNotMatch(text, /I miss the evening dose/);
  assert.match(text, /I would rather not discuss that yet\./);
  assert.equal(tracker.exchanges().length, 2);
  const listed = spawnSync(
    process.execPath,
    ["agents/chat-tracker.js", "--status", "--path", file],
    { cwd: path.join(__dirname, ".."), encoding: "utf8" },
  );
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).exchanges, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test("a visit turn appends the chat request and patient response", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-chat-http-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (url, method = "GET", payload) => {
    const r = await fetch(base + url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const started = await request("/api/encounters", "POST", {
      profileId: "denise",
      version: 1,
    });
    assert.equal(started.status, 201);
    const id = started.data.encounter.id;
    const question = "What brings you in today?";
    const turn = await request(`/api/encounters/${id}/turn`, "POST", {
      question,
      requestId: "track-1",
    });
    assert.equal(turn.status, 200);
    const reply = turn.data.encounter.transcript.at(-1).text;
    await request(`/api/encounters/${id}/turn`, "POST", {
      question,
      requestId: "track-1",
    });
    const rows = new ChatTracker(path.join(dir, "chat-tracker.csv")).exchanges();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].patient, "Denise Carter");
    assert.equal(rows[0].request, question);
    assert.equal(rows[0].response, reply);
    assert.equal(rows[0].encounter_id, id);
    assert.doesNotMatch(rows[0].response, /Hi, I'm Denise/);
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
