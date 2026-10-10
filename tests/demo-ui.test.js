"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
test("Faculty review/assignment, student trials, delayed feedback and role clearing through the DOM", async () => {
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
  w.structuredClone = structuredClone;
  w.fetch = (url, opts) => client(new URL(url, base), opts);
  w.HTMLElement.prototype.scrollTo = () => {};
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
    await wait(() => d.querySelectorAll(".patient-card").length === 10);
    assert.ok(d.getElementById("studio-group"));
    assert.match(
      d.querySelector(".studio-group-panel").textContent,
      /Assign a patient group/,
    );
    assert.match(
      d.querySelector(".studio-group-panel").textContent,
      /publish both prepared cases/,
    );
    d.querySelector('.studio-group-panel [data-tab="tests"]').click();
    await wait(() => !!d.getElementById("assign-student"));
    assert.match(
      d.querySelector("#app").textContent,
      /Faculty review required/,
    );
    for (const id of ["comparison-omar", "comparison-alex"]) {
      click("pick", `[data-id="${id}"]`);
      await wait(() => !!d.getElementById("patient-dialog"));
      assert.equal(
        d.querySelectorAll(".patient-dialog input[type=checkbox]").length,
        1,
      );
      assert.equal(d.querySelectorAll(".clinical-row details").length, 0);
      assert.equal(d.querySelectorAll(".editor-group[open]").length, 0);
      assert.equal(d.getElementById("field-facts-0-id"), null);
      assert.equal(d.getElementById("field-facts-0-kw"), null);
      assert.match(
        d.querySelector(".editor").textContent,
        /Patient information and character/,
      );
      fill("field-reviewAcknowledged", true);
      click("submit-patient");
      await wait(
        () =>
          !d.getElementById("patient-dialog") &&
          !!d.getElementById("assign-student"),
      );
    }
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
    await wait(() => !!d.querySelector('[data-action="start-test"]'));
    assert.equal(d.querySelector('[data-action="new"]'), null);
    assert.equal(d.querySelector('[data-tab="results"]'), null);
    assert.equal(d.querySelectorAll(".patient-card").length, 2);
    click("start-test");
    await wait(() => !!d.getElementById("question"));
    click("complete");
    await wait(() =>
      d.querySelector("#app").textContent.includes("Trial saved"),
    );
    assert.equal(d.querySelector(".score-num"), null);
    click("nav", '[data-tab="tests"]');
    await wait(() =>
      d.querySelector("#app").textContent.includes("1/2 trials complete"),
    );
    click("start-test");
    await wait(() => !!d.getElementById("question"));
    click("complete");
    await wait(() => !!d.querySelector(".rep-tabs"));
    assert.equal(d.querySelector(".bias-panel"), null);
    click("switch-role");
    await wait(() => !!d.getElementById("demo-student"));
    const choices = d.getElementById("demo-student").options;
    fill("demo-student", choices[1].value);
    click("choose-role", '[data-role="student"]');
    await wait(() =>
      d.querySelector("#app").textContent.includes("No tests assigned"),
    );
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
    await wait(() => !!d.querySelector('[data-action="start-test"]'));
    assert.ok(
      !d
        .querySelector("#app")
        .textContent.includes("Test-only faculty indicator"),
    );
    assert.equal(d.querySelector(".cited-event"), null);
    assert.deepEqual(errors, []);
  } finally {
    w.close();
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
