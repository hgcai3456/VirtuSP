"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
const profiles = require("../lib/profiles");
const catalog = require("../public/js/catalog");

test("Legacy catalog categories use teaching objectives only and explicit empty selections remain uncategorized", () => {
  const caseData = {
    obj: [{ t: "Practice nutrition counseling" }],
    summary: "urgent referral",
    facts: [{ label: "fall safety", say: "I need medication review" }],
  };
  assert.deepEqual(catalog.forProfile(caseData).objectives, ["nutrition"]);
  assert.deepEqual(catalog.forProfile({ ...caseData, catalog: { objectives: [], disciplines: [] } }), { objectives: [], disciplines: [] });
  assert.throws(() => catalog.normalize({ objectives: "nutrition", disciplines: [] }), { status: 400 });
  const mismatch = catalog.groupCatalog([
    { catalog: { objectives: ["nutrition"], disciplines: ["pa"] } },
    { catalog: { objectives: ["nutrition"], disciplines: ["physical-therapy"] } },
  ]);
  assert.equal(catalog.matches(mismatch, "nutrition", "pa"), false, "A multi-trial group cannot imply every trial supports a discipline when its cases disagree");
  assert.equal(catalog.matches(mismatch, "nutrition", ""), true, "The all-disciplines view still exposes the group");
});

