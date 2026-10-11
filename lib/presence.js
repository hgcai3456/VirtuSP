"use strict";

const FILLER = /\b(u+m+|uh+|er+|ah+|hmm+)\b/gi;
const FLAG_COPY = {
  looking_away: {
    id: "looking_away",
    label: "Often not facing the patient",
    hint: "Look toward the camera so the patient sees your eyes.",
  },
  slouching: {
    id: "slouching",
    label: "Posture dropped",
    hint: "Sit up so your face stays centered in the frame.",
  },
  head_turns: {
    id: "head_turns",
    label: "Frequent head turns",
    hint: "Turning away often can look disengaged on a video visit.",
  },
  fillers: {
    id: "fillers",
    label: "Filler words (um, uh)",
    hint: "Pause silently instead of filling the gap.",
  },
  pauses: {
    id: "pauses",
    label: "Awkward mid-sentence pauses",
    hint: "Finish the thought, then wait for the patient.",
  },
};

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  return Math.min(1, Math.max(0, n));
}

function countFillers(text) {
  return String(text || "").match(FILLER)?.length || 0;
}

function studentSpeech(enc) {
  return (enc?.transcript || [])
    .filter((turn) => turn.role === "student")
    .map((turn) => turn.text)
    .join(" ");
}

function emptyReport() {
  return {
    samples: 0,
    lookingShare: null,
    uprightShare: null,
    headTurnsPerMin: 0,
    fillerCount: 0,
    awkwardPauses: 0,
    durationSec: 0,
    detector: "none",
    flags: [],
    notice:
      "On-device presence coaching. Prototype signals only, not clinical validation.",
  };
}

function flagsFromMetrics(metrics) {
  const flags = [];
  const enough = metrics.samples >= 8;
  if (
    enough &&
    metrics.lookingShare != null &&
    metrics.lookingShare < 0.55
  ) {
    flags.push(FLAG_COPY.looking_away);
  }
  if (enough && metrics.uprightShare != null && metrics.uprightShare < 0.55) {
    flags.push(FLAG_COPY.slouching);
  }
  if (enough && metrics.headTurnsPerMin >= 8) {
    flags.push(FLAG_COPY.head_turns);
  }
  if (metrics.fillerCount >= 3) {
    flags.push(FLAG_COPY.fillers);
  }
  if (metrics.awkwardPauses >= 2) {
    flags.push(FLAG_COPY.pauses);
  }

  return flags;
}

function sanitizeReport(input) {
  const src = input && typeof input === "object" ? input : {};
  const samples = Math.min(20000, Math.max(0, Math.round(Number(src.samples) || 0)));
  const durationSec = Math.min(
    8 * 3600,
    Math.max(0, Math.round(Number(src.durationSec) || 0)),
  );
  const detector = ["mediapipe", "facedetector", "none"].includes(src.detector)
    ? src.detector
    : "none";
  const lookingShare =
    src.lookingShare == null || src.lookingShare === ""
      ? null
      : clamp01(src.lookingShare);
  const uprightShare =
    src.uprightShare == null || src.uprightShare === ""
      ? null
      : clamp01(src.uprightShare);
  const report = {
    samples,
    lookingShare,
    uprightShare,
    headTurnsPerMin: Math.min(
      120,
      Math.max(0, Number(src.headTurnsPerMin) || 0),
    ),
    fillerCount: Math.min(500, Math.max(0, Math.round(Number(src.fillerCount) || 0))),
    awkwardPauses: Math.min(
      200,
      Math.max(0, Math.round(Number(src.awkwardPauses) || 0)),
    ),
    durationSec,
    detector,
    flags: [],
    notice:
      "On-device presence coaching. Prototype signals only, not clinical validation.",
  };
  report.flags = flagsFromMetrics(report);

  return report;
}

function mergeReports(current, incoming) {
  const a = sanitizeReport(current);
  const b = sanitizeReport(incoming);
  const samples = a.samples + b.samples;
  const durationSec = Math.max(a.durationSec, b.durationSec);
  const looking =
    a.lookingShare == null && b.lookingShare == null
      ? null
      : ((a.lookingShare || 0) * a.samples + (b.lookingShare || 0) * b.samples) /
        Math.max(1, (a.lookingShare == null ? 0 : a.samples) +
          (b.lookingShare == null ? 0 : b.samples));
  const upright =
    a.uprightShare == null && b.uprightShare == null
      ? null
      : ((a.uprightShare || 0) * a.samples + (b.uprightShare || 0) * b.samples) /
        Math.max(1, (a.uprightShare == null ? 0 : a.samples) +
          (b.uprightShare == null ? 0 : b.samples));
  const detector =
    b.detector !== "none" ? b.detector : a.detector !== "none" ? a.detector : "none";

  return sanitizeReport({
    samples,
    lookingShare: looking,
    uprightShare: upright,
    headTurnsPerMin: Math.max(a.headTurnsPerMin, b.headTurnsPerMin),
    fillerCount: Math.max(a.fillerCount, b.fillerCount),
    awkwardPauses: Math.max(a.awkwardPauses, b.awkwardPauses),
    durationSec,
    detector,
  });
}

function applyTranscript(enc, report) {
  const next = sanitizeReport(report);
  next.fillerCount = Math.max(next.fillerCount, countFillers(studentSpeech(enc)));
  next.flags = flagsFromMetrics(next);

  return next;
}

function record(enc, incoming) {
  if (!enc || enc.status === "complete") {
    return enc?.presence || emptyReport();
  }
  enc.presence = applyTranscript(enc, mergeReports(enc.presence, incoming));

  return enc.presence;
}

function finalize(enc, incoming) {
  enc.presence = applyTranscript(
    enc,
    mergeReports(enc.presence, incoming || emptyReport()),
  );

  return enc.presence;
}

module.exports = {
  FILLER,
  FLAG_COPY,
  countFillers,
  emptyReport,
  sanitizeReport,
  mergeReports,
  flagsFromMetrics,
  applyTranscript,
  record,
  finalize,
};
