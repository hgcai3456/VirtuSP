"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const agent = require("../agents/unit-test-agent");

const root = path.resolve(__dirname, "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-unit-agent-"));
}

function stateFile(dir) {
  return path.join(dir, "pending.json");
}

function writeModule(dir, coveredOnly) {
  const body = coveredOnly
    ? 'function answer(x) {\n  if (x > 0) return "yes";\n  return "yes";\n}\nmodule.exports = { answer };\n'
    : 'function answer(x) {\n  if (x > 0) return "yes";\n  return "no";\n}\nmodule.exports = { answer };\n';
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "lib", "mod.js"), body);
  const testBody = coveredOnly
    ? 'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { answer } = require("../lib/mod.js");\ntest("both results", () => {\n  assert.equal(answer(1), "yes");\n  assert.equal(answer(0), "yes");\n});\n'
    : 'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { answer } = require("../lib/mod.js");\ntest("yes only", () => {\n  assert.equal(answer(1), "yes");\n});\n';
  fs.writeFileSync(path.join(dir, "tests", "mod.test.js"), testBody);
}

test("classifies source files and unit tests", () => {
  assert.equal(agent.isUnitSource("lib/engine.js"), true);
  assert.equal(agent.isUnitSource("agents/unit-test-agent.js"), true);
  assert.equal(agent.isUnitSource("scripts/preflight.js"), true);
  assert.equal(agent.isUnitSource("public/js/app.js"), true);
  assert.equal(agent.isUnitSource("server.js"), true);
  assert.equal(agent.isUnitSource("tests/health.test.js"), false);
  assert.equal(agent.isUnitSource("test/api.test.js"), false);
  assert.equal(agent.isUnitSource("node_modules/pg/index.js"), false);
  assert.equal(agent.isUnitSource("docs/HANDOFF.md"), false);
  assert.equal(agent.isUnitSource("perf/ci.js"), false);
  assert.equal(agent.isUnitSource("test/helper.js"), false);
  assert.equal(agent.isUnitSource(""), false);
  assert.equal(agent.isUnitSource("lib/notes.test.js"), false);
  assert.equal(agent.isUnitTest("tests/health.test.js"), true);
  assert.equal(agent.isUnitTest("lib/engine.js"), false);
  assert.equal(agent.isDirectRun(module, module), true);
  assert.equal(agent.isDirectRun({}, module), false);
});

test("normalizes workspace roots and relative paths", () => {
  const slash = agent.normalizeRoot("/c:/Users/Jasna/VirtuSP");
  assert.equal(slash.toLowerCase(), path.resolve("c:/Users/Jasna/VirtuSP").toLowerCase());
  assert.equal(agent.normalizeRoot("").toLowerCase(), path.resolve(process.cwd()).toLowerCase());
  const previous = process.env.CURSOR_PROJECT_DIR;
  process.env.CURSOR_PROJECT_DIR = root;
  try {
    assert.equal(agent.resolveRoot({}), root);
  } finally {
    if (previous === undefined) delete process.env.CURSOR_PROJECT_DIR;
    else process.env.CURSOR_PROJECT_DIR = previous;
  }
  delete process.env.CURSOR_PROJECT_DIR;
  assert.equal(agent.resolveRoot({ workspace_roots: [root] }), root);
  assert.equal(agent.resolveRoot({ workspace_roots: [] }), path.resolve(process.cwd()));
  assert.equal(agent.resolveRoot({}), path.resolve(process.cwd()));
  assert.equal(agent.toRelative(path.join(root, "lib", "engine.js"), root), "lib/engine.js");
  assert.equal(agent.toRelative("lib/engine.js", root), "lib/engine.js");
  assert.equal(agent.toRelative(`/c:/${root.slice(3).replace(/\\/g, "/")}/server.js`, root), "server.js");
  assert.equal(agent.toRelative("", root), null);
  assert.equal(agent.toRelative(root, root), null);
  assert.equal(agent.toRelative("/tmp/outside.js", root), null);
  assert.equal(agent.toRelative("C:\\definitely\\outside.js", root), null);
});

