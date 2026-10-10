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
    const oldIds = group.profileIds.map((id) => id.replace(/-demo$/, ""));
    for (const [i, id] of group.profileIds.entries()) {
      const p = structuredClone(store.state.drafts[id]);
      p.id = oldIds[i];
      delete p.preparedDemo;
      p.facts[0].say = "Previously authored statement.";
      store.state.drafts[p.id] = p;
      if (!i)
        store.state.releases.push({
          p: { ...structuredClone(p), version: 1 },
          at: "2026-10-10T00:00:00Z",
        });
      delete store.state.drafts[id];
    }
    store.state.releases = store.state.releases.filter(
      (r) => !group.profileIds.includes(r.p.id),
    );
    group.profileIds = oldIds;
    delete group.seedRevision;
    group.availableToAll = false; // Preserve an explicit previous faculty setting.
    const student = Object.values(store.state.students)[0];
    const enc = engine.create(store.latest(oldIds[0]).p);
    enc.studentId = student.id;
    enc.attemptId = "prior-attempt";
    store.state.encounters[enc.id] = enc;
    store.state.assignments["prior-assignment"] = {
      id: "prior-assignment",
      studentId: student.id,
      groupId: group.id,
      cases: [{ profileId: oldIds[0], version: 1 }],
      attemptId: "prior-attempt",
    };
    store.state.attempts["prior-attempt"] = {
      id: "prior-attempt",
      studentId: student.id,
      groupId: group.id,
      trials: [{ profileId: oldIds[0], version: 1, encounterId: enc.id }],
      status: "active",
    };
    const prior = structuredClone({
      draft: store.state.drafts[oldIds[0]],
      release: store.latest(oldIds[0]),
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
    assert.deepEqual(
      {
        draft: store.state.drafts[oldIds[0]],
        release: store.latest(oldIds[0]),
        encounter: store.state.encounters[enc.id],
        assignment: store.state.assignments["prior-assignment"],
        attempt: store.state.attempts["prior-attempt"],
      },
      prior,
    );
    const prepared = store.latest(store.state.groups[group.id].profileIds[0]).p;
    assert.equal(prepared.version, 1);
    assert.equal(
      prepared.reviewAcknowledged,
      false,
      "A prepared demo is not represented as faculty clinical approval",
    );
    assert.match(prepared.publicationBasis, /Bundled synthetic demo/);
    const releaseCount = store.state.releases.length;
    store = await new Store(dir).init();
    assert.equal(store.state.releases.length, releaseCount);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
