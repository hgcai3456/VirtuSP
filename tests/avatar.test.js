"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");
const { createAvatarRuntime } = require("../lib/avatar-session");
const { MockAvatarProvider } = require("../lib/avatar-provider-mock");
const { LiveAvatarProvider, TOKEN_URL, START_URL, STOP_URL } = require("../lib/avatar-provider-liveavatar");
const { PcmPump, pronounce, PCM_BYTES_PER_SECOND } = require("../lib/avatar-audio");
const { evaluateTurn } = require("../lib/avatar-policy");
const speech = require("../lib/speech");

const AVATAR_ID = "11111111-1111-4111-8111-111111111111";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boot(options = {}) {
  process.env.AI_ENABLED = "false";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-avatar-"));
  const provider = options.provider || (options.live ? null : new MockAvatarProvider());
  const spoken = [];
  let clock = options.clock || 1_700_000_000_000;
  const avatarRuntime = createAvatarRuntime({
    provider,
    speechAvailable: false,
    now: () => clock,
    synthesizePcm: options.synthesizePcm || (async (text) => {
      spoken.push(text);
      return Buffer.from([1, 2, 3, 4, 5, 6]);
    }),
    fetch: options.fetch,
    WebSocket: options.WebSocket,
    connectTimeoutMs: options.connectTimeoutMs,
    config: {
      enabled: true,
      provider: options.live ? "liveavatar" : "mock",
      mode: "LITE",
      apiKey: options.apiKey || "",
      avatarId: options.avatarId || AVATAR_ID,
      localOnly: true,
      maxSessionSeconds: 600,
      idleTimeoutSeconds: options.idleTimeoutSeconds || 90,
      chunkBytes: 4,
      maxBufferBytes: options.maxBufferBytes || 64,
      maxUtteranceSeconds: 60,
      maxNewSessionsPerMinute: options.maxNewSessionsPerMinute || 4,
      maxConcurrent: 2,
      heartbeatMs: 30000,
      ...(options.config || {}),
    },
  });
  const app = await createApp({ dataDir: dir, avatarRuntime });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  return {
    app,
    base,
    client,
    provider,
    spoken,
    avatarRuntime,
    dir,
    advance(ms) {
      clock += ms;
    },
    async close() {
      avatarRuntime.shutdown();
      await new Promise((resolve) => app.server.close(resolve));
      if (app.store?.queue) await app.store.queue.catch(() => {});
      let last;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
          return;
        } catch (error) {
          last = error;
          await delay(40 * (attempt + 1));
        }
      }
      throw last;
    },
  };
}

async function call(ctx, url, method = "GET", payload) {
  const response = await ctx.client(ctx.base + url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data, text };
}

async function encounter(ctx, profileId = "omar") {
  const created = await call(ctx, "/api/encounters", "POST", { profileId });
  assert.equal(created.status, 201, created.text);
  return created.data.encounter;
}

async function ask(ctx, id, question, requestId) {
  const result = await call(ctx, `/api/encounters/${id}/turn`, "POST", {
    question,
    requestId,
  });
  assert.equal(result.status, 200, result.text);
  return result.data.encounter.transcript.findLast((turn) => turn.role === "patient");
}

test("one second of 24 kHz PCM is 48000 bytes and pronunciation keeps order and negation", () => {
  assert.equal(PCM_BYTES_PER_SECOND, 48000);
  const pressure = pronounce("The reading was 155/110.");
  assert.match(pressure, /155 over 110/);
  assert.equal(pressure.includes("110 over 155"), false);
  assert.ok(pressure.indexOf("155") < pressure.indexOf("110"));
  const smoking = pronounce("I do not smoke.");
  assert.match(smoking, /do not smoke/);
  assert.doesNotMatch(smoking, /\bI smoke\b/);
  assert.match(pronounce("Take 5 mg."), /milligrams/);
});

