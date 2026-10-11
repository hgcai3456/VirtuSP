"use strict";

const fs = require("fs");
const path = require("path");
const gate = require("./unit-test-agent");
const suiteReporter = require("./suite-reporter");

const REPORT_NAME = "reports/testing-report.md";
const CONTEXT_LIMIT = 80000;

function isDirectRun(mainModule, thisModule) {
  return mainModule === thisModule;
}

function isFullSuite(command) {
  const text = String(command || "");
  if (/npm(\.cmd)?\s+(run\s+)?test(?![:\w-])/i.test(text)) return true;
  if (/node(\.exe)?\b/i.test(text) && /--test\b/.test(text) && /tests[/\\]\*\.test\.js/.test(text)) {
    return true;
  }
  return false;
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function caseSource(text) {
  let cut = text;
  const failRecap = cut.search(/^✖ failing tests:?\s*$/m);
  if (failRecap >= 0) cut = cut.slice(0, failRecap);
  const coverage = cut.search(/^ℹ\s+start of coverage report\s*$/m);
  if (coverage >= 0) cut = cut.slice(0, coverage);
  return cut;
}

function parseSummary(text) {
  const summary = {};
  const labels = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];
  for (const label of labels) {
    const re = new RegExp(`^ℹ\\s+${label}\\s+(\\d+)\\s*$`, "gm");
    let match;
    let value = null;
    while ((match = re.exec(text))) value = Number(match[1]);
    if (value != null) summary[label] = value;
  }
  const duration = /^ℹ\s+duration_ms\s+([0-9.]+)\s*$/gm;
  let match;
  let ms = null;
  while ((match = duration.exec(text))) ms = Number(match[1]);
  if (ms != null) summary.durationMs = ms;
  return summary;
}

function parseSpecCases(text) {
  const lines = caseSource(text).split(/\n/);
  const suites = [];
  const cases = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, "");
    const suite = line.match(/^(\s*)▶\s+(.+?)\s*$/);
    if (suite) {
      const indent = suite[1].length;
      while (suites.length && suites[suites.length - 1].indent >= indent) suites.pop();
      suites.push({ indent, name: suite[2] });
      continue;
    }
    const item = line.match(/^(\s*)([✔✖]|\u2012|-)\s+(.*)$/);
    if (!item) continue;
    const indent = item[1].length;
    const symbol = item[2];
    let rest = item[3].trim();
    let tag = "";
    const tagMatch = rest.match(/\s+#\s+(\S+)\s*$/);
    if (tagMatch) {
      tag = tagMatch[1];
      rest = rest.slice(0, tagMatch.index).trim();
    }
    const durationMatch = rest.match(/\s+\(([0-9.]+)ms\)\s*$/);
    if (durationMatch) rest = rest.slice(0, durationMatch.index).trim();
    const name = rest;
    const open = suites.length ? suites[suites.length - 1] : null;
    if (open && open.name === name && open.indent === indent) {
      suites.pop();
      continue;
    }
    let status = "passed";
    if (symbol === "✖") status = /CANCEL/i.test(tag) ? "cancelled" : "failed";
    else if (symbol === "\u2012" || symbol === "-") {
      if (tag === "TODO") status = "todo";
      else status = "skipped";
    }
    let detail = "";
    if (status === "failed") {
      const err = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].replace(/\r$/, "");
        if (/^(\s*)([✔✖]|\u2012|-|▶)\s+/.test(next) && next.match(/^(\s*)/)[1].length <= indent) break;
        if (/^ℹ\s+(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(next)) break;
        if (next.trim()) err.push(next.trim());
        if (err.length >= 4) break;
      }
      detail = err.join(" ").replace(/\s+/g, " ").slice(0, 400);
    }
    cases.push({ name, file: "", status, detail });
  }
  return cases;
}

