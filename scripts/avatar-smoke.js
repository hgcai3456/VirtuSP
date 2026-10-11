"use strict";

// Opt-in live check. A normal run does not contact LiveAvatar or ElevenLabs.
const live = process.argv.includes("--live");

if (!live) {
  console.log(
    "Avatar live smoke test is off. Re-run with --live only when you intend to open one bounded billable session.",
  );
  process.exit(0);
}

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const { LiveAvatarProvider } = require("../lib/avatar-provider-liveavatar");
const speech = require("../lib/speech");

const sentence = "Hello.";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  if (!process.env.LIVEAVATAR_API_KEY || !process.env.LIVEAVATAR_DEFAULT_AVATAR_ID) {
    fail("Set LIVEAVATAR_API_KEY and LIVEAVATAR_DEFAULT_AVATAR_ID locally before --live.");
    return;
  }
  if (!speech.configured()) {
    fail("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID locally before --live.");
    return;
  }
  if (String(process.env.LIVEAVATAR_MODE || "LITE").toUpperCase() !== "LITE") {
    fail("LIVEAVATAR_MODE must be LITE.");
    return;
  }
  const provider = new LiveAvatarProvider({
    apiKey: process.env.LIVEAVATAR_API_KEY,
    connectTimeoutMs: 15000,
  });
  let started = null;
  const observed = [];
  const result = {
    sentence,
    connected: false,
    speakStarted: false,
    interrupted: false,
    stopped: false,
    liveAudioObserved: false,
    lipSyncObserved: false,
  };
  try {
    started = await provider.start({
      avatarId: process.env.LIVEAVATAR_DEFAULT_AVATAR_ID,
      maxSessionDuration: Math.min(
        60,
        Number(process.env.AVATAR_MAX_SESSION_SECONDS) || 60,
      ),
    });
    result.connected = true;
    result.maxSessionSeconds = started.maxSessionDuration;
    provider.on(started.providerSessionId, (event) => {
      if (!event?.type) return;
      observed.push(event.type);
      if (event.type === "agent.speak_started") result.speakStarted = true;
      if (event.type === "agent.speak_interrupted") result.interrupted = true;
    });
    const source = await speech.streamPcm(sentence, speech.pickVoice({}));
    const reader = source.getReader();
    const { randomUUID } = require("node:crypto");
    const utteranceId = randomUUID();
    let pending = Buffer.alloc(0);
    let first = true;
    while (true) {
      const next = await reader.read();
      const chunk = next.done ? pending : Buffer.concat([pending, Buffer.from(next.value)]);
      pending = Buffer.alloc(0);
      if (!next.done && chunk.length < 48000 && chunk.length % 2 === 0) {
        pending = chunk;
        continue;
      }
      if (chunk.length % 2 !== 0) {
        pending = chunk.subarray(chunk.length - 1);
      }
      const even = chunk.subarray(0, chunk.length - (chunk.length % 2));
      if (even.length) {
        await provider.sendChunk(started.providerSessionId, {
          utteranceId,
          frame: even,
        });
        first = false;
      }
      if (next.done) break;
    }
    if (!first) await provider.endSpeak(started.providerSessionId, { utteranceId });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await provider.interrupt(started.providerSessionId);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    result.error = error.code || "live-failed";
    fail(result.error);
  } finally {
    if (started?.providerSessionId) {
      await provider.stop(started.providerSessionId, "USER_CLOSED").catch(() => {});
      result.stopped = true;
    }
  }
  result.events = [...new Set(observed)];
  console.log(JSON.stringify(result));
  if (!result.connected || !result.stopped) process.exitCode = 1;
}

main();
