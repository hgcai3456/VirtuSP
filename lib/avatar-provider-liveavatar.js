"use strict";

const { randomUUID } = require("node:crypto");

const TOKEN_URL = "https://api.liveavatar.com/v1/sessions/token";
const START_URL = "https://api.liveavatar.com/v1/sessions/start";
const STOP_URL = "https://api.liveavatar.com/v1/sessions/stop";

function failure(code) {
  return Object.assign(new Error("LiveAvatar session failed."), { code });
}

function envelopeData(body, ok) {
  if (!ok || !body || body.code !== 100 || !body.data) return null;
  return body.data;
}

class LiveAvatarProvider {
  constructor({ apiKey, fetchImpl, WebSocketImpl, connectTimeoutMs = 8000 } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl || fetch;
    this.WebSocketImpl = WebSocketImpl || globalThis.WebSocket;
    this.connectTimeoutMs = connectTimeoutMs;
    this.sessions = new Map();
  }

  async start({ avatarId, maxSessionDuration }) {
    if (!this.apiKey) throw failure("credentials");
    if (!this.WebSocketImpl) throw failure("control");
    const tokenResponse = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: avatarId,
        max_session_duration: maxSessionDuration,
      }),
    });
    const tokenBody = await tokenResponse.json().catch(() => null);
    const tokenData = envelopeData(tokenBody, tokenResponse.ok);
    if (!tokenData?.session_id || !tokenData?.session_token) throw failure("token");
    let started = null;
    try {
      const startResponse = await this.fetchImpl(START_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.session_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      const startBody = await startResponse.json().catch(() => null);
      started = envelopeData(startBody, startResponse.ok || startResponse.status === 201);
      if (
        !started?.session_id ||
        !started.livekit_url ||
        !started.livekit_client_token ||
        !started.ws_url
      ) {
        if (started?.session_id)
          await this.stopRemote(started.session_id, tokenData.session_token, "SERVER_ERROR");
        throw failure("start");
      }
      const socket = await this.openControl(started.ws_url);
      const record = {
        providerSessionId: started.session_id,
        sessionToken: tokenData.session_token,
        agentToken: started.livekit_agent_token || "",
        wsUrl: started.ws_url,
        socket,
        listeners: new Set(),
        utteranceId: null,
        connected: true,
      };
      socket.onmessage = (message) => {
        let event = null;
        try {
          event = JSON.parse(String(message.data || ""));
        } catch {
          return;
        }
        if (event?.type === "agent.speak_started")
          record.utteranceId = event.source_event_id || record.utteranceId;
        for (const listener of record.listeners) listener(event);
      };
      socket.onclose = () => {
        record.connected = false;
        for (const listener of record.listeners)
          listener({
            type: "session.state_updated",
            state: "disconnected",
            event_id: randomUUID(),
            source_event_id: null,
          });
      };
      this.sessions.set(started.session_id, record);
      const returnedMax = Number(started.max_session_duration);
      return {
        providerSessionId: started.session_id,
        maxSessionDuration:
          Number.isInteger(returnedMax) && returnedMax > 0
            ? returnedMax
            : maxSessionDuration,
        live: true,
        media: {
          livekitUrl: started.livekit_url,
          livekitClientToken: started.livekit_client_token,
        },
      };
    } catch (error) {
      if (started?.session_id)
        await this.stopRemote(
          started.session_id,
          tokenData.session_token,
          "SERVER_ERROR",
        ).catch(() => {});
      if (error.code) throw error;
      throw failure("start");
    }
  }

  openControl(url) {
    const Socket = this.WebSocketImpl;
    return new Promise((resolve, reject) => {
      let socket;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(socket);
      };
      let timer;
      try {
        socket = new Socket(url);
      } catch {
        reject(failure("control"));
        return;
      }
      timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          /* The failed socket is already unusable. */
        }
        finish(failure("control"));
      }, this.connectTimeoutMs);
      socket.onmessage = (message) => {
        let event = null;
        try {
          event = JSON.parse(String(message.data || ""));
        } catch {
          finish(failure("control"));
          return;
        }
        if (event.type === "session.state_updated" && event.state === "connected")
          finish();
        else if (event.type === "error") finish(failure("control"));
      };
      socket.onerror = () => finish(failure("control"));
    });
  }

  on(sessionId, listener) {
    const record = this.sessions.get(sessionId);
    if (!record) return () => {};
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }

  command(record, type, extra = {}) {
    if (!record?.socket || record.socket.readyState === 3) throw failure("control");
    const eventId = extra.event_id || randomUUID();
    record.socket.send(JSON.stringify({ type, event_id: eventId, ...extra, event_id: eventId }));
    return eventId;
  }

  async sendChunk(sessionId, { utteranceId, frame, signal }) {
    if (signal?.aborted) return { aborted: true };
    const record = this.sessions.get(sessionId);
    if (!record?.connected) throw failure("control");
    const first = record.utteranceId !== utteranceId;
    record.utteranceId = utteranceId;
    this.command(record, "agent.speak", {
      event_id: first ? utteranceId : randomUUID(),
      audio: Buffer.from(frame).toString("base64"),
    });
    return { ok: true };
  }

  async endSpeak(sessionId, { utteranceId, signal }) {
    if (signal?.aborted) return { aborted: true };
    const record = this.sessions.get(sessionId);
    if (!record?.connected) throw failure("control");
    this.command(record, "agent.speak_end", {});
    record.utteranceId = utteranceId;
    return { ok: true };
  }

  async setListening(sessionId, listening) {
    const record = this.sessions.get(sessionId);
    if (!record?.connected) return { ok: false };
    this.command(
      record,
      listening ? "agent.start_listening" : "agent.stop_listening",
      {},
    );
    return { ok: true };
  }

  async interrupt(sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record) return { ok: false };
    this.command(record, "agent.interrupt", {});
    return { ok: true };
  }

  async keepAlive(sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record?.connected) return;
    this.command(record, "session.keep_alive", {});
  }

  async stop(sessionId, reason) {
    const record = this.sessions.get(sessionId);
    const token = record?.sessionToken;
    if (record?.socket) {
      try {
        record.socket.close();
      } catch {
        /* Closing a dead socket is the cleanup itself. */
      }
      record.connected = false;
    }
    await this.stopRemote(sessionId, token, reason || "USER_CLOSED");
    this.sessions.delete(sessionId);
  }

  async stopRemote(sessionId, sessionToken, reason) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": this.apiKey,
    };
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    await this.fetchImpl(STOP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session_id: sessionId,
        reason: reason || "USER_CLOSED",
      }),
    }).catch(() => {});
  }
}

module.exports = {
  LiveAvatarProvider,
  TOKEN_URL,
  START_URL,
  STOP_URL,
};