test("PCM survives odd network chunks, rejects a torn sample, and stays bounded", () => {
  const pump = new PcmPump({ chunkBytes: 4, maxBytes: 8 });
  assert.equal(pump.push(Buffer.from([1])).ok, true);
  assert.equal(pump.push(Buffer.from([2, 3])).ok, true);
  assert.equal(pump.push(Buffer.from([4, 5, 6])).ok, true);
  const first = pump.takeReady();
  assert.deepEqual([...first.frame], [1, 2, 3, 4]);
  pump.finish();
  const tail = pump.takeReady();
  assert.deepEqual([...tail.frame], [5, 6]);
  const torn = new PcmPump({ chunkBytes: 4, maxBytes: 8 });
  torn.push(Buffer.from([1, 2, 3]));
  assert.throws(() => torn.finish(), /Incomplete PCM sample/);
  const bounded = new PcmPump({ chunkBytes: 4, maxBytes: 8 });
  assert.equal(bounded.push(Buffer.alloc(6)).ok, true);
  const blocked = bounded.push(Buffer.alloc(4));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "backpressure");
  assert.ok(bounded.buffered() <= 8);
  bounded.cancel();
  assert.equal(bounded.push(Buffer.from([9, 9]), 1).ignored, true);
});

test("feature disabled preserves the encounter and does not synthesize speech", async () => {
  const ctx = await boot({ config: { enabled: false } });
  try {
    const enc = await encounter(ctx);
    const turn = await ask(ctx, enc.id, "hello", "hello-disabled");
    assert.equal(turn.text, "Hello.");
    const started = await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    assert.equal(started.data.state, "DISABLED");
    assert.equal(started.data.live, false);
    const spoken = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "play-disabled",
    });
    assert.equal(spoken.status, 409);
    assert.equal(ctx.spoken.length, 0);
    assert.equal(ctx.provider.starts.length, 0);
    const again = await call(ctx, `/api/encounters/${enc.id}`);
    assert.equal(again.data.encounter.status, "active");
    assert.equal(again.data.encounter.transcript.at(-1).text, "Hello.");
  } finally {
    await ctx.close();
  }
});

test("missing credentials fall back without a fake live connection", async () => {
  let called = 0;
  const ctx = await boot({
    live: true,
    apiKey: "",
    avatarId: "",
    fetch: async () => {
      called += 1;
      throw new Error("network should not be called");
    },
  });
  try {
    const enc = await encounter(ctx);
    const started = await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    assert.equal(started.status, 200);
    assert.equal(started.data.state, "FALLBACK");
    assert.equal(started.data.live, false);
    assert.equal(started.data.connection, "unavailable");
    assert.equal(called, 0);
    assert.equal(JSON.stringify(started.data).includes("connected"), false);
    const turn = await ask(ctx, enc.id, "hello", "hello-fallback");
    const spoken = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "play-fallback",
    });
    assert.equal(spoken.data.playLocalAudio, false);
    assert.equal(spoken.data.fallback, "text");
    assert.equal(ctx.spoken.length, 0);
  } finally {
    await ctx.close();
  }
});

test("only a saved patient turn can be spoken and browser text never reaches TTS", async () => {
  const ctx = await boot();
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    const asked = await call(ctx, `/api/encounters/${enc.id}/turn`, "POST", {
      question: "hello",
      requestId: "hello-saved",
    });
    const student = asked.data.encounter.transcript.find((turn) => turn.role === "student");
    const patient = asked.data.encounter.transcript.findLast((turn) => turn.role === "patient");
    const studentSpeech = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: student.id,
      playbackRequestId: "student-play",
    });
    assert.equal(studentSpeech.status, 403);
    const altered = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: patient.id,
      playbackRequestId: "altered-play",
      text: "I smoke.",
      approved: true,
    });
    assert.equal(altered.status, 400);
    assert.equal(ctx.spoken.length, 0);
    const ok = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: patient.id,
      playbackRequestId: "hello-play",
    });
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(ctx.spoken, ["Hello."]);
    assert.equal(ok.data.playLocalAudio, false);
  } finally {
    await ctx.close();
  }
});

