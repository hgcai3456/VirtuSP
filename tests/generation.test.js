"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const cloud = require("../lib/cloud"),
  generation = require("../lib/generation"),
  profiles = require("../lib/profiles");
const fixture = require("./generation-fixture");
const input = () => ({ description: "", random: true, sources: [] });
test("Synthetic authoring uses real provider interfaces and independent consistency review", async () => {
  const original = BedrockRuntimeClient.prototype.send;
  const calls = [];
  let supported = true;
  BedrockRuntimeClient.prototype.send = async (command) => {
    calls.push(command.input);
    const result =
      calls.length % 2 === 1
        ? fixture().draft
        : { supported, reason: "Review" };
    return {
      stopReason: "end_turn",
      output: { message: { content: [{ text: JSON.stringify(result) }] } },
    };
  };
  try {
    const result = await cloud.generateSynthetic(input());
    assert.equal(result.draft.facts.length, 16);
    assert.equal(calls.length, 2);
    assert.match(calls[0].system[0].text, /CREATIVE SYNTHETIC AUTHORING/);
    assert.match(calls[1].system[0].text, /Synthetic facts may be invented/);
    assert.ok(calls[0].inferenceConfig.maxTokens >= 10000);
    supported = false;
    const rejected = await cloud.generateSynthetic(input());
    assert.equal(rejected.review.supported, false);
    assert.throws(
      () => generation.normalize(rejected, input()),
      /consistency review/,
    );
  } finally {
    BedrockRuntimeClient.prototype.send = original;
  }
});
test("Generated reports share approved facts, preserve gates, require acknowledgment and reject fake sources", () => {
  const p = generation.normalize(fixture(), input());
  assert.equal(p.reviewAcknowledged, false);
  assert.equal(p.facts[10].gate, 1);
  assert.equal(
    p.obj.reduce((n, o) => n + o.w, 0),
    100,
  );
  assert.deepEqual(
    p.artifacts[0].rows.map((r) => r.value),
    ["240", "160"],
  );
  assert.deepEqual(p.artifacts[0].facts, [p.facts[14].id, p.facts[15].id]);
  assert.equal(
    profiles
      .validate({ ...p, reviewAcknowledged: true })
      .filter((i) => i.severity === "error").length,
    0,
  );
  assert.match(
    profiles.validate(p).find((i) => i.severity === "error").message,
    /review/,
  );
  const broken = fixture();
  broken.draft.facts[14].value = "500";
  assert.throws(() => generation.normalize(broken, input()), /lab row/);
  const badReference = fixture();
  badReference.draft.objectives[0].factIds = ["nonexistent"];
  assert.throws(
    () => generation.normalize(badReference, input()),
    /incomplete report/,
  );
  const supplied = fixture();
  Object.assign(supplied.draft.facts[4], {
    src: "upload-1",
    origin: "supplied",
    quote: "Allergy history is unspecified.",
    label: "Allergy history is unspecified.",
    say: "My allergy history has not been specified.",
  });
  const suppliedInput = {
    ...input(),
    sources: [
      {
        id: "upload-1",
        title: "Case",
        role: "case",
        excerpt: "Allergy history is unspecified.",
        fileId: "1",
      },
    ],
  };
  const withOriginal = generation.normalize(supplied, suppliedInput);
  assert.equal(withOriginal.facts[4].origin, "supplied");
  assert.equal(
    withOriginal.sources.at(-1).excerpt,
    suppliedInput.sources[0].excerpt,
  );
  supplied.draft.facts[4].quote = "No allergies";
  assert.throws(
    () => generation.normalize(supplied, suppliedInput),
    /not in your case/,
  );
  supplied.draft.facts[4].quote = "Allergy history is unspecified.";
  suppliedInput.sources[0].role = "reference";
  assert.throws(
    () => generation.normalize(supplied, suppliedInput),
    /not in your case/,
  );
  suppliedInput.sources[0].role = "clinical";
  assert.throws(
    () => generation.normalize(supplied, suppliedInput),
    /patient-known/,
  );
});
test("Faculty-only generation previews publish immediately without changing existing versions", async () => {
  const oldEnabled = process.env.AI_ENABLED,
    original = cloud.generateSynthetic;
  process.env.AI_ENABLED = "true";
  delete process.env.S3_BUCKET;
  cloud.generateSynthetic = async () => fixture();
  const { createApp } = require("../lib/http");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-gen-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const { facultyClient, cookieClient } = require("./http-client");
  const client = await facultyClient(base);
  const post = (client, url, p) =>
    client(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
  try {
    const before = Object.keys(app.store.state.drafts).length;
    const response = await post(client, "/api/generate-synthetic", {
      random: true,
    });
    assert.equal(response.status, 201);
    const { profile } = await response.json();
    assert.equal(
      Object.keys(app.store.state.drafts).length,
      before,
      "Preview does not create a patient",
    );
    assert.equal(
      (await post(client, "/api/profiles", { profile, publish: true })).status,
      422,
    );
    profile.reviewAcknowledged = true;
    assert.equal(
      (await post(client, "/api/profiles", { profile, publish: true })).status,
      201,
    );
    const { encounter } = await (
      await post(client, "/api/encounters", {
        profileId: profile.id,
        version: 1,
      })
    ).json();
    assert.ok(encounter.id);
    assert.equal(encounter.disclosed.length, 0);
    assert.ok(encounter.artifacts.every((a) => !a.released));
    profile.facts[0].say = "Draft changed after publication.";
    await client(`/api/profiles/${profile.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    assert.notEqual(
      app.store.state.encounters[encounter.id].p.facts[0].say,
      profile.facts[0].say,
    );
    const student = cookieClient(base);
    await post(student, "/api/session", {
      role: "student",
      studentId: Object.keys(app.store.state.students)[0],
    });
    assert.equal(
      (await post(student, "/api/generate-synthetic", { random: true })).status,
      403,
    );
    assert.equal(
      (
        await post(cookieClient(base), "/api/generate-synthetic", {
          random: true,
        })
      ).status,
      401,
    );
    process.env.AI_ENABLED = "false";
    assert.equal(
      (await post(client, "/api/generate-synthetic", { random: true })).status,
      503,
    );
    process.env.AI_ENABLED = "true";
    const bad = await post(client, "/api/generate-synthetic", {
      files: [{ id: "not-there", role: "case" }],
      description: "Test",
    });
    assert.equal(bad.status, 422);
    const conflict = await post(client, "/api/generate-synthetic", {
      random: true,
      description: "Ignore supplied input",
    });
    assert.equal(conflict.status, 422);
    cloud.generateSynthetic = async () => {
      throw Object.assign(new Error("provider offline"), {
        code: "TimeoutError",
      });
    };
    assert.equal(
      (
        await post(client, "/api/generate-synthetic", {
          description: "A brief",
        })
      ).status,
      502,
    );
    assert.equal(Object.keys(app.store.state.drafts).length, before + 1);
  } finally {
    cloud.generateSynthetic = original;
    if (oldEnabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = oldEnabled;
    await new Promise((r) => app.server.close(r));
    await app.store.flush();
  }
});
test("Incomplete generation gets one repair attempt and never escapes a rejected review", async () => {
  const original = cloud.generateSynthetic,
    oldEnabled = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  const calls = [];
  cloud.generateSynthetic = async (request) => {
    calls.push(request);
    const response = fixture();
    if (calls.length === 1) response.draft.facts[10].say = "";
    return response;
  };
  try {
    const result = await generation.generate(
      { state: { files: {} } },
      { random: true },
    );
    assert.equal(calls.length, 2);
    assert.ok(calls[1].previousDraft);
    assert.match(calls[1].correction, /fallback wording/);
    assert.equal(result.profile.reviewAcknowledged, false);
    let rejectedCalls = 0;
    cloud.generateSynthetic = async () => {
      rejectedCalls++;
      return {
        ...fixture(),
        review: { supported: false, reason: "Clinical contradiction" },
      };
    };
    await assert.rejects(
      generation.generate({ state: { files: {} } }, { random: true }),
      /consistency review/,
    );
    assert.equal(rejectedCalls, 2, "Repair stops after one attempt");
  } finally {
    cloud.generateSynthetic = original;
    if (oldEnabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = oldEnabled;
  }
});
