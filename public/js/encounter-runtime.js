"use strict";

// Browser-local encounter state. No camera frames, audio, or biometrics.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VirtuSPEncounter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FACE_STATES = [
    "NO_FACE",
    "FACE_DETECTED",
    "MULTIPLE_FACES",
    "FACE_LOST",
    "CAMERA_OFF",
  ];
  const CONVERSATION_STATES = [
    "IDLE",
    "LISTENING",
    "STUDENT_SPEAKING",
    "TRANSCRIBING",
    "PATIENT_THINKING",
    "PATIENT_SPEAKING",
    "INTERRUPTED",
    "PAUSED",
    "ERROR",
    "ENDED",
  ];

  function createFacePresence({ graceMs = 3000 } = {}) {
    let state = "CAMERA_OFF";
    let missingSince = null;

    function set(next) {
      state = next;
      return state;
    }

    return {
      state() {
        return state;
      },
      cameraOff() {
        missingSince = null;
        return set("CAMERA_OFF");
      },
      cameraOn() {
        if (state === "CAMERA_OFF") {
          missingSince = null;
          return set("NO_FACE");
        }
        return state;
      },
      observe(faceCount, at) {
        if (state === "CAMERA_OFF") return state;
        const now = Number.isFinite(at) ? at : 0;
        const count = Number(faceCount) || 0;
        if (count > 1) {
          missingSince = null;
          return set("MULTIPLE_FACES");
        }
        if (count === 1) {
          missingSince = null;
          return set("FACE_DETECTED");
        }
        if (state === "NO_FACE") return state;
        if (missingSince == null) missingSince = now;
        if (now - missingSince < graceMs) return state;
        return set("FACE_LOST");
      },
    };
  }

  function faceLabel(state) {
    if (state === "FACE_DETECTED") return "Face detected";
    if (state === "MULTIPLE_FACES") return "More than one face detected";
    if (state === "FACE_LOST" || state === "NO_FACE") return "Move into frame";
    return "Camera off";
  }

  function createConversation() {
    let state = "IDLE";

    function set(next) {
      if (!CONVERSATION_STATES.includes(next)) return state;
      state = next;
      return state;
    }

    return {
      state() {
        return state;
      },
      start() {
        if (state === "ENDED") return state;
        return set("LISTENING");
      },
      studentSpeech() {
        if (state === "ENDED" || state === "PAUSED" || state === "ERROR")
          return state;
        if (state === "PATIENT_SPEAKING" || state === "PATIENT_THINKING")
          return set("INTERRUPTED");
        return set("STUDENT_SPEAKING");
      },
      silence() {
        if (state !== "STUDENT_SPEAKING" && state !== "INTERRUPTED") return state;
        return set("TRANSCRIBING");
      },
      submit() {
        if (state === "PAUSED" || state === "ENDED") return state;
        return set("PATIENT_THINKING");
      },
      patientSpeaks() {
        if (state !== "PATIENT_THINKING" && state !== "TRANSCRIBING") return state;
        return set("PATIENT_SPEAKING");
      },
      patientDone() {
        if (state === "ENDED" || state === "PAUSED" || state === "INTERRUPTED")
          return state;
        return set("LISTENING");
      },
      pause() {
        if (state === "ENDED") return state;
        return set("PAUSED");
      },
      resume() {
        if (state !== "PAUSED") return state;
        return set("LISTENING");
      },
      fail() {
        if (state === "ENDED") return state;
        return set("ERROR");
      },
      retry() {
        if (state !== "ERROR") return state;
        return set("LISTENING");
      },
      end() {
        return set("ENDED");
      },
    };
  }

  return {
    FACE_STATES,
    CONVERSATION_STATES,
    createFacePresence,
    createConversation,
    faceLabel,
  };
});
