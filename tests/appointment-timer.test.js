"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
const cloud = require("../lib/cloud");
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

test("answering the call starts one clock and excludes time waiting for the call", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  enc.createdAt = new Date(Date.now() - 600000).toISOString();
  assert.equal(engine.publicView(enc).durationMs, null);
  assert.equal(engine.publicView(enc).duration, null);
  const started = engine.beginInterview(enc);
  assert.equal(engine.beginInterview(enc), started);
  assert.equal(enc.events.filter((item) => item.type === "interview").length, 1);
  assert.equal(engine.publicView(enc).durationMs, null);
  await engine.complete(enc);
  assert.ok(enc.durationMs >= 0 && enc.durationMs < 60000);
  assert.equal(
    enc.durationMs,
    Date.parse(enc.completedAt) - Date.parse(started),
  );
  assert.equal(engine.interviewOverLimit(enc), false);
  assert.throws(() => engine.beginInterview(enc), /complete/);
  await engine.complete(enc);
  assert.equal(enc.events.filter((item) => item.type === "complete").length, 1);
});

test("a chart open anchors the clock before the call is answered", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  engine.openSection(enc, "hx");
  const open = enc.events.find((item) => item.type === "open");
  open.at = new Date(Date.now() - 45000).toISOString();
  assert.equal(engine.beginInterview(enc), open.at);
  await engine.complete(enc);
  assert.ok(enc.durationMs >= 45000);
  assert.match(enc.events.at(-1).text, /no student questions recorded/);
  assert.doesNotMatch(enc.events.at(-1).text, /time limit/);
});

test("appointment duration formatting handles seconds, minutes, and hours", () => {
  assert.equal(engine.formatDuration(-500), "0 sec");
  assert.equal(engine.formatDuration(1500), "2 sec");
  assert.equal(engine.formatDuration(60000), "1 min");
  assert.equal(engine.formatDuration(3600000), "1 hr");
  assert.equal(engine.formatDuration(3661000), "1 hr 1 min 1 sec");
});

test("background assessment stops generating while unsupported judgments remain pending", async () => {
  const saved = { ...cloud };
  const prior = process.env.AI_ENABLED;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let later;
  try {
    process.env.AI_ENABLED = "true";
    cloud.rubric = async () => {
      await gate;
      throw new Error("Synthetic unavailable assessment");
    };
    const enc = engine.create(profile());
    engine.beginInterview(enc);
    ({ later } = await engine.complete(enc, undefined, { background: true }));
    assert.equal(enc.status, "complete");
    assert.equal(enc.assessment.generating, true);
    assert.equal(engine.publicView(enc).assessment.generating, true);
    const duration = enc.durationMs;
    release();
    await later;
    assert.equal(enc.assessment.generating, false);
    assert.equal(enc.assessment.pending, true);
    assert.equal(enc.assessment.total, null);
    assert.equal(enc.durationMs, duration);
    assert.equal(enc.events.filter((item) => item.type === "complete").length, 1);
    process.env.AI_ENABLED = "false";
    const local = engine.create(profile());
    await engine.complete(local);
    assert.equal(local.assessment.generating, false);
    assert.equal(local.assessment.pending, true);
  } finally {
    release();
    if (later) await later;
    Object.assign(cloud, saved);
    if (prior === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = prior;
  }
});

test("an unexpected assessment failure clears generation and preserves pending judgments", async () => {
  const enc = engine.create(profile());
  enc.assessment = { pending: true, generating: true, total: null };
  const provider = cloud.provider;
  try {
    cloud.provider = () => { throw new Error("Synthetic assessment failure"); };
    await engine.finishAssessment(enc);
    assert.equal(enc.assessment.generating, false);
    assert.equal(enc.assessment.pending, true);
    assert.equal(enc.assessment.total, null);
    assert.match(enc.assessment.failure, /Synthetic assessment failure/);
  } finally {
    cloud.provider = provider;
  }
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

test("a 20 minute interview stops and records that no question was saved", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  enc.interviewStartedAt = new Date(
    Date.now() - engine.MAX_INTERVIEW_MS - 1000,
  ).toISOString();
  await assert.rejects(
    engine.ask(enc, "What brings you in?", "late"),
    /20 minute limit/,
  );
  assert.equal(
    enc.transcript.some((turn) => turn.role === "student"),
    false,
  );
  assert.equal(engine.interviewOverLimit(enc), true);
  await engine.complete(enc);
  assert.equal(enc.status, "complete");
  assert.ok(enc.durationMs >= engine.MAX_INTERVIEW_MS);
  const done = enc.events.find((item) => item.type === "complete");
  assert.match(done.text, /time limit/);
  assert.match(done.text, /no student questions recorded/);
  const view = engine.publicView(enc);
  assert.equal(view.interviewLimitMs, engine.MAX_INTERVIEW_MS);
  assert.equal(view.durationMs, enc.durationMs);
});
