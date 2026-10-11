"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const report = require("../agents/test-report");
const suiteReporter = require("../agents/suite-reporter");

const root = path.resolve(__dirname, "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-test-report-"));
}

async function* events(list) {
  for (const event of list) yield event;
}

test("recognizes only the full unit suite", () => {
  assert.equal(report.isFullSuite("npm test"), true);
  assert.equal(report.isFullSuite("npm.cmd test"), true);
  assert.equal(report.isFullSuite("npm run test -- --test-timeout=120000"), true);
  assert.equal(report.isFullSuite("node --test --experimental-test-coverage tests/*.test.js"), true);
  assert.equal(report.isFullSuite("node tests\\*.test.js --test"), true);
  assert.equal(report.isFullSuite("npm run test:pact"), false);
  assert.equal(report.isFullSuite("npm run test:e2e"), false);
  assert.equal(report.isFullSuite("npm run testing"), false);
  assert.equal(report.isFullSuite("node --test tests/health.test.js"), false);
  assert.equal(report.isFullSuite(""), false);
});

test("collects pass, fail, skip, and coverage from reporter events", async () => {
  const payload = await suiteReporter.collectSuite(
    events([
      {
        type: "test:pass",
        data: { name: "yes branch", file: path.join(root, "tests", "a.test.js"), details: { type: "test" } },
      },
      {
        type: "test:fail",
        data: {
          name: "no branch fails",
          file: path.join(root, "tests", "a.test.js"),
          details: {
            type: "test",
            error: { failureType: "testCodeFailure", cause: { message: "Expected values to be strictly equal" } },
          },
        },
      },
      {
        type: "test:pass",
        data: { name: "later", skip: true, file: path.join(root, "tests", "a.test.js"), details: { type: "test" } },
      },
      {
        type: "test:pass",
        data: { name: "a.test.js", file: path.join(root, "tests", "a.test.js"), details: { type: "suite" } },
      },
      {
        type: "test:summary",
        data: {
          file: path.join(root, "tests", "a.test.js"),
          counts: { tests: 99, pass: 99, fail: 0, skipped: 0, cancelled: 0, todo: 0 },
          duration_ms: 1,
          success: true,
        },
      },
      {
        type: "test:summary",
        data: {
          counts: { tests: 3, pass: 1, fail: 1, skipped: 1, cancelled: 0, todo: 0 },
          duration_ms: 42,
          success: false,
        },
      },
      {
        type: "test:coverage",
        data: {
          summary: {
            totals: { coveredLinePercent: 80, coveredBranchPercent: 50, coveredFunctionPercent: 100 },
            files: [
              {
                path: path.join(root, "lib", "a.js"),
                coveredLinePercent: 50,
                coveredBranchPercent: 50,
                coveredFunctionPercent: 100,
                lines: [
                  { line: 2, count: 0 },
                  { line: 3, count: 0 },
                  { line: 5, count: 1 },
                ],
              },
              { path: path.join(root, "tests", "a.test.js"), coveredLinePercent: 100, lines: [] },
              { path: "C:\\outside\\secret.js", coveredLinePercent: 1, lines: [] },
            ],
          },
        },
      },
    ]),
    root,
  );
  assert.equal(payload.cases.length, 3);
  assert.equal(payload.cases[1].status, "failed");
  assert.match(payload.cases[1].detail, /strictly equal/);
  assert.equal(payload.cases[1].file, "tests/a.test.js");
  assert.equal(payload.cases[2].status, "skipped");
  assert.equal(payload.counts.fail, 1);
  assert.equal(payload.success, false);
  assert.equal(payload.coverage[0].file, "all files");
  assert.equal(payload.coverage[0].lines, "80.00");
  assert.equal(payload.coverage[1].file, "lib/a.js");
  assert.equal(payload.coverage[1].uncovered, "2-3");
  assert.equal(payload.coverage.some((row) => row.file.includes("secret")), false);
  assert.equal(suiteReporter.errorDetail({ error: { cause: { actual: "no", expected: "yes" } } }), 'Expected "yes" and got "no"');
  assert.equal(suiteReporter.formatLineList([3, 2, 2, 5]), "2-3, 5");
});

