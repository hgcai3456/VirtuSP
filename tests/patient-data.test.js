"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../lib/store"),
  { createApp } = require("../lib/http");
const { rosterProfiles } = require("../lib/roster-profiles");
const roster = require("../public/js/roster");
const engine = require("../lib/engine"),
  { cookieClient } = require("./http-client");

test("Every roster case retains its complete source and releases its authored clinical notes", () => {
  for (const p of rosterProfiles()) {
    const source = roster.find((r) => r.id === p.id);
    assert.deepEqual(p.originalRoster, source, p.name);
    assert.ok(p.summary.includes(source.complaint), p.name);
    const enc = engine.create({ ...p, version: 1 });
    assert.equal(
      JSON.stringify(engine.publicView(enc)).includes("originalRoster"),
      false,
    );
    engine.openSection(enc, "notes");
    for (const f of p.facts.filter(
      (f) => f.vis === "chart" && f.sec === "notes",
    ))
      assert.ok(
        engine
          .publicView(enc)
          .disclosed.some(
            (d) =>
              d.id === f.id &&
              d.label === f.label &&
              d.releaseSection === "notes",
          ),
        p.name,
      );
    for (const f of p.facts.filter((f) => f.gate > 0))
      assert.ok(!engine.publicView(enc).disclosed.some((d) => d.id === f.id));
  }
});

test("Context migration preserves authored drafts and immutable releases and runs only once", async () => {
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "virtusp-data-migration-"),
  );
  try {
    let store = await new Store(dir).init();
    const p = store.state.drafts.yvette;
    delete p.summary;
    delete p.originalRoster;
    delete p.rosterDataRevision;
    const released = store.latest("yvette");
    delete released.p.summary;
    delete released.p.originalRoster;
    delete released.p.rosterDataRevision;
    // A faculty-created case at a roster ID must never be replaced or published.
    store.state.drafts.nisha.origin = "faculty";
    store.state.drafts.nisha.summary = "Faculty description must survive.";
    store.state.drafts.nisha.facts[0].label = "Faculty-edited finding.";
    const authored = JSON.parse(JSON.stringify(store.state.drafts.nisha));
    const oldReleases = JSON.parse(JSON.stringify(store.state.releases));
    const encounter = JSON.parse(JSON.stringify(engine.create(released.p)));
    store.state.encounters[encounter.id] = encounter;
    await store.save();
    store = await new Store(dir).init();
    assert.deepEqual(store.state.drafts.nisha, authored);
    assert.ok(store.state.drafts.yvette.summary.includes("Heart failure"));
    assert.equal(store.latest("yvette").p.version, released.p.version + 1);
    assert.deepEqual(store.state.encounters[encounter.id], encounter);
    assert.deepEqual(
      store.state.releases.slice(0, oldReleases.length),
      oldReleases,
    );
    const count = store.state.releases.length;
    store.state.drafts.yvette.summary = ""; // An intentional faculty edit stays empty.
    await store.save();
    store = await new Store(dir).init();
    assert.equal(store.state.drafts.yvette.summary, "");
    assert.equal(store.state.releases.length, count);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Faculty can recover saved cases and descriptions without exposing them to students", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-library-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const faculty = cookieClient(base),
    learner = cookieClient(base);
  const call = async (c, route, method = "GET", data) => {
    const r = await c(route, {
      method,
      headers: { "Content-Type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(learner, "/api/session", "POST", {
      role: "student",
      studentId: Object.keys(app.store.state.students)[0],
    });
    const saved = (await call(faculty, "/api/profiles?library=saved")).data
      .profiles;
    const yvette = saved.find(
      (p) => p.name === "Yvette Armstrong" && p.age === 64,
    );
    assert.ok(yvette.description.includes("Hypertension"));
    const original = structuredClone(app.store.state.drafts[yvette.id]);
    original.summary = "Edited faculty-only description.";
    await call(faculty, `/api/profiles/${original.id}`, "PUT", {
      profile: original,
    });
    const reloaded = (await call(faculty, `/api/profiles/${original.id}`)).data
      .profile;
    assert.equal(reloaded.summary, original.summary);
    assert.deepEqual(reloaded.facts, original.facts);
    assert.deepEqual(reloaded.original, original.original);
    assert.equal(
      (await call(learner, "/api/profiles?library=saved")).status,
      403,
    );
    const cases = (await call(learner, "/api/profiles")).data.profiles;
    assert.equal(
      cases.find((p) => p.id === "yvette").description,
      app.store.latest("yvette").p.intro,
    );
    assert.equal(JSON.stringify(cases).includes("Five-week"), false);
    const p = rosterProfiles().find((p) => p.id === "yvette");
    p.facts.push({
      ...p.facts.find((f) => f.id === "ya7"),
      id: "note-hx",
      ehr: "hx",
      label: "Prior clinical note",
    });
    const enc = engine.create(p);
    engine.openSection(enc, "notes");
    const note = engine
      .publicView(enc)
      .disclosed.find((f) => f.id === "note-hx");
    assert.equal(note.ehr, "hx");
    assert.equal(note.releaseSection, "notes");
  } finally {
    await new Promise((r) => app.server.close(r));
    await app.store.flush();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