test("stores snippets, locates them, and skips comments", () => {
  const spec = { snippets: [], unresolved: false };
  agent.addSnippet(spec, "");
  agent.addSnippet(spec, "   \n");
  agent.addSnippet(spec, "const value = 1;\r\n");
  agent.addSnippet(spec, "const value = 1;\n");
  assert.equal(spec.snippets.length, 1);
  agent.addSnippet(spec, `${"x".repeat(100001)}\n`);
  assert.equal(spec.snippets[1].length, 100000);
  for (let i = 0; i < 40; i += 1) agent.addSnippet(spec, `const extra${i} = ${i};\n`);
  assert.equal(spec.snippets.length, 40);
  assert.equal(spec.snippets.includes("const value = 1;\n"), false);

  const source = "function answer(x) {\n  if (x > 0) return \"yes\";\n  return \"no\";\n}\n";
  assert.deepEqual(agent.locateSnippet(source, "  return \"no\";"), [3]);
  assert.deepEqual(agent.findOccurrences(source, "   "), []);
  const repeated = Array.from({ length: 9 }, () => "const same = 1;").join("\n");
  assert.deepEqual(agent.findOccurrences(repeated, "const same = 1;"), []);
  const drifted = "  const veryDistinctiveLine = true;\n";
  assert.deepEqual(agent.locateSnippet(`head\n${drifted}tail\n`, `prefix\n${drifted}`), [2]);
  const twice = "  const anotherDistinctiveLine = true;\n";
  assert.deepEqual(agent.locateSnippet(`${twice}${twice}`, `missing wrapper\n${twice}`), []);
  assert.equal(agent.isSkippableLine("  // note\n"), true);
  assert.equal(agent.isSkippableLine(" /* block */"), true);
  assert.equal(agent.isSkippableLine(" * continued"), true);
  assert.equal(agent.isSkippableLine(" */"), true);
  assert.equal(agent.isSkippableLine("   "), true);
  assert.equal(agent.isSkippableLine("const value = 1;"), false);
  assert.equal(agent.formatLineList([2, 1, 1, 3, 5]), "1-3, 5");
  assert.equal(agent.formatLineList([1, 3, 4]), "1, 3-4");
  assert.equal(agent.formatLineList([4]), "4");
});

