"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const speech = require("../lib/speech");
test("Voice selection is stable per patient and follows gender and age bands", () => {
  const male = speech.pickVoice({
    id: "patient-one",
    name: "Omar",
    gender: "male",
    age: 45,
  });
  const again = speech.pickVoice({
    id: "patient-one",
    name: "Omar",
    gender: "male",
    age: 45,
  });
  const female = speech.pickVoice({
    id: "patient-two",
    name: "Yvette",
    gender: "female",
    age: 64,
  });
  assert.equal(male, again);
  assert.ok(speech.PREMADE.some((v) => v.id === male && v.gender === "male"));
  assert.ok(
    speech.PREMADE.some((v) => v.id === female && v.gender === "female"),
  );
  assert.equal(
    speech.pickVoice({ voiceId: "custom-voice_1" }),
    "custom-voice_1",
  );
  const olderWoman = speech.pickVoice({
    id: "patient-three",
    name: "Yvette",
    gender: "female",
    age: 72,
  });
  assert.ok(
    speech.PREMADE.some((v) => v.id === olderWoman && v.gender === "female"),
  );
  const olderListed = speech.PREMADE.find((v) => v.id === olderWoman);
  assert.equal(olderListed.gender, "female");
  assert.notEqual(olderListed.age, "young");
  const omar = speech.PREMADE.find((v) => v.id === male);
  assert.equal(omar.gender, "male");
  assert.equal(omar.age, "middle");
  assert.equal(speech.mapListedAge("middle_aged"), "middle");
  assert.equal(speech.mapListedAge("old"), "old");
  assert.equal(speech.mapListedAge("young"), "young");
});
test("Talking-video prompt uses appearance only and never includes chart facts", () => {
  const prompt = speech.appearancePrompt({
    name: "Omar Sinclair",
    gender: "male",
    age: 45,
    facts: [
      { label: "LDL 195", say: "I've been diagnosed with dyslipidemia." },
    ],
  });
  assert.match(prompt, /man/i);
  assert.doesNotMatch(prompt, /Omar|LDL|195|dyslipidemia|mechanic/i);
});
test("Talking clips are generated per spoken line", () => {
  assert.equal(speech.talkingClipName("Hello."), speech.talkingClipName("Hello."));
  assert.notEqual(
    speech.talkingClipName("Hello."),
    speech.talkingClipName("I feel tired."),
  );
  assert.doesNotMatch(speech.talkingClipName("LDL 195"), /LDL|195/);
});
test("Talking-video jobs stay idle without a configured key", () => {
  const previous = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    assert.equal(
      speech.beginTalkingVideo({
        profile: { id: "patient-one", intro: "Hello" },
        text: "Hello",
        dir: "/tmp",
      }).status,
      "idle",
    );
  } finally {
    if (previous) process.env.ELEVENLABS_API_KEY = previous;
  }
});
test("Voice catalog refresh keeps the premade fallback when listing is unavailable", async () => {
  const before = speech.pickVoice({
    id: "patient-one",
    name: "Omar",
    gender: "male",
    age: 45,
  });
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("offline");
  };
  try {
    const catalog = await speech.refreshCatalog();
    assert.ok(catalog.length);
    assert.equal(
      speech.pickVoice({
        id: "patient-one",
        name: "Omar",
        gender: "male",
        age: 45,
      }),
      before,
    );
  } finally {
    global.fetch = original;
  }
});