test("parses spec output once and reads the coverage table", () => {
  const skip = "\u2012 later (0.2638ms) # SKIP";
  const output = [
    "\u001b[32m✔\u001b[0m yes branch (1.042ms)",
    "✖ no branch fails (1.7525ms)",
    "  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal",
    skip,
    "▶ tests/health.test.js",
    "  ✔ liveness stays up (12ms)",
    "✔ tests/health.test.js (20ms)",
    "ℹ tests 4",
    "ℹ pass 2",
    "ℹ fail 1",
    "ℹ cancelled 0",
    "ℹ skipped 1",
    "ℹ todo 0",
    "ℹ duration_ms 479.5",
    "ℹ start of coverage report",
    "ℹ file | line % | branch % | funcs % | uncovered lines",
    "ℹ ---",
    "ℹ lib |  |  |  | ",
    "ℹ  a.js | 100.00 | 100.00 | 100.00 | ",
    "ℹ all files | 100.00 | 100.00 | 100.00 | ",
    "ℹ end of coverage report",
    "✖ failing tests:",
    "✖ no branch fails (1.7525ms)",
    "  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal",
  ].join("\n");
  const built = report.reportFromOutput(output, "npm test", 500);
  assert.equal(built.summary.tests, 4);
  assert.equal(built.summary.fail, 1);
  assert.equal(built.result, "failed");
  assert.equal(built.cases.filter((item) => item.name === "no branch fails").length, 1);
  assert.match(built.cases.find((item) => item.status === "failed").detail, /strictly equal/);
  assert.equal(built.cases.find((item) => item.name === "later").status, "skipped");
  assert.equal(built.cases.some((item) => item.name === "tests/health.test.js"), false);
  assert.equal(built.coverage[0].file, "all files");
  assert.equal(built.coverage.find((row) => row.file === "lib/a.js").lines, "100.00");
  const tap = report.parseCases("ok 1 - yes branch\nnot ok 2 - no branch fails\nok 3 - later # SKIP\n");
  assert.deepEqual(
    tap.map((item) => item.status),
    ["passed", "failed", "skipped"],
  );
});

