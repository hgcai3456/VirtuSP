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
  const client = await require("./http-client").facultyClient(() => base);
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
  window.fetch = (url, options) => client(new URL(url, base), options);
  window.HTMLElement.prototype.scrollTo = () => {};
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  const noop = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => ({
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
    drawImage: noop,
  });
  window.HTMLMediaElement.prototype.play = async () => {};
  window.HTMLMediaElement.prototype.pause = noop;
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
  let synthCancels = 0;
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  window.speechSynthesis = {
    speak(utter) {
      this._utter = utter;
      utter.onstart?.();
    },
    cancel() {
      synthCancels++;
      this._utter?.onend?.();
      this._utter = null;
    },
  };
  const doc = window.document;
  const wait = async (predicate) => {
    for (let i = 0; i < 800; i++) {
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
    await wait(() => doc.querySelectorAll(".patient-card").length === 8);
    assert.equal(doc.querySelector(".editor"), null);
    click("new");
    assert.ok(doc.getElementById("patient-dialog").hasAttribute("open"));
    assert.equal(
      doc.querySelectorAll('.patient-dialog input[type="checkbox"]').length,
      1,
    );
    assert.equal(
      (await (await client(base + "/api/profiles")).json()).profiles.length,
      8,
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
      (await (await client(base + "/api/profiles")).json()).profiles.length,
      8,
    );
    const pdf = require("./pdf-fixture")([
      "Synthetic faculty case",
      "Name: Test New Patient",
      "Age: 42",
      "Patient concern: I feel tired.",
    ]);
    const input = doc.getElementById("patient-upload");
    assert.equal(input.hidden, true, "The small native file control is hidden");
    const browse = doc.querySelector('[data-action="browse-patient"]');
    assert.equal(browse.tagName, "BUTTON");
    assert.equal(browse.type, "button", "Browsing does not submit the form");
    let pickerClicks = 0;
    input.addEventListener("click", (event) => {
      event.preventDefault();
      pickerClicks++;
    });
    browse.querySelector("strong").click();
    assert.equal(
      pickerClicks,
      1,
      "Clicking anywhere on the panel opens the picker",
    );
    assert.equal(
      doc.getElementById("patient-upload"),
      input,
      "File input stays mounted while browsing",
    );
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
    const drag = (
      type,
      files = [],
      selector = "#patient-drop-zone",
      items = [],
    ) => {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { files, items, dropEffect: "none" },
      });
      doc.querySelector(selector).dispatchEvent(event);
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
      ["History.pdf"].map((name) => ({
        name,
        type: "application/pdf",
        arrayBuffer: async () => pdf,
      })),
      ".upload-browse strong",
    );
    assert.equal(dropped.defaultPrevented, true);
    // An overlapping drop must not queue duplicate uploads.
    drag("drop", [{ name: "Duplicate.pdf", arrayBuffer: async () => pdf }]);
    await wait(
      () =>
        doc.querySelectorAll(".uploaded-document").length === 2 &&
        !doc.querySelector('[data-action="parse-patient"]').disabled,
    );
    drag("drop", [], "#patient-upload-area h2", [
      {
        kind: "file",
        getAsFile: () => ({
          name: "Context.pdf",
          type: "application/pdf",
          arrayBuffer: async () => pdf,
        }),
      },
    ]);
    await wait(
      () =>
        doc.querySelectorAll(".uploaded-document").length === 3 &&
        !doc.querySelector('[data-action="parse-patient"]').disabled,
    );
    assert.equal(doc.querySelectorAll(".uploaded-document").length, 3);
    // Editor-tab/URL drags carry no file bytes; explain rather than silently ignoring.
    drag("drop", [], ".upload-prompt", [{ kind: "string" }]);
    assert.ok(
      doc.querySelector(".form-notice").textContent.includes("File Explorer"),
    );
    assert.equal(doc.querySelectorAll(".uploaded-document").length, 3);
    const outside = drag("drop", [], "#patient-description");
    assert.equal(
      outside.defaultPrevented,
      true,
      "A stray drop cannot navigate away",
    );
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
    process.env.AI_ENABLED = "true";
    cloud.draft = async () => {
      throw Object.assign(new Error("Private detail"), {
        code: "MODEL_OUTPUT_LIMIT",
      });
    };
    try {
      click("parse-patient");
      await wait(() =>
        doc.querySelector(".form-notice")?.textContent.includes("output limit"),
      );
      assert.equal(
        doc.getElementById("field-name").value,
        "Test New Patient",
        "A failed retry retains existing form edits",
      );
      assert.equal(doc.getElementById("field-age").value, "42");
      assert.equal(doc.querySelectorAll(".uploaded-document").length, 3);
    } finally {
      cloud.draft = oldDraft;
      process.env.AI_ENABLED = "false";
    }
    assert.equal(
      doc.querySelectorAll("#patient-dialog details[open]").length,
      0,
      "Sections start closed after extraction",
    );
    assert.equal(
      (await (await client(base + "/api/profiles")).json()).profiles.length,
      8,
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
        doc.querySelectorAll(".patient-card").length === 9,
    );
    const created = (
      await (await client(base + "/api/profiles")).json()
    ).profiles.find((p) => p.name === "Test New Patient");
    assert.equal(created.version, 1);
    click("launch", '[data-id="' + created.id + '"]');
    await wait(() => !!doc.getElementById("question") && !doc.getElementById("question").disabled);
    assert.equal(doc.querySelector(".incoming-call"), null);
    assert.match(doc.getElementById("visit-timer").textContent, /^\d{2}:\d{2}/);
    await wait(() =>
      doc.getElementById("avf")?.classList.contains("video-call"),
    );
    assert.equal(doc.getElementById("question").disabled, false);
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
    click("pick", '[data-id="omar"]');
    await wait(
      () => doc.getElementById("field-name")?.value === "Omar Sinclair",
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
    await wait(() => !doc.getElementById("patient-dialog"));
    click("launch", '[data-id="omar"]');
    await wait(() => !!doc.getElementById("question") && !doc.getElementById("question").disabled);
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.speechSynthesis.cancel();
    await wait(() => {
      const r = recognizers.at(-1);

      return (
        r &&
        r.starts &&
        !r.aborted &&
        doc.querySelector(".mic-btn")?.textContent.includes("Listening")
      );
    });
    assert.ok(
      doc.querySelector("#avf .patient-photo"),
      "Patient photo is present",
    );
    assert.ok(
      doc.querySelector("#av-talk"),
      "Talking avatar canvas is present",
    );
    assert.ok(
      doc.querySelector("#av-video"),
      "Talking-video element is present",
    );
    assert.match(
      doc.querySelector("#av-video")?.getAttribute("src") || "",
      /omar\.mp4/,
      "Omar uses the packaged talking clip",
    );
    assert.ok(
      doc.querySelector("#avf .patient-call"),
      "Video-call canvas is present",
    );
    assert.ok(doc.getElementById("avf").classList.contains("camera-on"));
    assert.ok(
      !doc
        .querySelector(".ehr-panel")
        ?.textContent.includes("Encounter provenance"),
    );
    assert.ok(
      !doc.querySelector(".ehr-panel")?.textContent.includes("disclose"),
    );
    assert.ok(!doc.querySelector("#app").textContent.includes("LDL 195"));
    // Hands-free live conversation starts automatically in an active encounter.
    const mic = recognizers.at(-1);
    assert.ok(mic, "Live recognizer starts automatically");
    assert.equal(mic.continuous, true);
    assert.equal(mic.interimResults, true);
    assert.match(doc.querySelector(".mic-btn").textContent, /Listening|Live/);
    // A spoken utterance auto-submits after a short silence, with no button press.
    mic.onresult({
      results: [
        Object.assign([{ transcript: "What brings you in today" }], {
          isFinal: true,
        }),
      ],
    });
    assert.equal(
      doc.getElementById("question").value,
      "What brings you in today",
    );
    await wait(
      () => doc.querySelector(".bubble:last-child p")?.textContent === wording,
    );
    assert.equal(doc.querySelectorAll(".bubble.student").length, 1);
    const whileSpeaking = recognizers.at(-1);
    const cancelsBefore = synthCancels;
    whileSpeaking?.onresult({
      results: [
        Object.assign([{ transcript: "hello hello hello" }], {
          isFinal: false,
        }),
      ],
    });
    assert.equal(
      synthCancels,
      cancelsBefore,
      "Patient audio must not be transcribed as the student talking",
    );
    window.speechSynthesis.cancel();
    // Clicking the patient pauses the conversation; clicking again resumes.
    doc.getElementById("avf").click();
    assert.ok(doc.getElementById("avf").classList.contains("paused"));
    assert.match(doc.querySelector(".mic-btn").textContent, /Paused/);
    doc.getElementById("avf").click();
    assert.ok(!doc.getElementById("avf").classList.contains("paused"));
    assert.equal(
      doc.querySelector(".bubble:last-child p b"),
      null,
      "Patient text must be escaped",
    );
    click("section", '[data-section="labs"]');
    await wait(() =>
      doc
        .querySelector('[data-action="section"][data-section="labs"]')
        ?.classList.contains("on"),
    );
    assert.equal(doc.querySelector('[data-action="review"]'), null);
    assert.equal(doc.querySelector('[data-action="review-section"]'), null);
    click("complete");
    // Feedback opens on a short summary; the rubric is one of its views.
    await wait(() => !!doc.querySelector(".rep-tabs"));
    assert.ok(doc.querySelector(".warn").textContent.includes("provisional"));
    assert.ok(doc.querySelector(".score-num").textContent.includes("/28"));
    assert.ok(doc.querySelector(".plan"));
    assert.equal(doc.querySelectorAll(".domain-row").length, 0);
    click("rep-view", '[data-view="rubric"]');
    await wait(() => doc.querySelectorAll(".domain-row").length === 7);
    click("rep-view", '[data-view="findings"]');
    await wait(() => !!doc.querySelector(".meter"));
    click("rep-view", '[data-view="interview"]');
    await wait(() => !!doc.querySelector(".annotated .turn"));
    click("nav", '[data-tab="studio"]');
    click("launch", '[data-id="riley"]');
    await wait(() => !!doc.getElementById("question") && !doc.getElementById("question").disabled);
    assert.equal(doc.querySelector(".incoming-call"), null);
    assert.equal(doc.body.textContent.includes("Text message"), false);
    assert.equal(doc.body.textContent.includes("Patient is texting"), false);
    await wait(() =>
      doc.getElementById("avf")?.classList.contains("video-call"),
    );
    assert.equal(doc.getElementById("question").disabled, false);
    assert.ok(doc.querySelector("#student-camera"));
    assert.ok(doc.getElementById("visit-timer"));
    assert.ok(doc.querySelector('.mic-btn[data-action="toggle-pause"]'));
    assert.deepEqual(errors, []);
  } finally {
    window.close();
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
