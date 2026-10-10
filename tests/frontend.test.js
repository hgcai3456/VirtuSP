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
  window.structuredClone = structuredClone;
  window.fetch = (url, options) => fetch(new URL(url, base), options);
  window.HTMLElement.prototype.scrollTo = () => {};
  const recognizers = [];
  window.SpeechRecognition = class {
    constructor() {
      recognizers.push(this);
    }
    start() {
      this.starts = (this.starts || 0) + 1;
      this.onstart?.();
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
    abort() {
      this.aborted = true;
      this.onend?.();
    }
  };
  const doc = window.document;
  const wait = async (predicate) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      "DOM action did not settle: " +
        (doc.querySelector(".form-notice")?.textContent ||
          doc.querySelector(".toast")?.textContent),
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
    assert.equal(doc.querySelector(".editor"), null);
    click("new");
    assert.ok(doc.getElementById("patient-dialog").hasAttribute("open"));
    assert.equal(
      doc.querySelectorAll('.patient-dialog input[type="checkbox"]').length,
      1,
    );
    assert.equal(
      (await (await fetch(base + "/api/profiles")).json()).profiles.length,
      10,
    );
    click("close-patient");
    assert.equal(doc.getElementById("patient-dialog"), null);
    click("new");
    click("submit-patient");
    await wait(() =>
      doc
        .getElementById("publication-error-message")
        ?.textContent.includes("name"),
    );
    assert.equal(
      doc.getElementById("publication-error").getAttribute("role"),
      "alertdialog",
    );
    click("dismiss-publication-error");
    assert.equal(
      (await (await fetch(base + "/api/profiles")).json()).profiles.length,
      10,
    );
    const pdf = require("./pdf-fixture")([
      "Synthetic faculty case",
      "Name: Test New Patient",
      "Age: 42",
      "Patient concern: I feel tired.",
    ]);
    const input = doc.getElementById("patient-upload");
    Object.defineProperty(input, "files", {
      value: ["Case.pdf"].map((name) => ({
        name,
        type: "application/pdf",
        arrayBuffer: async () => pdf,
      })),
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await wait(
      () =>
        doc.querySelectorAll(".uploaded-document").length === 1 &&
        !doc.querySelector('[data-action="parse-patient"]').disabled,
    );
    const drag = (type, files = []) => {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { files, dropEffect: "none" },
      });
      doc.getElementById("patient-drop-zone").dispatchEvent(event);
      return event;
    };
    drag("dragenter");
    assert.ok(
      doc.getElementById("patient-drop-zone").classList.contains("drag-active"),
    );
    const over = drag("dragover");
    assert.equal(over.defaultPrevented, true);
    assert.equal(over.dataTransfer.dropEffect, "copy");
    drag("dragleave");
    assert.ok(
      !doc
        .getElementById("patient-drop-zone")
        .classList.contains("drag-active"),
    );
    const dropped = drag(
      "drop",
      ["History.pdf", "Context.pdf"].map((name) => ({
        name,
        type: "application/pdf",
        arrayBuffer: async () => pdf,
      })),
    );
    assert.equal(dropped.defaultPrevented, true);
    // An overlapping drop must not queue duplicate uploads.
    drag("drop", [{ name: "Duplicate.pdf", arrayBuffer: async () => pdf }]);
    await wait(
      () =>
        doc.querySelectorAll(".uploaded-document").length === 3 &&
        !doc.querySelector('[data-action="parse-patient"]').disabled,
    );
    assert.equal(doc.querySelectorAll(".uploaded-document").length, 3);
    drag("drop", [{ name: "Unsupported.exe", arrayBuffer: async () => pdf }]);
    await wait(() =>
      doc.querySelector(".form-notice")?.textContent.includes("Choose PDF"),
    );
    assert.equal(doc.querySelectorAll(".uploaded-document").length, 3);
    click("file-purpose", '[data-index="2"][data-role="clinical"]');
    assert.equal(
      doc.querySelector('select[data-upload-index="2"]').closest("details")
        .open,
      false,
    );
    assert.equal(
      doc
        .querySelector('[data-index="2"][data-role="clinical"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    click("file-purpose", '[data-index="2"][data-role="case"]');
    const cloud = require("../lib/cloud"),
      oldDraft = cloud.draft;
    process.env.AI_ENABLED = "true";
    cloud.draft = async (description) => {
      assert.ok(description.includes("Age: 42"));
      const source = description.match(
        /Patient document (upload-[a-z0-9-]+)/,
      )[1];
      return {
        name: "Test New Patient",
        age: 42,
        facts: [
          {
            label: "Fatigue",
            say: "I feel tired.",
            topic: "Reason for visit",
            kw: ["what brings", "tired"],
            vis: "ask",
            ehr: "hx",
            src: source,
          },
        ],
        objectives: [
          {
            title: "Explore fatigue",
            factIndexes: [0],
            tip: "Ask about the concern.",
          },
        ],
        missing: [],
      };
    };
    try {
      click("parse-patient");
      await wait(
        () =>
          doc.getElementById("field-name")?.value === "Test New Patient" &&
          !doc.querySelector('[data-action="parse-patient"]').disabled,
      );
    } finally {
      cloud.draft = oldDraft;
      process.env.AI_ENABLED = "false";
    }
    assert.equal(doc.getElementById("field-age").value, "42");
    assert.equal(
      doc.querySelectorAll("#patient-dialog details[open]").length,
      0,
      "Sections start closed after extraction",
    );
    assert.equal(
      (await (await fetch(base + "/api/profiles")).json()).profiles.length,
      10,
      "Extraction is only a preview",
    );
    assert.equal(
      doc.querySelectorAll('.patient-dialog input[type="checkbox"]').length,
      1,
    );
    assert.ok(
      !doc
        .querySelector(".patient-dialog")
        .textContent.includes("Publication checks"),
    );
    click("submit-patient");
    await wait(() =>
      doc
        .getElementById("publication-error-message")
        ?.textContent.includes("faculty review"),
    );
    assert.ok(
      !doc
        .getElementById("publication-error-message")
        .textContent.includes("generated-"),
    );
    click("dismiss-publication-error");
    assert.equal(
      doc.getElementById("field-name").value,
      "Test New Patient",
      "Validation preserves form contents",
    );
    fill("field-reviewAcknowledged", true);
    fill("field-age", 43);
    assert.equal(doc.getElementById("field-reviewAcknowledged").checked, false);
    fill("field-reviewAcknowledged", true);
    click("submit-patient");
    await wait(
      () =>
        !doc.getElementById("patient-dialog") &&
        doc.querySelectorAll(".patient-card").length === 11,
    );
    const created = (
      await (await fetch(base + "/api/profiles")).json()
    ).profiles.find((p) => p.name === "Test New Patient");
    assert.equal(created.version, 1);
    click("launch", '[data-id="' + created.id + '"]');
    await wait(() => !!doc.getElementById("question"));
    fill("question", "What brings you in today?");
    doc
      .getElementById("question-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await wait(
      () =>
        doc.querySelector(".bubble:last-child p")?.textContent ===
        "I feel tired.",
    );
    click("nav", '[data-tab="studio"]');
    click("pick", '[data-id="' + created.id + '"]');
    await wait(() => doc.querySelectorAll(".uploaded-document").length === 3);
    click("close-patient");
    click("pick", '[data-id="b5814549-fd2b-42a2-af78-9b681ad6f268"]');
    await wait(() =>
      doc.querySelector(".editor")?.textContent.includes("Omar Sinclair"),
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
    fill("field-reviewAcknowledged", true);
    fill("field-facts-0-say", wording);
    assert.equal(doc.getElementById("field-reviewAcknowledged").checked, false);
    fill("field-reviewAcknowledged", true);
    click("submit-patient");
    await wait(() =>
      doc.querySelector(
        '[data-action="launch"][data-id="b5814549-fd2b-42a2-af78-9b681ad6f268"]',
      ),
    );
    click("launch", '[data-id="b5814549-fd2b-42a2-af78-9b681ad6f268"]');
    await wait(() => !!doc.getElementById("question"));
    assert.ok(
      doc.querySelector("#avf .patient-photo"),
      "Still patient photo is present",
    );
    assert.ok(
      !doc
        .querySelector(".ehr-panel")
        ?.textContent.includes("Encounter provenance"),
    );
    assert.ok(
      !doc.querySelector(".ehr-panel")?.textContent.includes("disclose"),
    );
    assert.ok(!doc.querySelector("#app").textContent.includes("LDL 195"));
    click("mic");
    const microphone = recognizers.at(-1);
    assert.equal(microphone.continuous, true);
    microphone.onresult({
      results: [Object.assign([{ transcript: "Hello" }], { isFinal: true })],
    });
    assert.equal(
      doc.querySelectorAll(".bubble.student").length,
      0,
      "Final speech fragments must not automatically submit.",
    );
    assert.equal(
      doc.querySelector('[data-action="mic"]').textContent,
      "Stop & send",
    );
    microphone.onresult({
      results: [
        Object.assign([{ transcript: "Hello" }], { isFinal: true }),
        Object.assign([{ transcript: "Omar" }], { isFinal: true }),
      ],
    });
    assert.equal(doc.getElementById("question").value, "Hello Omar");
    click("mic");
    await wait(
      () => doc.querySelector(".bubble:last-child p")?.textContent === "Hello.",
    );
    assert.ok(microphone.stopped);
    click("mic");
    const denied = recognizers.at(-1);
    denied.onerror({ error: "not-allowed" });
    denied.onend();
    assert.ok(
      doc
        .getElementById("voice-status")
        .textContent.includes("permission was denied"),
    );
    click("mic");
    const canceled = recognizers.at(-1);
    canceled.onresult({
      results: [
        Object.assign([{ transcript: "Draft dictated text" }], {
          isFinal: false,
        }),
      ],
    });
    click("nav", '[data-tab="team"]');
    assert.ok(canceled.aborted);
    canceled.onresult({
      results: [
        Object.assign([{ transcript: "Stale speech must not submit" }], {
          isFinal: true,
        }),
      ],
    });
    click("nav", '[data-tab="enc"]');
    assert.equal(doc.getElementById("question").value, "Draft dictated text");
    assert.equal(doc.querySelectorAll(".bubble.student").length, 1);
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