function parseTapCases(text) {
  const cases = [];
  const re = /^(not ok|ok)\s+\d+\s+-\s+(.+?)\s*(?:#\s*(SKIP|TODO|CANCELLED))?\s*$/gim;
  let match;
  while ((match = re.exec(text))) {
    const tag = (match[3] || "").toUpperCase();
    let status = match[1].toLowerCase() === "not ok" ? "failed" : "passed";
    if (tag === "SKIP") status = "skipped";
    else if (tag === "TODO") status = "todo";
    else if (tag === "CANCELLED") status = "cancelled";
    cases.push({ name: match[2].trim(), file: "", status, detail: "" });
  }
  return cases;
}

function parseCases(text) {
  if (/^[ \t]*[✔✖▶\u2012]/m.test(text) || /^[ \t]*- .+#\s+SKIP/m.test(text)) return parseSpecCases(text);
  return parseTapCases(text);
}

function parseCoverageTable(text) {
  const start = text.search(/^ℹ\s+start of coverage report\s*$/m);
  const end = text.search(/^ℹ\s+end of coverage report\s*$/m);
  if (start < 0 || end < start) return [];
  const rows = [];
  const stack = [];
  for (const raw of text.slice(start, end).split(/\n/)) {
    const line = raw.replace(/\r$/, "").replace(/^ℹ\s?/, "");
    if (!line.trim() || /^-{3,}/.test(line.trim()) || line.trim().startsWith("file")) continue;
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const cell = parts[0].replace(/\s+$/, "");
    const depth = cell.length - cell.trimStart().length;
    const name = cell.trim();
    const lines = parts[1].trim();
    const branches = parts[2].trim();
    const functions = parts[3].trim();
    const uncovered = parts.slice(4).join("|").trim();
    if (name === "all files") {
      rows.push({ file: "all files", lines, branches, functions, uncovered: "" });
      continue;
    }
    const directory = !lines && !branches && !functions;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (directory) {
      stack.push({ depth, name });
      continue;
    }
    const file = [...stack.map((entry) => entry.name), name].join("/");
    rows.push({ file, lines, branches, functions, uncovered });
  }
  const total = rows.find((row) => row.file === "all files");
  const files = rows.filter((row) => row.file !== "all files");
  return total ? [total, ...files] : files;
}

function resultOf(summary, success) {
  if (success === false) return "failed";
  if (summary && (summary.fail > 0 || summary.cancelled > 0)) return "failed";
  if (success === true) return "passed";
  if (summary && summary.tests != null && summary.fail === 0) return "passed";
  return "incomplete";
}

function reportFromPayload(payload, command, durationMs) {
  const counts = (payload && payload.counts) || {};
  const summary = {
    tests: counts.tests,
    pass: counts.pass,
    fail: counts.fail,
    skipped: counts.skipped,
    cancelled: counts.cancelled,
    todo: counts.todo,
    durationMs: payload && payload.durationMs != null ? payload.durationMs : durationMs,
  };
  return {
    command,
    result: resultOf(summary, payload ? payload.success : null),
    summary,
    cases: (payload && payload.cases) || [],
    coverage: (payload && payload.coverage) || [],
  };
}

function reportFromOutput(output, command, durationMs) {
  const text = stripAnsi(output);
  const summary = parseSummary(text);
  if (summary.durationMs == null && durationMs != null) summary.durationMs = durationMs;
  const coverage = parseCoverageTable(text);
  return {
    command,
    result: resultOf(summary, null),
    summary,
    cases: parseCases(text),
    coverage,
  };
}

function readFreshSuite(file, durationMs, now) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const duration = Number(durationMs);
  const slack = 15000;
  const window = Number.isFinite(duration) && duration >= 0 ? duration + slack : slack;
  if (now - stat.mtimeMs > window) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  if (n < 1000) return `${Math.round(n)} ms`;
  const seconds = Math.round(n / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function count(summary, key) {
  const value = summary ? summary[key] : null;
  return value == null ? "unknown" : String(value);
}

function listCases(cases, status) {
  return (cases || []).filter((item) => item.status === status);
}

function caseLine(item) {
  const where = item.file ? ` (${item.file})` : "";
  if (item.status === "failed" && item.detail) return `- ${item.name}${where} — ${item.detail}`;
  return `- ${item.name}${where}`;
}

function section(title, cases) {
  const lines = [`### ${title}`];
  if (!cases.length) lines.push("None.");
  else for (const item of cases) lines.push(caseLine(item));
  return lines.join("\n");
}

function cell(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function shortUncovered(value) {
  const text = cell(value);
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}...`;
}

function coverageTable(rows) {
  if (!rows || !rows.length) {
    return "Unit test coverage was not collected for this run.";
  }
  const lines = [
    "| File | Line % | Branch % | Function % | Uncovered lines |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${cell(row.file)} | ${cell(row.lines)} | ${cell(row.branches)} | ${cell(row.functions)} | ${shortUncovered(row.uncovered)} |`,
    );
  }
  return lines.join("\n");
}

function formatReport(report, now) {
  const summary = report.summary || {};
  const when = now || new Date().toISOString();
  const command = String(report.command || "npm test").replace(/\s+/g, " ").trim().slice(0, 300);
  const duration = formatDuration(summary.durationMs);
  const lines = [
    "# Testing report",
    "",
    `Finished: ${when}`,
    `Command: \`${command}\``,
    `Result: ${report.result || "incomplete"}`,
    `Tests run: ${count(summary, "tests")}`,
    `Passed: ${count(summary, "pass")}`,
    `Failed: ${count(summary, "fail")}`,
    `Skipped: ${count(summary, "skipped")}`,
    `Cancelled: ${count(summary, "cancelled")}`,
    `Todo: ${count(summary, "todo")}`,
  ];
  if (duration) lines.push(`Duration: ${duration}`);
  const totals = (report.coverage || []).find((row) => row.file === "all files");
  if (totals) {
    lines.push(
      `Unit coverage: ${totals.lines}% lines, ${totals.branches}% branches, ${totals.functions}% functions`,
    );
  }
  const listed = (report.cases || []).length;
  if (summary.tests != null && listed && listed !== summary.tests) {
    lines.push(`The summary counted ${summary.tests} tests and the log listed ${listed} names.`);
  }
  lines.push(
    "",
    "## Tests that ran",
    "",
    section("Passed", listCases(report.cases, "passed")),
    "",
    section("Failed", listCases(report.cases, "failed")),
    "",
    section("Skipped", listCases(report.cases, "skipped")),
    "",
    "## Unit test coverage",
    "",
    coverageTable(report.coverage),
    "",
    "This is an engineering check, not clinical validation.",
    "",
  );
  return gate.redact(lines.join("\n"));
}

function contextBody(markdown) {
  if (markdown.length <= CONTEXT_LIMIT) return markdown;
  return `${markdown.slice(0, CONTEXT_LIMIT)}\n\nThe rest of the report is in ${REPORT_NAME}.`;
}

function handleShell(input, deps = {}) {
  if (process.env.VIRTUSP_SKIP_TEST_REPORT === "1") return {};
  const command = input && input.command ? String(input.command) : "";
  if (!isFullSuite(command)) return {};
  const now = deps.now || Date.now();
  const root = deps.root || gate.resolveRoot(input || {});
  const suiteFile = deps.suiteFile || suiteReporter.suiteReportPath(root);
  const payload = readFreshSuite(suiteFile, input && input.duration, now);
  const output = input && input.output ? String(input.output) : "";
  let report;
  if (payload) {
    report = reportFromPayload(payload, command, input && input.duration);
    if (!report.coverage.length) report.coverage = parseCoverageTable(stripAnsi(output));
  } else {
    report = reportFromOutput(output, command, input && input.duration);
  }
  const markdown = formatReport(report, deps.generatedAt || new Date(now).toISOString());
  const reportFile = deps.reportFile || path.join(root, REPORT_NAME);
  let saved = false;
  try {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, markdown);
    saved = true;
  } catch {
    saved = false;
  }
  const intro = [
    "A full testing suite just finished. Show the user this Testing report in your next message before other work. Keep what ran, which tests passed, which tests failed, and the unit test coverage. Do not replace the report with a one-line summary.",
  ];
  if (saved) intro.push(`A copy is saved at ${REPORT_NAME}.`);
  intro.push("", contextBody(markdown));
  return { additional_context: intro.join("\n") };
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function writeStdout(payload) {
  fs.writeSync(1, `${JSON.stringify(payload)}\n`);
}

function main(deps) {
  const options = deps || {};
  const read = options.readStdin || readStdin;
  const write = options.writeStdout || writeStdout;
  let input = {};
  try {
    const raw = read();
    if (raw && String(raw).trim()) input = JSON.parse(String(raw));
  } catch {
    write({});
    return;
  }
  if (input.hook_event_name === "afterShellExecution") {
    try {
      write(handleShell(input, options));
    } catch {
      write({});
    }
    return;
  }
  write({});
}

function entry(isMain, deps) {
  if (isMain) main(deps);
}

entry(isDirectRun(require.main, module));

module.exports = {
  CONTEXT_LIMIT,
  REPORT_NAME,
  caseSource,
  formatReport,
  handleShell,
  isDirectRun,
  isFullSuite,
  main,
  parseCases,
  parseCoverageTable,
  parseSummary,
  readFreshSuite,
  reportFromOutput,
  reportFromPayload,
};
