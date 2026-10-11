"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const TEST_ARGS = ["--test", "--test-timeout=120000", "tests/*.test.js"];
const SOURCE_PREFIXES = ["lib/", "agents/", "scripts/", "public/js/"];
const MAX_SNIPPETS = 40;
const MAX_SNIPPET_CHARS = 100000;

function emptyState() {
  return {
    files: {},
    testsChanged: false,
    pending: false,
    failureSignature: null,
    sameFailureCount: 0,
    reported: false,
  };
}

function isDirectRun(mainModule, thisModule) {
  return mainModule === thisModule;
}

function normalizeRoot(raw) {
  let text = String(raw || process.cwd())
    .trim()
    .replace(/\\/g, "/");
  const drive = text.match(/^\/([A-Za-z]:\/.*)$/);
  if (drive) text = drive[1];
  return path.resolve(text);
}

function resolveRoot(input) {
  const fromEnv = process.env.CURSOR_PROJECT_DIR;
  if (fromEnv) return normalizeRoot(fromEnv);
  const roots = input && input.workspace_roots;
  if (roots && roots[0]) return normalizeRoot(roots[0]);
  return normalizeRoot(process.cwd());
}

function toRelative(filePath, root) {
  if (!filePath) return null;
  let raw = String(filePath).trim().replace(/\\/g, "/");
  const drive = raw.match(/^\/([A-Za-z]:\/.*)$/);
  if (drive) raw = drive[1];
  const windowsAbs = path.win32.isAbsolute(raw);
  const posixAbs = path.posix.isAbsolute(raw);
  const absolute = windowsAbs ? true : posixAbs;
  const abs = absolute ? path.resolve(raw) : path.resolve(root, raw);
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return null;
  return rel;
}

function isUnitSource(rel) {
  if (!rel || !rel.endsWith(".js") || rel.endsWith(".test.js")) return false;
  if (rel.startsWith("tests/") || rel.startsWith("test/") || rel.startsWith("node_modules/")) {
    return false;
  }
  if (rel === "server.js") return true;
  for (const prefix of SOURCE_PREFIXES) {
    if (rel.startsWith(prefix)) return true;
  }
  return false;
}

function isUnitTest(rel) {
  return /^tests\/.+\.test\.js$/.test(rel);
}

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function addSnippet(spec, snippet) {
  const normalized = normalizeNewlines(snippet);
  if (!normalized.trim()) return;
  let stored = normalized;
  if (normalized.length > MAX_SNIPPET_CHARS) stored = normalized.slice(0, MAX_SNIPPET_CHARS);
  if (spec.snippets.includes(stored)) return;
  spec.snippets.push(stored);
  if (spec.snippets.length > MAX_SNIPPETS) spec.snippets.shift();
}

function findOccurrences(source, needle) {
  const file = normalizeNewlines(source);
  const text = normalizeNewlines(needle);
  if (!text.trim()) return [];
  const lines = [];
  let from = 0;
  let count = 0;
  while (count < 9) {
    const at = file.indexOf(text, from);
    if (at < 0) break;
    count += 1;
    const start = file.slice(0, at).split("\n").length;
    const span = text.split("\n").length;
    for (let line = start; line < start + span; line += 1) lines.push(line);
    from = at + text.length;
  }
  if (count === 0 || count >= 9) return [];
  return lines;
}

function locateSnippet(source, snippet) {
  const direct = findOccurrences(source, snippet);
  if (direct.length) return [...new Set(direct)];
  const found = new Set();
  for (const line of normalizeNewlines(snippet).split("\n")) {
    if (line.trim().length < 20) continue;
    const hit = findOccurrences(source, line);
    if (hit.length === 1) found.add(hit[0]);
  }
  return [...found];
}

function defaultStateFile(root) {
  return path.join(root, ".cursor", "hooks", "state", "pending.json");
}

function loadState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const state = emptyState();
    state.testsChanged = Boolean(parsed.testsChanged);
    state.pending = Boolean(parsed.pending);
    state.failureSignature = parsed.failureSignature || null;
    state.sameFailureCount = Number(parsed.sameFailureCount) || 0;
    state.reported = Boolean(parsed.reported);
    const files = parsed.files && typeof parsed.files === "object" ? parsed.files : {};
    for (const rel of Object.keys(files)) {
      const spec = files[rel] || {};
      const snippets = Array.isArray(spec.snippets) ? spec.snippets : [];
      state.files[rel] = {
        snippets: snippets.filter((item) => typeof item === "string"),
        unresolved: Boolean(spec.unresolved),
      };
    }
    return state;
  } catch {
    return emptyState();
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
}

function clearState(file) {
  fs.rmSync(file, { force: true });
}

function fileUrlToPath(url) {
  if (!url || !String(url).startsWith("file://")) return null;
  try {
    let pathname = decodeURIComponent(String(url).slice("file://".length));
    const drive = pathname.match(/^\/([A-Za-z]:\/.*)$/);
    if (drive) pathname = drive[1];
    return path.normalize(pathname);
  } catch {
    return null;
  }
}

function sameFile(a, b) {
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  const exact = left === right;
  const folded = left.toLowerCase() === right.toLowerCase();
  if (exact) return true;
  return folded;
}

function readCoverage(dir) {
  if (!fs.existsSync(dir)) return [];
  const records = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith("coverage") || !name.endsWith(".json")) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    for (const script of data.result || []) {
      const filePath = fileUrlToPath(script.url);
      if (!filePath) continue;
      const ranges = [];
      for (const fn of script.functions || []) {
        for (const range of fn.ranges || []) {
          ranges.push({
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            count: range.count,
          });
        }
      }
      records.push({ path: filePath, ranges });
    }
  }
  return records;
}

function lineByteSpans(buf) {
  const spans = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i += 1) {
    if (i === buf.length || buf[i] === 0x0a) {
      const end = i === buf.length ? buf.length : i + 1;
      spans.push([start, end]);
      start = i + 1;
    }
  }
  return spans;
}

function isSkippableLine(text) {
  const trimmed = String(text).replace(/\r?\n/g, "").trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("/*")) return true;
  if (trimmed.startsWith("*/")) return true;
  if (trimmed.startsWith("*")) return true;
  return false;
}

