"use strict";

const { randomUUID } = require("node:crypto");

class MockAvatarProvider {
  constructor() {
    this.sessions = new Map();
    this.starts = [];
    this.speaks = [];
    this.interrupts = [];
    this.stops = [];
    this.keepAlives = [];
    this.failStart = false;
    this.failSpeak = false;
    this.providerMaxSeconds = null;
    this.listeners = new Map();
  }

  on(sessionId, listener) {
    const list = this.listeners.get(sessionId) || new Set();
    list.add(listener);
    this.listeners.set(sessionId, list);
    return () => list.delete(listener);
  }

  emit(sessionId, event) {
    for (const listener of this.listeners.get(sessionId) || []) listener(event);
  }

  async start(input) {
    this.starts.push({
      mode: input.mode,
      avatarId: input.avatarId,
      maxSessionDuration: input.maxSessionDuration,
    });
    if (this.failStart) {
      this.failStart = false;
      const error = new Error("Mock provider refused to start.");
      error.code = "start";
      throw error;
    }
    const id = `mock-${this.starts.length}-${randomUUID()}`;
    const maxSessionDuration =
      this.providerMaxSeconds || input.maxSessionDuration;
    const session = {
      id,
      stopped: false,
      chunks: [],
      utteranceId: null,
    };
    this.sessions.set(id, session);
    queueMicrotask(() =>
      this.emit(id, {
        type: "session.state_updated",
        state: "connected",
        event_id: randomUUID(),
        source_event_id: null,
      }),
    );
    return {
      providerSessionId: id,
      maxSessionDuration,
      media: null,
      live: false,
    };
  }

  async sendChunk(sessionId, { utteranceId, frame, signal }) {
    const session = this.sessions.get(sessionId);
    if (signal?.aborted) return { aborted: true };
    if (!session || session.stopped) {
      const error = new Error("Mock session is closed.");
      error.code = "control";
      throw error;
    }
    const bytes = Buffer.from(frame);
    if (!session.pending) session.pending = [];
    session.pending.push(bytes);
    session.utteranceId = utteranceId;
    this.speaks.push({ sessionId, utteranceId, bytes: bytes.length });
    if (!session.announced) {
      session.announced = true;
      this.emit(sessionId, {
        type: "agent.speak_started",
        event_id: randomUUID(),
        source_event_id: utteranceId,
      });
    }
    if (this.failSpeak) {
      this.failSpeak = false;
      const error = new Error("Mock provider failed mid-utterance.");
      error.code = "playback";
      throw error;
    }
    return { ok: true };
  }

  async endSpeak(sessionId, { utteranceId, signal }) {
    if (signal?.aborted) return { aborted: true };
    const session = this.sessions.get(sessionId);
    if (!session || session.stopped) return { aborted: true };
    const audio = Buffer.concat(session.pending || []);
    session.chunks.push(audio);
    session.pending = [];
    session.announced = false;
    this.emit(sessionId, {
      type: "agent.speak_ended",
      event_id: randomUUID(),
      source_event_id: utteranceId,
    });
    return { ok: true, bytes: audio.length };
  }

  async setListening(sessionId, listening) {
    this.listening = this.listening || [];
    this.listening.push({ sessionId, listening: !!listening });
  }

  async interrupt(sessionId) {
    this.interrupts.push(sessionId);
    const session = this.sessions.get(sessionId);
    const utteranceId = session?.utteranceId || null;
    this.emit(sessionId, {
      type: "agent.speak_interrupted",
      event_id: randomUUID(),
      source_event_id: utteranceId,
    });
    return { ok: true };
  }

  async keepAlive(sessionId) {
    this.keepAlives.push(sessionId);
  }

  async stop(sessionId, reason) {
    this.stops.push({ sessionId, reason });
    const session = this.sessions.get(sessionId);
    if (session) session.stopped = true;
    this.emit(sessionId, {
      type: "session.state_updated",
      state: "disconnected",
      event_id: randomUUID(),
      source_event_id: null,
    });
  }

  receivedAudio(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return Buffer.alloc(0);
    return Buffer.concat(session.chunks);
  }
}

module.exports = { MockAvatarProvider };
