"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http");
const cloud = require("../lib/cloud");
const textPdf = require("./pdf-fixture");
test("Document roles, previews, clinical attachments and explicit creation preserve boundaries", async () => {
  process.env.AI_ENABLED = "true";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-docs-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`,
    oldDraft = cloud.draft;
  const request = async (url, payload) => {
    const r = await fetch(base + url, {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  };
  const upload = async (name, lines) =>
    (
      await request("/api/files", {
        name,
        type: "application/pdf",
        data: textPdf(lines).toString("base64"),
      })
    ).file;
  try {
    const reference = await upload("Teaching.pdf", [
      "General reference. Typical sample patient age is 80.",
    ]);
    const report = await upload("Clinical.pdf", [
      "Synthetic chart report. Date: 2026-10-10. Prior note: Follow-up requested.",
    ]);
    const caseBrief = await upload("Case.pdf", ["Name: Document Patient"]);
    cloud.draft = async (description, sources) => {
      assert.ok(!description.includes("age is 80"));
      assert.ok(sources.some((s) => s.id === "upload-" + reference.id));
      return {
        name: "Document Patient",
        age: null,
        facts: [
          {
            label: "Follow-up requested",
            say: "Follow-up requested.",
            vis: "ask",
            ehr: "notes",
            kw: ["follow up"],
            src: "upload-" + report.id,
          },
        ],
        objectives: [],
        missing: ["Age unspecified"],
      };
    };
    const draft = await request("/api/generate", {
      description: "Name: Document Patient",
      files: [
        { id: reference.id, role: "reference" },
        { id: report.id, role: "clinical", section: "notes" },
        { id: caseBrief.id, role: "case" },
      ],
      preview: true,
    });
    assert.equal(draft.status, 201);
    assert.equal(draft.profile.sources.filter((s) => s.fileId).length, 3);
    assert.equal(draft.profile.age, null);
    assert.equal(
      draft.profile.facts[0].vis,
      "chart",
      "Report facts are chart-only even if model mislabels them",
    );
    assert.equal(draft.profile.artifacts[0].fileId, report.id);
    assert.deepEqual(draft.profile.artifacts[0].facts, ["generated-0"]);
    assert.equal(
      draft.profile.artifacts[0].date,
      "",
      "No current date invented",
    );
    assert.equal(
      draft.profile.sources.find((s) => s.fileId === reference.id).role,
      "reference",
    );
    assert.equal((await request("/api/profiles")).profiles.length, 10);
    assert.equal(
      (
        await request("/api/profiles", {
          profile: draft.profile,
          publish: true,
        })
      ).status,
      422,
    );
    assert.equal(
      (await request("/api/profiles")).profiles.length,
      10,
      "Failed publication creates no draft",
    );
    assert.equal(
      (
        await request("/api/generate", {
          description: "Case",
          files: [
            { id: report.id, role: "case" },
            { id: report.id, role: "clinical" },
          ],
          preview: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/generate", {
          description: "Case",
          files: [{ id: "missing", role: "case" }],
          preview: true,
        })
      ).status,
      400,
    );
    const saved = await request("/api/profiles", { profile: draft.profile });
    assert.equal(saved.status, 201);
    assert.equal((await request("/api/profiles")).profiles.length, 11);
    assert.equal(
      (await request("/api/profiles", { profile: draft.profile })).status,
      409,
    );
  } finally {
    cloud.draft = oldDraft;
    process.env.AI_ENABLED = "false";
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
