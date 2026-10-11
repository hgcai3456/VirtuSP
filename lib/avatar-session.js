"use strict";

const { randomUUID } = require("node:crypto");
const speech = require("./speech");
const { evaluateTurn } = require("./avatar-policy");
const { pronounce, PcmPump, pumpStream, PCM_BYTES_PER_SECOND } = require("./avatar-audio");
const { MockAvatarProvider } = require("./avatar-provider-mock");
const { LiveAvatarProvider } = require("./avatar-provider-liveavatar");

const BUILD = "virtusp-avatar-1";
const AVATAR_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[a-zA-Z0-9_-]{1,80}$/;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function readAvatarConfig(env = process.env) {
  const enabled = String(env.AVATAR_ENABLED || "").toLowerCase() === "true";
  const requested = String(env.AVATAR_PROVIDER || "liveavatar").toLowerCase();
  return {
    enabled,
    provider: requested === "mock" ? "mock" : "liveavatar",
    mode: String(env.LIVEAVATAR_MODE || "LITE").toUpperCase(),
    apiKey: env.LIVEAVATAR_API_KEY || "",
    avatarId: env.LIVEAVATAR_DEFAULT_AVATAR_ID || "",
    maxSessionSeconds: clamp(env.AVATAR_MAX_SESSION_SECONDS, 30, 3600, 600),
    idleTimeoutSeconds: clamp(env.AVATAR_IDLE_TIMEOUT_SECONDS, 15, 600, 90),
    localOnly: env.AVATAR_LOCAL_ONLY !== "false",
    chunkBytes: clamp(env.AVATAR_PCM_CHUNK_BYTES, 2, 1024 * 1024, PCM_BYTES_PER_SECOND),
    maxBufferBytes: clamp(
      env.AVATAR_PCM_MAX_BUFFER_BYTES,
      PCM_BYTES_PER_SECOND,
      PCM_BYTES_PER_SECOND * 8,
      PCM_BYTES_PER_SECOND * 4,
    ),
    maxUtteranceSeconds: clamp(env.AVATAR_MAX_UTTERANCE_SECONDS, 5, 180, 60),
    maxNewSessionsPerMinute: clamp(env.AVATAR_MAX_SESSIONS_PER_MINUTE, 1, 20, 4),
    maxConcurrent: clamp(env.AVATAR_MAX_CONCURRENT, 1, 8, 2),
    heartbeatMs: clamp(env.AVATAR_HEARTBEAT_MS, 5000, 60000, 30000),
  };
}

function requestIsLocal(req) {
  const address = String(req.socket?.remoteAddress || "");
  const loopback =
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1";
  const host = String(req.headers?.host || "")
    .replace(/:\d+$/, "")
    .toLowerCase();
  const hostLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return loopback && hostLocal;
}

function sanitizeEvent(event) {
  return {
    type: event.type,
    state: event.state || null,
    encounterId: event.encounterId || null,
    turnId: event.turnId || null,
    playbackRequestId: event.playbackRequestId || null,
    utteranceId: event.utteranceId || null,
    provider: event.provider || null,
    caseVersion: event.caseVersion ?? null,
    fallback: event.fallback || null,
    partial: event.partial === true,
    serverObservedAt: event.serverObservedAt || null,
    reason: event.reason || null,
    playback: event.playback || null,
    connection: event.connection || null,
    live: event.live === true,
  };
}

