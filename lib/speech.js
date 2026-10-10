"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const PREMADE = [
  { id: "TX3LPaxmHKxFdv7VOQHJ", gender: "male", age: "young" },
  { id: "bIHbv24MWmeRgasZH58o", gender: "male", age: "young" },
  { id: "SOYHLrjzK2X1ezoPC6cr", gender: "male", age: "young" },
  { id: "IKne3meq5aSn9XLyUdCD", gender: "male", age: "young" },
  { id: "pNInz6obpgDQGcFmaJgB", gender: "male", age: "middle" },
  { id: "cjVigY5qzO86Huf0OWal", gender: "male", age: "middle" },
  { id: "iP95p4xoKVk53GoZ742B", gender: "male", age: "middle" },
  { id: "nPczCjzI2devNBz1zQrb", gender: "male", age: "middle" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", gender: "male", age: "middle" },
  { id: "pqHfZKP75CvOlQylNhV4", gender: "male", age: "old" },
  { id: "EXAVITQu4vr4xnSDxMaL", gender: "female", age: "young" },
  { id: "FGY2WhTYpPnrIDTdsKH5", gender: "female", age: "young" },
  { id: "cgSgspJ2msm6clMCkdW9", gender: "female", age: "young" },
  { id: "XrExE9yKIg1WjnnlVkGX", gender: "female", age: "middle" },
  { id: "hpp4J3VqNfWAUOO0d1Us", gender: "female", age: "middle" },
  { id: "pFZP5JQG7iQjIQuC4Bku", gender: "female", age: "middle" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", gender: "female", age: "middle" },
];
let catalog = PREMADE;
let refreshPromise;
const talkingJobs = new Map();
function configured() {
  return !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}
function hashSeed(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}
function ageBand(age) {
  const n = Number(age);
  if (age == null || age === "" || !Number.isFinite(n)) return "middle";
  if (n < 30) return "young";
  if (n >= 60) return "old";

  return "middle";
}
function genderBand(profile) {
  const g = String(profile?.gender || "").toLowerCase();
  if (g.startsWith("f")) return "female";
  if (g.startsWith("m")) return "male";

  return "";
}
function mapListedAge(age) {
  const value = String(age || "").toLowerCase();
  if (value.includes("middle")) return "middle";
  if (value.includes("young") || value.includes("teen")) return "young";
  if (value.includes("old") || value.includes("senior")) return "old";

  return "middle";
}
function voicePool(profile) {
  const gender = genderBand(profile);
  const age = ageBand(profile?.age);
  const gendered = gender
    ? catalog.filter((v) => v.gender === gender)
    : catalog;
  const aged = gendered.filter((v) => v.age === age);
  if (aged.length) return aged;
  if (age !== "middle") {
    const mid = gendered.filter((v) => v.age === "middle");
    if (mid.length) return mid;
  }

  return gendered.length ? gendered : catalog;
}
function pickVoice(profile) {
  if (profile?.voiceId && /^[a-zA-Z0-9_-]{1,80}$/.test(profile.voiceId))
    return profile.voiceId;
  const pool = voicePool(profile);
  const seed = hashSeed(
    profile?.presentationKey ||
      (profile?.id || "") + "|" + (profile?.name || ""),
  );

  return pool[seed % pool.length].id;
}
function resetCatalog() {
  catalog = PREMADE;
  refreshPromise = null;
}
function headers() {
  return { "xi-api-key": process.env.ELEVENLABS_API_KEY };
}
async function refreshCatalog() {
  if (!process.env.ELEVENLABS_API_KEY) return catalog;
  if (!refreshPromise)
    refreshPromise = (async () => {
      try {
        const r = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: headers(),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return catalog;
        const data = await r.json();
        const listed = (data.voices || [])
          .map((voice) => ({
            id: voice.voice_id,
            gender: String(voice.labels?.gender || "").toLowerCase(),
            age: mapListedAge(voice.labels?.age),
          }))
          .filter(
            (voice) =>
              /^[a-zA-Z0-9_-]{1,80}$/.test(voice.id) &&
              (voice.gender === "male" || voice.gender === "female"),
          );
        if (listed.length) catalog = listed;
      } catch {
        return catalog;
      }

      return catalog;
    })();

  return refreshPromise;
}
async function synthesize(text, voiceId) {
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const payloads = [
    {
      text,
      model_id: model,
      voice_settings: {
        stability: 0.38,
        similarity_boost: 0.78,
        style: 0.35,
        use_speaker_boost: true,
      },
    },
    { text, model_id: model },
  ];
  let last = "ElevenLabs speech failed.";
  for (const body of payloads) {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    last = "ElevenLabs speech failed.";
  }
  throw new Error(last);
}
async function realtimeToken() {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error("ElevenLabs is not configured.");
  const model = process.env.ELEVENLABS_STT_MODEL || "scribe_v2_medical";
  const url = new URL(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
  );
  url.searchParams.set("model_id", model);
  const r = await fetch(url, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Could not start live transcription.");
  const data = await r.json().catch(() => ({}));
  const token = String(data.token || data.single_use_token || "").trim();
  if (!token) throw new Error("Could not start live transcription.");

  return { token, model };
}
async function streamSpeech(text, voiceId) {
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
  );
  url.searchParams.set("optimize_streaming_latency", "3");
  url.searchParams.set("output_format", "mp3_44100_128");
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.78,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok || !r.body) throw new Error("ElevenLabs speech failed.");

  return r.body;
}
async function transcribe(buffer, type = "audio/webm") {
  const form = new FormData();
  form.append(
    "model_id",
    process.env.ELEVENLABS_STT_MODEL || "scribe_v2_medical",
  );
  form.append("language_code", "eng");
  form.append(
    "file",
    new Blob([buffer], { type: type || "audio/webm" }),
    "utterance.webm",
  );
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: headers(),
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error("ElevenLabs transcription failed.");
  const data = await r.json();
  const text = String(data.text || "").trim();
  if (!text) throw new Error("No speech was recognized.");

  return text.slice(0, 2000);
}
function appearancePrompt(profile) {
  const gender = genderBand(profile);
  const who =
    gender === "female" ? "woman" : gender === "male" ? "man" : "adult";
  const age = ageBand(profile?.age);
  const years =
    age === "young"
      ? "in their mid-twenties"
      : age === "old"
        ? "in their late sixties"
        : "in their mid-forties";

  return `Photorealistic documentary still of a ${who} ${years}, head and shoulders, sitting in a quiet outpatient clinic and looking toward the camera with a calm conversational expression, natural window light, realistic skin, everyday civilian clothes, no text, no watermark, not a celebrity, not a known person`;
}
function clipText(text) {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  return value || "Hello, I am here for my visit.";
}
function mediaDir(dir, profileId) {
  return path.join(dir, "media", profileId);
}
function proError() {
  return Object.assign(new Error("pro-required"), { code: "pro-required" });
}
function imageMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";

  return "image/webp";
}
async function xiJson(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 402) throw proError();
  if (!r.ok) throw new Error("ElevenLabs media request failed.");

  return data;
}
async function pollFlow(kind, id, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await xiJson(
      `https://api.elevenlabs.io/v1/flows/${kind}/${id}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (data.status === "completed" && data.content_url) return data;
    if (data.status === "failed")
      throw new Error("ElevenLabs media request failed.");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("ElevenLabs media request failed.");
}
async function downloadMedia(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("ElevenLabs media request failed.");

  return Buffer.from(await r.arrayBuffer());
}
async function stillFromProfile(profile, folder, sourceImage) {
  const dest = path.join(folder, "portrait");
  if (sourceImage) {
    try {
      const image = await fs.readFile(sourceImage);
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(dest, image);

      return image;
    } catch {
      /* Fall through to a cached or generated still. */
    }
  }

  return generatePortrait(profile, dest);
}
async function generatePortrait(profile, file) {
  try {
    return await fs.readFile(file);
  } catch {
    /* Generate a new still when no cached portrait exists. */
  }
  const created = await xiJson("https://api.elevenlabs.io/v1/flows/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: process.env.ELEVENLABS_IMAGE_MODEL || "gemini-2.5-flash-image",
      prompt: appearancePrompt(profile),
      aspect_ratio: "3:4",
    }),
  });
  const done = await pollFlow("image", created.id);
  const image = await downloadMedia(done.content_url);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, image);

  return image;
}
async function generateTalkingClip(image, audio, file) {
  const created = await xiJson("https://api.elevenlabs.io/v1/flows/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: process.env.ELEVENLABS_VIDEO_MODEL || "creatify-aurora",
      image: {
        type: "inline_base64",
        mime_type: imageMime(image),
        content_base64: image.toString("base64"),
      },
      audio: {
        type: "inline_base64",
        mime_type: "audio/mpeg",
        content_base64: audio.toString("base64"),
      },
      resolution: "480p",
    }),
  });
  const done = await pollFlow("video", created.id);
  const video = await downloadMedia(done.content_url);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, video);

  return file;
}
async function talkingVideoState(profileId, dir) {
  const file = path.join(mediaDir(dir, profileId), "talking.mp4");
  try {
    const stat = await fs.stat(file);
    if (stat.size > 1000) {
      talkingJobs.set(profileId, { status: "ready", file });

      return talkingJobs.get(profileId);
    }
  } catch {
    /* No cached talking clip yet. */
  }

  return talkingJobs.get(profileId) || { status: "idle" };
}
function beginTalkingVideo({ profile, text, dir, sourceImage }) {
  const id = profile?.id;
  if (!configured() || !id || !validMediaId(id)) return { status: "idle" };
  const current = talkingJobs.get(id);
  if (
    current?.status === "pending" ||
    current?.status === "ready" ||
    current?.status === "pro-required"
  )
    return current;
  talkingJobs.set(id, { status: "pending" });
  const folder = mediaDir(dir, id);
  (async () => {
    try {
      await refreshCatalog();
      const image = await stillFromProfile(profile, folder, sourceImage);
      const audio = await synthesize(clipText(text), pickVoice(profile));
      const file = await generateTalkingClip(
        image,
        audio,
        path.join(folder, "talking.mp4"),
      );
      talkingJobs.set(id, { status: "ready", file });
    } catch (error) {
      talkingJobs.set(id, {
        status: error.code === "pro-required" ? "pro-required" : "failed",
      });
    }
  })();

  return talkingJobs.get(id);
}
function validMediaId(id) {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id || "");
}
module.exports = {
  PREMADE,
  configured,
  pickVoice,
  mapListedAge,
  resetCatalog,
  refreshCatalog,
  synthesize,
  streamSpeech,
  realtimeToken,
  transcribe,
  appearancePrompt,
  talkingVideoState,
  beginTalkingVideo,
};