function overlapHasCode(buf, lineStart, lineEnd, range) {
  const start = Math.max(lineStart, range.startOffset);
  const end = Math.min(lineEnd, range.endOffset);
  return !isSkippableLine(buf.subarray(start, end).toString("utf8"));
}

function lineUncovered(buf, start, end, ranges) {
  const text = buf.subarray(start, end).toString("utf8");
  if (isSkippableLine(text)) return false;
  let sawPositive = false;
  for (const range of ranges) {
    if (range.endOffset <= start || range.startOffset >= end) continue;
    if (!overlapHasCode(buf, start, end, range)) continue;
    if (range.count === 0) return true;
    if (range.count > 0) sawPositive = true;
  }
  if (sawPositive) return false;
  return true;
}

function gapsForFile(absPath, spec, records) {
  let source;
  try {
    source = fs.readFileSync(absPath);
  } catch {
    return { missing: true, lines: [], unmapped: false, loaded: false };
  }
  const snippets = spec.snippets || [];
  const record = records.find((item) => sameFile(item.path, absPath));
  const ranges = record ? record.ranges : [];
  if (!snippets.length) {
    if (spec.unresolved) {
      return { missing: false, lines: [], unmapped: true, loaded: Boolean(record) };
    }
    return { missing: false, lines: [], unmapped: false, loaded: Boolean(record) };
  }
  const text = source.toString("utf8");
  const lineSet = new Set();
  for (const snippet of snippets) {
    for (const line of locateSnippet(text, snippet)) lineSet.add(line);
  }
  if (!lineSet.size) {
    return { missing: false, lines: [], unmapped: true, loaded: Boolean(record) };
  }
  const spans = lineByteSpans(source);
  const uncovered = [];
  for (const line of [...lineSet].sort((a, b) => a - b)) {
    const span = spans[line - 1];
    if (lineUncovered(source, span[0], span[1], ranges)) uncovered.push(line);
  }
  return { missing: false, lines: uncovered, unmapped: false, loaded: Boolean(record) };
}

