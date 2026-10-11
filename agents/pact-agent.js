"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TEST_FILES = [
  "tests/pact/catalog.test.js",
  "tests/pact/consumer.test.js",
  "tests/pact/provider.test.js",
];

function pactFile(root) {
  return path.join(root, "pacts", "virtusp-web-virtusp-api.json");
}

function providerTestFile(root) {
  return path.join(root, "tests", "pact", "provider.test.js");
}

function readPactDescriptions(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pactFile(root), "utf8"));
    const interactions = Array.isArray(parsed.interactions) ? parsed.interactions : [];
    return interactions.map((item) => item && item.description).filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}

function readProviderSource(root) {
  try {
    return fs.readFileSync(providerTestFile(root), "utf8");
  } catch {
    return "";
  }
}

function missingOperations(catalog, descriptions, source) {
  const have = new Set(descriptions);
  const text = String(source || "");
  return catalog
    .filter((operation) => {
      if (have.has(operation.id)) return false;
      if (operation.direct && text.includes(operation.id)) return false;
      return true;
    })
    .map((operation) => operation.id);
}

function failureLines(output) {
  const matches = String(output || "").match(/^.*(not ok |AssertionError|Error:|✖).*$/gm);
  if (!matches) return [];
  return matches.slice(0, 30);
}

function failureSignature(outcome) {
  const body = JSON.stringify({
    code: outcome.code,
    missing: outcome.missing || [],
    fails: failureLines(outcome.output),
  });
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
}

function spawnTests(root, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const result = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=300000", ...TEST_FILES], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: deps.timeoutMs || 300000,
    windowsHide: true,
  });
  const output = [result.stdout, result.stderr, result.error && result.error.message].filter(Boolean).join("\n");
  return { code: result.status === null ? 1 : result.status, output };
}

function runOnce(root, deps = {}) {
  const catalog = deps.catalog || require("../pacts/endpoints").OPERATIONS;
  const tested = deps.spawn ? deps.spawn() : spawnTests(root, deps);
  const descriptions = deps.readDescriptions ? deps.readDescriptions() : readPactDescriptions(root);
  const source = deps.providerSource !== undefined ? deps.providerSource : readProviderSource(root);
  const missing = missingOperations(catalog, descriptions, source);
  const outcome = {
    code: tested.code,
    output: tested.output || "",
    missing,
    ok: tested.code === 0 && missing.length === 0,
  };
  outcome.signature = failureSignature(outcome);
  return outcome;
}

function loop(run, options = {}) {
  const maxSame = options.maxSame || 3;
  const maxAttempts = options.maxAttempts || 8;
  let signature = null;
  let same = 0;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = run();
    last = outcome;
    if (outcome.ok) return { ok: true, attempt, blocked: false, outcome };
    if (outcome.signature === signature) same += 1;
    else {
      signature = outcome.signature;
      same = 1;
    }
    if (same >= maxSame) return { ok: false, attempt, blocked: true, outcome };
  }
  return { ok: false, attempt: maxAttempts, blocked: false, outcome: last };
}

function formatResult(result) {
  if (result.ok) {
    return `Pact coverage is 100% and the Pact tests passed on attempt ${result.attempt}.\n`;
  }
  const lines = [];
  if (result.blocked) {
    lines.push("The same Pact result has come back 3 times. Stop and report this blocker.");
  } else {
    lines.push(`Pact tests are still failing after ${result.attempt} attempts.`);
  }
  const missing = (result.outcome && result.outcome.missing) || [];
  if (missing.length) {
    lines.push("", "Operations without a contract:");
    for (const id of missing) lines.push(`- ${id}`);
  }
  const output = String((result.outcome && result.outcome.output) || "").trim();
  if (output) lines.push("", output.slice(-4000));
  lines.push("");
  return lines.join("\n");
}

function cliOptions(deps) {
  return deps || {};
}

function applyExitCode(code, deps) {
  if (!deps) process.exitCode = code;
  return code;
}

function runCli(deps) {
  const options = cliOptions(deps);
  const root = options.root || path.resolve(__dirname, "..");
  const result = loop(() => (options.runOnce ? options.runOnce() : runOnce(root, options)), options);
  const write = options.write || ((text) => process.stdout.write(text));
  write(formatResult(result));
  return result.ok ? 0 : 1;
}

function isDirectRun(mainModule, thisModule) {
  return mainModule === thisModule;
}

function entry(isMain, deps) {
  if (!isMain) return 0;
  return applyExitCode(runCli(deps), deps);
}

entry(isDirectRun(require.main, module));

module.exports = {
  TEST_FILES,
  entry,
  failureSignature,
  formatResult,
  isDirectRun,
  loop,
  missingOperations,
  pactFile,
  readPactDescriptions,
  readProviderSource,
  applyExitCode,
  cliOptions,
  runCli,
  runOnce,
  spawnTests,
};
