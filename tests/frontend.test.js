"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");
test("Studio edits, publication, interview, progressive chart and feedback work through the DOM", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-dom-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(await fs.readFile("public/app.html", "utf8"), {
    url: base + "/app.html",
    runScripts: "outside-only",
    virtualConsole: console,
  });
  const window = dom.window;
  window.fetch = (url, options) => fetch(new URL(url, base), options);
  window.HTMLElement.prototype.scrollTo = () => {};
  const doc = window.document;
  const wait = async (predicate) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      "DOM action did not settle: " + doc.querySelector(".toast")?.textContent,
    );
  };
  const click = (action, extra = "") => {
    const button = doc.querySelector(`[data-action="${action}"]${extra}`);
    assert.ok(button, action);
    button.click();
  };
  const fill = (id, value) => {
    const el = doc.getElementById(id);
    assert.ok(el, id);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  try {
    window.eval(await fs.readFile("public/js/app.js", "utf8"));
    await wait(() => doc.querySelectorAll(".patient-card").length === 10);
    assert.ok(
      doc.querySelector(".editor").textContent.includes("Omar Sinclair"),
    );
    click("prepare");
    await wait(
      () =>
        !!doc.getElementById("field-facts-0-say") &&
        doc.getElementById("field-facts-0-id").value === "concern",
    );
    const wording =
      "I want to discuss medication concerns. <b>Literal patient text</b>";
    fill("field-facts-0-say", wording);
    click("references");
    await wait(
      () => doc.querySelectorAll('[data-path$=".excerpt"]').length === 3,
    );
    click("review-all");
    fill("field-reviewAcknowledged", true);
    fill("field-facts-0-say", wording);
    assert.equal(doc.getElementById("field-facts-0-reviewed").checked, false);
    assert.equal(doc.getElementById("field-reviewAcknowledged").checked, false);
    click("review-all");
    fill("field-reviewAcknowledged", true);
    click("publish");
    await wait(() =>
      doc.querySelector(
        '[data-action="launch"][data-id="b5814549-fd2b-42a2-af78-9b681ad6f268"]',
      ),
    );
    click("launch", '[data-id="b5814549-fd2b-42a2-af78-9b681ad6f268"]');
    await wait(() => !!doc.getElementById("question"));
    assert.ok(!doc.querySelector("#app").textContent.includes("LDL 195"));
    fill("question", "What brings you in today?");
    doc
      .getElementById("question-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await wait(
      () => doc.querySelector(".bubble:last-child p")?.textContent === wording,
    );
    assert.equal(
      doc.querySelector(".bubble:last-child p b"),
      null,
      "Patient text must be escaped",
    );
    click("section", '[data-section="labs"]');
    await wait(() =>
      doc.querySelector(".ehr-panel").textContent.includes("LDL 195"),
    );
    click("review-section", '[data-section="labs"]');
    await wait(() => !doc.querySelector('[data-action="review-section"]'));
    click("complete");
    await wait(() => !!doc.querySelector(".rubric-grid"));
    assert.equal(doc.querySelectorAll(".rubric-grid .obj-card").length, 7);
    assert.ok(doc.querySelector(".warn").textContent.includes("provisional"));
    assert.ok(doc.querySelector(".score-num").textContent.includes("/28"));
    assert.deepEqual(errors, []);
  } finally {
    window.close();
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
