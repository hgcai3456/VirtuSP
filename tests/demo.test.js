"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../lib/http");
const { cookieClient } = require("./http-client");
const speech = require("../lib/speech");
test("Prepared groups: role boundaries, pinning, sequential resume, delayed feedback, evidence and recovery", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  delete process.env.ELEVENLABS_API_KEY;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-groups-"));
  let app, base;
  const start = async () => {
    app = await createApp({ dataDir: dir });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  const call = async (client, url, method = "GET", body) => {
    const r = await client(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  const faculty = cookieClient(() => base),
    learner = cookieClient(() => base),
    other = cookieClient(() => base);
  try {
    await start();
    assert.equal((await call(learner, "/api/encounters")).status, 401);
    const students = (await call(learner, "/api/students")).data.students;
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(learner, "/api/session", "POST", {
      role: "student",
      studentId: students[0].id,
    });
    await call(other, "/api/session", "POST", {
      role: "student",
      studentId: students[1].id,
    });
    assert.equal(
      (await call(learner, "/api/profiles")).data.profiles.length,
      3,
    );
    for (const endpoint of [
      "/api/faculty-results",
      "/api/profiles/comparison-omar",
      "/api/files/not-real",
      "/api/references",
    ])
      assert.equal((await call(learner, endpoint)).status, 403, endpoint);
    assert.equal(
      (await call(learner, "/api/generate", "POST", { description: "x" }))
        .status,
      403,
    );
    assert.equal(
      (await call(learner, "/api/profiles", "POST", {})).status,
      403,
    );
    const group = (await call(faculty, "/api/groups")).data.groups[0];
    assert.equal(group.preparationStatus, "ready");
    const profiles = [];
    for (const c of group.cases) {
      const p = (await call(faculty, `/api/profiles/${c.profileId}`)).data
        .profile;
      assert.equal(p.reviewAcknowledged, false);
      assert.ok(!p.facts.some((f) => f.allergyDrug));
      assert.ok(p.preparedDemo);
      assert.match(p.publicationBasis, /no faculty clinical approval/);
      profiles.push(p);
    }
    assert.equal(speech.pickVoice(profiles[0]), speech.pickVoice(profiles[1]));
    assert.equal(
      (await call(faculty, "/api/groups")).data.groups[0].preparationStatus,
      "ready",
    );
    const task = (
      await call(faculty, "/api/assignments", "POST", {
        groupId: group.id,
        studentId: students[0].id,
      })
    ).data.assignment;
    assert.equal(
      (await call(other, `/api/assignments/${task.id}/start`, "POST", {}))
        .status,
      404,
    );
    assert.equal(
      (
        await call(learner, "/api/encounters", "POST", {
          profileId: profiles[0].id,
        })
      ).status,
      403,
    );
    const attempts = await Promise.all([
      call(learner, `/api/assignments/${task.id}/start`, "POST", {}),
      call(learner, `/api/assignments/${task.id}/start`, "POST", {}),
    ]);
    const attempt = attempts[0].data.attempt;
    assert.equal(attempt.id, attempts[1].data.attempt.id);
    const first = (
      await call(learner, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).data.encounter;
    const duplicate = (
      await call(learner, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).data.encounter;
    assert.equal(first.id, duplicate.id);
    assert.equal(first.version, 1);
    assert.equal(
      (await call(other, `/api/encounters/${first.id}`)).status,
      404,
    );
    assert.equal(
      (await call(other, `/api/encounters/${first.id}/export`)).status,
      404,
    );
    assert.equal(
      (
        await call(other, `/api/encounters/${first.id}/turn`, "POST", {
          question: "Hello",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          other,
          `/api/encounters/${first.id}/artifacts/lipid-report/file`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await call(other, `/api/encounters/${first.id}/speech`, "POST", {}))
        .status,
      404,
    );
    assert.equal(
      (await call(other, `/api/attempts/${attempt.id}`)).status,
      404,
    );
    assert.equal(
      (await call(other, "/api/assignments")).data.assignments.length,
      0,
    );
    assert.equal(
      (await call(other, "/api/encounters")).data.encounters.length,
      0,
    );
    const p = profiles.find((p) => p.id === first.profileId);
    p.facts[0].say = "Changed after assignment.";
    p.reviewAcknowledged = true;
    await call(faculty, `/api/profiles/${p.id}`, "PUT", { profile: p });
    await call(faculty, `/api/profiles/${p.id}/publish`, "POST", {});
    assert.equal(
      (await call(faculty, "/api/groups")).data.groups[0].preparationStatus,
      "clinical-mismatch",
    );
    const turn = (
      await call(learner, `/api/encounters/${first.id}/turn`, "POST", {
        question: "What brings you in today?",
        requestId: "opening",
      })
    ).data.encounter;
    assert.equal(
      turn.transcript.at(-1).text,
      "I'm uncomfortable with taking medication.",
    );
    assert.ok(!JSON.stringify(turn).includes("LDL 195"));
    const chart = (
      await call(learner, `/api/encounters/${first.id}/turn`, "POST", {
        question: "Can I see the lab results?",
        requestId: "lab-results",
      })
    ).data.encounter;
    assert.ok(
      chart.artifacts
        .find((a) => a.id === "lipid-report" && a.released)
        .text.includes("260"),
    );
    const done = (
      await call(learner, `/api/encounters/${first.id}/complete`, "POST", {})
    ).data.encounter;
    assert.equal(done.assessment, null);
    assert.equal(done.feedbackHeld, true);
    assert.equal(
      (await call(learner, `/api/encounters/${first.id}/coaching`, "POST", {}))
        .status,
      409,
    );
    assert.equal(
      (await call(other, `/api/encounters/${first.id}/coaching`, "POST", {}))
        .status,
      404,
    );
    for (const url of [
      `/api/encounters/${first.id}`,
      `/api/encounters/${first.id}/export`,
    ]) {
      const data = (await call(learner, url)).data;
      assert.equal((data.encounter || data).assessment, null);
    }
    const summary = (await call(learner, "/api/encounters")).data.encounters[0];
    assert.equal(summary.total, null);
    assert.equal(summary.objectivePercent, null);
    assert.equal(summary.findingsTotal, null);
    const teacher = (await call(faculty, `/api/encounters/${first.id}`)).data
      .encounter;
    assert.equal(
      (
        await call(faculty, `/api/encounters/${first.id}/turn`, "POST", {
          question: "Hello",
          requestId: "faculty-edit",
        })
      ).status,
      403,
    );
    assert.ok(teacher.assessment);
    assert.equal(teacher.biasAnalysis.status, "pending");
    const context = (
      await call(faculty, `/api/bias/attempt/${attempt.id}/context`)
    ).data;
    assert.equal(context.encounters[0].profile.version, 1);
    const result = {
      status: "complete",
      detectorVersion: "test-adapter-v1",
      findings: [
        {
          text: "Review this recorded interaction.",
          evidence: [{ encounterId: first.id, eventId: teacher.events[0].id }],
        },
      ],
      limitations: ["Test adapter payload; not clinical validation."],
    };
    assert.equal(
      (await call(learner, `/api/bias/attempt/${attempt.id}/context`)).status,
      403,
    );
    assert.equal(
      (await call(learner, `/api/bias/attempt/${attempt.id}`, "PUT", result))
        .status,
      403,
    );
    assert.equal(
      (await call(faculty, `/api/bias/attempt/${attempt.id}`, "PUT", result))
        .status,
      200,
    );
    result.findings[0].evidence[0].eventId = "invented";
    assert.equal(
      (await call(faculty, `/api/bias/attempt/${attempt.id}`, "PUT", result))
        .status,
      400,
    );
    const foreign = (
      await call(other, "/api/encounters", "POST", { profileId: "denise" })
    ).data.encounter;
    result.findings[0].evidence[0] = {
      encounterId: foreign.id,
      eventId: foreign.events[0].id,
    };
    assert.equal(
      (await call(faculty, `/api/bias/attempt/${attempt.id}`, "PUT", result))
        .status,
      400,
    );
    await app.store.flush();
    await new Promise((r) => app.server.close(r));
    await start();
    await call(faculty, "/api/session", "POST", { role: "faculty" });
    await call(learner, "/api/session", "POST", {
      role: "student",
      studentId: students[0].id,
    });
    assert.equal(
      (await call(learner, `/api/assignments/${task.id}/start`, "POST", {}))
        .data.attempt.id,
      attempt.id,
    );
    const second = (
      await call(learner, `/api/attempts/${attempt.id}/next`, "POST", {})
    ).data.encounter;
    assert.notEqual(second.id, first.id);
    assert.notEqual(second.profileId, first.profileId);
    assert.equal(second.version, 1);
    const secondDone = (
      await call(learner, `/api/encounters/${second.id}/complete`, "POST", {})
    ).data.encounter;
    assert.ok(secondDone.assessment);
    assert.equal(secondDone.feedbackHeld, false);
    const refreshed = await call(
      learner,
      `/api/encounters/${first.id}/coaching`,
      "POST",
      {},
    );
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.data.encounter.assessment);
    assert.equal(refreshed.data.encounter.biasAnalysis, undefined);
    const visible = (await call(learner, `/api/encounters/${first.id}/export`))
      .data;
    assert.ok(visible.assessment);
    assert.equal(visible.biasAnalysis, undefined);
    assert.ok(
      !JSON.stringify(
        (await call(learner, `/api/attempts/${attempt.id}`)).data,
      ).includes("test-adapter"),
    );
    assert.equal(
      (await call(learner, `/api/attempts/${attempt.id}/next`, "POST", {}))
        .status,
      409,
    );
    assert.equal(
      (await call(faculty, `/api/attempts/${attempt.id}`)).data.biasAnalysis
        .status,
      "complete",
    );
    assert.equal(
      (
        await call(faculty, `/api/bias/attempt/${attempt.id}`, "PUT", {
          status: "unavailable",
          detectorVersion: "adapter-v1",
          findings: [],
          limitations: ["Detector service unavailable."],
        })
      ).status,
      200,
    );
    const practice = (
      await call(learner, "/api/encounters", "POST", { profileId: "denise" })
    ).data.encounter;
    assert.ok(
      (
        await call(
          learner,
          `/api/encounters/${practice.id}/complete`,
          "POST",
          {},
        )
      ).data.encounter.assessment,
    );
    assert.equal(
      (await call(faculty, "/api/faculty-results")).data.students.length,
      3,
    );
  } finally {
    if (app?.server.listening) await new Promise((r) => app.server.close(r));
    if (app) await app.store.flush();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
