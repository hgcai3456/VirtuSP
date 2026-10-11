"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");

test("Each published patient can be answered and spoken with", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-call-ui-"));
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
    abort() {
      this.aborted = true;
      this.onend?.();
    }
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  window.speechSynthesis = {
    speak(utter) {
      utter.onstart?.();
    },
    cancel() {},
  };
  const doc = window.document;
  const wait = async (predicate) => {
    for (let i = 0; i < 400; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("UI did not settle: " + doc.querySelector("#app")?.textContent);
  };
  const click = (action, extra = "") => {
    const el = doc.querySelector(`[data-action="${action}"]${extra}`);
    assert.ok(el, action + extra);
    el.click();
  };
  try {
    window.eval(await fs.readFile("public/js/catalog.js", "utf8"));
    window.eval(await fs.readFile("public/js/app.js", "utf8"));
    await wait(() => doc.querySelectorAll('[data-action="launch"]').length >= 7);
    const launches = [...doc.querySelectorAll('[data-action="launch"]')];
    const patients = launches.map((el) => ({
      id: el.dataset.id,
      name: el.closest(".patient-card")?.querySelector("h3")?.textContent,
    }));
    assert.ok(patients.every((p) => p.id && p.name));
    for (const patient of patients) {
      click("nav", '[data-tab="studio"]');
      await wait(() =>
        !!doc.querySelector(`[data-action="launch"][data-id="${patient.id}"]`),
      );
      click("launch", `[data-id="${patient.id}"]`);
      await wait(
        () =>
          !!doc.getElementById("question") &&
          !doc.getElementById("question").disabled,
      );
      assert.equal(doc.querySelector(".incoming-call"), null);
      assert.ok(doc.querySelector("#student-camera"));
      assert.match(doc.getElementById("visit-timer").textContent, /^\d{2}:\d{2}/);
      assert.ok(doc.querySelector('.mic-btn[data-action="toggle-pause"]'));
      assert.match(
        doc.getElementById("voice-status").textContent,
        /Listening|Patient speaking|Ready/,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    window.close();
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