test("cross-encounter and cross-owner avatar requests are rejected", async () => {
  const ctx = await boot();
  try {
    const first = await encounter(ctx, "omar");
    const second = await encounter(ctx, "denise");
    const turn = await ask(ctx, first.id, "hello", "owner-hello");
    await call(ctx, `/api/encounters/${first.id}/avatar/start`, "POST", {});
    const crossed = await call(ctx, `/api/encounters/${second.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "cross-turn",
    });
    assert.equal(crossed.status, 403);
    const other = require("./http-client").cookieClient(() => ctx.base);
    await other(ctx.base + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "faculty" }),
    });
    const foreign = await other(ctx.base + `/api/encounters/${first.id}/avatar/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: turn.id, playbackRequestId: "foreign-play" }),
    });
    assert.equal(foreign.status, 403);
    const students = await call(ctx, "/api/students");
    const [studentA, studentB] = students.data.students;
    const learner = require("./http-client").cookieClient(() => ctx.base);
    await learner(ctx.base + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student", studentId: studentA.id }),
    });
    const ownedResponse = await learner(ctx.base + "/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "denise" }),
    });
    const ownedText = await ownedResponse.text();
    assert.equal(ownedResponse.status, 201, ownedText);
    const ownedBody = JSON.parse(ownedText);
    const intruder = require("./http-client").cookieClient(() => ctx.base);
    await intruder(ctx.base + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student", studentId: studentB.id }),
    });
    const hidden = await intruder(
      ctx.base + `/api/encounters/${ownedBody.encounter.id}/avatar/status`,
    );
    assert.equal(hidden.status, 403);
  } finally {
    await ctx.close();
  }
});

test("unapproved, invented, swapped, and chart-only lines never reach TTS", async () => {
  const ctx = await boot();
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    const clinical = await ask(ctx, enc.id, "Did you have a stroke, and do you smoke?", "missing-history");
    const invented = [
      "I do not smoke.",
      "I smoke.",
      "I had a stroke.",
      "There is no family history of stroke.",
    ];
    const record = ctx.app.store.state.encounters[enc.id];
    for (const line of invented) {
      assert.equal(
        record.p.facts.some((fact) => fact.vis === "ask" && fact.say === line),
        false,
        line,
      );
      assert.notEqual(clinical.text, line);
    }
    const unknownSpeech = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: clinical.id,
      playbackRequestId: "unknown-play",
    });
    if (evaluateTurn(record, clinical).ok) {
      assert.equal(unknownSpeech.status, 200, unknownSpeech.text);
      for (const line of invented) assert.notEqual(ctx.spoken.at(-1), pronounce(line));
    } else {
      assert.equal(unknownSpeech.status, 422);
      assert.equal(ctx.spoken.length, 0);
    }
    const askFact = record.p.facts.find((fact) => fact.vis === "ask" && fact.say);
    const chart = record.p.facts.find((fact) => fact.vis === "chart") || record.p.facts[0];
    chart.vis = "chart";
    chart.label = "LDL 195";
    chart.say = "LDL is 195.";
    askFact.say = "I do not smoke.";
    record.disclosed[askFact.id] = { at: "2026-10-10T00:00:00.000Z" };
    record.transcript.push(
      {
        id: "model-turn",
        role: "patient",
        text: "I had a stroke and I smoke.",
        factIds: [],
        provider: "bedrock",
      },
      {
        id: "invented-turn",
        role: "patient",
        text: "I do not have a family history of stroke.",
        factIds: [],
        provider: "bedrock",
      },
      {
        id: "swapped-turn",
        role: "patient",
        text: "The reading was 110/155.",
        factIds: [askFact.id],
        provider: "bedrock",
      },
      {
        id: "chart-turn",
        role: "patient",
        text: "LDL is 195.",
        factIds: [chart.id],
        provider: "bedrock",
      },
      {
        id: "approved-smoke",
        role: "patient",
        text: "I do not smoke.",
        factIds: [askFact.id],
        provider: "approved",
      },
    );
    askFact.say = "I do not smoke.";
    const spokenBeforeDenied = ctx.spoken.length;
    for (const id of ["model-turn", "invented-turn", "swapped-turn", "chart-turn"]) {
      const denied = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
        turnId: id,
        playbackRequestId: `deny-${id}`,
      });
      assert.equal(denied.status, 422, id + denied.text);
    }
    assert.equal(ctx.spoken.length, spokenBeforeDenied);
    const pressure = record.p.facts.find((fact) => fact.id === askFact.id);
    pressure.say = "The reading was 155/110.";
    record.transcript.push({
      id: "pressure-turn",
      role: "patient",
      text: "The reading was 155/110.",
      factIds: [pressure.id],
      provider: "approved",
    });
    const approvedSmoke = record.transcript.find((turn) => turn.id === "approved-smoke");
    approvedSmoke.text = "I do not smoke.";
    pressure.say = "I do not smoke.";
    const smoke = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: "approved-smoke",
      playbackRequestId: "smoke-play",
    });
    assert.equal(smoke.status, 200, smoke.text);
    assert.match(ctx.spoken.at(-1), /do not smoke/);
    assert.doesNotMatch(ctx.spoken.at(-1), /\bI smoke\b/);
    pressure.say = "The reading was 155/110.";
    const reading = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: "pressure-turn",
      playbackRequestId: "pressure-play",
    });
    assert.equal(reading.status, 200, reading.text);
    assert.match(ctx.spoken.at(-1), /155 over 110/);
    assert.equal(ctx.spoken.at(-1).includes("110 over 155"), false);
    const decision = evaluateTurn(record, {
      role: "patient",
      text: chart.label,
      factIds: [],
    });
    assert.equal(decision.ok, false);
  } finally {
    await ctx.close();
  }
});

