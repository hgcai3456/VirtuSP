"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http");
const { client, learnerContext, replay } = require("../lib/demo-replay");
test("AI learner receives only the displayed encounter, never hidden facts or grading output", () => {
  const context = learnerContext(
    {
      name: "Synthetic",
      age: 40,
      transcript: [{ role: "patient", text: "A concern" }],
      p: { facts: [{ say: "SECRET-FACT" }] },
      assessment: { score: "SECRET-SCORE" },
      events: [{ text: "SECRET-EVENT" }],
    },
    "balanced",
    1,
    6,
  );
  assert.ok(!JSON.stringify(context).includes("SECRET"));
  assert.equal(context.conversation[0].text, "A concern");
  assert.throws(() => learnerContext({}, "bad", 1, 6));
});
test("Demo replay creates only labeled synthetic aliases, uses real encounter routes and resumes without duplicate turns", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-replay-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const faculty = client(base),
    student = client(base);
  try {
    await faculty("/api/session", "POST", { role: "faculty" });
    const human = (await faculty("/api/students")).students[0];
    const manifest = {};
    let calls = 0;
    const options = {
      faculty,
      student,
      selection: { profileId: "omar" },
      behavior: "balanced",
      runId: "test-run",
      turns: 4,
      manifest,
      save: async () => {},
      generate: async () => {
        calls++;
        return "What concerns you about medication?";
      },
    };
    const result = await replay(options);
    assert.equal(
      result.status,
      "unavailable",
      "Disabled bias model never fabricates findings",
    );
    const alias = app.store.state.students[manifest.studentId];
    assert.equal(alias.aiDemo, true);
    assert.match(alias.alias, /AI demo/);
    const enc = app.store.state.encounters[manifest.encounterIds[0]];
    assert.equal(enc.studentId, manifest.studentId);
    assert.equal(enc.status, "complete");
    assert.ok(enc.interviewStartedAt, "Replay starts the interview clock before learner turns");
    assert.equal(enc.transcript.filter((t) => t.role === "student").length, 4);
    assert.ok(enc.events.some((e) => e.type === "student"));
    assert.ok(enc.assessment);
    assert.equal(calls, 4);
    await replay(options);
    assert.equal(calls, 4);
    assert.equal(Object.keys(app.store.state.encounters).length, 1);
    assert.deepEqual(app.store.state.students[human.id], human);
    const humanClient = client(base);
    await humanClient("/api/session", "POST", {
      role: "student",
      studentId: human.id,
    });
    await assert.rejects(
      humanClient(`/api/encounters/${enc.id}`),
      /not found|do not have access/i,
    );
    await assert.rejects(
      humanClient(`/api/bias/encounter/${enc.id}`),
      /faculty/i,
    );
    await assert.rejects(
      replay({ ...options, manifest: { studentId: human.id } }),
      /never a human student/,
    );
    const group = (await faculty("/api/groups")).groups.find(
      (g) => g.id === "dyslipidemia-diverse-backgrounds",
    );
    const groupManifest = {};
    await replay({
      ...options,
      selection: { groupId: group.id, trialCount: group.trialCount },
      runId: "group-run",
      manifest: groupManifest,
    });
    assert.equal(groupManifest.encounterIds.length, 4);
    assert.equal(
      app.store.state.attempts[groupManifest.attemptId].status,
      "complete",
    );
    const n = Object.keys(app.store.state.encounters).length;
    await replay({
      ...options,
      selection: { groupId: group.id, trialCount: group.trialCount },
      runId: "group-run",
      manifest: groupManifest,
    });
    assert.equal(Object.keys(app.store.state.encounters).length, n);
  } finally {
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