test("Objective catalog uses published teaching metadata, preserves assigned versions and keeps clinical answers private", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-catalog-flow-"));
  let app;
  try {
    app = await createApp({ dataDir: dir });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const faculty = cookieClient(base), student = cookieClient(base);
    const call = async (client, url, method = "GET", body) => {
      const response = await client(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, ...(await response.json()) };
    };
    const aliases = (await call(student, "/api/students")).students;
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(student, "/api/session", "POST", { role: "student", studentId: aliases[0].id });
    const options = await call(student, "/api/catalog");
    assert.equal(options.status, 200);
    assert.ok(options.objectives.some((o) => o.id === "urgent-referral"));
    assert.ok(options.disciplines.some((d) => d.id === "physical-therapy"));

    const publish = async (name, objectives, disciplines) => {
      const p = profiles.blank();
      p.name = name;
      p.intro = "Hello, I would like to discuss my concern.";
      p.summary = "PRIVATE ANSWER KEY: the patient needs urgent referral.";
      p.facts = [profiles.fact("concern", "PRIVATE CLINICAL VALUE", { say: "I have a concern.", reviewed: true })];
      p.reviewAcknowledged = true;
      p.catalog = { objectives, disciplines };
      const created = await call(faculty, "/api/profiles", "POST", { profile: p, publish: true });
      assert.equal(created.status, 201, JSON.stringify(created));
      return created.profile;
    };
    const first = await publish("Catalog test one", ["communication", "nutrition"], ["pa", "nutrition"]);
    const second = await publish("Catalog test two", ["communication", "medications"], ["pa", "medicine"]);
    const list = (await call(student, "/api/profiles")).profiles;
    const shown = list.find((p) => p.id === first.id);
    assert.deepEqual(shown.catalog, first.catalog);
    assert.ok(!JSON.stringify(shown).includes("PRIVATE"));
    assert.ok(!shown.catalog.objectives.includes("urgent-referral"), "Answer-key summary cannot add a catalog objective");
    assert.equal((await call(student, `/api/profiles/${first.id}`, "PUT", { profile: first })).status, 403);
    const assignment = await call(faculty, "/api/assignments", "POST", { profileId: first.id, studentId: aliases[0].id });
    assert.equal(assignment.status, 201);
    const originalRelease = structuredClone(app.store.latest(first.id));

    const draft = structuredClone(first);
    draft.catalog = { objectives: ["mobility"], disciplines: ["physical-therapy"] };
    assert.equal((await call(faculty, `/api/profiles/${first.id}`, "PUT", { profile: draft })).status, 200);
    const stillPublished = (await call(student, "/api/profiles")).profiles.find((p) => p.id === first.id);
    assert.deepEqual(stillPublished.catalog, first.catalog, "Draft catalog edits must not change the published student catalog");
    assert.deepEqual(app.store.latest(first.id), originalRelease, "Metadata editing must not rewrite any immutable release");

    const group = await call(faculty, "/api/groups", "POST", { title: "Catalog intersection", kind: "practice", profileIds: [first.id, second.id] });
    assert.equal(group.status, 201);
    assert.deepEqual(group.group.catalog.objectives, ["communication"]);
    assert.deepEqual(group.group.catalog.disciplines, ["pa"]);
    const invalidDraft = structuredClone(draft);
    invalidDraft.catalog.objectives = ["invented-specialty"];
    assert.equal((await call(faculty, `/api/profiles/${first.id}`, "PUT", { profile: invalidDraft })).status, 400);
    assert.deepEqual(app.store.state.drafts[first.id].catalog, draft.catalog, "An invalid tag must leave the saved draft unchanged");
    const republished = await call(faculty, `/api/profiles/${first.id}/publish`, "POST", { acknowledge: true });
    assert.equal(republished.status, 201, JSON.stringify(republished));
    const attempt = await call(student, `/api/assignments/${assignment.assignment.id}/start`, "POST", {});
    assert.equal(attempt.status, 200);
    assert.equal(attempt.attempt.trials[0].version, assignment.assignment.cases[0].version);
    assert.deepEqual(app.store.state.releases.find((r) => r.p.id === first.id && r.p.version === 1), originalRelease);
    assert.ok((await call(student, "/api/assignments")).assignments.some((a) => a.id === assignment.assignment.id), "An assignment survives changes to available catalog tags");
  } finally {
    if (app?.server.listening) {
      await app.store.flush();
      await new Promise((r) => app.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Discipline preference is per demo alias, validated, private from public listings and recovered after restart", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-discipline-"));
  let app, base;
  const open = async () => {
    app = await createApp({ dataDir: dir });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  const anonymous = cookieClient(() => base), faculty = cookieClient(() => base), first = cookieClient(() => base), second = cookieClient(() => base);
  const call = async (client, url, method = "GET", body) => {
    const response = await client(url, {
      method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    await open();
    const aliases = (await call(anonymous, "/api/students")).students;
    const login = async (client, index) => call(client, "/api/session", "POST", { role: "student", studentId: aliases[index].id });
    await login(first, 0);
    await login(second, 1);
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    assert.equal((await call(anonymous, "/api/student-preferences", "PUT", { discipline: "pa" })).status, 401);
    assert.equal((await call(faculty, "/api/student-preferences", "PUT", { discipline: "pa" })).status, 403);
    assert.equal((await call(first, "/api/student-preferences", "PUT", { discipline: "pa", studentId: aliases[1].id })).status, 403);
    const changed = await call(first, "/api/student-preferences", "PUT", { discipline: "pa" });
    assert.equal(changed.status, 200);
    assert.equal(changed.preferences.discipline, "pa");
    assert.equal((await call(first, "/api/session")).preferences.discipline, "pa");
    assert.equal((await call(second, "/api/session")).preferences.discipline, "");
    assert.equal((await call(first, "/api/student-preferences", "PUT", { discipline: "unrecognized" })).status, 400);
    assert.equal((await call(first, "/api/session")).preferences.discipline, "pa");
    const publicStudents = (await call(anonymous, "/api/students")).students;
    assert.deepEqual(Object.keys(publicStudents.find((s) => s.id === aliases[0].id)).sort(), ["alias", "id"]);
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await open();
    const recovered = await login(first, 0);
    assert.equal(recovered.preferences.discipline, "pa");
    await login(second, 1);
    assert.equal((await call(second, "/api/session")).preferences.discipline, "");
    const reset = await call(first, "/api/student-preferences", "PUT", { discipline: "" });
    assert.equal(reset.status, 200);
    assert.equal(reset.preferences.discipline, "");
  } finally {
    if (app?.server.listening) {
      await app.store.flush();
      await new Promise((r) => app.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