test("writes the testing report after a fresh full suite", () => {
  const dir = tempDir();
  const suiteFile = path.join(dir, "last-suite.json");
  const reportFile = path.join(dir, "testing-report.md");
  const payload = {
    cases: [
      { name: "yes branch", file: "tests/a.test.js", status: "passed", detail: "" },
      { name: "no branch fails", file: "tests/a.test.js", status: "failed", detail: "api_key=supersecret" },
    ],
    counts: { tests: 2, pass: 1, fail: 1, skipped: 0, cancelled: 0, todo: 0 },
    durationMs: 125000,
    success: false,
    coverage: [{ file: "all files", lines: "80.00", branches: "50.00", functions: "100.00", uncovered: "" }],
  };
  fs.writeFileSync(suiteFile, JSON.stringify(payload));
  const seen = report.handleShell(
    { command: "npm test", output: "", duration: 1000, workspace_roots: [dir] },
    { root: dir, suiteFile, reportFile, now: Date.now(), generatedAt: "2026-10-11T04:00:00.000Z" },
  );
  assert.match(seen.additional_context, /Show the user this Testing report/);
  assert.match(seen.additional_context, /no branch fails/);
  assert.match(seen.additional_context, /api_key=\[redacted\]/);
  assert.match(seen.additional_context, /Unit coverage: 80\.00% lines, 50\.00% branches, 100\.00% functions/);
  assert.equal(seen.additional_context.includes("supersecret"), false);
  const saved = fs.readFileSync(reportFile, "utf8");
  assert.match(saved, /# Testing report/);
  assert.match(saved, /Result: failed/);
  assert.match(saved, /Duration: 2m 5s/);
  assert.match(saved, /not clinical validation/);
  assert.equal(report.handleShell({ command: "npm run test:pact", output: "ok", duration: 10 }, { root: dir }).additional_context, undefined);
  const previous = process.env.VIRTUSP_SKIP_TEST_REPORT;
  process.env.VIRTUSP_SKIP_TEST_REPORT = "1";
  try {
    assert.deepEqual(report.handleShell({ command: "npm test", output: "ℹ tests 1\nℹ pass 1\nℹ fail 0" }, { root: dir }), {});
  } finally {
    if (previous === undefined) delete process.env.VIRTUSP_SKIP_TEST_REPORT;
    else process.env.VIRTUSP_SKIP_TEST_REPORT = previous;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ignores a stale suite file and uses the shell output", () => {
  const dir = tempDir();
  const suiteFile = path.join(dir, "last-suite.json");
  fs.writeFileSync(
    suiteFile,
    JSON.stringify({
      cases: [{ name: "stale", file: "", status: "passed", detail: "" }],
      counts: { tests: 1, pass: 1, fail: 0, skipped: 0, cancelled: 0, todo: 0 },
      durationMs: 5,
      success: true,
      coverage: [],
    }),
  );
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(suiteFile, old, old);
  const output = ["✔ fresh test (1ms)", "ℹ tests 1", "ℹ pass 1", "ℹ fail 0", "ℹ skipped 0", "ℹ cancelled 0", "ℹ todo 0"].join("\n");
  const seen = report.handleShell(
    { command: "node --test tests/*.test.js", output, duration: 1000 },
    { root: dir, suiteFile, reportFile: path.join(dir, "out.md"), now: Date.now(), generatedAt: "2026-10-11T04:00:00.000Z" },
  );
  assert.match(seen.additional_context, /fresh test/);
  assert.equal(seen.additional_context.includes("stale"), false);
  assert.equal(report.readFreshSuite(path.join(dir, "missing.json"), 1000, Date.now()), null);
  fs.writeFileSync(suiteFile, "{");
  fs.utimesSync(suiteFile, Date.now() / 1000, Date.now() / 1000);
  assert.equal(report.readFreshSuite(suiteFile, 1000, Date.now()), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the hook returns the report for a finished suite", () => {
  const dir = tempDir();
  const seen = [];
  report.main({
    root: dir,
    suiteFile: path.join(dir, "missing.json"),
    reportFile: path.join(dir, "out.md"),
    now: Date.now(),
    generatedAt: "2026-10-11T04:00:00.000Z",
    readStdin: () =>
      JSON.stringify({
        hook_event_name: "afterShellExecution",
        command: "npm test",
        output: "✔ only (1ms)\nℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ skipped 0\nℹ cancelled 0\nℹ todo 0\n",
        duration: 20,
      }),
    writeStdout(payload) {
      seen.push(payload);
    },
  });
  report.main({
    readStdin: () => "{",
    writeStdout(payload) {
      seen.push(payload);
    },
  });
  report.main({
    readStdin: () => JSON.stringify({ hook_event_name: "stop" }),
    writeStdout(payload) {
      seen.push(payload);
    },
  });
  assert.match(seen[0].additional_context, /only/);
  assert.deepEqual(seen[1], {});
  assert.deepEqual(seen[2], {});
  assert.equal(report.isDirectRun(module, module), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("node loads the suite reporter for a real run", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "lib", "a.js"),
    'function answer(x) {\n  if (x > 0) return "yes";\n  return "no";\n}\nmodule.exports = { answer };\n',
  );
  fs.writeFileSync(
    path.join(dir, "sample.test.js"),
    [
      'const test = require("node:test");',
      'const assert = require("node:assert/strict");',
      'const { answer } = require("./lib/a.js");',
      'test("yes branch", () => { assert.equal(answer(1), "yes"); });',
      'test("no branch fails", () => { assert.equal(answer(0), "yes"); });',
      'test("later", { skip: true }, () => {});',
      "",
    ].join("\n"),
  );
  const suiteFile = path.join(dir, "last-suite.json");
  const childEnv = { ...process.env, VIRTUSP_SUITE_REPORT: suiteFile };
  delete childEnv.NODE_CHANNEL_FD;
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--experimental-test-coverage",
      "--test-reporter",
      pathToFileURL(path.join(root, "agents", "suite-reporter.js")).href,
      "--test-reporter-destination",
      "stdout",
      "sample.test.js",
    ],
    {
      cwd: dir,
      encoding: "utf8",
      env: childEnv,
    },
  );
  assert.equal(result.status, 1, String(result.stderr || result.stdout || result.error || "").slice(0, 500));
  const payload = JSON.parse(fs.readFileSync(suiteFile, "utf8"));
  assert.equal(payload.counts.tests, 3);
  assert.equal(payload.counts.pass, 1);
  assert.equal(payload.counts.fail, 1);
  assert.equal(payload.counts.skipped, 1);
  assert.equal(payload.success, false);
  assert.equal(payload.cases.find((item) => item.name === "no branch fails").status, "failed");
  assert.match(payload.cases.find((item) => item.name === "no branch fails").detail, /Expected|strictly equal|got/);
  const covered = payload.coverage.find((row) => row.file === "lib/a.js");
  assert.equal(covered.lines, "100.00");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the project hook runs this report after the full suite", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /suite-reporter\.js/);
  assert.match(pkg.scripts.test, /--experimental-test-coverage/);
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".cursor", "hooks.json"), "utf8"));
  assert.equal(hooks.hooks.afterShellExecution[0].command, "node agents/test-report.js");
  assert.equal(hooks.hooks.afterShellExecution[0].timeout, 30);
  const prompt = fs.readFileSync(path.join(root, ".cursor", "agents", "test-reporter.md"), "utf8");
  assert.match(prompt, /name: test-reporter/);
  assert.match(prompt, /unit test coverage/);
  const matcher = hooks.hooks.afterShellExecution[0].matcher;
  assert.match("npm test", new RegExp(matcher));
  assert.match("npm run test:pact", new RegExp(matcher));
});
