"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http"),
  { cookieClient } = require("./http-client");
const demo = require("../lib/demo"),
  bias = require("../lib/bias");

test("Individual assignments pin versions, restrict ownership, resume once and release single-visit feedback", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "virtusp-single-assignment-"),
  );
  let app, base;
  const open = async () => {
    app = await createApp({ dataDir: dir });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  const faculty = cookieClient(() => base),
    student = cookieClient(() => base),
    other = cookieClient(() => base);
  const call = async (client, url, method = "GET", body) => {
    const r = await client(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  };
  try {
    await open();
    const aliases = Object.values(app.store.state.students);
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(student, "/api/session", "POST", {
      role: "student",
      studentId: aliases[0].id,
    });
    await call(other, "/api/session", "POST", {
      role: "student",
      studentId: aliases[1].id,
    });
    const p = (await call(student, "/api/profiles")).profiles[0];
    assert.equal(
      (
        await call(student, "/api/assignments", "POST", {
          profileId: p.id,
          studentId: aliases[0].id,
        })
      ).status,
      403,
    );
    const assigned = await call(faculty, "/api/assignments", "POST", {
      profileId: p.id,
      studentId: aliases[0].id,
    });
    assert.equal(assigned.status, 201);
    const a = assigned.assignment;
    assert.equal(a.kind, "individual");
    assert.equal(a.cases[0].version, p.version);
    // A subsequent release cannot change the assigned case.
    const newer = structuredClone(app.store.latest(p.id));
    newer.p.version++;
    newer.p.intro = "Changed after assignment.";
    app.store.state.releases.push(newer);
    await app.store.save();
    assert.equal(
      (await call(other, `/api/assignments/${a.id}/start`, "POST", {})).status,
      404,
    );
    const starts = await Promise.all(
      [1, 2, 3].map(() =>
        call(student, `/api/assignments/${a.id}/start`, "POST", {}),
      ),
    );
    assert.equal(new Set(starts.map((r) => r.attempt.id)).size, 1);
    const attempt = starts[0].attempt;
    assert.equal(attempt.kind, "individual");
    assert.equal(attempt.title, p.name);
    assert.equal(attempt.groupSnapshot, undefined);
    const first = (
      await call(student, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).encounter;
    assert.equal(first.version, p.version);
    assert.equal(first.groupProgress, undefined);
    assert.equal(
      (await call(other, `/api/encounters/${first.id}/export`)).status,
      404,
    );
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await open();
    await call(student, "/api/session", "POST", {
      role: "student",
      studentId: aliases[0].id,
    });
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    assert.equal(
      (await call(student, `/api/attempts/${attempt.id}/next`, "POST", {}))
        .encounter.id,
      first.id,
    );
    const completed = await call(
      student,
      `/api/encounters/${first.id}/complete`,
      "POST",
      {},
    );
    assert.equal(completed.status, 200);
    assert.ok(completed.encounter.assessment);
    assert.equal(completed.encounter.feedbackHeld, false);
    assert.equal(completed.encounter.biasAnalysis, undefined);
    assert.equal(
      (await call(student, `/api/bias/encounter/${first.id}`)).status,
      403,
    );
    const results = (await call(faculty, "/api/faculty-results")).students.find(
      (s) => s.id === aliases[0].id,
    );
    assert.ok(results.encounters.some((e) => e.id === first.id));
    assert.equal(
      results.attempts.length,
      0,
      "Single visits remain individual results",
    );
  } finally {
    if (app?.server.listening) {
      await app.store.flush();
      await new Promise((r) => app.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Four-case exploratory group is open, clinically matched, sequential and evidence-bound", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "virtusp-diverse-group-"),
  );
  const app = await createApp({ dataDir: dir }),
    store = app.store;
  try {
    const group = store.state.groups["dyslipidemia-diverse-backgrounds"];
    assert.equal(demo.groupView(store, group, true).preparationStatus, "ready");
    assert.equal(group.profileIds.length, 4);
    const cases = group.profileIds.map((id) => store.latest(id).p);
    assert.equal(new Set(cases.map((p) => p.age)).size, 4);
    assert.equal(new Set(cases.map((p) => p.education)).size, 4);
    assert.equal(new Set(cases.map((p) => p.ethnicity)).size, 4);
    assert.equal(new Set(cases.map((p) => p.gender)).size, 2);
    assert.equal(
      new Set(cases.map((p) => demo.comparisonKey(p, group))).size,
      1,
    );
    assert.ok(
      cases.every(
        (p) =>
          p.provenance.preparation.includes("Team-authored") &&
          p.original["patient-name"] === "Omar Sinclair",
      ),
    );
    const sid = Object.keys(store.state.students)[0],
      a = demo.assign(store, group.id, sid);
    const attempt = demo.start(store, a, sid);
    group.purpose = "Later catalog edit";
    for (let i = 0; i < 4; i++) {
      const e = demo.next(store, attempt);
      assert.equal(demo.next(store, attempt).id, e.id);
      const event = require("../lib/engine").event(e, "student", {
        text: "What matters to you about this plan?",
      });
      e.transcript.push({ id: event.id, role: "student", text: event.text });
      e.status = "complete";
      e.assessment = { domains: [] };
      demo.completeTrial(store, e);
      assert.equal(
        demo.assessmentReady(store, { role: "student", studentId: sid }, e),
        i === 3,
      );
    }
    const context = demo.detectorContext(store, "attempt", attempt.id);
    assert.notEqual(
      context.group.purpose,
      group.purpose,
      "Assigned comparison design is pinned",
    );
    const input = bias.inputFor(context);
    assert.equal(input.comparison.controlled, false);
    assert.equal(input.comparison.eligible, true);
    assert.ok(
      input.encounters.every(
        (e) => e.demographics.education && e.demographics.background,
      ),
    );
    assert.ok(
      input.encounters.every(
        (e) => !e.availableFacts.some((f) => f.id === "lipids"),
      ),
      "Hidden facts do not enter assessment evidence",
    );
    const evaluations = input.encounters.flatMap((e) =>
      bias.rubric.categories.map((c) => ({
        encounterId: e.id,
        categoryId: c.id,
        score: null,
        reason: "Not observed",
        evidence: [],
        coaching: "",
      })),
    );
    const evidence = input.encounters.slice(0, 2).map((e) => ({
      encounterId: e.id,
      eventId: e.events.find((v) => v.type === "student").id,
      quote: "What matters to you about this plan?",
    }));
    const candidate = {
      evaluations,
      comparisons: [
        {
          text: "Test-only evidence-linked exploratory observation; differences do not prove bias.",
          evidence,
        },
      ],
      limitations: [group.limitations],
    };
    assert.doesNotThrow(() => bias.validate(candidate, input));
    candidate.comparisons[0].evidence[0].eventId = "not-existing";
    assert.throws(() => bias.validate(candidate, input), /student action/);
    const changed = store.latest(cases[0].id).p;
    const background = changed.facts.find((f) => f.id === "background");
    background.gate = 2;
    assert.equal(
      demo.groupView(store, group, true).preparationStatus,
      "clinical-mismatch",
      "Varied backgrounds still require shared disclosure settings",
    );
    background.gate = 1;
    changed.facts.find((f) => f.id === "lipids").label =
      "Changed clinical value";
    assert.equal(
      demo.groupView(store, group, true).preparationStatus,
      "clinical-mismatch",
    );
    assert.equal(attempt.status, "complete");
  } finally {
    await store.flush();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
