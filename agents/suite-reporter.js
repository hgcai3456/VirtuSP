"use strict";

const fs = require("fs");
const path = require("path");

function suiteReportPath(root) {
  if (process.env.VIRTUSP_SUITE_REPORT) return process.env.VIRTUSP_SUITE_REPORT;
  return path.join(root || process.cwd(), "reports", "last-suite.json");
}

function formatLineList(lines) {
  const sorted = [...new Set(lines)].filter((line) => Number.isInteger(line) && line > 0).sort((a, b) => a - b);
  if (!sorted.length) return "";
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const line = sorted[i];
    if (line === prev + 1) {
      prev = line;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = line;
    prev = line;
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(", ");
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function relativeFile(file, root) {
  if (!file) return "";
  const abs = path.resolve(String(file));
  const rel = path.relative(root || process.cwd(), abs).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return "";
  return rel;
}

function keepCoverageFile(rel) {
  if (!rel || rel.includes("node_modules/")) return false;
  if (rel.startsWith("tests/") || rel.startsWith("test/") || rel.startsWith("tmp/")) return false;
  return true;
}

function uncoveredLines(file) {
  const lines = [];
  for (const entry of file.lines || []) {
    if (entry && entry.count === 0 && Number.isInteger(entry.line)) lines.push(entry.line);
  }
  return formatLineList(lines);
}

function coverageRows(summary, root) {
  const rows = [];
  for (const file of (summary && summary.files) || []) {
    const rel = relativeFile(file.path, root);
    if (!keepCoverageFile(rel)) continue;
    rows.push({
      file: rel,
      lines: percent(file.coveredLinePercent),
      branches: percent(file.coveredBranchPercent),
      functions: percent(file.coveredFunctionPercent),
      uncovered: uncoveredLines(file),
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  const totals = summary && summary.totals;
  if (totals) {
    rows.unshift({
      file: "all files",
      lines: percent(totals.coveredLinePercent),
      branches: percent(totals.coveredBranchPercent),
      functions: percent(totals.coveredFunctionPercent),
      uncovered: "",
    });
  }
  return rows;
}

function normalizeCounts(counts) {
  if (!counts) return null;
  return {
    tests: counts.tests,
    pass: counts.pass != null ? counts.pass : counts.passed,
    fail: counts.fail != null ? counts.fail : counts.failed,
    skipped: counts.skipped,
    cancelled: counts.cancelled,
    todo: counts.todo,
  };
}

function errorDetail(details) {
  const error = details && details.error;
  if (!error) return "";
  const cause = error.cause;
  let text = "";
  if (cause && typeof cause.message === "string" && cause.message.trim()) text = cause.message;
  else if (typeof error.message === "string" && error.message.trim()) text = error.message;
  else if (cause && cause.actual !== undefined && cause.expected !== undefined) {
    text = `Expected ${JSON.stringify(cause.expected)} and got ${JSON.stringify(cause.actual)}`;
  } else if (error.failureType) text = String(error.failureType);
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

function caseStatus(event) {
  const data = event.data || {};
  const details = data.details || {};
  const failureType = details.error && details.error.failureType ? String(details.error.failureType) : "";
  if (data.todo || details.todo) return "todo";
  if (data.skip || details.skip) return "skipped";
  if (event.type === "test:fail") {
    if (/cancel/i.test(failureType)) return "cancelled";
    return "failed";
  }
  return "passed";
}

async function collectSuite(source, root) {
  const cases = [];
  let counts = null;
  let durationMs = null;
  let success = null;
  let coverage = [];
  for await (const event of source) {
    if (!event || !event.type) continue;
    const data = event.data || {};
    if (event.type === "test:pass" || event.type === "test:fail") {
      const kind = data.details && data.details.type;
      if (kind === "suite") continue;
      const file = relativeFile(data.file, root) || String(data.file || "").replace(/\\/g, "/");
      cases.push({
        name: data.name || "(unnamed)",
        file,
        status: caseStatus(event),
        detail: event.type === "test:fail" ? errorDetail(data.details) : "",
      });
      continue;
    }
    if (event.type === "test:summary" && !data.file) {
      counts = normalizeCounts(data.counts);
      durationMs = data.duration_ms;
      success = data.success;
      continue;
    }
    if (event.type === "test:coverage") coverage = coverageRows(data.summary, root);
  }
  return { cases, counts, durationMs, success, coverage };
}

function writeSuite(payload, root) {
  const file = suiteReportPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload));
  return file;
}

async function* suiteReporter(source) {
  const payload = await collectSuite(source, process.cwd());
  try {
    writeSuite(payload, process.cwd());
  } catch {
    // The shell hook can still read the spec output.
  }
}

suiteReporter.collectSuite = collectSuite;
suiteReporter.coverageRows = coverageRows;
suiteReporter.errorDetail = errorDetail;
suiteReporter.formatLineList = formatLineList;
suiteReporter.suiteReportPath = suiteReportPath;
suiteReporter.writeSuite = writeSuite;

module.exports = suiteReporter;
