"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { blank, fact, validate, documentAwarenessFacts } = require("../lib/profiles");
const engine = require("../lib/engine");
const cloud = require("../lib/cloud");
const caseRubric = require("../lib/caseRubric");
const { assess } = require("../lib/assessment");

function profile(extra = {}) {
  return {
    ...blank(),
    id: "boundary-patient",
    name: "Riley Boundary",
    version: 1,
    age: 12,
    reviewAcknowledged: true,
    facts: [
      fact("concern", "Wheeze after running", {
        say: "I wheeze after I run.",
        topic: "Reason for visit",
        kw: ["bring", "wheeze", "asthma"],
      }),
      fact("secret", "Inhaler left at school", {
        say: "I left my inhaler at school.",
        topic: "Inhaler access",
        kw: ["inhaler", "school"],
        gate: 1,
        deflect: "I would rather not discuss that yet.",
      }),
    ],
    artifacts: [
      {
        id: "ecg-1",
        title: "Historical ECG",
        sec: "labs",
        release: "question",
        unlock: ["ecg"],
        facts: [],
        src: "faculty",
      },
    ],
    obj: [],
    sources: [],
    rapport: ["I understand this is difficult"],
    ...extra,
  };
}

test("A published finding is answerable from its topic when keywords were left blank", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(
    profile({
      facts: [
        fact("nights", "Night schedule", {
          say: "My schedule changed to nights last month.",
          topic: "Work schedule",
          kw: [],
        }),
      ],
    }),
  );
  await engine.ask(enc, "What changed with your work schedule?", "schedule");
  assert.equal(
    enc.transcript.at(-1).text,
    "My schedule changed to nights last month.",
  );
  await engine.ask(enc, "Did you have a stroke last year?", "stroke");
  assert.equal(enc.transcript.at(-1).factIds.length, 0);
  assert.ok(engine.isUnknownReply(enc.transcript.at(-1).text));
  assert.doesNotMatch(enc.transcript.at(-1).text, /stroke/i);
});

test("Empty citations reject unsupported facts and still allow a courtesy", () => {
  for (const text of [
    "I suffered a stroke last year.",
    "I smoke every day.",
    "My mother died of a stroke.",
    "I had a mild heart attack in March.",
    "My brother takes insulin.",
    "No allergies.",
    "Yeah, honestly I've had a cough for two weeks now.",
  ])
    assert.equal(
      engine.validResponse({ text, factIds: [] }, [], []),
      false,
      text,
    );
  assert.equal(
    engine.validResponse({ text: "Hello.", factIds: [] }, [], []),
    true,
  );
  assert.equal(
    engine.validResponse(
      { text: "I wheeze after I run.", factIds: ["concern"] },
      [{ id: "concern", say: "I wheeze after I run." }],
      [],
    ),
    true,
  );
});

