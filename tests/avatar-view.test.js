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
});
