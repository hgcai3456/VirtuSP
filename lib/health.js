"use strict";

const { asList, counts } = require("./db");

// A locked EFS file must not stall the process for the full 30s busy timeout.
const READY_BUSY_MS = 200;

function pingOne(db) {
  if (!db || typeof db.prepare !== "function") return false;
  let restore = null;
  try {
    if (typeof db.exec === "function") {
      const current = db.prepare("PRAGMA busy_timeout").get();
      const timeout = current && Number(current.timeout);
      if (Number.isFinite(timeout)) {
        db.exec("PRAGMA busy_timeout = " + READY_BUSY_MS);
        restore = timeout;
      }
    }
    const row = db.prepare("SELECT 1 AS ok").get();
    return !!(row && Number(row.ok) === 1);
  } catch {
    return false;
  } finally {
    if (restore != null) {
      try {
        db.exec("PRAGMA busy_timeout = " + restore);
      } catch {
        // The probe result stands. The next query keeps the shorter timeout.
      }
    }
  }
}

function ping(db) {
  const list = asList(db);
  return list.length > 0 && list.every(pingOne);
}

function readiness(db) {
  const up = ping(db);
  return {
    ok: up,
    checks: { database: up ? "up" : "down" },
  };
}

function healthPayload(db, extras = {}) {
  // Counts keep the connection's busy timeout. The short probe stays on
  // /api/ready so a brief lock does not fail the faculty status request.
  if (!asList(db).length) {
    return { ok: false, checks: { database: "down" }, ...extras };
  }
  try {
    return {
      ok: true,
      checks: { database: "up" },
      ...counts(db),
      ...extras,
    };
  } catch {
    return { ok: false, checks: { database: "down" }, ...extras };
  }
}

module.exports = { ping, readiness, healthPayload };
