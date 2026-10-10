"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
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
    ],
    artifacts: [],
    obj: [],
    sources: [],
  };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );

  return sorted[index];
}

test("Local visit memory answers repeated questions within the time budget", async () => {
  process.env.AI_ENABLED = "false";
  const samples = [];
  const started = Date.now();
  for (let n = 0; n < 30; n++) {
    const enc = engine.create(profile());
    const first = Date.now();
    await engine.ask(enc, "What brings you in?", "a-" + n);
    samples.push(Date.now() - first);
    assert.equal(enc.transcript.at(-1).text, "I feel tired.");
    const second = Date.now();
    await engine.ask(enc, "Tell me more", "b-" + n);
    samples.push(Date.now() - second);
    assert.equal(enc.transcript.at(-1).text, "As I said, I feel tired.");
  }
  const elapsed = Date.now() - started;
  const p95 = percentile(samples, 0.95);
  assert.equal(samples.length, 60);
  assert.ok(p95 < 50, "p95 " + p95 + " ms");
  assert.ok(elapsed < 1500, "total " + elapsed + " ms");
});

test("Concurrent visits keep memory correct with no failed turns", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-perf-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const samples = [];
  let failures = 0;

  async function turn(id, question, requestId) {
    const started = Date.now();
    const response = await fetch(`${base}/api/encounters/${id}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, requestId }),
    });
    samples.push(Date.now() - started);
    if (!response.ok) {
      failures += 1;

      return "";
    }
    const body = await response.json();

    return body.encounter.transcript.at(-1).text;
  }

  async function visit(index) {
    const started = await fetch(base + "/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "denise", version: 1 }),
    });
    if (!started.ok) {
      failures += 1;

      return;
    }
    const id = (await started.json()).encounter.id;
    const first = await turn(id, "What brings you in today?", "first-" + index);
    const second = await turn(
      id,
      "What brings you in today?",
      "second-" + index,
    );
    const more = await turn(id, "Tell me more", "more-" + index);
    if (
      first !==
      "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    )
      failures += 1;
    if (!second.startsWith("As I said, ")) failures += 1;
    if (!more.startsWith("As I said, ")) failures += 1;
  }

  try {
    const visits = [];
    for (let index = 0; index < 12; index++) visits.push(visit(index));
    await Promise.all(visits);
    const p95 = percentile(samples, 0.95);
    assert.equal(failures, 0);
    assert.equal(samples.length, 36);
    assert.ok(p95 < 3000, "p95 " + p95 + " ms");
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