test("duplicate playback is reused and a changed payload conflicts", async () => {
  const ctx = await boot();
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    const turn = await ask(ctx, enc.id, "hello", "dup-hello");
    const first = call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "same-play",
    });
    const second = call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "same-play",
    });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(ctx.spoken.length, 1);
    assert.equal(ctx.provider.speaks.length > 0, true);
    const other = await ask(ctx, enc.id, "thank you", "thanks-turn");
    const conflict = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: other.id,
      playbackRequestId: "same-play",
    });
    assert.equal(conflict.status, 409);
    assert.equal(ctx.spoken.length, 1);
  } finally {
    await ctx.close();
  }
});

test("interruption drops late audio and patient switching stops the previous session", async () => {
  let release;
  const ctx = await boot({
    synthesizePcm: async (text, profile, signal) =>
      (async function* () {
        yield Buffer.from([1, 2, 3, 4]);
        await new Promise((resolve, reject) => {
          release = resolve;
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.code = "aborted";
            reject(error);
          });
        });
        yield Buffer.from([5, 6, 7, 8]);
      })(),
  });
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    const turn = await ask(ctx, enc.id, "hello", "interrupt-hello");
    const pending = call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "interrupt-play",
    });
    for (let i = 0; i < 50 && ctx.provider.speaks.length === 0; i++) await delay(10);
    assert.equal(ctx.provider.speaks.length > 0, true);
    const stopped = await call(ctx, `/api/encounters/${enc.id}/avatar/interrupt`, "POST", {});
    assert.equal(stopped.status, 200);
    const finished = await pending;
    assert.equal(finished.data.playLocalAudio, false);
    const bytes = ctx.provider.speaks.reduce((total, item) => total + item.bytes, 0);
    assert.equal(bytes, 4);
    assert.equal(ctx.provider.interrupts.length > 0, true);
    release?.();
    const other = await encounter(ctx, "denise");
    const switched = await call(ctx, `/api/encounters/${other.id}/avatar/start`, "POST", {});
    assert.equal(switched.status, 200);
    assert.equal(ctx.provider.stops.some((item) => item.reason === "patient-switch"), true);
    const stale = await call(ctx, `/api/encounters/${enc.id}/avatar/status`);
    assert.equal(stale.data.state, "CLOSED");
    const saved = await call(ctx, `/api/encounters/${enc.id}`);
    assert.equal(saved.data.encounter.status, "active");
  } finally {
    await ctx.close();
  }
});

