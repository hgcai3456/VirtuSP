"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const cloud = require("../lib/cloud"),
  fixture = require("./generation-fixture");
const { createApp } = require("../lib/http");
test("Faculty quick generation supports dictation/drop, compact review, edits, publication and random input", async () => {
  const original = cloud.generateSynthetic,
    oldEnabled = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const calls = [];
  cloud.generateSynthetic = async (input) => {
    calls.push(input);
    return fixture();
  };
  const app = await createApp({
    dataDir: await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-gen-ui-")),
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const initialDraftCount = Object.keys(app.store.state.drafts).length;
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(base);
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(await fs.readFile("public/app.html", "utf8"), {
    url: base + "/app.html",
    runScripts: "outside-only",
  });
  const w = dom.window;
  Object.defineProperty(w, "isSecureContext", {
    configurable: true,
    get: () => true,
  });
  const doc = w.document;
  w.structuredClone = structuredClone;
  w.fetch = (url, options) => client(new URL(url, base), options);
  const recognizers = [];
  w.SpeechRecognition = class {
    constructor() {
      recognizers.push(this);
    }
    start() {}
    abort() {
      this.aborted = true;
    }
  };
  const wait = async (fn) => {
    for (let i = 0; i < 500; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error(
      doc.querySelector(".form-notice")?.textContent || "UI timed out",
    );
  };
  const click = (action) => {
    const el = doc.querySelector(`[data-action="${action}"]`);
    assert.ok(el, action);
    el.click();
  };
  const fill = (id, value) => {
    const el = doc.getElementById(id);
    assert.ok(el, id);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  try {
    w.eval(await fs.readFile("public/js/catalog.js", "utf8"));
    w.eval(await fs.readFile("public/js/app.js", "utf8"));
    await wait(() => doc.querySelectorAll(".patient-card").length === 8);
    click("new-ai");
    assert.ok(doc.querySelector(".ai-patient-dialog"));
    assert.equal(
      doc.getElementById("field-name"),
      null,
      "Quick setup has no full clinical form",
    );
    fill("patient-description", "An adult with cholesterol concerns.");
    fill("ai-objective", "medications");
    click("dictate-patient");
    recognizers[0].onresult({
      results: [[{ transcript: "Worried about medication." }]],
    });
    assert.match(
      doc.getElementById("patient-description").value,
      /Worried about medication/,
    );
    click("dictate-patient");
    assert.equal(recognizers[0].aborted, true);
    const event = new w.Event("drop", { bubbles: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [
          {
            name: "brief.txt",
            type: "text/plain",
            size: 22,
            arrayBuffer: async () => Buffer.from("Fictional case material."),
          },
        ],
      },
    });
    doc.getElementById("patient-drop-zone").dispatchEvent(event);
    await wait(() => doc.querySelectorAll(".uploaded-document").length === 1);
    click("generate-ai");
    await wait(() => !!doc.querySelector(".ai-case-preview"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sources.length, 1);
    assert.match(calls[0].learningObjective, /Medication review and shared decisions/);
    assert.match(calls[0].description, /Worried about medication/);
    assert.equal(
      doc.querySelectorAll('.patient-dialog input[type="checkbox"]').length,
      1,
    );
    assert.equal(doc.getElementById("field-name"), null);
    assert.equal(Object.keys(app.store.state.drafts).length, initialDraftCount);
    assert.ok(
      [...doc.querySelectorAll(".ai-review-section")].every((d) => !d.open),
    );
    click("change-ai-brief");
    assert.match(
      doc.getElementById("patient-description").value,
      /Worried about medication/,
    );
    click("back-ai-review");
    assert.ok(doc.querySelector(".ai-case-preview"));
    click("edit-ai-details");
    fill("field-name", "Reviewed Taylor Reed");
    fill("field-facts-14-value", "245");
    click("edit-ai-details");
    assert.match(
      doc.querySelector(".ai-case-preview h2").textContent,
      /Reviewed Taylor/,
    );
    click("submit-patient");
    await wait(() => !!doc.getElementById("publication-error"));
    assert.match(
      doc.getElementById("publication-error-message").textContent,
      /review/i,
    );
    click("dismiss-publication-error");
    fill("field-reviewAcknowledged", true);
    click("submit-patient");
    await wait(() => !doc.getElementById("patient-dialog"));
    assert.equal(
      Object.keys(app.store.state.drafts).length,
      initialDraftCount + 1,
    );
    const created = Object.values(app.store.state.drafts).find(
      (p) => p.name === "Reviewed Taylor Reed",
    );
    assert.ok(app.store.latest(created.id));
    assert.deepEqual(created.catalog, { objectives: ["medications"], disciplines: [] });
    assert.equal(created.artifacts[0].rows[0].value, "245");
    assert.match(created.facts[14].label, /245/);
    click("new-ai");
    click("random-ai");
    await wait(() => !!doc.querySelector(".ai-case-preview"));
    assert.equal(calls.at(-1).description, "");
    assert.equal(calls.at(-1).random, true);
    assert.deepEqual(calls.at(-1).sources, []);
    cloud.generateSynthetic = async () => {
      throw Error("Failed provider");
    };
    click("regenerate-ai");
    await wait(() =>
      doc.querySelector(".form-notice")?.textContent.includes("failed"),
    );
    assert.ok(
      doc.querySelector(".ai-case-preview"),
      "Failed regeneration preserves prior case",
    );
    click("close-patient");
    click("new-ai");
    click("dictate-patient");
    click("close-patient");
    assert.equal(
      recognizers.at(-1).aborted,
      true,
      "Closing ends microphone use",
    );
    click("new");
    assert.ok(
      doc.getElementById("field-name"),
      "Original full creation stays available",
    );
  } finally {
    dom.window.close();
    cloud.generateSynthetic = original;
    if (oldEnabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = oldEnabled;
    await new Promise((r) => app.server.close(r));
    await app.store.flush();
  }
});
