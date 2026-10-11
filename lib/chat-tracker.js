"use strict";
const fs = require("node:fs");
const path = require("node:path");

const header = [
  "recorded_at",
  "encounter_id",
  "patient",
  "request",
  "response",
  "provider",
  "latency_ms",
  "turn_id",
];

function csvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cell) => cell !== ""));
}

function sleepSync(ms) {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);

    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

class ChatTracker {
  constructor(file) {
    this.file = path.resolve(file);
    this.lockFile = this.file + ".lock";
  }

  withLock(fn) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const started = Date.now();
    for (;;) {
      try {
        const fd = fs.openSync(this.lockFile, "wx");
        fs.writeSync(
          fd,
          JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
        );
        try {
          return fn();
        } finally {
          fs.closeSync(fd);
          try {
            fs.unlinkSync(this.lockFile);
          } catch (err) {
            // another writer already removed it
          }
        }
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
        let stale = false;
        try {
          const payload = JSON.parse(fs.readFileSync(this.lockFile, "utf8"));
          const age = Date.now() - fs.statSync(this.lockFile).mtimeMs;
          stale = !pidAlive(Number(payload.pid)) || age > 5000;
        } catch (readErr) {
          stale = true;
        }
        if (stale) {
          try {
            fs.unlinkSync(this.lockFile);
          } catch (unlinkErr) {
            // the owner released it
          }
        }
        if (Date.now() - started > 2000) {
          throw new Error("Chat tracker is busy.");
        }
        sleepSync(20);
      }
    }
  }

  readRows() {
    if (!fs.existsSync(this.file)) return [];

    return parseCsv(fs.readFileSync(this.file, "utf8"));
  }

  exchanges() {
    const rows = this.readRows();
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

  record(enc, previousLength) {
    const added = Array.isArray(enc && enc.transcript)
      ? enc.transcript.slice(previousLength || 0)
      : [];
    const request = added.find((turn) => turn && turn.role === "student");
    const response = added.findLast((turn) => turn && turn.role === "patient");
    if (!request || !response || !String(response.text || "").trim()) {
      return null;
    }
    const entry = {
      recorded_at: new Date().toISOString(),
      encounter_id: enc.id || "",
      patient: (enc.p && enc.p.name) || "",
      request: String(request.text || ""),
      response: String(response.text || ""),
      provider: response.provider || "",
      latency_ms:
        response.latencyMs == null ? "" : String(response.latencyMs),
      turn_id: response.id || request.id || "",
    };
    if (!entry.turn_id) return null;

    return this.withLock(() => {
      const rows = this.readRows();
      const known = rows.slice(1).some((row) => row[7] === entry.turn_id);
      if (known) return null;
      const line = header.map((key) => csvField(entry[key])).join(",");
      if (!rows.length) {
        fs.writeFileSync(this.file, header.join(",") + "\n" + line + "\n");
      } else {
        const current = fs.readFileSync(this.file, "utf8");
        const prefix = current.endsWith("\n") ? "" : "\n";
        fs.appendFileSync(this.file, prefix + line + "\n");
      }

      return entry;
    });
  }
}

module.exports = {
  ChatTracker,
  header,
  parseCsv,
  csvField,
};
