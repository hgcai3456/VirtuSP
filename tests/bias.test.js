"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createHash } = require("node:crypto");
const bias = require("../lib/bias"),
  cloud = require("../lib/cloud"),
  engine = require("../lib/engine"),
  demo = require("../lib/demo");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
const seeds = require("../corpus/prepared-groups.json");
function context(group = false) {
  const encounters = seeds.profiles.slice(0, group ? 2 : 1).map((p, i) => {
    const e = engine.create({ ...structuredClone(p), version: 1 });
    e.id = `enc-${i}`;
    e.status = "complete";
    const v = engine.event(e, "student", {
      text: "What concerns would you like us to address today?",
    });
    e.transcript.push({ id: v.id, role: "student", text: v.text });
    return {
      id: e.id,
      status: e.status,
      profile: e.p,
      events: e.events,
      transcript: e.transcript,
    };
  });
  return {
    targetType: group ? "attempt" : "encounter",
    targetId: group ? "group-1" : encounters[0].id,
    group: group ? { ...seeds.groups[0], kind: "comparison" } : null,
    attempt: group
      ? {
          status: "complete",
          trials: encounters.map((e) => ({ encounterId: e.id })),
        }
      : null,
    encounters,
  };
}
function candidate(input) {
  return {
    evaluations: input.encounters.flatMap((e) =>
      bias.rubric.categories.map((c) => ({
        encounterId: e.id,
        categoryId: c.id,
        score: c.id === "demographic" ? 3 : null,
        reason:
          c.id === "demographic"
            ? "Invites the patient's concerns without a demographic assumption."
            : "Insufficient opportunity in this short encounter to observe this category.",
        evidence:
          c.id === "demographic"
            ? [
                {
                  encounterId: e.id,
                  eventId: e.events.find((v) => v.type === "student").id,
                  quote: e.transcript.find((t) => t.role === "student").text,
                },
              ]
            : [],
        coaching: "",
      })),
    ),
    comparisons: [],
    limitations: [
      "Short synthetic test interaction; ratings are test fixtures.",
    ],
  };
}
test("Supplied rubric provenance, performance scale and explicit application extensions", async () => {
  const bytes = await fs.readFile(
    path.join(__dirname, "../corpus", bias.rubric.source.file),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    bias.rubric.source.sha256,
  );
  assert.equal(bias.rubric.categories.length, 5);
  assert.equal(bias.rubric.scale[1], "Unsatisfactory");
  assert.equal(bias.rubric.scale[4], "Exemplary");
  assert.ok(
    bias.rubric.categories.every(
      (c) => Object.keys(c.descriptors).length === 4,
    ),
  );
  assert.match(bias.rubric.applicationPolicy.notObservable, /extension/);
  assert.match(bias.rubric.applicationPolicy.totals, /no aggregate/);
});
test("Bias context excludes undisclosed facts, original case documents and automated judgments", () => {
  const c = context(true),
    e = c.encounters[0];
  e.profile.facts.push({
    id: "secret",
    say: "Hidden diagnosis 987",
    label: "hidden",
    gate: 3,
  });
  e.profile.sources.push(
    { id: "case-document", excerpt: "Hidden diagnosis 987" },
    { role: "reference", title: "Teaching", excerpt: "Shared decisions" },
  );
  e.events.push(
    { id: "gate-test", type: "gate", text: "hidden rejected" },
    { id: "flag", type: "communication", text: "judgmental" },
  );
  const input = bias.inputFor(c);
  assert.equal(input.encounters[0].availableFacts.length, 0);
  assert.ok(!JSON.stringify(input).includes("Hidden diagnosis 987"));
  assert.ok(
    !input.encounters[0].events.some(
      (v) => v.id === "flag" || v.id === "gate-test",
    ),
  );
  assert.equal(
    input.encounters[0].teachingReferences.at(-1).excerpt,
    "Shared decisions",
  );
  assert.equal(
    input.comparison.controlled,
    false,
    "Unmatched snapshots cannot support a comparison",
  );
  const clean = context(true);
  assert.equal(bias.inputFor(clean).comparison.controlled, true);
  clean.encounters[0].profile.facts[0].reviewed = true;
  assert.equal(
    bias.inputFor(clean).comparison.controlled,
    true,
    "Review bookkeeping does not change matched clinical content",
  );
  const fact = clean.encounters[0].profile.facts[0];
  clean.encounters[0].transcript.push({
    id: "reply",
    role: "patient",
    text: fact.say,
    factIds: [fact.id],
    provider: "bedrock",
  });
  assert.equal(
    bias.inputFor(clean).encounters[0].availableFacts[0].say,
    fact.say,
  );
  const report = clean.encounters[0].profile.artifacts[0];
  const release = {
    id: "released-report",
    type: "release",
    artifactId: report.id,
    at: "2026-10-10T12:00:00Z",
  };
  clean.encounters[0].events.push(release);
  const exposed = bias
    .inputFor(clean)
    .encounters[0].availableFacts.find((v) => v.id === report.facts[0]);
  assert.deepEqual(exposed.availableAt, [
    { eventId: release.id, at: release.at },
  ]);
});
test("Bias ratings reject fabricated quotes, wrong-trial evidence and unsupported comparisons", () => {
  const input = bias.inputFor(context(true)),
    valid = candidate(input);
  assert.equal(bias.validate(valid, input), valid);
  for (const mutate of [
    (v) => (v.evaluations[2].evidence[0].quote = "Words never spoken"),
    (v) => (v.evaluations[2].evidence[0].eventId = "invented"),
    (v) => (v.evaluations[2].evidence[0].encounterId = input.encounters[1].id),
    (v) =>
      (v.evaluations[2].evidence[0].eventId = input.encounters[0].events[0].id),
    (v) => (v.evaluations[2].score = 5),
    (v) => v.evaluations.push(v.evaluations[0]),
    (v) => v.evaluations.pop(),
    (v) => (v.evaluations[2].evidence = []),
    (v) => (v.evaluations[2].evidence = [null]),
    (v) =>
      v.comparisons.push({
        text: "Difference",
        evidence: v.evaluations[2].evidence,
      }),
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => bias.validate(invalid, input));
  }
  const comparison = {
    text: "Possible difference; trial order is a confound.",
    evidence: [
      valid.evaluations[2].evidence[0],
      valid.evaluations[7].evidence[0],
    ],
  };
  bias.validate({ ...valid, comparisons: [comparison] }, input);
  assert.throws(() =>
    bias.validate(
      { ...valid, comparisons: [comparison] },
      { ...input, comparison: { controlled: false } },
    ),
  );
});
test("Bedrock analysis requires grounding approval, preserves unknowns, caches unchanged evidence and fails without fabricated scores", async () => {
  const original = {
    enabled: cloud.enabled,
    bias: cloud.bias,
    json: cloud.json,
  };
  let calls = 0;
  cloud.enabled = () => true;
  cloud.bias = async (input) => {
    calls++;
    return candidate(input);
  };
  cloud.json = async () => ({ supported: true, reason: "Test audit" });
  try {
    const c = context(true),
      result = await bias.analyze(c);
    assert.equal(result.status, "complete");
    assert.equal(result.rubricAssessment.evaluations.length, 10);
    assert.equal(result.rubricAssessment.comparisonControlled, true);
    assert.ok(
      result.rubricAssessment.evaluations.some((v) => v.score === null),
    );
    bias.validateSaved(result.rubricAssessment, c);
    assert.equal(await bias.analyze(c, result), result);
    assert.equal(calls, 1);
    assert.throws(
      () => bias.validateSaved(result.rubricAssessment, context(true)),
      /metadata/,
    );
    c.encounters[0].status = "active";
    await assert.rejects(bias.analyze(c), { status: 409 });
    c.encounters[0].status = "complete";
    cloud.json = async () => ({
      supported: false,
      reason: "Unsupported judgment",
    });
    const rejected = await bias.analyze(c);
    assert.equal(rejected.status, "unavailable");
    assert.equal(rejected.rubricAssessment, undefined);
    assert.deepEqual(rejected.findings, []);
    cloud.enabled = () => false;
    assert.equal((await bias.analyze(c)).status, "unavailable");
  } finally {
    Object.assign(cloud, original);
  }
});
test("Faculty-only individual/group bias APIs protect students, completed targets, evidence and recovery", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-bias-"));
  let app, base;
  const original = {
    enabled: cloud.enabled,
    bias: cloud.bias,
    json: cloud.json,
  };
  const start = async () => {
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
    return { ...(await res.json()), status: res.status };
  };
  try {
    await start();
    const studentId = Object.keys(app.store.state.students)[0];
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(student, "/api/session", "POST", { role: "student", studentId });
    assert.equal(
      (await call(faculty, "/api/bias/rubric")).rubric.categories.length,
      5,
    );
    const pdf = await faculty("/api/bias/rubric/file");
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    for (const url of [
      "/api/bias/rubric",
      "/api/bias/rubric/file",
      "/api/bias/encounter/fake/context",
    ])
      assert.equal((await student(url)).status, 403);
    const groupId = Object.keys(app.store.state.groups)[0];
    const assignment = (
      await call(faculty, "/api/assignments", "POST", { studentId, groupId })
    ).assignment;
    const attempt = (
      await call(student, `/api/assignments/${assignment.id}/start`, "POST", {})
    ).attempt;
    const first = (
      await call(student, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).encounter;
    assert.equal(first.commonPresentation, false);
    assert.ok(first.videoUrl);
    assert.notEqual(first.portrait, "patient.jpg");
    assert.ok(
      [501, 503].includes(
        (await call(student, `/api/encounters/${first.id}/talking-video`))
          .status,
      ),
    );
    assert.equal(
      (
        await call(
          faculty,
          `/api/bias/encounter/${first.id}/analyze`,
          "POST",
          {},
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          faculty,
          `/api/bias/attempt/${attempt.id}/analyze`,
          "POST",
          {},
        )
      ).status,
      409,
    );
    // Record synthetic completed trials directly; this test isolates analysis rather than inference.
    const finish = (id) => {
      const e = app.store.state.encounters[id];
      const v = engine.event(e, "student", {
        text: "What concerns would you like us to address today?",
      });
      e.transcript.push({ id: v.id, role: "student", text: v.text });
      e.status = "complete";
      e.assessment = { domains: [], total: 0, denominator: 0 };
      demo.completeTrial(app.store, e);
    };
    finish(first.id);
    cloud.enabled = () => true;
    cloud.bias = async (input) => candidate(input);
    cloud.json = async () => ({ supported: true });
    const single = (
      await call(faculty, `/api/bias/encounter/${first.id}/analyze`, "POST", {})
    ).biasAnalysis;
    assert.equal(single.status, "complete");
    assert.equal(single.rubricAssessment.evaluations.length, 5);
    assert.equal(
      (await call(student, `/api/encounters/${first.id}`)).encounter.assessment,
      null,
      "Standard group feedback is still held",
    );
    const second = (
      await call(student, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).encounter;
    assert.equal(second.commonPresentation, false);
    assert.ok(second.videoUrl);
    assert.ok(second.portrait);
    finish(second.id);
    const result = (
      await call(faculty, `/api/bias/attempt/${attempt.id}/analyze`, "POST", {})
    ).biasAnalysis;
    assert.equal(result.status, "complete");
    assert.equal(result.rubricAssessment.evaluations.length, 10);
    for (const typeId of [`encounter/${first.id}`, `attempt/${attempt.id}`]) {
      for (const [method, suffix] of [
        ["GET", ""],
        ["GET", "/context"],
        ["POST", "/analyze"],
        ["PUT", ""],
      ])
        assert.equal(
          (
            await call(
              student,
              `/api/bias/${typeId}${suffix}`,
              method,
              method === "GET" ? undefined : {},
            )
          ).status,
          403,
        );
    }
    for (const url of [
      "/api/encounters",
      `/api/encounters/${first.id}`,
      `/api/attempts/${attempt.id}`,
      `/api/encounters/${first.id}/export`,
    ]) {
      const response = await student(url);
      assert.equal(response.status, 200);
      assert.ok(!(await response.text()).includes("rubricAssessment"), url);
    }
    const forged = structuredClone(single);
    forged.rubricAssessment.evaluations[2].evidence[0].quote =
      "invented quotation";
    assert.equal(
      (await call(faculty, `/api/bias/encounter/${first.id}`, "PUT", forged))
        .status,
      400,
    );
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await start();
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    assert.equal(
      (await call(faculty, `/api/bias/attempt/${attempt.id}`)).biasAnalysis
        .rubricAssessment.evaluations.length,
      10,
    );
  } finally {
    Object.assign(cloud, original);
    if (app) {
      await app.store.flush();
      await new Promise((r) => app.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
