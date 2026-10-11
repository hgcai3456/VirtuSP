"use strict";

const { performance } = require("node:perf_hooks");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");

function profile() {
  const value = blank();
  value.name = "Overhead Synthetic";
  value.age = 40;
  value.reviewAcknowledged = true;
  value.version = 1;
  value.facts = [
    fact("concern", "A cough", {
      say: "I have a cough.",
      kw: ["cough"],
    }),
  ];
  return value;
}

async function sample(enabled) {
  process.env.OBS_ENABLED = enabled ? "true" : "false";
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  const started = performance.now();
  const before = process.cpuUsage();
  const memoryBefore = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100; i += 1) {
    await engine.ask(enc, "What brings you in with the cough?", "req" + i);
  }
  const cpu = process.cpuUsage(before);
  return {
    enabled,
    turns: 100,
    durationMs: Math.round(performance.now() - started),
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    heapDeltaBytes: process.memoryUsage().heapUsed - memoryBefore,
  };
}

(async () => {
  const off = await sample(false);
  const on = await sample(true);
  console.log(
    JSON.stringify(
      {
        workload: "100 local catalog turns, AI disabled, one encounter",
        sampleSize: 100,
        instrumentationDisabled: off,
        instrumentationEnabled: on,
        durationDeltaMs: on.durationMs - off.durationMs,
        note: "Single process, one sample of 100 turns. This is not a confidence interval.",
      },
      null,
      2,
    ),
  );
})();
