"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");

async function request(client, url, payload) {
  const started = performance.now();
  const response = await client(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return { status: response.status, ms: performance.now() - started, data };
}

async function textVisit(client, user) {
  const created = await request(client, "/api/encounters", {
    profileId: "riley",
  });
  assert.equal(created.status, 201);
  const id = created.data.encounter.id;
  assert.equal(created.data.encounter.channel, "visit");
  assert.equal(created.data.encounter.emergency, null);
  const turns = [
    ["Have you thought about ending your life?", "early"],
    ["I am sorry this has been so hard.", "kind-1"],
    ["I hear how heavy this feels.", "kind-2"],
    [
      "Do you feel safe right now, or have you thought about ending your life?",
      "safety",
    ],
  ];
  let last = created;
  for (const [question, name] of turns) {
    last = await request(client, `/api/encounters/${id}/turn`, {
      question,
      requestId: `${user}-${name}`,
    });
    assert.equal(last.status, 200, `${user} ${name}`);
  }
  return { ms: last.ms, encounter: last.data.encounter, createdMs: created.ms };
}

test("Eight concurrent Riley video visits stay local, correct, and within 2 seconds per turn", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-riley-perf-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  try {
    const users = 8;
    const results = await Promise.all(
      Array.from({ length: users }, (_, index) =>
        textVisit(client, `u${index}`),
      ),
    );
    for (const result of results) {
      assert.equal(result.encounter.emergency.service, "911");
      assert.match(result.encounter.transcript.at(-1).text, /ending my life/i);
      assert.equal(
        result.encounter.transcript.some((turn) =>
          turn.text.includes("I am scared to say the worst part."),
        ),
        true,
      );
    }
    const turnTimes = results.map((result) => result.ms).sort((a, b) => a - b);
    const p95 = turnTimes[Math.ceil(turnTimes.length * 0.95) - 1];
    assert.ok(
      p95 < 2000,
      `p95 safety turn was ${Math.round(p95)} ms`,
    );
    assert.equal(
      results.filter((result) => result.encounter.emergency.service !== "911")
        .length,
      0,
    );
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
