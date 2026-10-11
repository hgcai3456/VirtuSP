"use strict";
(function (root) {
  const state = {
    running: false,
    timer: 0,
    startedAt: 0,
    samples: 0,
    lookingHits: 0,
    uprightHits: 0,
    visualSamples: 0,
    headTurns: 0,
    fillerCount: 0,
    awkwardPauses: 0,
    lastNx: null,
    lastSide: 0,
    lastSpeechAt: 0,
    lastResultAt: 0,
    detector: "none",
    landmarker: null,
    faceDetector: null,
    getVideo: null,
  };

  function reset() {
    state.samples = 0;
    state.lookingHits = 0;
    state.uprightHits = 0;
    state.visualSamples = 0;
    state.headTurns = 0;
    state.fillerCount = 0;
    state.awkwardPauses = 0;
    state.lastNx = null;
    state.lastSide = 0;
    state.lastSpeechAt = 0;
    state.lastResultAt = 0;
    state.startedAt = Date.now();
  }

  function noteSpeech(text) {
    const found = String(text || "").match(/\b(u+m+|uh+|er+|ah+|hmm+)\b/gi);
    state.fillerCount += found ? found.length : 0;
    state.lastSpeechAt = Date.now();
    state.lastResultAt = Date.now();
  }

  function notePartial(text) {
    const now = Date.now();
    if (
      state.lastResultAt &&
      now - state.lastResultAt > 1800 &&
      String(text || "").trim().split(/\s+/).filter(Boolean).length >= 2
    ) {
      state.awkwardPauses += 1;
    }
    if (String(text || "").trim()) state.lastResultAt = now;
  }

  function snapshot() {
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - (state.startedAt || Date.now())) / 1000),
    );
    const lookingShare = state.visualSamples
      ? state.lookingHits / state.visualSamples
      : null;
    const uprightShare = state.visualSamples
      ? state.uprightHits / state.visualSamples
      : null;
    const minutes = Math.max(durationSec / 60, 1 / 60);

    const headTurnsPerMin = state.headTurns / minutes;
    const flags = [];
    if (state.visualSamples >= 8 && lookingShare != null && lookingShare < 0.55)
      flags.push({
        id: "looking_away",
        label: "Often not facing the patient",
      });
    if (state.visualSamples >= 8 && uprightShare != null && uprightShare < 0.55)
      flags.push({ id: "slouching", label: "Posture dropped" });
    if (state.visualSamples >= 8 && headTurnsPerMin >= 8)
      flags.push({ id: "head_turns", label: "Frequent head turns" });
    if (state.fillerCount >= 3)
      flags.push({ id: "fillers", label: "Filler words (um, uh)" });
    if (state.awkwardPauses >= 2)
      flags.push({ id: "pauses", label: "Awkward mid-sentence pauses" });

    return {
      samples: state.samples,
      lookingShare,
      uprightShare,
      headTurnsPerMin,
      fillerCount: state.fillerCount,
      awkwardPauses: state.awkwardPauses,
      durationSec,
      detector: state.detector,
      flags,
    };
  }

  function measureBox(video, box) {
    const w = video.videoWidth || 1;
    const h = video.videoHeight || 1;
    const nx = (box.x + box.width / 2) / w;
    const ny = (box.y + box.height / 2) / h;
    const large = box.width / w > 0.16;
    const looking = large && Math.abs(nx - 0.5) < 0.16 && Math.abs(ny - 0.42) < 0.24;
    const upright = ny < 0.62;
    const side = Math.abs(nx - 0.5) > 0.17 ? (nx > 0.5 ? 1 : -1) : 0;
    if (side && state.lastSide && side !== state.lastSide) state.headTurns += 1;
    if (side) state.lastSide = side;
    state.lastNx = nx;
    state.visualSamples += 1;
    if (looking) state.lookingHits += 1;
    if (upright) state.uprightHits += 1;
  }

  function measureLandmarks(video, landmarks) {
    if (!landmarks?.length) return;
    const nose = landmarks[1];
    const left = landmarks[33];
    const right = landmarks[263];
    if (!nose || !left || !right) return;
    const midX = (left.x + right.x) / 2;
    const yaw = nose.x - midX;
    const pitch = nose.y - (left.y + right.y) / 2;
    const looking = Math.abs(yaw) < 0.045 && Math.abs(pitch) < 0.06;
    const upright = pitch < 0.07;
    const side = Math.abs(yaw) > 0.05 ? (yaw > 0 ? 1 : -1) : 0;
    if (side && state.lastSide && side !== state.lastSide) state.headTurns += 1;
    if (side) state.lastSide = side;
    state.visualSamples += 1;
    if (looking) state.lookingHits += 1;
    if (upright) state.uprightHits += 1;
  }

  async function ensureDetector() {
    if (state.landmarker || state.faceDetector) return;
    try {
      if (typeof FaceDetector === "function") {
        state.faceDetector = new FaceDetector({
          fastMode: true,
          maxDetectedFaces: 1,
        });
        state.detector = "facedetector";
      }
    } catch {
      state.faceDetector = null;
    }
    if (state.landmarker || state.faceDetector) return;
    try {
      const vision = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17"
      );
      const files = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm",
      );
      state.landmarker = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      state.detector = "mediapipe";
    } catch {
      if (!state.faceDetector) state.detector = "none";
    }
  }

  async function sample() {
    if (!state.running) return;
    state.samples += 1;
    const video = state.getVideo?.();
    if (!video || !video.videoWidth) return;
    await ensureDetector();
    try {
      if (state.landmarker) {
        const result = state.landmarker.detectForVideo(video, performance.now());
        const face = result?.faceLandmarks?.[0];
        if (face) measureLandmarks(video, face);
        return;
      }
      if (state.faceDetector) {
        const faces = await state.faceDetector.detect(video);
        const box = faces[0]?.boundingBox;
        if (box) measureBox(video, box);
      }
    } catch {
      /* Keep voice flags if a frame cannot be read. */
    }
  }

  function start(options) {
    if (state.running) return;
    state.getVideo = options?.getVideo || (() => null);
    reset();
    state.running = true;
    state.timer = setInterval(sample, 350);
    ensureDetector();
  }

  function stop() {
    state.running = false;
    clearInterval(state.timer);
    state.timer = 0;
  }

  root.VirtuPresence = {
    start,
    stop,
    noteSpeech,
    notePartial,
    snapshot,
  };
})(typeof window !== "undefined" ? window : globalThis);
