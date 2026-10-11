"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");

async function boot(dir, secure) {
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(() => base);
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const dom = new JSDOM(await fs.readFile("public/app.html", "utf8"), {
    url: base + "/app.html",
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  const window = dom.window;
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    get: () => secure,
  });
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
  window.SpeechRecognition = class {
    start() {
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  };
  window.speechSynthesis = { cancel() {}, speak() {} };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  window.eval(await fs.readFile("public/js/encounter-runtime.js", "utf8"));
  window.eval(await fs.readFile("public/js/catalog.js", "utf8"));
  window.eval(await fs.readFile("public/js/app.js", "utf8"));
  return { app, window, doc: window.document };
}

async function wait(doc, predicate) {
  for (let i = 0; i < 800; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(doc.body.textContent.slice(0, 240));
}

test("an insecure page does not open the camera", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-media-off-"));
  const { app, window, doc } = await boot(dir, false);
  let calls = 0;
  window.navigator.mediaDevices = {
    getUserMedia: async () => {
      calls += 1;
      throw new Error("should not capture");
    },
  };
  t.after(async () => {
    window.close();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await wait(doc, () => doc.querySelectorAll(".patient-card").length >= 1);
  doc.getElementById("themeBtn").click();
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.equal(doc.getElementById("themeBtn").textContent, "Theme: Dark");
  doc.getElementById("themeBtn").click();
  assert.equal(doc.documentElement.hasAttribute("data-theme"), false);
  assert.equal(doc.getElementById("themeBtn").textContent, "Theme: Auto");
  doc.getElementById("themeBtn").click();
  assert.equal(doc.documentElement.dataset.theme, "light");
  assert.equal(doc.getElementById("themeBtn").textContent, "Theme: Light");
  assert.equal(calls, 0);
  doc.querySelector('[data-action="launch"][data-id="riley"]').click();
  await wait(doc, () => /secure page/.test(doc.body.textContent));
  assert.equal(calls, 0);
  const privacy = doc.getElementById("media-privacy");
  const voice = doc.getElementById("voice-status");
  const label = doc.getElementById("self-label");
  assert.ok(
    privacy && /Secure context no/.test(privacy.textContent),
    JSON.stringify({
      privacy: privacy && privacy.outerHTML,
      voice: voice && voice.textContent,
      label: label && label.textContent,
    }),
  );
  assert.match(doc.getElementById("media-privacy").textContent, /Microphone blocked/);
  assert.match(doc.getElementById("media-privacy").textContent, /Recording off/);
});

test("ending the encounter stops camera and microphone tracks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-media-on-"));
  const { app, window, doc } = await boot(dir, true);
  const tracks = [];
  const constraints = [];
  const queue = [
    Object.assign(new Error("dismissed"), { name: "AbortError" }),
    Object.assign(new Error("secure"), { name: "SecurityError" }),
    Object.assign(new Error("constraints"), { name: "OverconstrainedError" }),
    Object.assign(new Error("constraints"), { name: "OverconstrainedError" }),
  ];
  window.navigator.mediaDevices = {
    async enumerateDevices() {
      return [];
    },
    async getUserMedia(request) {
      constraints.push(request);
      const error = queue.shift();
      if (error) throw error;
      const owned = ["video", "audio"].map((kind) => ({
        kind,
        enabled: true,
        readyState: "live",
        stop() {
          this.readyState = "ended";
        },
        getSettings() {
          return { deviceId: "cam-1" };
        },
      }));
      tracks.push(...owned);
      return {
        getTracks: () => owned,
        getVideoTracks: () => owned.filter((item) => item.kind === "video"),
        getAudioTracks: () => owned.filter((item) => item.kind === "audio"),
      };
    },
  };
  t.after(async () => {
    window.close();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await wait(doc, () => doc.querySelector('[data-action="launch"][data-id="riley"]'));
  assert.equal(constraints.length, 0);
  doc.querySelector('[data-action="launch"][data-id="riley"]').click();
  await wait(doc, () => /dismissed/.test(doc.body.textContent));
  doc.querySelector("[data-action='student-camera']").click();
  await wait(doc, () => /secure page/.test(doc.body.textContent));
  doc.querySelector("[data-action='student-camera']").click();
  await wait(doc, () => /compatible camera/.test(doc.body.textContent));
  doc.querySelector("[data-action='student-camera']").click();
  await wait(doc, () => /Camera on/.test(doc.getElementById("self-label")?.textContent || ""));
  assert.equal(tracks.length, 2);
  assert.equal(constraints.at(-1).audio.echoCancellation, true);
  assert.ok(tracks.every((track) => track.readyState === "live"));
  doc.querySelector('[data-action="mute"]').click();
  assert.match(doc.getElementById("media-privacy").textContent, /Microphone muted/);
  window.dispatchEvent(new window.Event("pagehide"));
  assert.ok(tracks.every((track) => track.readyState === "ended"));
});

test("directly starting a visit records one clock and the time limit stops media", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-media-limit-"));
  const { app, window, doc } = await boot(dir, true);
  const tracks = ["video", "audio"].map((kind) => ({
    kind,
    readyState: "live",
    stop() { this.readyState = "ended"; },
  }));
  let captureCalls = 0;
  window.navigator.mediaDevices = {
    async enumerateDevices() { return []; },
    async getUserMedia() {
      captureCalls += 1;
      return {
        getTracks: () => tracks,
        getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
        getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
      };
    },
  };
  const timers = new Set();
  const setInterval = window.setInterval.bind(window);
  const clearInterval = window.clearInterval.bind(window);
  window.setInterval = (callback, ms) => {
    const id = setInterval(callback, ms);
    if (ms === 1000) timers.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    timers.delete(id);
    clearInterval(id);
  };
  t.after(async () => {
    window.close();
    await app.store.save();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await wait(doc, () => doc.querySelector('[data-action="launch"][data-id="riley"]'));
  doc.querySelector('[data-action="launch"][data-id="riley"]').click();
  await wait(doc, () => /Interview/.test(doc.getElementById("interview-timer")?.textContent || ""));
  const encounter = Object.values(app.store.state.encounters)[0];
  assert.ok(encounter.interviewStartedAt);
  assert.equal(encounter.events.filter((event) => event.type === "interview").length, 1);
  assert.equal(timers.size, 1);
  await wait(doc, () => /Camera on/.test(doc.getElementById("self-label")?.textContent || ""));
  window.Date.now = () => Date.parse(encounter.interviewStartedAt) + 20 * 60 * 1000;
  await wait(doc, () => encounter.status === "complete");
  await wait(doc, () => !doc.getElementById("question"));
  assert.ok(tracks.every((track) => track.readyState === "ended"));
  await wait(doc, () => /No student questions were recorded/.test(doc.body.textContent));
  assert.equal(timers.size, 0);
  assert.equal(captureCalls, 1);
});