function collectGaps(root, state, records) {
  const gaps = [];
  for (const rel of Object.keys(state.files).sort()) {
    const result = gapsForFile(path.join(root, rel), state.files[rel], records);
    if (result.missing) {
      gaps.push({ file: rel, lines: [], note: "file is missing" });
      continue;
    }
    if (result.unmapped) {
      gaps.push({ file: rel, lines: [], note: "the edit could not be mapped to current lines" });
      continue;
    }
    if (!result.lines.length) continue;
    let note = "";
    if (!result.loaded && rel.startsWith("public/js/")) {
      note = "browser script was not in the coverage report; load it with a //# sourceURL= comment matching this path";
    }
    gaps.push({ file: rel, lines: result.lines, note });
  }
  return gaps;
}

function redact(text) {
  return String(text || "")
    .replace(/cursor_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
    .replace(/(api[_-]?key|secret|password|token)\s*[:=]\s*([^\s,;]+)/gi, "$1=[redacted]");
}

function tail(text, max) {
  const clean = redact(text).trim();
  if (clean.length <= max) return clean;
  return clean.slice(clean.length - max);
}

function failureLines(output) {
  const matches = String(output || "").match(/^.*(✖|not ok |AssertionError|ERR_TEST_FAILURE).*$/gm);
  if (!matches) return [];
  return matches.slice(0, 30);
}

function failureSignature(code, gaps, output) {
  const body = JSON.stringify({ code, gaps, fails: failureLines(output) });
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
}

function formatLineList(lines) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
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

function formatFollowup({ outcome, gaps, attempt, blocked, state }) {
  const files = Object.keys(state.files);
  const lines = [];
  if (blocked) {
    lines.push(
      "The same unit-test result has come back 3 times. Stop editing and report this blocker. Do not delete or weaken a test to get a green run.",
    );
  } else {
    lines.push(
      "Unit-test gate is still open. Recursively write unit tests, run npm test, and update the code until 100% of the unit tests pass and every changed line and branch is covered.",
    );
    lines.push(`This is attempt ${attempt} of 3 for this same result.`);
    if (outcome.code !== 0) {
      lines.push(
        "A test failed. Update the code under test so the existing assertion passes. Keep the assertion. Do not delete or weaken a test.",
      );
    }
  }
  if (files.length) {
    lines.push("", "Changed source:");
    for (const file of files) lines.push(`- ${file}`);
  }
  if (state.testsChanged) lines.push("", "Unit tests changed.");
  if (gaps.length) {
    lines.push("", "Coverage gaps:");
    for (const gap of gaps) {
      const where = gap.lines.length ? `${gap.file}: ${formatLineList(gap.lines)}` : gap.file;
      if (gap.note) lines.push(`- ${where} (${gap.note})`);
      else lines.push(`- ${where}`);
    }
  }
  lines.push("", `npm test exit code: ${outcome.code}`);
  if (outcome.code === 0) {
    lines.push(
      "The unit tests passed. The changed lines above are not covered yet. Write another unit test that executes each gap, then run npm test again.",
    );
  }
  const output = tail(outcome.output || "", 3000);
  if (output) lines.push("", "Output:", output);
  lines.push(
    "",
    "Use node:test in tests/*.test.js and synthetic data only. A passing run is an engineering check, not clinical validation.",
  );
  return lines.join("\n");
}

function runUnitTests(root, deps = {}) {
  const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-unit-cov-"));
  const args = deps.testArgs || TEST_ARGS;
  const timeoutMs = deps.timeoutMs || 540000;
  try {
    const childEnv = { ...process.env, NODE_V8_COVERAGE: coverageDir };
    delete childEnv.NODE_CHANNEL_FD;
    delete childEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
    });
    const output = [result.stdout, result.stderr, result.error && result.error.message]
      .filter(Boolean)
      .join("\n");
    const code = result.status === null ? 1 : result.status;
    return { code, output, records: readCoverage(coverageDir) };
  } finally {
    fs.rmSync(coverageDir, { recursive: true, force: true });
  }
}