function createAvatarRuntime(options = {}) {
  const config = { ...readAvatarConfig(), ...(options.config || {}) };
  if (config.chunkBytes % 2 !== 0) config.chunkBytes += 1;
  const now = options.now || Date.now;
  const fetchImpl = options.fetch || fetch;
  const WebSocketImpl = options.WebSocket || globalThis.WebSocket;
  const speechAvailable =
    options.speechAvailable == null ? speech.configured() : options.speechAvailable === true;
  const synthesize =
    options.synthesizePcm ||
    (async (text, profile, signal) => {
      if (!speech.configured()) {
        const error = new Error("ElevenLabs is not configured.");
        error.code = "tts";
        throw error;
      }
      return speech.streamPcm(pronounce(text), speech.pickVoice(profile), {
        signal,
        fetch: fetchImpl,
      });
    });
  const sessions = new Map();
  const subscribers = new Map();
  const recentStarts = new Map();
  let provider = options.provider || null;
  const timer = setInterval(() => runtime.sweep(), 5000);
  if (typeof timer.unref === "function") timer.unref();

  function configuration() {
    if (!config.enabled) return "disabled";
    if (config.provider === "mock") return "mock";
    if (config.mode !== "LITE") return "unsupported-mode";
    if (!config.apiKey || !AVATAR_ID.test(config.avatarId))
      return "missing-credentials";
    return "configured";
  }

  function publicConfig() {
    return {
      enabled: config.enabled === true,
      provider: config.enabled ? config.provider : "none",
      mode: "LITE",
      configuration: configuration(),
      build: BUILD,
      localOnly: config.localOnly !== false,
    };
  }

  function ensureProvider() {
    if (provider) return provider;
    if (config.provider === "mock") provider = new MockAvatarProvider();
    else
      provider = new LiveAvatarProvider({
        apiKey: config.apiKey,
        fetchImpl,
        WebSocketImpl,
        connectTimeoutMs: options.connectTimeoutMs || 8000,
      });
    return provider;
  }

  function emit(session, event) {
    const payload = sanitizeEvent({
      ...event,
      encounterId: session?.encounterId || event.encounterId,
      provider: event.provider || session?.providerName || null,
      caseVersion: event.caseVersion ?? session?.caseVersion ?? null,
      serverObservedAt: new Date(now()).toISOString(),
      live: session?.live === true,
    });
    if (session) {
      session.events.push(payload);
      if (session.events.length > 50) session.events.shift();
    }
    const sinks = subscribers.get(session?.encounterId || event.encounterId);
    for (const sink of sinks || []) sink(payload);
    return payload;
  }

  function record(enc, event) {
    if (!enc.presentationLog) enc.presentationLog = [];
    enc.presentationLog.push(event);
    return event;
  }

  function view(session) {
    if (!session)
      return {
        state: config.enabled ? "CLOSED" : "DISABLED",
        configuration: configuration(),
        connection: "unavailable",
        playback: "idle",
        live: false,
        mode: config.enabled ? "LITE" : "disabled",
        build: BUILD,
        simulatedPatient: true,
        media: null,
      };
    return {
      state: session.state,
      configuration: configuration(),
      connection: session.connection,
      playback: session.playback,
      live: session.live === true,
      mode: session.live ? "LITE" : session.state === "DISABLED" ? "disabled" : "fallback",
      build: BUILD,
      simulatedPatient: true,
      provider: session.providerName,
      encounterId: session.encounterId,
      caseVersion: session.caseVersion,
      patientName: session.patientName,
      generation: session.generation,
      maxSessionSeconds: session.maxSessionSeconds,
      partial: session.partial === true,
      replayAvailable: session.replayAvailable === true,
      fallback: session.fallback || null,
      media: session.live ? session.media : null,
      serverTime: new Date(now()).toISOString(),
      browserPlaybackAt: "unavailable",
    };
  }

  function findByEncounter(encounterId, ownerKey) {
    for (const session of sessions.values()) {
      if (session.encounterId === encounterId && !session.closed) {
        if (ownerKey && session.ownerKey !== ownerKey) return { foreign: true, session };
        return { session };
      }
    }
    return {};
  }

  async function closeSession(session, reason) {
    if (!session || session.closed) return;
    session.closed = true;
    session.generation += 1;
    session.abort?.abort();
    session.pump?.cancel();
    session.beating = false;
    if (session.heartbeat) clearInterval(session.heartbeat);
    session.heartbeat = null;
    session.state = "CLOSED";
    session.connection = "disconnected";
    session.playback = session.partial ? "partial" : "idle";
    const active = ensureProvider();
    if (session.providerSessionId && active?.stop)
      await active.stop(session.providerSessionId, reason).catch(() => {});
    emit(session, {
      type: "avatar_disconnected",
      state: "CLOSED",
      reason,
      connection: "disconnected",
    });
    sessions.delete(session.id);
  }

  function watchProvider(session) {
    const active = ensureProvider();
    if (!session.providerSessionId || !active?.on) return;
    session.unsubscribe = active.on(session.providerSessionId, (event) => {
      if (!event || session.closed) return;
      if (
        (event.type === "agent.speak_started" || event.type === "agent.speak_ended") &&
        event.source_event_id !== session.utteranceId
      )
        return;
      if (
        event.type === "agent.speak_interrupted" &&
        event.source_event_id !== session.utteranceId &&
        event.source_event_id !== session.canceledUtteranceId
      )
        return;
      if (event.type === "agent.speak_started") {
        session.state = "SPEAKING";
        session.playback = "speaking";
        session.utteranceStartedAt = new Date(now()).toISOString();
        emit(session, {
          type: "avatar_utterance_started",
          state: "SPEAKING",
          turnId: session.turnId,
          playbackRequestId: session.playbackRequestId,
          utteranceId: session.utteranceId,
          playback: "speaking",
        });
      } else if (event.type === "agent.speak_ended") {
        session.state = "READY";
        session.playback = "ended";
        emit(session, {
          type: "avatar_utterance_ended",
          state: "READY",
          turnId: session.turnId,
          playbackRequestId: session.playbackRequestId,
          utteranceId: event.source_event_id,
          playback: "ended",
        });
      } else if (event.type === "agent.speak_interrupted") {
        session.partial = true;
        session.replayAvailable = true;
        session.playback = "interrupted";
        session.state = "READY";
        emit(session, {
          type: "avatar_utterance_interrupted",
          state: "READY",
          turnId: session.turnId,
          playbackRequestId: session.playbackRequestId,
          utteranceId: event.source_event_id,
          partial: true,
          playback: "interrupted",
        });
      } else if (event.type === "session.state_updated" && event.state === "disconnected") {
        if (!session.closed) {
          session.closed = true;
          session.beating = false;
          if (session.heartbeat) clearInterval(session.heartbeat);
          session.state = "CLOSED";
          session.connection = "disconnected";
          sessions.delete(session.id);
          emit(session, {
            type: "avatar_disconnected",
            state: "CLOSED",
            reason: "provider",
            connection: "disconnected",
          });
        }
      }
    });
  }

  function beginHeartbeat(session) {
    session.beating = true;
    session.heartbeat = setInterval(() => {
      if (!session.beating || session.closed || !session.providerSessionId) return;
      ensureProvider().keepAlive?.(session.providerSessionId).catch(() => {});
    }, config.heartbeatMs);
    if (typeof session.heartbeat.unref === "function") session.heartbeat.unref();
  }

  async function startSession({ enc, ownerKey, localRequest }) {
    if (!config.enabled)
      return {
        status: 200,
        body: {
          ...view(null),
          state: "DISABLED",
          mode: "disabled",
          fallback: "existing-encounter",
        },
      };
    if (config.localOnly !== false && !localRequest)
      return {
        status: 403,
        body: {
          error:
            "Voice avatar stays on this machine until encounters have real authentication.",
          code: "local-only",
          state: "DISABLED",
        },
      };
    const existing = findByEncounter(enc.id, ownerKey);
    if (existing.foreign)
      return { status: 403, body: { error: "Voice session belongs to another operator.", code: "owner" } };
    if (existing.session && ["READY", "FALLBACK", "LISTENING", "SPEAKING"].includes(existing.session.state))
      return { status: 200, body: view(existing.session) };
    if (enc.p?.presentationKey)
      return {
        status: 200,
        body: {
          ...view(null),
          state: "FALLBACK",
          connection: "unavailable",
          live: false,
          fallback: "existing-encounter",
          reason: "unsupported-presentation",
          patientName: enc.p.name,
          caseVersion: enc.p.version,
          encounterId: enc.id,
        },
      };
    const stamp = now();
    const history = (recentStarts.get(ownerKey) || []).filter((at) => stamp - at < 60000);
    if (history.length >= config.maxNewSessionsPerMinute)
      return { status: 429, body: { error: "Too many voice sessions.", code: "rate-limit" } };
    const openLive = [...sessions.values()].filter((item) => item.live && !item.closed);
    if (openLive.length >= config.maxConcurrent && configuration() === "configured")
      return { status: 429, body: { error: "Too many voice sessions.", code: "rate-limit" } };
    for (const previous of sessions.values()) {
      if (previous.ownerKey === ownerKey && previous.encounterId !== enc.id && !previous.closed)
        await closeSession(previous, "patient-switch");
    }
    const modeOk = config.provider === "mock" || config.mode === "LITE";
    const credsOk = configuration() === "configured" || configuration() === "mock";
    const session = {
      id: randomUUID(),
      ownerKey,
      encounterId: enc.id,
      caseVersion: enc.p?.version ?? null,
      patientName: enc.p?.name || "Simulated patient",
      profileId: enc.p?.id || null,
      generation: 1,
      state: "CONNECTING",
      connection: "unavailable",
      playback: "idle",
      live: false,
      providerName: config.provider,
      events: [],
      playbacks: new Map(),
      startedAt: stamp,
      lastActivity: stamp,
      maxSessionSeconds: config.maxSessionSeconds,
      partial: false,
      replayAvailable: false,
      closed: false,
      beating: false,
    };
    if (!modeOk || !credsOk) {
      session.state = "FALLBACK";
      session.fallback = modeOk ? "missing-credentials" : "unsupported-mode";
      session.connection = "unavailable";
      sessions.set(session.id, session);
      history.push(stamp);
      recentStarts.set(ownerKey, history);
      emit(session, {
        type: "fallback_selected",
        state: "FALLBACK",
        fallback: "text",
        reason: session.fallback,
      });
      return { status: 200, body: view(session) };
    }
    history.push(stamp);
    recentStarts.set(ownerKey, history);
    sessions.set(session.id, session);
    try {
      const active = ensureProvider();
      const started = await active.start({
        mode: "LITE",
        avatarId: config.provider === "mock" ? config.avatarId || "mock-avatar" : config.avatarId,
        maxSessionDuration: config.maxSessionSeconds,
      });
      const providerMax = Number(started.maxSessionDuration);
      if (Number.isInteger(providerMax) && providerMax > 0)
        session.maxSessionSeconds = Math.min(config.maxSessionSeconds, providerMax);
      session.providerSessionId = started.providerSessionId;
      session.live = started.live === true;
      session.media = started.media || null;
      session.connection = session.live ? "connected" : "mock-connected";
      session.state = "READY";
      watchProvider(session);
    if (session.providerSessionId) {
      beginHeartbeat(session);
      if (session.live)
        await active.setListening?.(session.providerSessionId, true).catch(() => {});
    }
      return { status: 200, body: view(session) };
    } catch {
      session.state = "FALLBACK";
      session.connection = "unavailable";
      session.live = false;
      session.media = null;
      session.fallback = "provider";
      if (session.providerSessionId)
        await ensureProvider().stop?.(session.providerSessionId, "SERVER_ERROR").catch(() => {});
      session.providerSessionId = null;
      emit(session, {
        type: "fallback_selected",
        state: "FALLBACK",
        fallback: "text",
        reason: "provider",
      });
      return { status: 200, body: view(session) };
    }
  }

  async function interruptSession(session, reason) {
    if (!session || session.closed) return;
    session.generation += 1;
    session.canceledUtteranceId = session.utteranceId;
    session.utteranceId = null;
    session.abort?.abort();
    session.pump?.cancel();
    session.state = "INTERRUPTING";
    if (session.providerSessionId)
      await ensureProvider().interrupt?.(session.providerSessionId).catch(() => {});
    session.state = "READY";
    session.playback = session.partial ? "interrupted" : "idle";
    if (reason) session.fallback = reason;
  }

  async function speakTurn({ enc, ownerKey, input, store }) {
    if (!config.enabled)
      return { status: 409, body: { error: "Voice avatar is off.", code: "disabled", state: "DISABLED" } };
    const keys = Object.keys(input || {});
    if (keys.some((key) => !["turnId", "playbackRequestId", "generation"].includes(key)))
      return {
        status: 400,
        body: { error: "Speech requests cannot include answer text.", code: "client-text" },
      };
    if (!REQUEST_ID.test(input?.turnId || "") || !REQUEST_ID.test(input?.playbackRequestId || ""))
      return { status: 400, body: { error: "A saved turn and playback request are required.", code: "request" } };
    const located = findByEncounter(enc.id, ownerKey);
    if (located.foreign)
      return { status: 403, body: { error: "Voice session belongs to another operator.", code: "owner" } };
    const session = located.session;
    if (!session)
      return { status: 409, body: { error: "Start the voice session first.", code: "no-session" } };
    if (input.generation != null && Number(input.generation) !== session.generation)
      return { status: 409, body: { error: "Stale voice session.", code: "stale-generation" } };
    const cached = session.playbacks.get(input.playbackRequestId);
    if (cached) {
      if (cached.turnId !== input.turnId)
        return { status: 409, body: { error: "Playback request conflict.", code: "playback-conflict" } };
      return cached.result;
    }
    const turn = (enc.transcript || []).find((item) => item.id === input.turnId);
    if (!turn || turn.role !== "patient")
      return {
        status: 403,
        body: { error: "Only a saved patient turn can be spoken.", code: "turn" },
      };
    const decision = evaluateTurn(enc, turn);
    if (!decision.ok) {
      return {
        status: 422,
        body: {
          error: "This reply is not approved for speech.",
          code: decision.code,
          playLocalAudio: false,
        },
      };
    }
    const generation = session.generation;
    let result;
    const pending = (async () => {
      session.lastActivity = now();
      session.turnId = turn.id;
      session.playbackRequestId = input.playbackRequestId;
      session.partial = false;
      session.replayAvailable = false;
      session.state = "PREPARING_REPLY";
      session.playback = "preparing";
      const committed = record(enc, emit(session, {
        type: "answer_committed",
        state: "PREPARING_REPLY",
        turnId: turn.id,
        playbackRequestId: input.playbackRequestId,
        caseVersion: enc.p?.version ?? null,
      }));
      if (!session.providerSessionId || session.state === "FALLBACK" || session.fallback === "missing-credentials" || session.fallback === "provider") {
        const path = speechAvailable ? "portrait-audio" : "text";
        result = {
          status: 200,
          body: {
            ...view(session),
            state: "FALLBACK",
            playback: "idle",
            playLocalAudio: path === "portrait-audio",
            fallback: path,
            turnId: turn.id,
            playbackRequestId: input.playbackRequestId,
            partial: false,
            replayAvailable: false,
          },
        };
        session.state = "FALLBACK";
        record(enc, emit(session, {
          type: "fallback_selected",
          state: "FALLBACK",
          turnId: turn.id,
          playbackRequestId: input.playbackRequestId,
          fallback: path,
          reason: session.fallback || "unavailable",
        }));
        return result;
      }
      const controller = new AbortController();
      session.abort = controller;
      const utteranceId = randomUUID();
      session.utteranceId = utteranceId;
      const pump = new PcmPump({
        chunkBytes: config.chunkBytes,
        maxBytes: config.maxBufferBytes,
      });
      session.pump = pump;
      let sent = 0;
      try {
        record(enc, emit(session, {
          type: "synthesis_started",
          state: "PREPARING_REPLY",
          turnId: turn.id,
          playbackRequestId: input.playbackRequestId,
          utteranceId,
        }));
        await ensureProvider().setListening?.(session.providerSessionId, false).catch(() => {});
        const source = await synthesize(decision.text, enc.p, controller.signal);
        if (generation !== session.generation || controller.signal.aborted)
          throw Object.assign(new Error("aborted"), { code: "aborted" });
        const pumped = await pumpStream({
          stream: source,
          pump,
          generation: pump.generation,
          signal: controller.signal,
          maxBytes: config.maxUtteranceSeconds * PCM_BYTES_PER_SECOND,
          onFrame: async (frame) => {
            if (controller.signal.aborted || session.generation !== generation) return;
            sent += frame.length;
            const chunk = await ensureProvider().sendChunk(session.providerSessionId, {
              utteranceId,
              frame,
              signal: controller.signal,
            });
            if (chunk?.aborted) return;
          },
        });
        if (pumped.aborted || session.generation !== generation) {
          session.partial = sent > 0;
          session.replayAvailable = sent > 0;
          session.playback = sent > 0 ? "interrupted" : "idle";
          session.state = "READY";
          result = {
            status: 200,
            body: {
              ...view(session),
              playLocalAudio: false,
              partial: sent > 0,
              replayAvailable: sent > 0,
              turnId: turn.id,
              playbackRequestId: input.playbackRequestId,
              utteranceId,
            },
          };
          return result;
        }
        await ensureProvider().endSpeak(session.providerSessionId, {
          utteranceId,
          signal: controller.signal,
        });
        await ensureProvider().setListening?.(session.providerSessionId, true).catch(() => {});
        session.playback = "submitted";
        result = {
          status: 200,
          body: {
            ...view(session),
            playLocalAudio: false,
            partial: false,
            replayAvailable: false,
            turnId: turn.id,
            playbackRequestId: input.playbackRequestId,
            utteranceId,
            synthesisStartedAt: committed.serverObservedAt,
            providerPlaybackAt: session.utteranceStartedAt || "unavailable",
            browserPlaybackAt: "unavailable",
          },
        };
        return result;
      } catch (error) {
        const aborted = error?.code === "aborted" || controller.signal.aborted;
        if (!aborted && session.providerSessionId)
          await ensureProvider().interrupt?.(session.providerSessionId).catch(() => {});
        const partial = sent > 0 || aborted;
        session.partial = partial && sent > 0;
        session.replayAvailable = session.partial;
        const localAudio = !session.partial && speechAvailable;
        const path = session.partial ? "text" : localAudio ? "portrait-audio" : "text";
        session.state = path === "text" && !session.providerSessionId ? "FALLBACK" : "READY";
        if (!session.live) session.state = "FALLBACK";
        session.playback = session.partial ? "partial" : "idle";
        session.fallback = path;
        record(enc, emit(session, {
          type: "fallback_selected",
          state: session.state,
          turnId: turn.id,
          playbackRequestId: input.playbackRequestId,
          utteranceId,
          fallback: path,
          partial: session.partial,
          reason: aborted ? "interrupted" : error.code || "playback",
        }));
        result = {
          status: 200,
          body: {
            ...view(session),
            playLocalAudio: localAudio,
            partial: session.partial,
            replayAvailable: session.partial,
            fallback: path,
            turnId: turn.id,
            playbackRequestId: input.playbackRequestId,
            utteranceId,
          },
        };
        return result;
      }
    })();
    session.playbacks.set(input.playbackRequestId, {
      turnId: input.turnId,
      result: pending.then((value) => {
        store?.save?.().catch(() => {});
        return value;
      }),
    });
    return session.playbacks.get(input.playbackRequestId).result;
  }

  async function handle(ctx) {
    const { req, res, enc, send, ownerKey, store, parts } = ctx;
    const action = parts[4];
    const localRequest = requestIsLocal(req);
    if (req.method === "POST" && action === "start") {
      const outcome = await startSession({ enc, ownerKey, localRequest });
      return send(res, outcome.status, outcome.body);
    }
    if (req.method === "POST" && action === "speak") {
      let input = {};
      try {
        input = await ctx.body(req);
      } catch (error) {
        return send(res, error.status || 400, { error: error.message });
      }
      const outcome = await speakTurn({ enc, ownerKey, input, store });
      return send(res, outcome.status, outcome.body);
    }
    if (req.method === "POST" && action === "interrupt") {
      const located = findByEncounter(enc.id, ownerKey);
      if (located.foreign)
        return send(res, 403, { error: "Voice session belongs to another operator.", code: "owner" });
      if (!located.session)
        return send(res, 409, { error: "Voice session is not active.", code: "no-session" });
      located.session.partial = located.session.playback === "speaking" || located.session.playback === "preparing" || located.session.playback === "submitted";
      await interruptSession(located.session, "operator");
      located.session.replayAvailable = located.session.partial === true;
      return send(res, 200, view(located.session));
    }
    if (req.method === "POST" && action === "stop") {
      const located = findByEncounter(enc.id, ownerKey);
      if (located.foreign)
        return send(res, 403, { error: "Voice session belongs to another operator.", code: "owner" });
      if (located.session) await closeSession(located.session, "USER_CLOSED");
      return send(res, 200, {
        state: "CLOSED",
        encounterStatus: enc.status,
        live: false,
        connection: "disconnected",
        playback: "idle",
        build: BUILD,
      });
    }
    if (req.method === "POST" && action === "heartbeat") {
      const located = findByEncounter(enc.id, ownerKey);
      if (located.foreign)
        return send(res, 403, { error: "Voice session belongs to another operator.", code: "owner" });
      if (!located.session)
        return send(res, 409, { error: "Voice session is not active.", code: "no-session" });
      located.session.lastActivity = now();
      const input = await ctx.body(req).catch(() => ({}));
      const reported = String(input.activity || "");
      if (["LISTENING", "TRANSCRIBING", "READY"].includes(reported) && located.session.state !== "SPEAKING" && located.session.state !== "PREPARING_REPLY")
        located.session.state = reported;
      return send(res, 200, view(located.session));
    }
    if (req.method === "GET" && action === "status") {
      const located = findByEncounter(enc.id, ownerKey);
      if (located.foreign)
        return send(res, 403, { error: "Voice session belongs to another operator.", code: "owner" });
      return send(res, 200, view(located.session));
    }
    if (req.method === "GET" && action === "events") {
      const located = findByEncounter(enc.id, ownerKey);
      if (located.foreign)
        return send(res, 403, { error: "Voice session belongs to another operator.", code: "owner" });
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
      });
      const sink = (event) => {
        res.write(`event: avatar\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const set = subscribers.get(enc.id) || new Set();
      set.add(sink);
      subscribers.set(enc.id, set);
      sink(sanitizeEvent({
        type: "status",
        state: located.session?.state || "CLOSED",
        encounterId: enc.id,
        connection: located.session?.connection || "unavailable",
        playback: located.session?.playback || "idle",
        serverObservedAt: new Date(now()).toISOString(),
      }));
      req.on("close", () => set.delete(sink));
      return;
    }
    return send(res, 404, { error: "Not found." });
  }

  const runtime = {
    config,
    publicConfig,
    handle,
    sweep(at = now()) {
      for (const session of [...sessions.values()]) {
        if (session.closed) continue;
        const idle = at - session.lastActivity >= config.idleTimeoutSeconds * 1000;
        const expired = at - session.startedAt >= session.maxSessionSeconds * 1000;
        if (idle || expired)
          closeSession(session, idle ? "IDLE_TIMEOUT" : "MAX_DURATION_REACHED");
      }
    },
    beat(encounterId) {
      const located = findByEncounter(encounterId);
      const session = located.session;
      if (!session?.beating || session.closed || !session.providerSessionId) return false;
      ensureProvider().keepAlive?.(session.providerSessionId);
      return true;
    },
    provider() {
      return provider;
    },
    sessionFor(encounterId) {
      return findByEncounter(encounterId).session || null;
    },
    shutdown() {
      clearInterval(timer);
      for (const session of [...sessions.values()]) closeSession(session, "SERVER_ERROR");
    },
  };
  return runtime;
}

module.exports = {
  BUILD,
  readAvatarConfig,
  requestIsLocal,
  sanitizeEvent,
  createAvatarRuntime,
};
