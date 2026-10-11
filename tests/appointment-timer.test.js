"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
const { appointments } = require("../lib/appointment-log");
const { createApp } = require("../lib/http");

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

test("the interview clock starts once and the appointment duration is recorded", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  const started = new Date(Date.now() - 125000).toISOString();
  enc.interviewStartedAt = started;
  assert.equal(engine.beginInterview(enc), started);
  assert.equal(
    enc.events.filter((item) => item.type === "interview").length,
    0,
  );
  await engine.complete(enc);
  assert.equal(enc.status, "complete");
  assert.ok(enc.durationMs >= 125000 && enc.durationMs < 180000);
  assert.match(engine.formatDuration(enc.durationMs), /^2 min \d+ sec$/);
  const done = enc.events.find((item) => item.type === "complete");
  assert.equal(done.durationMs, enc.durationMs);
  assert.match(done.text, /Encounter completed · 2 min /);
  const again = enc.durationMs;
  await engine.complete(enc);
  assert.equal(enc.durationMs, again);
  const view = engine.publicView(enc);
  assert.equal(view.interviewStartedAt, started);
  assert.equal(view.durationMs, enc.durationMs);
  assert.equal(view.duration, engine.formatDuration(enc.durationMs));
  assert.equal(JSON.stringify(view).includes("I miss the evening dose."), false);
});

test("a later start cannot shorten time already spent asking questions", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  await engine.ask(enc, "What brings you in?", "one");
  enc.events.find((item) => item.type === "student").at = new Date(
    Date.now() - 90000,
  ).toISOString();
  const anchored = enc.events.find((item) => item.type === "student").at;
  engine.beginInterview(enc);
  assert.equal(enc.interviewStartedAt, anchored);
  await engine.complete(enc);
  assert.ok(enc.durationMs >= 90000);
  assert.equal(
    JSON.stringify(engine.publicView(enc)).includes("I miss the evening dose."),
    false,
  );
});

test("finishing an appointment appends one duration row", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-appointment-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  const request = async (url, method = "GET", payload) => {
    const r = await client(url, {
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
    assert.equal(started.data.encounter.interviewStartedAt, null);
    assert.equal(started.data.encounter.durationMs, null);
    const begun = await request(`/api/encounters/${id}/begin`, "POST", {});
    assert.equal(begun.status, 200);
    const again = await request(`/api/encounters/${id}/begin`, "POST", {});
    assert.equal(
      again.data.encounter.interviewStartedAt,
      begun.data.encounter.interviewStartedAt,
    );
    const finished = await request(`/api/encounters/${id}/complete`, "POST", {});
    assert.equal(finished.status, 200);
    assert.equal(typeof finished.data.encounter.durationMs, "number");
    assert.match(finished.data.encounter.duration, /\d+ sec|\d+ min/);
    const file = path.join(dir, "appointment-log.csv");
    const rows = appointments(file);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].encounter_id, id);
    assert.equal(rows[0].patient, "Denise Carter");
    assert.equal(rows[0].duration_ms, String(finished.data.encounter.durationMs));
    assert.equal(rows[0].duration, finished.data.encounter.duration);
    const text = await fs.readFile(file, "utf8");
    assert.match(text, /duration_ms/);
    assert.doesNotMatch(text, /I miss the evening dose|LDL/);
    await request(`/api/encounters/${id}/complete`, "POST", {});
    assert.equal(appointments(file).length, 1);
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
