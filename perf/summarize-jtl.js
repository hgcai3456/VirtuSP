"use strict";

const fs = require("node:fs");
const readline = require("node:readline");

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node summarize-jtl.js results.jtl");
    process.exit(2);
  }
  const elapsed = [];
  const byLabel = new Map();
  let header = null;
  let minTs = Infinity;
  let maxTs = 0;
  let bytes = 0;
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(",");
    if (!header) {
      header = cells;
      continue;
    }
    const row = {};
    header.forEach((name, i) => {
      row[name] = cells[i];
    });
    const ms = Number(row.elapsed);
    const ts = Number(row.timeStamp);
    const ok = row.success === "true";
    if (Number.isFinite(ts)) {
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }
    if (Number.isFinite(ms)) elapsed.push(ms);
    bytes += Number(row.bytes) || 0;
    const label = row.label || "unknown";
    const bucket = byLabel.get(label) || { samples: 0, errors: 0, elapsed: 0 };
    bucket.samples += 1;
    bucket.elapsed += Number.isFinite(ms) ? ms : 0;
    if (!ok) bucket.errors += 1;
    byLabel.set(label, bucket);
  }
  elapsed.sort((a, b) => a - b);
  const samples = elapsed.length;
  const errors = [...byLabel.values()].reduce((sum, b) => sum + b.errors, 0);
  const seconds = samples ? Math.max(0.001, (maxTs - minTs) / 1000) : 0;
  const labels = [...byLabel.entries()]
    .map(([label, bucket]) => ({
      label,
      samples: bucket.samples,
      errors: bucket.errors,
      errorPct: bucket.samples
        ? Number(((100 * bucket.errors) / bucket.samples).toFixed(2))
        : 0,
      meanMs: bucket.samples ? Math.round(bucket.elapsed / bucket.samples) : null,
    }))
    .sort((a, b) => b.meanMs - a.meanMs);
  const summary = {
    samples,
    errors,
    errorPct: samples ? Number(((100 * errors) / samples).toFixed(2)) : 100,
    rps: seconds ? Number((samples / seconds).toFixed(1)) : 0,
    meanMs: samples
      ? Math.round(elapsed.reduce((sum, n) => sum + n, 0) / samples)
      : null,
    p50Ms: percentile(elapsed, 50),
    p95Ms: percentile(elapsed, 95),
    p99Ms: percentile(elapsed, 99),
    maxMs: samples ? elapsed[elapsed.length - 1] : null,
    bytes,
    labels,
  };
  process.stdout.write(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
