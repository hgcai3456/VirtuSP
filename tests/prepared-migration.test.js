"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../lib/store");
const engine = require("../lib/engine");
test("Ready demo migration preserves earlier authored drafts, published versions and assigned encounters", async () => {
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "virtusp-prepared-migration-"),
  );
  try {
    let store = await new Store(dir).init();
    const group = Object.values(store.state.groups)[0];
    const profileId = group.profileIds[0];
    delete group.seedRevision;
    group.availableToAll = false;
    const student = Object.values(store.state.students)[0];
    const enc = engine.create(store.latest(profileId).p);
    enc.studentId = student.id;
    enc.attemptId = "prior-attempt";
    store.state.encounters[enc.id] = enc;
    store.state.assignments["prior-assignment"] = {
      id: "prior-assignment",
      studentId: student.id,
      groupId: group.id,
      cases: [{ profileId, version: 1 }],
      attemptId: "prior-attempt",
    };
    store.state.attempts["prior-attempt"] = {
      id: "prior-attempt",
      studentId: student.id,
      groupId: group.id,
      trials: [{ profileId, version: 1, encounterId: enc.id }],
      status: "active",
    };
    const prior = structuredClone({
      encounter: enc,
      assignment: store.state.assignments["prior-assignment"],
      attempt: store.state.attempts["prior-attempt"],
    });
    await store.save();
    store = await new Store(dir).init();
    assert.equal(
      require("../lib/demo").groupView(
        store,
        store.state.groups[group.id],
        true,
      ).preparationStatus,
      "ready",
    );
    assert.equal(store.state.groups[group.id].availableToAll, false);
    assert.equal(store.state.drafts[profileId].name, prior.encounter.p.name);
    assert.equal(store.state.encounters[enc.id].id, prior.encounter.id);
    assert.equal(
      store.state.encounters[enc.id].studentId,
      prior.encounter.studentId,
    );
    assert.deepEqual(
      store.state.assignments["prior-assignment"],
      prior.assignment,
    );
    assert.deepEqual(store.state.attempts["prior-attempt"], prior.attempt);
    const prepared = store.latest(store.state.groups[group.id].profileIds[0]).p;
    assert.equal(prepared.version, 1);
    assert.equal(prepared.origin, "roster");
    const releaseCount = store.state.releases.length;
    store = await new Store(dir).init();
    assert.equal(store.state.releases.length, releaseCount);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
