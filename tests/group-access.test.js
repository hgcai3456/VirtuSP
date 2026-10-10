"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
test("Faculty creates available groups; student self-start is authorized, pinned and idempotent", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-available-"));
  let app, base;
  const open = async () => {
    app = await createApp({ dataDir: dir });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  const faculty = cookieClient(() => base),
    student = cookieClient(() => base);
  const call = async (client, url, method = "GET", body) => {
    const res = await client(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, ...(await res.json()) };
  };
  try {
    await open();
    const alias = (await call(student, "/api/students")).students[0].id;
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(student, "/api/session", "POST", {
      role: "student",
      studentId: alias,
    });
    assert.equal(
      (await call(student, "/api/groups")).groups.length,
      1,
      "The ready demo is an open assessment",
    );
    assert.equal(
      (await call(student, "/api/students", "POST", { alias: "Unauthorized" }))
        .status,
      403,
    );
    assert.equal((await call(student, "/api/groups", "POST", {})).status, 403);
    const patients = (await call(student, "/api/profiles")).profiles;
    const input = {
      title: "Mixed practice",
      kind: "practice",
      profileIds: patients.map((p) => p.id),
      availableToAll: true,
    };
    const created = await call(faculty, "/api/groups", "POST", input);
    assert.equal(created.status, 201);
    assert.equal(created.group.preparationStatus, "ready");
    const id = created.group.id;
    assert.equal(
      (
        await call(faculty, "/api/groups", "POST", {
          ...input,
          profileIds: [patients[0].id],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(faculty, "/api/groups", "POST", {
          ...input,
          profileIds: [patients[0].id, "not-published"],
        })
      ).status,
      400,
    );
    const comparison = await call(faculty, "/api/groups", "POST", {
      ...input,
      title: "Unmatched comparison",
      kind: "comparison",
    });
    assert.equal(comparison.group.preparationStatus, "clinical-mismatch");
    assert.equal(
      (
        await call(
          student,
          `/api/groups/${comparison.group.id}/start`,
          "POST",
          {},
        )
      ).status,
      403,
    );
    assert.ok(
      (await call(student, "/api/groups")).groups.some((g) => g.id === id),
    );
    assert.ok(
      !(await call(student, "/api/groups")).groups.some(
        (g) => g.id === comparison.group.id,
      ),
    );
    assert.equal(
      (
        await call(student, `/api/groups/${id}`, "PUT", {
          availableToAll: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (await call(faculty, `/api/groups/${id}/start`, "POST", {})).status,
      403,
    );
    const starts = await Promise.all(
      [1, 2, 3].map(() => call(student, `/api/groups/${id}/start`, "POST", {})),
    );
    assert.ok(starts.every((r) => r.status === 200));
    assert.equal(new Set(starts.map((r) => r.attempt.id)).size, 1);
    assert.equal(Object.keys(app.store.state.assignments).length, 1);
    const attempt = starts[0].attempt;
    assert.equal(attempt.studentId, alias);
    const first = await call(
      student,
      `/api/attempts/${attempt.id}/next`,
      "POST",
      {},
    );
    assert.equal(first.encounter.feedbackHeld, true);
    await call(faculty, `/api/groups/${id}`, "PUT", { availableToAll: false });
    assert.equal(
      (await call(student, `/api/groups/${id}/start`, "POST", {})).status,
      403,
    );
    const assignments = (await call(student, "/api/assignments")).assignments;
    assert.equal(assignments[0].origin, "open");
    assert.equal(
      (
        await call(
          student,
          `/api/assignments/${assignments[0].id}/start`,
          "POST",
          {},
        )
      ).attempt.id,
      attempt.id,
    );
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await open();
    await call(student, "/api/session", "POST", {
      role: "student",
      studentId: alias,
    });
    const resumed = await call(
      student,
      `/api/attempts/${attempt.id}/next`,
      "POST",
      {},
    );
    assert.equal(resumed.encounter.id, first.encounter.id);
    assert.deepEqual(
      (await call(student, `/api/attempts/${attempt.id}`)).attempt.trials,
      first.attempt.trials,
    );
  } finally {
    if (app?.server.listening) {
      await app.store.flush();
      await new Promise((r) => app.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
