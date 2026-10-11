"use strict";

const TYPES = new Set([
  "CAMERA_REQUESTED",
  "CAMERA_GRANTED",
  "CAMERA_DENIED",
  "MIC_GRANTED",
  "MIC_DENIED",
  "FACE_DETECTED",
  "FACE_LOST",
  "STUDENT_SPEECH_STARTED",
  "STUDENT_SPEECH_ENDED",
  "TRANSCRIPT_FINALIZED",
  "PATIENT_REQUEST_STARTED",
  "PATIENT_RESPONSE_RECEIVED",
  "TTS_STARTED",
  "TTS_FINISHED",
  "PATIENT_INTERRUPTED",
  "CHART_FACT_REVEALED",
  "NETWORK_ERROR",
  "ENCOUNTER_ENDED",
]);

const BLOCKED =
  /frame|image|audio|embedding|descriptor|template|biometric|secret|prompt|token|cookie|authorization/i;

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitize(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
    if (BLOCKED.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(120000, Math.round(value)));
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const text = value.replace(/[\u0000-\u001f]/g, "").slice(0, 160);
      if (!text || BLOCKED.test(text) || text.startsWith("data:")) continue;
      out[key] = text;
    }
  }
  return out;
}

function record(enc, input, eventFn) {
  const type = String(input?.type || "");
  if (!TYPES.has(type)) throw fail("Unknown encounter event.", 422);
  const mediaCount = enc.events.filter((item) => TYPES.has(item.type)).length;
  if (mediaCount >= 400) throw fail("Encounter event limit reached.", 429);
  return eventFn(enc, type, { metadata: sanitize(input.metadata) });
}

module.exports = { TYPES, sanitize, record };
