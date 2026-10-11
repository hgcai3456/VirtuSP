"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv, csvField } = require("./chat-tracker");
const { formatDuration } = require("./engine");

const header = [
  "recorded_at",
  "encounter_id",
  "student_id",
  "patient",
  "started_at",
  "completed_at",
  "duration_ms",
  "duration",
];

function sleepSync(ms) {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function withLock(lockFile, fn) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      try {
        return fn();
      } finally {
        fs.closeSync(fd);
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // The owner already released it.
        }
      }
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 5000)
          fs.unlinkSync(lockFile);
      } catch {
        // Another writer released the lock.
      }
      if (Date.now() - started > 2000)
        throw new Error("Appointment log is busy.");
      sleepSync(20);
    }
  }
}

function appointments(file) {
  if (!fs.existsSync(file)) return [];
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (!rows.length) return [];
  const names = rows[0].every((cell, index) => cell === header[index])
    ? rows[0]
    : header;
  const body = names === rows[0] ? rows.slice(1) : rows;
  return body.map((row) => {
    const record = {};
    names.forEach((name, index) => {
      record[name] = row[index] || "";
    });
    return record;
  });
}

function record(file, enc) {
  if (!enc || !enc.id || !Number.isFinite(enc.durationMs)) return null;
  const entry = {
    recorded_at: new Date().toISOString(),
    encounter_id: enc.id,
    student_id: enc.studentId || "",
    patient: (enc.p && enc.p.name) || "",
    started_at: enc.interviewStartedAt || enc.createdAt || "",
    completed_at: enc.completedAt || "",
    duration_ms: String(enc.durationMs),
    duration: formatDuration(enc.durationMs),
  };
  const target = path.resolve(file);
  return withLock(target + ".lock", () => {
    const rows = fs.existsSync(target)
      ? parseCsv(fs.readFileSync(target, "utf8"))
      : [];
    const known = rows.slice(1).some((row) => row[1] === entry.encounter_id);
    if (known) return null;
    const line = header.map((key) => csvField(entry[key])).join(",");
    if (!rows.length) {
      fs.writeFileSync(target, header.join(",") + "\n" + line + "\n");
    } else {
      const current = fs.readFileSync(target, "utf8");
      const prefix = current.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(target, prefix + line + "\n");
    }
    return entry;
  });
}

module.exports = { header, appointments, record };
