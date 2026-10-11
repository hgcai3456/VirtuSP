"use strict";

// Entry point for `node --require ./lib/observability/register.js`.
// Safe to load more than once. Does not import the HTTP server or the
// encounter engine.

if (!globalThis.__VIRTUSP_OBS_REGISTERED) {
  globalThis.__VIRTUSP_OBS_REGISTERED = true;
  try {
    require("./index").install();
  } catch {
    // Telemetry setup must not prevent the application from starting.
  }
}
