"use strict";
(function (root) {
  const doc = root.document;
  if (!doc) return;

  function createAvatarView() {
    let panel = null;
    let video = null;
    let remoteAudio = null;
    let localAudio = null;
    let room = null;
    let connectedKey = "";
    let connectCount = 0;
    let state = "DISABLED";
    let encounterId = "";
    let session = null;
    let playbackGen = 0;
    let events = null;
    let recognition = null;
    let micStream = null;
    let heartbeat = 0;
    let currentUtterance = "";
    let captionText = "";
    const callbacks = {
      submitQuestion() {},
      stopLocalAudio() {},
      onPlaybackSettled() {},
      setMuted() {},
      isMuted: () => false,
      mediaClient: null,
      getUserMedia: null,
    };

    function $(selector) {
      return panel?.querySelector(selector) || null;
    }

    function setState(next, label) {
      state = next;
      panel?.setAttribute("data-state", next);
      const status = $("#avatar-status");
      if (status) status.textContent = label || next;
      const enable = $("#avatar-enable");
      if (enable) enable.hidden = next !== "ERROR" || !panel?.dataset.audioBlocked;
      const replay = $('[data-action="avatar-replay"]');
      if (replay) replay.hidden = !panel?.dataset.replay;
    }

    function updateLabels(enc) {
      const name = $("#avatar-name");
      const version = $("#avatar-version");
      if (name) name.textContent = enc?.name || "Simulated patient";
      if (version) version.textContent = enc?.version != null ? `Case v${enc.version}` : "";
      const caption = $("#avatar-captions");
      if (caption) caption.textContent = captionText;
    }

    function buildPanel() {
      if (panel) return panel;
      panel = doc.createElement("section");
      panel.className = "avatar-panel";
      panel.setAttribute("aria-label", "Simulated patient");
      panel.innerHTML = [
        '<p class="avatar-kicker">Simulated patient</p>',
        '<h2 id="avatar-name"></h2>',
        '<p id="avatar-version" class="avatar-version"></p>',
        '<p id="avatar-status" role="status">Voice avatar is off</p>',
        '<p id="avatar-captions" class="avatar-captions" aria-live="polite"></p>',
        '<div class="avatar-actions">',
        '<button type="button" class="btn pri" data-action="avatar-start">Start voice encounter</button>',
        '<button type="button" class="btn" data-action="avatar-talk">Talk</button>',
        '<button type="button" class="btn" data-action="avatar-send">Stop &amp; send</button>',
        '<button type="button" class="btn" data-action="avatar-interrupt">Stop speaking</button>',
        '<button type="button" class="btn" data-action="avatar-mute">Mute</button>',
        '<button type="button" class="btn" data-action="avatar-type">Type instead</button>',
        '<button type="button" class="btn" data-action="avatar-end">End voice session</button>',
        '<button type="button" class="btn pri" data-action="avatar-enable-audio" id="avatar-enable" hidden>Enable audio</button>',
        '<button type="button" class="btn" data-action="avatar-replay" hidden>Replay answer</button>',
        "</div>",
      ].join("");
      video = doc.createElement("video");
      video.id = "avatar-media";
      video.className = "avatar-media";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-label", "Simulated patient video");
      remoteAudio = doc.createElement("audio");
      remoteAudio.id = "avatar-remote-audio";
      panel.prepend(remoteAudio);
      panel.prepend(video);
      if (root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
        panel.classList.add("avatar-reduced");
      return panel;
    }

    function park() {
      if (!panel) return;
      panel.hidden = true;
      if (panel.parentElement !== doc.body) doc.body.appendChild(panel);
    }

    function stopMic() {
      try {
        recognition?.abort();
      } catch {
        /* The recognizer is already stopped. */
      }
      recognition = null;
      micStream?.getTracks?.().forEach((track) => track.stop());
      micStream = null;
    }

    function stopRemotePlayback() {
      try {
        video?.pause();
      } catch {
        /* jsdom has no media playback. */
      }
      try {
        remoteAudio?.pause();
      } catch {
        /* jsdom has no media playback. */
      }
      if (localAudio) {
        localAudio.pause();
        localAudio = null;
      }
      callbacks.stopLocalAudio();
    }

    async function disconnectMedia() {
      const current = room;
      room = null;
      connectedKey = "";
      try {
        await current?.disconnect?.();
      } catch {
        /* The room is already closed. */
      }
    }

    async function endSession(notify) {
      playbackGen += 1;
      stopMic();
      stopRemotePlayback();
      await disconnectMedia();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = 0;
      events?.close?.();
      events = null;
      const id = encounterId;
      session = null;
      currentUtterance = "";
      setState("CLOSED", "Voice session ended. The encounter is still open.");
      if (notify && id) {
        await root.fetch(`/api/encounters/${id}/avatar/stop`, {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
      }
      callbacks.onPlaybackSettled();
    }

    function sync(info) {
      const enc = info?.encounter;
      if (!enc || info.tab !== "enc") {
        if (session && state === "SPEAKING") {
          playbackGen += 1;
          stopRemotePlayback();
          setState("READY", "Speech stopped away from the encounter.");
        }
        park();
        return;
      }
      if (encounterId && enc.id !== encounterId && session) {
        const previous = encounterId;
        playbackGen += 1;
        stopMic();
        stopRemotePlayback();
        void disconnectMedia();
        events?.close?.();
        events = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = 0;
        session = null;
        root.fetch(`/api/encounters/${previous}/avatar/stop`, {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
        setState("CLOSED", "Voice session ended. The encounter is still open.");
      }
      encounterId = enc.id;
      buildPanel();
      const dock = doc.getElementById("avatar-dock");
      if (dock && panel.parentElement !== dock) dock.appendChild(panel);
      panel.hidden = false;
      updateLabels(enc);
      const mute = $('[data-action="avatar-mute"]');
      if (mute) mute.textContent = callbacks.isMuted() ? "Unmute" : "Mute";
    }

    function showAudioRecovery() {
      panel.dataset.audioBlocked = "1";
      const enable = $("#avatar-enable");
      if (enable) enable.hidden = false;
      setState(state, "Enable audio to hear the patient.");
    }

    async function playElements() {
      const attempts = [];
      if (video?.play) attempts.push(video.play());
      if (remoteAudio?.play) attempts.push(remoteAudio.play());
      const results = await Promise.all(attempts.map((item) => Promise.resolve(item).catch((error) => error)));
      if (results.some((result) => result && result.name === "NotAllowedError"))
        showAudioRecovery();
      else if (panel) delete panel.dataset.audioBlocked;
    }

    async function connectMedia(media) {
      const key = `${encounterId}|${media.livekitUrl}`;
      if (room && connectedKey === key) return;
      const client = callbacks.mediaClient || (await loadLiveKit());
      connectCount += 1;
      const created = client.connect
        ? await client.connect(media)
        : await connectLiveKit(client, media);
      room = created.room || created;
      connectedKey = key;
      if (created.video && video) video.srcObject = created.video;
      if (created.audio && remoteAudio) remoteAudio.srcObject = created.audio;
      await playElements();
    }

    async function loadLiveKit() {
      if (root.LivekitClient) return root.LivekitClient;
      await new Promise((resolve, reject) => {
        const script = doc.createElement("script");
        script.src = "/vendor/livekit-client.umd.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("livekit-unavailable"));
        doc.head.appendChild(script);
      });
      if (!root.LivekitClient) throw new Error("livekit-unavailable");
      return root.LivekitClient;
    }

    async function connectLiveKit(client, media) {
      const Room = client.Room;
      const RoomEvent = client.RoomEvent;
      const next = new Room();
      next.on(RoomEvent.TrackSubscribed, (track) => {
        const element = track.kind === "audio" ? remoteAudio : video;
        track.attach?.(element);
        void playElements();
      });
      await next.connect(media.livekitUrl, media.livekitClientToken);
      return { room: next };
    }

    function openEvents() {
      events?.close?.();
      if (typeof root.EventSource !== "function" || !encounterId) return;
      events = new root.EventSource(`/api/encounters/${encounterId}/avatar/events`);
      events.addEventListener("avatar", (message) => {
        let data = {};
        try {
          data = JSON.parse(message.data);
        } catch {
          return;
        }
        if (data.utteranceId && currentUtterance && data.utteranceId !== currentUtterance)
          return;
        if (data.type === "avatar_utterance_started")
          setState("SPEAKING", "Patient speaking");
        if (data.type === "avatar_utterance_ended") {
          setState("READY", "Simulated patient is ready.");
          callbacks.onPlaybackSettled();
        }
        if (data.type === "avatar_utterance_interrupted") {
          panel.dataset.replay = "1";
          setState("READY", "Speech was interrupted. Replay is available.");
          callbacks.onPlaybackSettled();
        }
        if (data.type === "avatar_disconnected") {
          setState("FALLBACK", "Avatar disconnected. The transcript is unchanged.");
          callbacks.onPlaybackSettled();
        }
      });
    }

    async function start() {
      if (!encounterId) return;
      const mine = ++playbackGen;
      setState("CONNECTING", "Connecting simulated patient…");
      const response = await root.fetch(`/api/encounters/${encounterId}/avatar/start`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (mine !== playbackGen) return;
      session = data;
      if (!response.ok || data.state === "DISABLED") {
        session = data.state === "DISABLED" ? data : null;
        setState(data.state || "ERROR", data.error || "Voice avatar is off.");
        return;
      }
      if (data.live && data.media?.livekitUrl && data.media?.livekitClientToken) {
        try {
          await connectMedia(data.media);
          if (mine !== playbackGen) return;
          setState("READY", "Simulated patient is ready.");
        } catch {
          setState("FALLBACK", "Video is unavailable. Portrait and text remain.");
        }
      } else if (data.connection === "mock-connected") {
        setState("READY", "Simulated patient is ready. Mock video is not a live avatar.");
      } else {
        setState("FALLBACK", data.reason === "missing-credentials"
          ? "Live avatar is not configured. Portrait and text remain."
          : "Using the portrait fallback.");
      }
      openEvents();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (!session || !encounterId) return;
        root.fetch(`/api/encounters/${encounterId}/avatar/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity: state === "LISTENING" ? "LISTENING" : "READY" }),
        }).catch(() => {});
      }, 25000);
    }

    function micAllowed() {
      if (root.isSecureContext) return true;
      const host = root.location?.hostname;
      return host === "localhost" || host === "127.0.0.1";
    }

    async function talk() {
      if (!micAllowed()) {
        setState("ERROR", "Microphone needs a secure page. Type your question.");
        const input = doc.getElementById("question");
        if (input) input.disabled = false;
        return;
      }
      const request = callbacks.getUserMedia || root.navigator.mediaDevices?.getUserMedia?.bind(root.navigator.mediaDevices);
      if (!request) {
        setState("READY", "Microphone is unavailable. Type your question.");
        return;
      }
      try {
        micStream = await request({ audio: true });
      } catch {
        setState("READY", "Microphone is off. Type your question.");
        const input = doc.getElementById("question");
        if (input) {
          input.disabled = false;
          input.focus?.();
        }
        return;
      }
      const Rec = root.SpeechRecognition || root.webkitSpeechRecognition;
      if (!Rec) {
        setState("READY", "Dictation is unavailable. Type your question.");
        return;
      }
      recognition = new Rec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        const input = doc.getElementById("question");
        if (input) input.value = text;
      };
      recognition.start();
      setState("LISTENING", "Listening… Speak, then Stop & send.");
    }

    function sendUtterance() {
      const input = doc.getElementById("question");
      const text = input?.value || "";
      stopMic();
      if (!text.trim()) {
        setState("READY", "Type a question or try Talk again.");
        return;
      }
      setState("TRANSCRIBING", "Checking what you said…");
      callbacks.submitQuestion(text);
    }

    async function playLocal(turn, mine) {
      stopRemotePlayback();
      localAudio = new root.Audio(`/api/encounters/${encounterId}/speech/${turn.id}/stream`);
      localAudio.onended = () => {
        if (mine !== playbackGen) return;
        setState("READY", "Simulated patient is ready.");
        callbacks.onPlaybackSettled();
      };
      try {
        await localAudio.play();
        if (mine !== playbackGen) {
          localAudio.pause();
          return;
        }
        setState("SPEAKING", "Patient speaking · portrait");
      } catch (error) {
        if (error?.name === "NotAllowedError") showAudioRecovery();
        else {
          captionText = turn.text || captionText;
          updateLabels(callbacks.getEncounter?.() || { name: $("#avatar-name")?.textContent });
          setState("FALLBACK", "Audio is unavailable. The transcript remains.");
          callbacks.onPlaybackSettled();
        }
      }
    }

    async function playTurn(turn, replay) {
      if (!turn || !encounterId || !session) return;
      const encId = encounterId;
      const mine = ++playbackGen;
      const playbackRequestId = root.crypto?.randomUUID?.() || `play-${mine}`;
      captionText = turn.text || "";
      updateLabels({ name: $("#avatar-name")?.textContent, version: null });
      const caption = $("#avatar-captions");
      if (caption) caption.textContent = captionText;
      setState("PREPARING_REPLY", "The patient is answering…");
      delete panel?.dataset?.replay;
      const response = await root.fetch(`/api/encounters/${encId}/avatar/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnId: turn.id,
          playbackRequestId,
          ...(session.generation != null ? { generation: session.generation } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (mine !== playbackGen || encId !== encounterId) return;
      currentUtterance = data.utteranceId || "";
      if (data.generation != null && session) session.generation = data.generation;
      if (data.partial || data.replayAvailable) panel.dataset.replay = "1";
      if (!response.ok) {
        captionText = turn.text || "";
        if (caption) caption.textContent = captionText;
        setState("FALLBACK", "This reply stays in the transcript.");
        callbacks.onPlaybackSettled();
        return;
      }
      if (data.playLocalAudio) {
        await playLocal(turn, mine);
        return;
      }
      if (data.playback === "submitted" || data.utteranceId) {
        setState("SPEAKING", "Patient speaking");
        return;
      }
      setState(data.state || "FALLBACK", data.fallback === "text"
        ? "Text only. The transcript remains."
        : "Using the portrait fallback.");
      callbacks.onPlaybackSettled();
      return replay;
    }

    async function interrupt() {
      playbackGen += 1;
      stopRemotePlayback();
      stopMic();
      setState("INTERRUPTING", "Stopping speech…");
      if (encounterId && session) {
        const response = await root.fetch(`/api/encounters/${encounterId}/avatar/interrupt`, {
          method: "POST",
        }).catch(() => null);
        const data = await response?.json?.().catch(() => ({}));
        if (data?.generation != null) session.generation = data.generation;
      }
      currentUtterance = "";
      setState("READY", "Simulated patient is ready.");
    }

    async function handleAction(action) {
      if (action === "avatar-start") return start();
      if (action === "avatar-talk") return talk();
      if (action === "avatar-send") return sendUtterance();
      if (action === "avatar-interrupt") return interrupt();
      if (action === "avatar-mute") {
        const next = !callbacks.isMuted();
        callbacks.setMuted(next);
        const mute = $('[data-action="avatar-mute"]');
        if (mute) mute.textContent = next ? "Unmute" : "Mute";
        if (next) stopRemotePlayback();
        return;
      }
      if (action === "avatar-type") {
        stopMic();
        setState("READY", "Type your question.");
        doc.getElementById("question")?.focus?.();
        return;
      }
      if (action === "avatar-end") return endSession(true);
      if (action === "avatar-enable-audio") {
        delete panel?.dataset?.audioBlocked;
        const enable = $("#avatar-enable");
        if (enable) enable.hidden = true;
        await playElements();
        try {
          await localAudio?.play?.();
        } catch {
          /* The gesture already ran. The transcript remains. */
        }
        return;
      }
      if (action === "avatar-replay") {
        const enc = callbacks.getEncounter?.();
        const turn = [...(enc?.transcript || [])].reverse().find((item) => item.role === "patient");
        if (turn) return playTurn(turn, true);
      }
    }

    root.addEventListener?.("pagehide", () => {
      if (!session || !encounterId) return;
      root.fetch(`/api/encounters/${encounterId}/avatar/stop`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    });

    return {
      park,
      sync,
      configure(next) {
        Object.assign(callbacks, next || {});
      },
      ownsPlayback() {
        return !!session && !["DISABLED", "CLOSED", "ERROR"].includes(state);
      },
      playTurn,
      interrupt,
      handleAction,
      state: () => state,
      mediaElement: () => video,
      connects: () => connectCount,
    };
  }

  root.VirtuSPAvatar = createAvatarView();
})(typeof window !== "undefined" ? window : globalThis);
