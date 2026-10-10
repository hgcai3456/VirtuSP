"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
const cloud = require("../lib/cloud");
const bias = require("../lib/bias");
test("Ready faculty assignment, assigned-first student entry, open choices and role clearing through the DOM", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-role-ui-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`,
    client = cookieClient(base),
    errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(await fs.readFile("public/app.html", "utf8"), {
      url: base + "/app.html",
      runScripts: "outside-only",
      virtualConsole: vc,
    }),
    w = dom.window,
    d = w.document;
  const cloudOriginal = {
    enabled: cloud.enabled,
    bias: cloud.bias,
    json: cloud.json,
  };
  w.structuredClone = structuredClone;
  w.fetch = (url, opts) => client(new URL(url, base), opts);
  w.HTMLElement.prototype.scrollTo = () => {};
  const noop = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: noop,
    clearRect: noop,
    beginPath: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
  });
  w.HTMLMediaElement.prototype.play = async () => {};
  w.HTMLMediaElement.prototype.pause = noop;
  const wait = async (fn) => {
    for (let i = 0; i < 300; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(
      "UI did not settle: " + d.querySelector("#app")?.textContent,
    );
  };
  const click = (action, extra = "") => {
    const el = d.querySelector(`[data-action="${action}"]${extra}`);
    assert.ok(el, action);
    el.click();
  };
  const fill = (id, v) => {
    const el = d.getElementById(id);
    assert.ok(el, id);
    if (el.type === "checkbox") el.checked = v;
    else el.value = v;
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  try {
    w.eval(await fs.readFile("public/js/app.js", "utf8"));
    await wait(() => !!d.getElementById("demo-student"));
    assert.equal(d.querySelectorAll(".patient-card").length, 0);
    click("choose-role", '[data-role="faculty"]');
    await wait(() => d.querySelectorAll(".patient-card").length === 7);
    assert.ok(!d.querySelector("#app").textContent.includes("Published v"));
    assert.ok(!d.querySelector("#app").textContent.includes("Marcus Ramirez"));
    assert.ok(d.getElementById("studio-group"));
    assert.match(
      d.querySelector(".studio-group-panel").textContent,
      /Assign a patient group/,
    );
    assert.match(
      d.querySelector(".studio-group-panel").textContent,
      /Choose a student/,
    );
    d.querySelector('.studio-group-panel [data-tab="tests"]').click();
    await wait(() => !!d.getElementById("assign-student"));
    assert.ok(!d.querySelector('[data-action="assign-group"]').disabled);
    fill("new-student-alias", "Student C");
    click("add-student");
    await wait(() => d.getElementById("assign-student")?.options.length === 3);
    assert.ok(!d.querySelector(".toast").textContent.includes("Cannot read"));
    d.querySelector(".group-builder").open = true;
    fill("group-title", "Available practice");
    fill("group-available", true);
    const boxes = [...d.querySelectorAll('[name="group-patient"]')];
    boxes.slice(0, 2).forEach((box) => {
      box.checked = true;
    });
    click("create-group");
    await wait(
      () => d.querySelector(".toast")?.textContent === "Patient group created.",
    );
    assert.match(d.querySelector("#app").textContent, /Available practice/);
    assert.equal(d.querySelectorAll(".group-details[open]").length, 0);
    assert.ok(
      !d.querySelector("#app").textContent.includes("Make available to all"),
    );
    assert.ok(
      !d.querySelector("#app").textContent.includes("Use assignments only"),
    );
    assert.ok(
      !d.querySelector("#app").textContent.includes("Review & publish"),
    );
    assert.match(d.querySelector("#app").textContent, /Ready to assign/);
    click("assign-group");
    await wait(
      () => d.querySelector(".toast")?.textContent === "Group assigned.",
    );
    click("switch-role");
    await wait(() => !!d.getElementById("demo-student"));
    assert.ok(
      !d
        .querySelector("#app")
        .textContent.includes("Prepared comparison groups"),
    );
    click("choose-role", '[data-role="student"]');
    await wait(() => !!d.querySelector(".student-assignments"));
    assert.match(
      d.querySelector("#app").textContent,
      /My assigned assessments/,
    );
    assert.equal(d.querySelectorAll(".simulation-choice").length, 0);
    assert.ok(d.querySelector('[data-action="start-test"]'));
    assert.equal(d.querySelector('#nav [data-action="nav"]'), null);
    assert.equal(d.querySelector('[data-action="new"]'), null);
    assert.equal(d.querySelector('[data-tab="results"]'), null);
    click("nav", '[data-tab="open-assessments"]');
    await wait(() => d.querySelectorAll(".simulation-choice").length === 2);
    click("nav", '[data-tab="studio"]');
    assert.equal(d.querySelectorAll(".patient-card").length, 7);
    assert.equal(d.querySelector('[data-action="pick"]'), null);
    click("nav", '[data-tab="student-home"]');
    await wait(() => !!d.querySelector(".student-assignments"));
    assert.equal(d.querySelectorAll(".patient-card").length, 0);
    assert.equal(d.querySelector('[data-action="add-student"]'), null);
    assert.equal(d.querySelector('[data-action="create-group"]'), null);
    click("start-test");
    await wait(() => !!d.getElementById("question"));
    click("complete");
    await wait(() =>
      d.querySelector("#app").textContent.includes("Trial saved"),
    );
    assert.equal(d.querySelector(".score-num"), null);
    assert.match(
      d.querySelector('[data-action="next-test"]').textContent,
      /Continue to next patient/,
    );
    click("next-test");
    await wait(() => !!d.getElementById("question"));
    click("nav", '[data-tab="student-home"]');
    await wait(() =>
      d.querySelector("#app").textContent.includes("1/2 trials complete"),
    );
    click("start-test");
    await wait(() => !!d.getElementById("question"));
    click("complete");
    await wait(() => !!d.querySelector(".rep-tabs"));
    assert.equal(d.querySelector(".bias-panel"), null);
    click("nav", '[data-tab="tests"]');
    await wait(() => !!d.querySelector('[data-action="start-available"]'));
    assert.ok(d.querySelector('[data-action="start-available"]'));
    click("start-available");
    await wait(() => !!d.getElementById("question"));
    assert.match(d.querySelector("#app").textContent, /Trial 1 of 2/);
    assert.equal(
      d.querySelector('[src="/video/omar.mp4"]'),
      null,
      "Comparison names must not select different packaged clips",
    );
    click("nav", '[data-tab="student-home"]');
    await wait(() => !!d.querySelector(".student-assignments"));
    assert.ok(
      !d.querySelector("#app").textContent.includes("Available practice"),
      "Self-selected open attempts aren't faculty assignments",
    );
    click("switch-role");
    await wait(() => !!d.getElementById("demo-student"));
    const choices = d.getElementById("demo-student").options;
    fill("demo-student", choices[1].value);
    click("choose-role", '[data-role="student"]');
    await wait(() => !!d.querySelector(".student-assignments"));
    assert.match(
      d.querySelector("#app").textContent,
      /No assessments assigned yet/,
    );
    click("nav", '[data-tab="open-assessments"]');
    await wait(() => d.querySelectorAll(".simulation-choice").length === 2);
    click("nav", '[data-tab="tests"]');
    await wait(() => !!d.querySelector('[data-action="start-available"]'));
    click("nav", '[data-tab="history"]');
    await wait(() =>
      d.querySelector("#app").textContent.includes("No encounters yet"),
    );
    assert.equal(d.querySelector(".bias-panel"), null);
    click("switch-role");
    await wait(() => !!d.getElementById("demo-student"));
    click("choose-role", '[data-role="faculty"]');
    await wait(() => !!d.querySelector('[data-tab="results"]'));
    click("nav", '[data-tab="results"]');
    await wait(() => !!d.querySelector(".student-results"));
    assert.match(d.querySelector("#app").textContent, /Student A/);
    assert.match(d.querySelector("#app").textContent, /Awaiting analysis/);
    assert.match(d.querySelector("#app").textContent, /2\/2 trials/);
    assert.match(
      d.querySelector("#app").textContent,
      /Unassigned demo encounters/,
    );
    const record = Object.values(app.store.state.encounters)[0];
    assert.ok(
      d.querySelector('[data-action="analyze-bias"][data-type="attempt"]'),
    );
    click("analyze-bias", '[data-type="attempt"]');
    await wait(() =>
      d.querySelector("#app").textContent.includes("Analysis unavailable"),
    );
    assert.equal(
      d.querySelector(".bias-rubric"),
      null,
      "Disabled AI cannot fabricate ratings",
    );
    cloud.enabled = () => true;
    cloud.bias = async (input) => ({
      evaluations: input.encounters.flatMap((e) =>
        bias.rubric.categories.map((c) => ({
          encounterId: e.id,
          categoryId: c.id,
          score: null,
          reason: "No student questions were recorded to assess this category.",
          evidence: [],
          coaching: "",
        })),
      ),
      comparisons: [],
      limitations: ["Synthetic DOM fixture, not clinical validation."],
    });
    cloud.json = async () => ({ supported: true });
    click("analyze-bias", '[data-type="attempt"]');
    await wait(() => d.querySelectorAll(".bias-rubric tbody tr").length === 10);
    assert.match(d.querySelector(".bias-rubric").textContent, /Not observable/);
    assert.ok(d.querySelector('a[href="/api/bias/rubric/file"]'));
    Object.assign(cloud, cloudOriginal);
    const submitted = await client(`/api/bias/encounter/${record.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "complete",
        detectorVersion: "DOM-test-adapter",
        findings: [
          {
            text: "Test-only faculty indicator",
            evidence: [
              { encounterId: record.id, eventId: record.events[0].id },
            ],
          },
        ],
        limitations: ["Synthetic test payload only."],
      }),
    });
    assert.equal(submitted.status, 200);
    click("nav", '[data-tab="results"]');
    await wait(() => !!d.querySelector('[data-action="bias-evidence"]'));
    click("bias-evidence");
    await wait(() => !!d.querySelector(".cited-event"));
    assert.ok(
      d.querySelector(".cited-event").textContent.includes(record.events[0].id),
    );
    assert.ok(
      d
        .querySelector(".cited-event")
        .textContent.includes(record.transcript[0].text),
    );
    click("switch-role");
    await wait(() => !!d.getElementById("demo-student"));
    fill("demo-student", d.getElementById("demo-student").options[0].value);
    click("choose-role", '[data-role="student"]');
    await wait(() => !!d.querySelector(".student-assignments"));
    await wait(() => !!d.querySelector('[data-action="start-test"]'));
    assert.ok(
      !d
        .querySelector("#app")
        .textContent.includes("Test-only faculty indicator"),
    );
    assert.equal(d.querySelector(".cited-event"), null);
    assert.deepEqual(errors, []);
  } finally {
    Object.assign(cloud, cloudOriginal);
    w.close();
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