function rememberFailure(state, signature) {
  if (signature === state.failureSignature) {
    if (state.reported) return "quiet";
    state.sameFailureCount += 1;
    return "count";
  }
  state.failureSignature = signature;
  state.sameFailureCount = 1;
  state.reported = false;
  return "count";
}

function stopGate(input, deps) {
  if (process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT === "1") return {};
  if (input.status === "aborted") return {};
  const root = deps.root || resolveRoot(input);
  const stateFile = deps.stateFile || defaultStateFile(root);
  const state = loadState(stateFile);
  if (!state.pending) return {};
  const hasSource = Object.keys(state.files).length > 0;
  if (!hasSource && !state.testsChanged) {
    clearState(stateFile);
    return {};
  }
  const run = deps.run || runUnitTests;
  const outcome = run(root, deps);
  const gaps = hasSource ? collectGaps(root, state, outcome.records || []) : [];
  if (outcome.code === 0 && !gaps.length) {
    clearState(stateFile);
    return {};
  }
  const signature = failureSignature(outcome.code, gaps, outcome.output || "");
  const action = rememberFailure(state, signature);
  if (action === "quiet") {
    state.pending = false;
    saveState(stateFile, state);
    return {};
  }
  const blocked = state.sameFailureCount >= 3;
  if (blocked) {
    state.reported = true;
    state.pending = false;
  } else {
    state.pending = true;
  }
  saveState(stateFile, state);
  return {
    followup_message: formatFollowup({
      outcome,
      gaps,
      attempt: state.sameFailureCount,
      blocked,
      state,
    }),
  };
}

function errorText(err) {
  if (err && err.stack) return `${err.stack}\n`;
  return `${err}\n`;
}

function reportError(err, deps) {
  if (deps && deps.warn) {
    deps.warn(err);
    return;
  }
  process.stderr.write(errorText(err));
}

function handleStop(input, deps = {}) {
  try {
    return stopGate(input, deps);
  } catch (err) {
    reportError(err, deps);
    return {};
  }
}

function handleEdit(input, deps = {}) {
  if (process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT === "1") return {};
  const root = deps.root || resolveRoot(input);
  const rel = toRelative(input.file_path, root);
  if (!rel) return {};
  const source = isUnitSource(rel);
  const unitTest = isUnitTest(rel);
  if (!source && !unitTest) return {};
  const stateFile = deps.stateFile || defaultStateFile(root);
  const state = loadState(stateFile);
  if (unitTest) state.testsChanged = true;
  if (source) {
    const spec = state.files[rel] || { snippets: [], unresolved: false };
    const edits = Array.isArray(input.edits) ? input.edits : [];
    if (!edits.length) spec.unresolved = true;
    for (const edit of edits) {
      if (!edit || !edit.new_string || !String(edit.new_string).trim()) continue;
      addSnippet(spec, edit.new_string);
    }
    state.files[rel] = spec;
  }
  state.pending = true;
  saveState(stateFile, state);
  return {};
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
  if (input.hook_event_name === "afterFileEdit") {
    write(handleEdit(input, options));
    return;
  }
  if (input.hook_event_name === "stop") {
    write(handleStop(input, options));
    return;
  }
  write({});
}

function entry(isMain, deps) {
  if (isMain) main(deps);
}

entry(isDirectRun(require.main, module));

module.exports = {
  TEST_ARGS,
  addSnippet,
  collectGaps,
  emptyState,
  entry,
  fileUrlToPath,
  findOccurrences,
  formatLineList,
  gapsForFile,
  handleEdit,
  handleStop,
  isDirectRun,
  isSkippableLine,
  isUnitSource,
  isUnitTest,
  lineUncovered,
  loadState,
  locateSnippet,
  main,
  normalizeRoot,
  readCoverage,
  readStdin,
  redact,
  resolveRoot,
  runUnitTests,
  sameFile,
  toRelative,
  writeStdout,
};
