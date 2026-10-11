"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const presence = require("../lib/presence");
const engine = require("../lib/engine");
const { createApp } = require("../lib/http");

function profile() {
  return {
    id: "presence-demo",
    name: "Presence Demo",
    age: 40,
    version: 1,
    intro: "Hello.",
    facts: [
      {
        id: "concern",
        label: "Tired",
        say: "I feel tired.",
        topic: "Visit",
        kw: ["bring"],
        vis: "ask",
        ehr: "hx",
        gate: 0,
        type: "reported",
        src: "Faculty authored",
      },
    ],
    artifacts: [],
    sources: [],
    obj: [],
  };
}

test("Filler words are counted without copying clinical numbers", () => {
  assert.equal(presence.countFillers("Um, I, uh, wanted to ask"), 2);
  assert.equal(presence.countFillers("LDL 195 is not spoken here"), 0);
});

test("Presence flags stay off until there is enough evidence", () => {
  const early = presence.sanitizeReport({
    samples: 3,
    lookingShare: 0.1,
    uprightShare: 0.1,
    headTurnsPerMin: 20,
    fillerCount: 1,
    awkwardPauses: 1,
    durationSec: 4,
    detector: "facedetector",
  });
  assert.deepEqual(early.flags, []);
  const flagged = presence.sanitizeReport({
    samples: 20,
    lookingShare: 0.3,
    uprightShare: 0.4,
    headTurnsPerMin: 10,
    fillerCount: 4,
    awkwardPauses: 3,
    durationSec: 90,
    detector: "mediapipe",
  });
  assert.deepEqual(
    flagged.flags.map((f) => f.id),
    ["looking_away", "slouching", "head_turns", "fillers", "pauses"],
  );
  assert.match(flagged.notice, /not clinical validation/i);
});

test("Rejected payloads cannot inject frames or unbounded counts", () => {
  const clean = presence.sanitizeReport({
    samples: 1e9,
    fillerCount: -3,
    lookingShare: 4,
    detector: "remote-api",
    image: "data:image/png;base64,aaaa",
    flags: [{ id: "looking_away", label: "hack" }],
  });
  assert.equal(clean.samples, 20000);
  assert.equal(clean.fillerCount, 0);
  assert.equal(clean.lookingShare, 1);
  assert.equal(clean.detector, "none");
  assert.ok(!("image" in clean));
});

test("Encounter presence uses the spoken transcript and stays in the student view", async () => {
  const enc = engine.create(profile());
  await engine.ask(enc, "Um, uh, um, what brings you in today?", "p1");
  engine.recordPresence(enc, {
    samples: 12,
    lookingShare: 0.9,
    uprightShare: 0.9,
    headTurnsPerMin: 1,
    fillerCount: 0,
    awkwardPauses: 0,
    durationSec: 40,
    detector: "facedetector",
  });
  assert.ok(enc.presence.fillerCount >= 2);
  assert.ok(enc.presence.flags.some((f) => f.id === "fillers"));
  const view = engine.publicView(enc);
  assert.equal(view.presence.fillerCount, enc.presence.fillerCount);
  assert.ok(!JSON.stringify(view.presence).includes("data:image"));
});

test("Presence samples save on an active visit and appear after completion", async () => {
  process.env.AI_ENABLED = "false";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-presence-http-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  try {
    const started = await client("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "omar", version: 1 }),
    });
    assert.equal(started.status, 201);
    const id = (await started.json()).encounter.id;
    const saved = await client(`/api/encounters/${id}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: 16,
        lookingShare: 0.2,
        uprightShare: 0.9,
        headTurnsPerMin: 9,
        fillerCount: 3,
        awkwardPauses: 0,
        durationSec: 70,
        detector: "facedetector",
      }),
    });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.ok(body.encounter.presence.flags.some((f) => f.id === "looking_away"));
    const done = await client(`/api/encounters/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presence: {
          samples: 4,
          lookingShare: 0.2,
          fillerCount: 3,
          detector: "facedetector",
        },
      }),
    });
    assert.equal(done.status, 200);
    const finished = (await done.json()).encounter;
    assert.ok(finished.presence.flags.some((f) => f.id === "fillers"));
    assert.match(finished.presence.notice, /not clinical validation/i);
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