test("The encounter ignores model prose and keeps approved wording", async () => {
  const saved = { ...cloud };
  const prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  try {
    cloud.guard = async () => {};
    cloud.select = async () => ({
      factIds: [],
      empathy: true,
      openQuestion: false,
      judgmental: false,
    });
    let paraphrased = 0;
    cloud.paraphrase = async () => {
      paraphrased += 1;
      return { text: "I suffered a stroke last year.", factIds: [] };
    };
    const enc = engine.create(profile());
    await engine.ask(enc, "Tell me something about your health.", "stroke");
    const turn = enc.transcript.at(-1);
    assert.equal(paraphrased, 0);
    assert.equal(turn.generatedText, false);
    assert.equal(turn.textSource, "server-constructed");
    assert.equal(turn.caseVersion, 1);
    assert.doesNotMatch(turn.text, /stroke|smoke|mother|insulin/i);
    assert.equal(enc.trust, 0);
    await engine.ask(enc, "What brings you in?", "concern");
    assert.equal(enc.transcript.at(-1).text, "I wheeze after I run.");
    assert.equal(enc.transcript.at(-1).responseMode, "approved-fact");
    await engine.ask(enc, "Hello", "hi");
    assert.equal(enc.transcript.at(-1).text, "Hello.");
    assert.equal(enc.transcript.at(-1).responseMode, "courtesy");
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});

test("Politeness does not open a guarded fact, and one authored phrase counts once", async () => {
  process.env.AI_ENABLED = "false";
  const enc = engine.create(profile());
  for (const [question, id] of [
    ["Thank you", "thanks"],
    ["I am sorry", "sorry"],
    ["I understand. Where is your inhaler?", "short"],
  ]) {
    await engine.ask(enc, question, id);
    assert.equal(enc.trust, 0);
    assert.equal(enc.disclosed.secret, undefined);
  }
  assert.equal(
    enc.transcript.find((t) => t.role === "patient" && t.text.includes("inhaler")),
    undefined,
  );
  await engine.ask(
    enc,
    "I understand this is difficult. Where is your inhaler?",
    "open",
  );
  assert.equal(enc.trust, 1);
  assert.equal(enc.transcript.at(-1).text, "I left my inhaler at school.");
  await engine.ask(
    enc,
    "I understand this is difficult. Where is your inhaler?",
    "again",
  );
  assert.equal(enc.trust, 1);
});

test("Unspecified allergy stays unknown and a documented negative stays distinct", async () => {
  process.env.AI_ENABLED = "false";
  const unspecified = engine.create(profile());
  await engine.ask(unspecified, "Do you have any allergies?", "none");
  assert.ok(engine.isUnknownReply(unspecified.transcript.at(-1).text));
  assert.doesNotMatch(unspecified.transcript.at(-1).text, /no known allergies|no allergies/i);
  const documented = engine.create(
    profile({
      facts: [
        fact("allergy", "No known drug allergies", {
          say: "I have no known drug allergies.",
          topic: "Drug allergies",
          kw: ["allerg"],
        }),
      ],
    }),
  );
  await engine.ask(documented, "Do you have any allergies?", "negative");
  assert.equal(documented.transcript.at(-1).text, "I have no known drug allergies.");
  assert.equal(engine.isUnknownReply(documented.transcript.at(-1).text), false);
});

test("A pediatric asthma case does not receive the hearing rubric", () => {
  const asthma = profile();
  assert.equal(caseRubric.forProfile(asthma), null);
  assert.equal(caseRubric.suggest(asthma).id, "pediatric-hearing-treatment");
  assert.equal(caseRubric.forProfile({ ...asthma, caseRubric: "pediatric-hearing-treatment" }).id, "pediatric-hearing-treatment");
  const hearing = documentAwarenessFacts([
    { id: "ecg-1", title: "Historical ECG", sec: "labs" },
  ])[0];
  assert.equal(hearing.reviewed, false);
  assert.doesNotMatch(hearing.say, /recently/);
});

test("Assessment failure is not a score of 1, and a supported 1 still triggers review", async () => {
  const saved = { ...cloud };
  const prior = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "false";
  try {
    const enc = engine.create(profile({ age: 34, rubricApplicable: [1, 2, 3, 4, 5, 6, 7] }));
    await engine.ask(enc, "What brings you in?", "q");
    await engine.complete(enc);
    assert.ok(enc.assessment.domains.every((d) => d.status === "not_assessed" && d.score === null));
    assert.equal(enc.assessment.total, null);
    assert.equal(enc.assessment.reviewRequired, false);
    assert.equal(enc.assessment.concerns.length, 0);
    process.env.AI_ENABLED = "true";
    const student = enc.events.find((e) => e.type === "student").id;
    cloud.rephrase = async () => ({ rewrites: [] });
    cloud.rubric = async () => {
      throw new Error("timeout");
    };
    const failed = await assess(enc);
    assert.equal(failed.pending, true);
    assert.equal(failed.total, null);
    assert.equal(failed.reviewRequired, false);
    assert.ok(failed.domains.every((d) => d.score !== 1));
    cloud.rubric = async () => ({
      domains: [1, 2, 3, 4, 5, 6, 7].map((domain) => ({
        domain,
        score: domain === 6 ? 1 : 3,
        reason: domain === 6 ? "Not observed." : "Observed in the visit.",
        evidence: domain === 6 ? [] : [student],
        next: "Try a fuller history next time.",
      })),
      strengths: [{ text: "Asked the concern.", evidence: [student] }],
      gaps: [],
      concerns: [],
    });
    cloud.json = async () => ({ supported: true, reason: "" });
    const scored = await assess(enc);
    assert.equal(scored.pending, false);
    assert.equal(scored.domains.find((d) => d.domain === 6).status, "assessed");
    assert.equal(scored.domains.find((d) => d.domain === 6).score, 1);
    assert.equal(scored.reviewRequired, true);
    assert.equal(scored.denominator, 28);
    const original = structuredClone(scored.domains);
    enc.assessment = scored;
    engine.reviewAssessment(enc, {
      domain: 6,
      decision: "accept",
      reviewer: { type: "demo-alias", id: "faculty-demo" },
    });
    assert.equal(enc.assessment.domains[5].review.reviewerType, "demo-alias");
    assert.deepEqual(
      enc.assessment.modelDraft.find((d) => d.domain === 6).score,
      original.find((d) => d.domain === 6).score,
    );
  } finally {
    Object.assign(cloud, saved);
    process.env.AI_ENABLED = prior || "false";
  }
});

test("A later edit does not change the running encounter, and repeats do not inflate trust", async () => {
  process.env.AI_ENABLED = "false";
  const source = profile({ version: 3 });
  const enc = engine.create(source);
  source.facts[0].say = "I have a new diagnosis.";
  source.version = 9;
  source.caseRubric = "pediatric-hearing-treatment";
  await engine.ask(enc, "What brings you in?", "one");
  assert.equal(enc.transcript.at(-1).text, "I wheeze after I run.");
  assert.equal(enc.p.version, 3);
  assert.equal(enc.p.caseRubric, "");
  const before = enc.transcript.length;
  await Promise.all([
    engine.ask(enc, "What brings you in?", "one"),
    engine.ask(enc, "What brings you in?", "two"),
  ]);
  assert.equal(enc.transcript.filter((t) => t.role === "student").length, 2);
  assert.ok(enc.transcript.length >= before);
  assert.equal(enc.trust, 0);
});

test("Faculty can publish a new case and the encounter speaks only approved lines", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-boundary-"));
  const { createApp } = require("../lib/http");
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = await require("./http-client").facultyClient(base);
  const call = async (url, payload, method = payload ? "POST" : "GET") => {
    const response = await client(base + url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    return { httpStatus: response.status, body };
  };
  try {
    const drafted = profile({
      id: "new-case-jordan",
      name: "Jordan Vale",
      age: 34,
      intro: "Hi, I'm Jordan.",
    });
    drafted.artifacts = [];
    assert.equal(validate(drafted).some((issue) => issue.severity === "error"), false);
    const created = await call("/api/profiles", { profile: drafted, publish: true });
    assert.equal(created.httpStatus, 201);
    assert.equal(created.body.version, 1);
    const started = await call("/api/encounters", { profileId: drafted.id, version: 1 });
    assert.equal(started.httpStatus, 201);
    const id = started.body.encounter.id;
    const approved = await call(`/api/encounters/${id}/turn`, {
      question: "What brings you in?",
      requestId: "turn-approved",
    });
    assert.equal(approved.httpStatus, 200);
    assert.equal(approved.body.encounter.transcript.at(-1).text, "I wheeze after I run.");
    assert.equal(approved.body.encounter.transcript.at(-1).generatedText, false);
    const blocked = await call(`/api/encounters/${id}/turn`, {
      question: "Did you have a stroke last year, and do you smoke every day?",
      requestId: "turn-blocked",
    });
    assert.equal(blocked.body.encounter.transcript.at(-1).factIds.length, 0);
    assert.doesNotMatch(
      blocked.body.encounter.transcript.at(-1).text,
      /stroke|smoke|mother|inhaler/i,
    );
    const spoken = blocked.body.encounter.transcript
      .filter((turn) => turn.role === "patient")
      .map((turn) => turn.text)
      .join("\n");
    assert.doesNotMatch(spoken, /left my inhaler|stroke last year|smoke every day/i);
    const hidden = await call(`/api/encounters/${id}/artifacts/missing/file`);
    assert.equal(hidden.httpStatus, 403);
    const done = await call(`/api/encounters/${id}/complete`, {});
    assert.equal(done.httpStatus, 200);
    assert.equal(done.body.encounter.assessment.pending, true);
    assert.equal(done.body.encounter.assessment.total, null);
    assert.ok(done.body.encounter.assessment.coaching.findings);
    const exported = await call(`/api/encounters/${id}/export`);
    assert.equal(exported.httpStatus, 200);
    assert.equal(JSON.stringify(exported.body).includes("left my inhaler"), false);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