test("provider failure keeps the encounter and does not start a second audio path", async () => {
  const ctx = await boot();
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    const turn = await ask(ctx, enc.id, "hello", "fail-hello");
    ctx.provider.failSpeak = true;
    const failed = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "fail-play",
    });
    assert.equal(failed.status, 200);
    assert.equal(failed.data.playLocalAudio, false);
    assert.equal(failed.data.partial, true);
    assert.equal(failed.data.replayAvailable, true);
    const saved = await call(ctx, `/api/encounters/${enc.id}`);
    assert.equal(saved.data.encounter.status, "active");
    assert.equal(saved.data.encounter.transcript.at(-1).text, "Hello.");
    assert.equal(ctx.spoken.length, 1);
  } finally {
    await ctx.close();
  }
});

test("disconnect and idle timeout stop the provider and its heartbeat", async () => {
  const ctx = await boot();
  try {
    const enc = await encounter(ctx);
    await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    assert.equal(ctx.avatarRuntime.beat(enc.id), true);
    assert.equal(ctx.provider.keepAlives.length, 1);
    const session = ctx.avatarRuntime.sessionFor(enc.id);
    ctx.provider.emit(session.providerSessionId, {
      type: "session.state_updated",
      state: "disconnected",
      event_id: "disc",
      source_event_id: null,
    });
    assert.equal(ctx.avatarRuntime.beat(enc.id), false);
    const restarted = await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    assert.equal(restarted.data.connection, "mock-connected");
    assert.equal(ctx.avatarRuntime.beat(enc.id), true);
    ctx.advance(91_000);
    ctx.avatarRuntime.sweep();
    assert.equal(ctx.avatarRuntime.beat(enc.id), false);
    assert.equal(
      ctx.provider.stops.some((item) => item.reason === "IDLE_TIMEOUT"),
      true,
    );
    const stopped = await call(ctx, `/api/encounters/${enc.id}/avatar/stop`, "POST", {});
    const after = await call(ctx, `/api/encounters/${enc.id}`);
    assert.equal(stopped.data.encounterStatus, "active");
    assert.equal(after.data.encounter.status, "active");
  } finally {
    await ctx.close();
  }
});

test("live avatar responses omit control credentials", async () => {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.readyState = 1;
      FakeSocket.latest = this;
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({
            type: "session.state_updated",
            state: "connected",
            event_id: "srv",
            source_event_id: null,
          }),
        });
      });
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
    }
  }
  const calls = [];
  const ctx = await boot({
    live: true,
    apiKey: "SECRET-LIVEAVATAR-KEY",
    avatarId: AVATAR_ID,
    WebSocket: FakeSocket,
    fetch: async (url, options) => {
      calls.push({ url: String(url), body: options.body, headers: options.headers });
      if (String(url) === TOKEN_URL)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 100,
            data: { session_id: "sess-1", session_token: "SECRET-SESSION-TOKEN" },
            message: "ok",
          }),
        };
      if (String(url) === START_URL)
        return {
          ok: true,
          status: 201,
          json: async () => ({
            code: 100,
            data: {
              session_id: "sess-1",
              livekit_url: "wss://media.example/room",
              livekit_client_token: "CLIENT-MEDIA-TOKEN",
              livekit_agent_token: "SECRET-AGENT-TOKEN",
              ws_url: "wss://example.test/SECRET-CONTROL",
              max_session_duration: 120,
            },
            message: "ok",
          }),
        };
      assert.equal(String(url), STOP_URL);
      return { ok: true, status: 200, json: async () => ({ code: 100, data: null, message: "ok" }) };
    },
  });
  try {
    const enc = await encounter(ctx);
    const started = await call(ctx, `/api/encounters/${enc.id}/avatar/start`, "POST", {});
    assert.equal(started.status, 200, started.text);
    assert.equal(started.data.live, true);
    assert.equal(started.data.connection, "connected");
    assert.equal(started.data.maxSessionSeconds, 120);
    assert.equal(started.data.media.livekitClientToken, "CLIENT-MEDIA-TOKEN");
    const leaked = `${started.text}\n${logs.join("\n")}`;
    assert.equal(leaked.includes("SECRET-LIVEAVATAR-KEY"), false);
    assert.equal(leaked.includes("SECRET-SESSION-TOKEN"), false);
    assert.equal(leaked.includes("SECRET-AGENT-TOKEN"), false);
    assert.equal(leaked.includes("SECRET-CONTROL"), false);
    const tokenCall = JSON.parse(calls[0].body);
    assert.equal(tokenCall.mode, "LITE");
    assert.equal(tokenCall.avatar_id, AVATAR_ID);
    assert.equal(JSON.stringify(tokenCall).includes("LDL"), false);
    const turn = await ask(ctx, enc.id, "hello", "live-hello");
    const spoken = await call(ctx, `/api/encounters/${enc.id}/avatar/speak`, "POST", {
      turnId: turn.id,
      playbackRequestId: "live-play",
    });
    assert.equal(spoken.status, 200, spoken.text);
    const frames = FakeSocket.latest.sent.filter((item) => item.type === "agent.speak");
    assert.equal(frames[0].event_id, spoken.data.utteranceId);
    assert.equal(FakeSocket.latest.sent.some((item) => item.type === "agent.speak_end"), true);
    assert.deepEqual(
      [...Buffer.from(frames[0].audio, "base64").subarray(0, 4)],
      [1, 2, 3, 4],
    );
    const health = await call(ctx, "/api/health");
    assert.equal(health.text.includes("SECRET-LIVEAVATAR-KEY"), false);
    await call(ctx, `/api/encounters/${enc.id}/avatar/stop`, "POST", {});
    assert.equal(calls.some((item) => item.url === STOP_URL), true);
  } finally {
    console.error = original;
    await ctx.close();
  }
});

