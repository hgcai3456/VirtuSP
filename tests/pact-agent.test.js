"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const agent = require("../agents/pact-agent");

const catalog = [
  { id: "GET /api/live" },
  { id: "GET /api/encounters/:id/avatar/events", direct: true },
];

test("finds operations that have no Pact interaction", () => {
  assert.deepEqual(agent.missingOperations(catalog, ["GET /api/live"], "GET /api/encounters/:id/avatar/events"), []);
  assert.deepEqual(agent.missingOperations(catalog, [], ""), [
    "GET /api/live",
    "GET /api/encounters/:id/avatar/events",
  ]);
  assert.deepEqual(agent.missingOperations(catalog, ["GET /api/live"], ""), [
    "GET /api/encounters/:id/avatar/events",
  ]);
});

test("reads Pact descriptions and ignores a missing or invalid file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-pact-agent-"));
  assert.deepEqual(agent.readPactDescriptions(dir), []);
  const folder = path.join(dir, "pacts");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "virtusp-web-virtusp-api.json"), "{");
  assert.deepEqual(agent.readPactDescriptions(dir), []);
  fs.writeFileSync(
    path.join(folder, "virtusp-web-virtusp-api.json"),
    JSON.stringify({ interactions: [{ description: "GET /api/live" }, { description: 1 }, null] }),
  );
  assert.deepEqual(agent.readPactDescriptions(dir), ["GET /api/live"]);
  assert.equal(agent.readProviderSource(dir), "");
  assert.equal(agent.pactFile(dir), path.join(folder, "virtusp-web-virtusp-api.json"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loops until the suite passes and stops on a repeated failure", () => {
  let calls = 0;
  const passed = agent.loop(() => {
    calls += 1;
    return calls < 2
      ? { ok: false, signature: "one", missing: ["GET /api/live"], output: "not ok 1" }
      : { ok: true, signature: "done", missing: [], output: "" };
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.attempt, 2);

  const blocked = agent.loop(() => ({ ok: false, signature: "same", missing: [], output: "AssertionError" }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.attempt, 3);

  let n = 0;
  const exhausted = agent.loop(
    () => {
      n += 1;
      return { ok: false, signature: "sig-" + n, missing: [], output: "" };
    },
    { maxAttempts: 2, maxSame: 5 },
  );
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.blocked, false);
  assert.equal(exhausted.attempt, 2);
  assert.match(agent.formatResult(exhausted), /still failing after 2/);
  assert.match(agent.formatResult(blocked), /3 times/);
  assert.match(agent.formatResult({ ...blocked, outcome: { missing: ["GET /api/live"], output: "x".repeat(5000) } }), /GET \/api\/live/);
  assert.match(agent.formatResult(passed), /100%/);
});

test("signatures ignore unchanged failures and keep the test exit code", () => {
  const first = agent.failureSignature({ code: 1, missing: ["GET /api/live"], output: "not ok 1\nAssertionError: no\n" });
  const again = agent.failureSignature({ code: 1, missing: ["GET /api/live"], output: "noise\nnot ok 1\nAssertionError: no\n" });
  const changed = agent.failureSignature({ code: 0, missing: [], output: "" });
  assert.equal(first, again);
  assert.notEqual(first, changed);
  assert.equal(agent.failureSignature({ code: 1, output: "quiet" }).length, 16);
});

test("runOnce reports coverage after the spawned suite", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-pact-once-"));
  const passed = agent.runOnce(root, {
    catalog,
    spawn: () => ({ code: 0, output: "" }),
    readDescriptions: () => ["GET /api/live"],
    providerSource: "GET /api/encounters/:id/avatar/events",
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.missing.length, 0);

  const failed = agent.runOnce(root, {
    catalog,
    spawn: () => ({ code: 1, output: "not ok 1" }),
    readDescriptions: () => [],
    providerSource: "",
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 1);
  assert.deepEqual(failed.missing, ["GET /api/live", "GET /api/encounters/:id/avatar/events"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("spawnTests records the child status and a timeout", () => {
  const ok = agent.spawnTests(process.cwd(), {
    spawnSync: () => ({ status: 0, stdout: "ok", stderr: "" }),
  });
  assert.equal(ok.code, 0);
  assert.match(ok.output, /ok/);
  const timedOut = agent.spawnTests(process.cwd(), {
    spawnSync: () => ({ status: null, stdout: "", stderr: "", error: new Error("timed out") }),
  });
  assert.equal(timedOut.code, 1);
  assert.match(timedOut.output, /timed out/);
});

test("records a direct-launch exit code and default options", () => {
  const previous = process.exitCode;
  const original = process.stdout.write;
  let printed = "";
  process.stdout.write = (chunk) => {
    printed += chunk;
    return true;
  };
  try {
    assert.deepEqual(agent.cliOptions(undefined), {});
    assert.equal(agent.cliOptions({ root: "x" }).root, "x");
    assert.equal(agent.applyExitCode(4), 4);
    assert.equal(process.exitCode, 4);
    assert.equal(agent.applyExitCode(5, { keep: true }), 5);
    assert.equal(agent.runCli({ runOnce: () => ({ ok: true, missing: [], output: "" }) }), 0);
  } finally {
    process.stdout.write = original;
    process.exitCode = previous;
  }
  assert.match(printed, /100%/);
});

test("the command reports success and a blocker without exiting the test runner", () => {
  assert.equal(agent.isDirectRun(module, module), true);
  assert.equal(agent.isDirectRun({}, module), false);
  assert.equal(agent.entry(false), 0);
  let success = "";
  assert.equal(
    agent.runCli({
      runOnce: () => ({ ok: true, signature: "ok", missing: [], output: "" }),
      write: (text) => {
        success += text;
      },
    }),
    0,
  );
  assert.match(success, /100%/);
  let failure = "";
  assert.equal(
    agent.entry(true, {
      runOnce: () => ({ ok: false, signature: "same", missing: ["GET /api/live"], output: "not ok 1" }),
      write: (text) => {
        failure += text;
      },
      maxSame: 1,
    }),
    1,
  );
  assert.match(failure, /blocker/);
  assert.equal(agent.TEST_FILES.length, 3);
});
