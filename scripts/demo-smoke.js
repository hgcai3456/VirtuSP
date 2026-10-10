"use strict";
// Isolated synthetic integration run. Test approvals are not faculty clinical review.
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const path = require("node:path"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const { createApp } = require("../lib/http");
async function main() {
  process.env.AI_ENABLED = "true";
  process.env.S3_PREFIX = `virtusp-group-smoke/${Date.now()}`;
  const dir = path.join(__dirname, "../tmp", `group-smoke-${Date.now()}`),
    app = await createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie = "";
    return async (url, method = "GET", body) => {
      const r = await fetch(base + url, {
        method,
        headers: {
          Cookie: cookie,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data;
    };
  }
  const faculty = client(),
    student = client(),
    report = { model: require("../lib/cloud").model(), trials: [] };
  try {
    await faculty("/api/session", "POST", { role: "faculty" });
    const people = (await faculty("/api/students")).students,
      group = (await faculty("/api/groups")).groups[0];
    for (const c of group.cases) {
      const p = (await faculty(`/api/profiles/${c.profileId}`)).profile;
      p.reviewAcknowledged = true;
      await faculty(`/api/profiles/${p.id}`, "PUT", { profile: p });
      await faculty(`/api/profiles/${p.id}/publish`, "POST", {});
    }
    const a = (
      await faculty("/api/assignments", "POST", {
        groupId: group.id,
        studentId: people[0].id,
      })
    ).assignment;
    await student("/api/session", "POST", {
      role: "student",
      studentId: people[0].id,
    });
    const attempt = (
      await student(`/api/assignments/${a.id}/start`, "POST", {})
    ).attempt;
    for (let i = 0; i < 2; i++) {
      let e = (await student(`/api/attempts/${attempt.id}/next`, "POST", {}))
        .encounter;
      const providers = [];
      for (const [n, q] of [
        "Hello",
        "What concerns you about taking medication?",
        "Are you allergic to penicillin?",
      ].entries()) {
        e = (
          await student(`/api/encounters/${e.id}/turn`, "POST", {
            question: q,
            requestId: `smoke-${n}`,
          })
        ).encounter;
        const last = e.transcript.at(-1);
        providers.push(last.provider);
        assert.ok(!JSON.stringify(e).includes("LDL 195"));
        if (n === 1) assert.ok(last.factIds.includes("concern"));
        if (n === 2) assert.equal(last.factIds.length, 0);
      }
      assert.ok(
        providers.includes("bedrock"),
        "No real Bedrock patient reply was delivered",
      );
      e = (await student(`/api/encounters/${e.id}/complete`, "POST", {}))
        .encounter;
      if (i === 0) assert.equal(e.assessment, null);
      else assert.ok(e.assessment);
      const assessment = (await faculty(`/api/encounters/${e.id}`)).encounter
        .assessment;
      report.trials.push({
        ethnicity: e.ethnicity,
        providers,
        assessmentProvider: assessment.provider,
        assessmentFailure: assessment.failure || null,
        feedbackHeld: e.feedbackHeld,
      });
    }
    await app.store.flush();
    report.storage = app.store.sync.status;
    if (process.env.S3_BUCKET) assert.equal(report.storage, "synced");
    assert.equal(
      (await faculty(`/api/attempts/${attempt.id}`)).biasAnalysis.status,
      "pending",
    );
    await fs.mkdir(path.join(__dirname, "../output"), { recursive: true });
    await fs.writeFile(
      path.join(__dirname, "../output/group-smoke.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
  }
}
main().catch((e) => {
  console.error(e.name + ": " + e.message);
  process.exitCode = 1;
});