test("ElevenLabs PCM requests use pcm_24000 and reject an MP3 body", async () => {
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const previousVoice = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_VOICE_ID = "voice123";
  try {
    let seen = null;
    const stream = await speech.streamPcm("Hello.", "voice123", {
      fetch: async (url, options) => {
        seen = { url: String(url), body: JSON.parse(options.body) };
        return {
          ok: true,
          headers: { get: () => "application/octet-stream" },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.close();
            },
          }),
        };
      },
    });
    assert.match(seen.url, /output_format=pcm_24000/);
    assert.equal(seen.url.includes("optimize_streaming_latency=4"), false);
    assert.equal(seen.body.apply_text_normalization, "on");
    assert.ok(stream);
    await assert.rejects(
      () =>
        speech.streamPcm("Hello.", "voice123", {
          fetch: async () => ({
            ok: true,
            headers: { get: () => "audio/mpeg" },
            body: {},
          }),
        }),
      /not PCM/,
    );
  } finally {
    if (previousKey) process.env.ELEVENLABS_API_KEY = previousKey;
    else delete process.env.ELEVENLABS_API_KEY;
    if (previousVoice) process.env.ELEVENLABS_VOICE_ID = previousVoice;
    else delete process.env.ELEVENLABS_VOICE_ID;
  }
});

test("new avatar sessions are rate limited", async () => {
  const ctx = await boot({ maxNewSessionsPerMinute: 2 });
  try {
    const ids = [];
    for (const profileId of ["omar", "denise", "omar"]) {
      ids.push((await encounter(ctx, profileId)).id);
    }
    assert.equal((await call(ctx, `/api/encounters/${ids[0]}/avatar/start`, "POST", {})).status, 200);
    assert.equal((await call(ctx, `/api/encounters/${ids[1]}/avatar/start`, "POST", {})).status, 200);
    const limited = await call(ctx, `/api/encounters/${ids[2]}/avatar/start`, "POST", {});
    assert.equal(limited.status, 429);
    assert.equal(ctx.provider.starts.length, 2);
  } finally {
    await ctx.close();
  }
});

test("LiveAvatar provider is constructible for the documented LITE contract", () => {
  const provider = new LiveAvatarProvider({ apiKey: "", fetchImpl: async () => {
    throw new Error("no network");
  } });
  assert.equal(typeof provider.start, "function");
  assert.equal(typeof provider.stop, "function");
});