test("reads coverage records and compares paths", () => {
  const dir = tempDir();
  try {
    assert.deepEqual(agent.readCoverage(path.join(dir, "missing")), []);
    fs.writeFileSync(path.join(dir, "notes.txt"), "skip");
    fs.writeFileSync(path.join(dir, "coverage-x.txt"), "skip");
    fs.writeFileSync(path.join(dir, "coverage-empty.json"), "{}");
    fs.writeFileSync(path.join(dir, "coverage-bad.json"), "{");
    fs.writeFileSync(
      path.join(dir, "coverage-ok.json"),
      JSON.stringify({
        result: [
          { url: "http://example.test/mod.js", functions: [] },
          { url: "file:///%", functions: [] },
          {
            url: "file:///C:/proj/mod.js",
            functions: [{ ranges: [{ startOffset: 0, endOffset: 4, count: 1 }] }],
          },
          { url: "file:///tmp/other.js", functions: [{}] },
          { url: "file:///tmp/nofn.js" },
        ],
      }),
    );
    const records = agent.readCoverage(dir);
    assert.equal(records.length, 3);
    assert.equal(records.some((record) => record.ranges[0] && record.ranges[0].count === 1), true);
    assert.equal(agent.fileUrlToPath("file:///C:/proj/mod.js").toLowerCase(), path.normalize("C:/proj/mod.js").toLowerCase());
    assert.equal(agent.fileUrlToPath("https://example.test"), null);
    assert.equal(agent.fileUrlToPath(""), null);
    assert.equal(agent.sameFile(path.join(dir, "A.js"), path.join(dir, "a.js")), true);
    assert.equal(agent.sameFile(path.join(dir, "A.js"), path.join(dir, "b.js")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reports uncovered changed lines and ignores comments", () => {
  const dir = tempDir();
  const file = path.join(dir, "mod.js");
  const source = "function answer(x) {\n  // note\n  return \"no\";\n}\n";
  fs.writeFileSync(file, source);
  const buf = fs.readFileSync(file);
  assert.equal(agent.lineUncovered(buf, 0, buf.length, []), true);
  assert.equal(
    agent.lineUncovered(buf, 0, buf.length, [{ startOffset: 0, endOffset: buf.length, count: 1 }]),
    false,
  );
  assert.equal(
    agent.lineUncovered(buf, 0, buf.length, [{ startOffset: 0, endOffset: buf.length, count: 0 }]),
    true,
  );
  assert.equal(
    agent.lineUncovered(buf, 0, 4, [
      { startOffset: 0, endOffset: 0, count: 1 },
      { startOffset: 50, endOffset: 80, count: 1 },
    ]),
    true,
  );
  const newline = buf.length - 1;
  assert.equal(
    agent.lineUncovered(buf, 0, buf.length, [{ startOffset: newline, endOffset: buf.length, count: 1 }]),
    true,
  );
  const uncovered = agent.gapsForFile(
    file,
    { snippets: ["return \"no\";"], unresolved: false },
    [],
  );
  assert.deepEqual(uncovered.lines, [3]);
  const comments = agent.gapsForFile(file, { snippets: ["  // note"], unresolved: false }, []);
  assert.deepEqual(comments.lines, []);
  const missing = agent.gapsForFile(path.join(dir, "gone.js"), { snippets: ["return"], unresolved: false }, []);
  assert.equal(missing.missing, true);
  const unmapped = agent.gapsForFile(file, { snippets: [], unresolved: true }, []);
  assert.equal(unmapped.unmapped, true);
  const untouched = agent.gapsForFile(file, { unresolved: false }, []);
  assert.equal(untouched.unmapped, false);
  const lost = agent.gapsForFile(file, { snippets: ["this line is not in the file at all"], unresolved: false }, []);
  assert.equal(lost.unmapped, true);
  fs.writeFileSync(path.join(dir, "public-file.js"), "export const label = \"synthetic\";\n");
  const gaps = agent.collectGaps(
    dir,
    {
      files: {
        "zz-missing.js": { snippets: ["x"], unresolved: false },
        "public/js/app.js": { snippets: ["missing snippet that is long enough"], unresolved: false },
        "mod.js": { snippets: ["  return \"no\";"], unresolved: false },
      },
    },
    [],
  );
  assert.equal(gaps[0].file, "mod.js");
  assert.equal(gaps[0].note, "");
  assert.equal(gaps[1].note, "file is missing");
  assert.equal(gaps[2].note, "file is missing");
  fs.mkdirSync(path.join(dir, "public", "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "public", "js", "app.js"), "const label = \"synthetic\";\n");
  const mapped = agent.collectGaps(
    dir,
    { files: { "public/js/app.js": { snippets: ["const label = \"synthetic\";"], unresolved: false } } },
    [],
  );
  assert.match(mapped[0].note, /sourceURL/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("redacts secrets from hook output", () => {
  const clean = agent.redact("cursor_secretvalue AKIA1234567890ABCDEF api_key=abc password: hunter token=xyz");
  assert.equal(clean.includes("cursor_secretvalue"), false);
  assert.equal(clean.includes("AKIA1234567890ABCDEF"), false);
  assert.match(clean, /api_key=\[redacted\]/);
  assert.equal(agent.redact(""), "");
});

test("records edits and ignores files outside the unit-test gate", () => {
  const dir = tempDir();
  const pending = stateFile(dir);
  const deps = { root, stateFile: pending };
  try {
    assert.deepEqual(
      agent.handleEdit({ file_path: path.join(root, "README.md"), edits: [{ new_string: "x" }] }, deps),
      {},
    );
    assert.equal(fs.existsSync(pending), false);
    agent.handleEdit(
      {
        file_path: path.join(root, "lib", "engine.js"),
        edits: [{ old_string: "a", new_string: "const marker = \"synthetic\";\n" }],
      },
      deps,
    );
    agent.handleEdit(
      {
        file_path: "tests/health.test.js",
        edits: [{ new_string: "test(\"synthetic\", () => {});\n" }],
      },
      deps,
    );
    agent.handleEdit({ file_path: path.join(root, "server.js"), edits: [] }, deps);
    agent.handleEdit({ file_path: path.join(root, "lib", "store.js"), edits: "nope" }, deps);
    agent.handleEdit({ file_path: path.join(root, "lib", "db.js"), edits: [null] }, deps);
    agent.handleEdit(
      { file_path: path.join(root, "lib", "http.js"), edits: [{ new_string: "   " }] },
      deps,
    );
    const state = agent.loadState(pending);
    assert.equal(state.pending, true);
    assert.equal(state.testsChanged, true);
    assert.match(state.files["lib/engine.js"].snippets[0], /synthetic/);
    assert.equal(state.files["server.js"].unresolved, true);
    assert.deepEqual(agent.loadState(path.join(dir, "missing.json")), agent.emptyState());
    fs.writeFileSync(pending, "{");
    assert.deepEqual(agent.loadState(pending).files, {});
    fs.writeFileSync(
      pending,
      JSON.stringify({
        pending: true,
        testsChanged: 1,
        failureSignature: "abc",
        sameFailureCount: 2,
        reported: 1,
        files: "nope",
      }),
    );
    const numeric = agent.loadState(pending);
    assert.deepEqual(numeric.files, {});
    assert.equal(numeric.sameFailureCount, 2);
    assert.equal(numeric.failureSignature, "abc");
    fs.writeFileSync(
      pending,
      JSON.stringify({
        pending: true,
        testsChanged: 1,
        failureSignature: "",
        sameFailureCount: 0,
        reported: 1,
        files: { "lib/engine.js": { snippets: ["ok", 4], unresolved: 1 }, "lib/empty.js": null },
      }),
    );
    const loaded = agent.loadState(pending);
    assert.equal(loaded.testsChanged, true);
    assert.equal(loaded.failureSignature, null);
    assert.equal(loaded.sameFailureCount, 0);
    assert.deepEqual(loaded.files["lib/engine.js"].snippets, ["ok"]);
    assert.deepEqual(loaded.files["lib/empty.js"].snippets, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("edits are stored in the workspace hook state file", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "engine.js"), "const marker = \"synthetic\";\n");
  agent.handleEdit(
    {
      file_path: path.join(dir, "lib", "engine.js"),
      edits: [{ new_string: "const marker = \"synthetic\";\n" }],
    },
    { root: dir },
  );
  const pending = path.join(dir, ".cursor", "hooks", "state", "pending.json");
  assert.equal(fs.existsSync(pending), true);
  const done = agent.handleStop(
    { status: "completed" },
    {
      root: dir,
      run() {
        return {
          code: 0,
          output: "ok",
          records: [
            {
              path: path.join(dir, "lib", "engine.js"),
              ranges: [{ startOffset: 0, endOffset: 200, count: 1 }],
            },
          ],
        };
      },
    },
  );
  assert.deepEqual(done, {});
  assert.equal(fs.existsSync(pending), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a passing covered change clears the gate", () => {
  const dir = tempDir();
  const project = path.join(dir, "proj");
  fs.mkdirSync(project);
  writeModule(project, true);
  const pending = stateFile(dir);
  const deps = { root: project, stateFile: pending };
  agent.handleEdit(
    { file_path: path.join(project, "lib", "mod.js"), edits: [{ new_string: "return \"yes\";" }] },
    deps,
  );
  const result = agent.handleStop({ status: "completed", hook_event_name: "stop" }, deps);
  assert.deepEqual(result, {});
  assert.equal(fs.existsSync(pending), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an uncovered branch asks for another attempt and then stops repeating itself", () => {
  const dir = tempDir();
  const project = path.join(dir, "proj");
  fs.mkdirSync(project);
  writeModule(project, false);
  const pending = stateFile(dir);
  const deps = {
    root: project,
    stateFile: pending,
    testArgs: ["--test", "--test-timeout=10000", "tests/mod.test.js"],
    timeoutMs: 20000,
  };
  agent.handleEdit(
    { file_path: path.join(project, "lib", "mod.js"), edits: [{ new_string: "return \"no\";" }] },
    deps,
  );
  const first = agent.handleStop({ status: "completed" }, deps);
  assert.match(first.followup_message, /attempt 1 of 3/);
  assert.match(first.followup_message, /lib\/mod\.js: 3/);
  assert.match(first.followup_message, /not covered yet/);
  const second = agent.handleStop({ status: "completed" }, deps);
  assert.match(second.followup_message, /attempt 2 of 3/);
  const third = agent.handleStop({ status: "completed" }, deps);
  assert.match(third.followup_message, /come back 3 times/);
  const fourth = agent.handleStop({ status: "completed" }, deps);
  assert.deepEqual(fourth, {});
  agent.handleEdit(
    { file_path: path.join(project, "lib", "mod.js"), edits: [{ new_string: "return \"no\";" }] },
    deps,
  );
  const afterEdit = agent.handleStop({ status: "completed" }, deps);
  assert.deepEqual(afterEdit, {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a new failure starts the attempt count over", () => {
  const dir = tempDir();
  const pending = stateFile(dir);
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "engine.js"), "const marker = \"synthetic\";\n");
  let output = "✖ first failure\n";
  const deps = {
    root: dir,
    stateFile: pending,
    run() {
      return { code: 1, output };
    },
  };
  agent.handleEdit(
    {
      file_path: path.join(dir, "lib", "engine.js"),
      edits: [{ new_string: "const marker = \"synthetic\";\n" }],
    },
    deps,
  );
  const first = agent.handleStop({ status: "completed" }, deps);
  assert.match(first.followup_message, /attempt 1 of 3/);
  output = `${"x".repeat(3500)}\n✖ second failure\n`;
  const second = agent.handleStop({ status: "completed" }, deps);
  assert.match(second.followup_message, /attempt 1 of 3/);
  assert.ok(second.followup_message.length < 8000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a failing unit test is sent back until the same failure is reported", () => {
  const dir = tempDir();
  const project = path.join(dir, "proj");
  fs.mkdirSync(path.join(project, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(project, "tests", "mod.test.js"),
    "const test = require(\"node:test\");\nconst assert = require(\"node:assert/strict\");\ntest(\"fails\", () => {\n  assert.equal(1, 2);\n});\n",
  );
  const pending = stateFile(dir);
  const deps = {
    root: project,
    stateFile: pending,
    testArgs: ["--test", "--test-timeout=10000", "tests/mod.test.js"],
    timeoutMs: 20000,
  };
  agent.handleEdit(
    { file_path: path.join(project, "tests", "mod.test.js"), edits: [{ new_string: "assert.equal(1, 2);" }] },
    deps,
  );
  const first = agent.handleStop({ status: "completed" }, deps);
  assert.match(first.followup_message, /exit code: 1/);
  assert.match(first.followup_message, /Update the code under test/);
  assert.equal(first.followup_message.includes("not covered yet"), false);
  assert.match(first.followup_message, /Unit tests changed/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a timed-out run counts as a failed gate", () => {
  const dir = tempDir();
  const project = path.join(dir, "proj");
  fs.mkdirSync(path.join(project, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(project, "tests", "mod.test.js"),
    "const test = require(\"node:test\");\ntest(\"hangs\", () => new Promise(() => { setInterval(() => {}, 1000); }));\n",
  );
  const outcome = agent.runUnitTests(project, {
    // Run the test directly so the process timeout kills the only child process.
    testArgs: ["tests/mod.test.js"],
    timeoutMs: 800,
  });
  assert.equal(outcome.code, 1);
  assert.match(outcome.output, /ETIMEDOUT|timeout/i);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      break;
    } catch (err) {
      if (attempt === 4) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
});

test("skip, abort, idle, and thrown runners do not follow up", () => {
  const dir = tempDir();
  const pending = stateFile(dir);
  const previous = process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT;
  process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT = "1";
  try {
    agent.handleEdit(
      { file_path: path.join(root, "lib", "engine.js"), edits: [{ new_string: "const x = 1;\n" }] },
      { root, stateFile: pending },
    );
    assert.equal(fs.existsSync(pending), false);
    assert.deepEqual(agent.handleStop({ status: "completed" }, { root, stateFile: pending }), {});
  } finally {
    if (previous === undefined) delete process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT;
    else process.env.VIRTUSP_SKIP_UNIT_TEST_AGENT = previous;
  }
  fs.writeFileSync(pending, JSON.stringify({ ...agent.emptyState(), pending: true, testsChanged: true }));
  assert.deepEqual(agent.handleStop({ status: "aborted" }), {});
  assert.deepEqual(agent.handleEdit({ file_path: "" }), {});
  assert.deepEqual(agent.handleStop({ status: "aborted" }, { root, stateFile: pending }), {});
  fs.writeFileSync(pending, JSON.stringify({ ...agent.emptyState(), pending: true }));
  assert.deepEqual(agent.handleStop({ status: "completed" }, { root, stateFile: pending }), {});
  assert.equal(fs.existsSync(pending), false);
  fs.writeFileSync(
    pending,
    JSON.stringify({ ...agent.emptyState(), pending: true, testsChanged: true }),
  );
  const warned = [];
  assert.deepEqual(
    agent.handleStop(
      { status: "completed" },
      {
        root,
        stateFile: pending,
        warn(err) {
          warned.push(err);
        },
        run() {
          throw new Error("runner failed");
        },
      },
    ),
    {},
  );
  assert.match(warned[0].message, /runner failed/);
  const stderr = [];
  const writeStderr = process.stderr.write;
  process.stderr.write = (chunk, encoding, callback) => {
    stderr.push(String(chunk));
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  };
  try {
    fs.writeFileSync(
      pending,
      JSON.stringify({ ...agent.emptyState(), pending: true, testsChanged: true }),
    );
    assert.deepEqual(
      agent.handleStop(
        { status: "completed" },
        {
          root,
          stateFile: pending,
          run() {
            throw new Error("runner string");
          },
        },
      ),
      {},
    );
    fs.writeFileSync(
      pending,
      JSON.stringify({ ...agent.emptyState(), pending: true, testsChanged: true }),
    );
    assert.deepEqual(
      agent.handleStop(
        { status: "completed" },
        {
          root,
          stateFile: pending,
          run() {
            throw "runner string";
          },
        },
      ),
      {},
    );
  } finally {
    process.stderr.write = writeStderr;
  }
  assert.ok(stderr.some((line) => line.includes("runner string")));
  const savedRoot = process.env.CURSOR_PROJECT_DIR;
  delete process.env.CURSOR_PROJECT_DIR;
  try {
    fs.writeFileSync(
      pending,
      JSON.stringify({ ...agent.emptyState(), pending: true, testsChanged: true }),
    );
    const emptyOutput = agent.handleStop(
      { status: "completed", workspace_roots: [dir] },
      {
        stateFile: pending,
        run() {
          return { code: 1, output: "", records: [] };
        },
      },
    );
    assert.match(emptyOutput.followup_message, /exit code: 1/);
    assert.equal(emptyOutput.followup_message.includes("Output:"), false);
  } finally {
    if (savedRoot === undefined) delete process.env.CURSOR_PROJECT_DIR;
    else process.env.CURSOR_PROJECT_DIR = savedRoot;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the hook command speaks JSON on stdin", () => {
  const messages = [];
  const previousRead = fs.readFileSync;
  const previousWrite = fs.writeSync;
  fs.readFileSync = (fd, encoding) => {
    if (fd === 0) return "{\"hook_event_name\":\"stop\",\"status\":\"aborted\"}";
    return previousRead(fd, encoding);
  };
  fs.writeSync = (fd, data) => {
    messages.push(String(data));
    return String(data).length;
  };
  try {
    agent.main();
    agent.entry(false);
    agent.entry(true, {
      readStdin: () => "",
      writeStdout(payload) {
        messages.push(JSON.stringify(payload));
      },
    });
    agent.entry(true, {
      readStdin: () => "   ",
      writeStdout(payload) {
        messages.push(JSON.stringify(payload));
      },
    });
    agent.main({
      readStdin: () => "{",
      writeStdout(payload) {
        messages.push(JSON.stringify(payload));
      },
    });
    agent.main({
      readStdin: () => JSON.stringify({ hook_event_name: "other" }),
      writeStdout(payload) {
        messages.push(JSON.stringify(payload));
      },
    });
    agent.main(null);
  } finally {
    fs.readFileSync = previousRead;
    fs.writeSync = previousWrite;
  }
  assert.ok(messages.some((line) => line.includes("\"status\":\"aborted\"") || line.includes("{}")));
});

test("main dispatches edit and stop events", () => {
  const dir = tempDir();
  const pending = stateFile(dir);
  const seen = [];
  agent.main({
    root,
    stateFile: pending,
    readStdin: () =>
      JSON.stringify({
        hook_event_name: "afterFileEdit",
        file_path: path.join(root, "lib", "engine.js"),
        edits: [{ new_string: "const fromMain = 1;\n" }],
      }),
    writeStdout(payload) {
      seen.push(payload);
    },
    run() {
      return { code: 1, output: "✖ failing tests\nAssertionError: synthetic\n", records: [] };
    },
  });
  agent.main({
    root,
    stateFile: pending,
    readStdin: () => JSON.stringify({ hook_event_name: "stop", status: "completed" }),
    writeStdout(payload) {
      seen.push(payload);
    },
    run() {
      return { code: 1, output: "✖ failing tests\nAssertionError: synthetic\n", records: [] };
    },
  });
  assert.deepEqual(seen[0], {});
  assert.match(seen[1].followup_message, /attempt 1 of 3/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the project hook runs this gate for every code change", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /node --test --experimental-test-coverage /);
  assert.match(pkg.scripts.test, /tests\/\*\.test\.js/);
  assert.deepEqual(agent.TEST_ARGS, ["--test", "--test-timeout=120000", "tests/*.test.js"]);
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".cursor", "hooks.json"), "utf8"));
  assert.equal(hooks.version, 1);
  assert.equal(hooks.hooks.afterFileEdit[0].command, "node agents/unit-test-agent.js");
  assert.equal(hooks.hooks.afterFileEdit[0].timeout, 15);
  assert.equal(hooks.hooks.stop[0].command, "node agents/unit-test-agent.js");
  assert.equal(hooks.hooks.stop[0].loop_limit, 12);
  assert.ok(hooks.hooks.stop[0].timeout >= 600);
  const prompt = fs.readFileSync(path.join(root, ".cursor", "agents", "unit-tester.md"), "utf8");
  assert.match(prompt, /name: unit-tester/);
  assert.match(prompt, /100% of the unit tests pass/);
  assert.match(prompt, /update the code under test so the existing assertion passes/);
});
