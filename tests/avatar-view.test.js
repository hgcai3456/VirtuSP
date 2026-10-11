"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

async function loadView() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><body><input id=\"question\"><div id=\"avatar-dock\"></div></body>", {
    url: "http://127.0.0.1:3000/app.html",
    runScripts: "outside-only",
  });
  const window = dom.window;
  window.isSecureContext = true;
  window.HTMLMediaElement.prototype.play = () =>
    Promise.reject(Object.assign(new Error("autoplay"), { name: "NotAllowedError" }));
  window.HTMLMediaElement.prototype.pause = () => {};
  window.Audio = class {
    constructor(url) {
      this.url = url;
    }
    play() {
      return Promise.reject(Object.assign(new Error("autoplay"), { name: "NotAllowedError" }));
    }
    pause() {}
  };
  window.eval(await fs.readFile("public/js/avatar-view.js", "utf8"));
  return window;
}

test("autoplay rejection exposes Enable audio and microphone denial leaves typing usable", async () => {
  const window = await loadView();
  const view = window.VirtuSPAvatar;
  let mediaRequests = 0;
  view.configure({
    getUserMedia: async () => {
      mediaRequests += 1;
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    },
    mediaClient: {
      async connect() {
        return { room: { disconnect() {} } };
      },
    },
  });
  window.fetch = async (url) => {
    if (String(url).endsWith("/avatar/start")) {
      return {
        ok: true,
        json: async () => ({
          state: "READY",
          live: true,
          connection: "connected",
          generation: 1,
          media: {
            livekitUrl: "wss://media.example/room",
            livekitClientToken: "client-token",
          },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  };
  view.sync({
    tab: "enc",
    encounter: { id: "enc-1", name: "Omar Sinclair", version: 3 },
  });
  await view.handleAction("avatar-start");
  const enable = window.document.querySelector('[data-action="avatar-enable-audio"]');
  assert.equal(enable.hidden, false);
  assert.match(window.document.getElementById("avatar-name").textContent, /Omar Sinclair/);
  assert.match(window.document.querySelector(".avatar-kicker").textContent, /Simulated patient/);
  await view.handleAction("avatar-talk");
  assert.equal(mediaRequests, 1);
  const input = window.document.getElementById("question");
  assert.equal(input.disabled, false);
  input.value = "What brings you in today?";
  assert.equal(input.value, "What brings you in today?");
  view.dispose();
  window.close();
});

test("ordinary rerenders do not open another provider session", async () => {
  const window = await loadView();
  const view = window.VirtuSPAvatar;
  view.configure({
    mediaClient: {
      async connect() {
        return { room: { disconnect() {} } };
      },
    },
  });
  window.fetch = async () => ({
    ok: true,
    json: async () => ({
      state: "READY",
      live: true,
      connection: "connected",
      generation: 1,
      media: { livekitUrl: "wss://media.example/room", livekitClientToken: "client-token" },
    }),
  });
  const encounter = { id: "enc-1", name: "Omar Sinclair", version: 3 };
  view.sync({ tab: "enc", encounter });
  await view.handleAction("avatar-start");
  const media = view.mediaElement();
  view.park();
  window.document.getElementById("avatar-dock").remove();
  const dock = window.document.createElement("div");
  dock.id = "avatar-dock";
  window.document.body.appendChild(dock);
  view.sync({ tab: "enc", encounter: { ...encounter, name: "Omar Sinclair" } });
  view.sync({ tab: "enc", encounter });
  assert.equal(view.mediaElement(), media);
  assert.equal(view.connects(), 1);
  assert.equal(dock.contains(media), true);
  view.dispose();
  window.close();
});

function listenHarness(window) {
  const recognizers = [];
  const timers = [];
  window.SpeechRecognition = class {
    start() {
      recognizers.push(this);
    }
    abort() {
      this.aborted = true;
    }
  };
  window.setTimeout = (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ id, fn, ms, cleared: false });
    return id;
  };
  window.clearTimeout = (id) => {
    const item = timers.find((timer) => timer.id === id);
    if (item) item.cleared = true;
  };
  return { recognizers, timers };
}

test("an empty voice listen stops instead of running with nothing recorded", async () => {
  const window = await loadView();
  const view = window.VirtuSPAvatar;
  const { recognizers, timers } = listenHarness(window);
  let submitted = 0;
  view.configure({
    submitQuestion() {
      submitted += 1;
    },
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
  });
  view.sync({
    tab: "enc",
    encounter: { id: "enc-1", name: "Ada Synthetic", version: 1 },
  });
  await view.handleAction("avatar-talk");
  assert.equal(view.state(), "LISTENING");
  recognizers[0].onend();
  assert.equal(submitted, 0);
  assert.equal(view.state(), "READY");
  assert.match(
    window.document.getElementById("avatar-status").textContent,
    /Nothing was recorded/,
  );
  assert.equal(
    timers.some((timer) => timer.ms === 30000 && !timer.cleared),
    false,
  );
  view.dispose();
  window.close();
});

test("heard speech is sent, and a silent listen deadline records nothing", async () => {
  const window = await loadView();
  const view = window.VirtuSPAvatar;
  const { recognizers, timers } = listenHarness(window);
  const submitted = [];
  view.configure({
    submitQuestion(text) {
      submitted.push(text);
    },
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
  });
  view.sync({
    tab: "enc",
    encounter: { id: "enc-1", name: "Ada Synthetic", version: 1 },
  });
  await view.handleAction("avatar-talk");
  recognizers[0].onresult({
    results: [[{ transcript: "What brings you in today" }]],
  });
  recognizers[0].onend();
  assert.deepEqual(submitted, ["What brings you in today"]);

  await view.handleAction("avatar-talk");
  const deadline = timers.find((timer) => timer.ms === 30000 && !timer.cleared);
  assert.ok(deadline);
  deadline.fn();
  assert.deepEqual(submitted, ["What brings you in today"]);
  assert.equal(view.state(), "READY");
  assert.match(
    window.document.getElementById("avatar-status").textContent,
    /Nothing was recorded/,
  );
  view.dispose();
  window.close();
});
