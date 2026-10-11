"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const speech = require("../lib/speech");
const { createApp } = require("../server");

test("Each spoken line gets its own talking clip name", () => {
  const hello = speech.talkingClipName("Hello.");
  const tired = speech.talkingClipName("I feel tired.");
  assert.equal(hello, speech.talkingClipName("Hello."));
  assert.notEqual(hello, tired);
  assert.match(hello, /^talking-[0-9a-f]+\.mp4$/);
  assert.doesNotMatch(hello + tired, /Hello|tired|LDL|195/);
});

test("Talking-video jobs are separate per line and stay idle without a key", async () => {
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const previousVoice = process.env.ELEVENLABS_VOICE_ID;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-talk-"));
  const original = global.fetch;
  const profile = {
    id: "denise",
    name: "Denise Carter",
    gender: "female",
    age: 58,
    intro: "Hi, I'm Denise.",
  };
  try {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    assert.equal(
      speech.beginTalkingVideo({ profile, text: "I feel tired.", dir }).status,
      "idle",
    );
    assert.equal(
      (await speech.talkingVideoState("denise", dir, "I feel tired.")).status,
      "idle",
    );

    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "test-voice";
    global.fetch = () => new Promise(() => {});
    const first = speech.beginTalkingVideo({
      profile,
      text: "I feel tired.",
      dir,
    });
    const same = speech.beginTalkingVideo({
      profile,
      text: "I feel tired.",
      dir,
    });
    const other = speech.beginTalkingVideo({
      profile,
      text: "Hello there.",
      dir,
    });
    assert.equal(first.status, "pending");
    assert.equal(same, first);
    assert.equal(other.status, "pending");
    assert.notEqual(other, first);
    assert.equal(
      (await speech.talkingVideoState("denise", dir, "I feel tired.")).status,
      "pending",
    );
    assert.equal(
      (await speech.talkingVideoState("denise", dir, "Hello there.")).status,
      "pending",
    );
  } finally {
    global.fetch = original;
    if (previousKey == null) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previousKey;
    if (previousVoice == null) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = previousVoice;
  }
});

test("The talking-video route stays unavailable without ElevenLabs", async () => {
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const previousVoice = process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  process.env.AI_ENABLED = "false";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-talk-http-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  try {
    const started = await client("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "denise", version: 1 }),
    });
    assert.equal(started.status, 201);
    const encounter = (await started.json()).encounter;
    const video = await client(
      `/api/encounters/${encounter.id}/talking-video`,
    );
    assert.equal(video.status, 503);
    const body = await video.json();
    assert.match(body.error, /not configured/i);
  } finally {
    app.server.close();
    if (previousKey == null) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previousKey;
    if (previousVoice == null) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = previousVoice;
  }
});
