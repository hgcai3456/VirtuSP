"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { createApp } = require("../lib/http");
const { blank, fact } = require("../lib/profiles");
const cloud = require("../lib/cloud");
async function main() {
  if (!process.env.S3_BUCKET)
    throw new Error("S3_BUCKET is required; run setup:aws.");
  process.env.AI_ENABLED = "true";
  const prefix = `virtusp-smoke/${Date.now()}`;
  process.env.S3_PREFIX = prefix;
  const directory = path.join(__dirname, "../tmp", `cloud-smoke-${Date.now()}`);
  const app = await createApp({ dataDir: directory });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "faculty" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const client = (url, options = {}) =>
    fetch(url, { ...options, headers: { ...options.headers, Cookie: cookie } });
  const request = async (url, method = "GET", payload) => {
    const r = await client(base + url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    return result;
  };
  try {
    const p = (await request("/api/profiles", "POST", {})).profile;
    p.name = "Taylor Reed";
    p.age = 38;
    p.intro = "Hi, I'm Taylor.";
    p.personality = "Thoughtful";
    p.style = "Brief everyday wording";
    const note =
      "Synthetic intake note: alternating shifts at a grocery store; exact times and duration unspecified.";
    p.facts = [
      fact("concern", "Trouble sleeping after a work schedule change", {
        say: "Since my work schedule changed, I have trouble sleeping.",
        topic: "Reason for visit and sleep concern",
        kw: ["bring", "sleep", "concern"],
        src: "smoke-author",
        reviewed: true,
      }),
      fact("work", "Works alternating shifts at a grocery store", {
        say: "I work alternating shifts at a grocery store.",
        topic: "Occupation and work schedule",
        kw: ["work", "shift", "job"],
        src: "smoke-author",
        reviewed: true,
      }),
      fact(
        "private",
        "Uncomfortable asking the supervisor for a schedule change",
        {
          say: "I feel uncomfortable asking my supervisor to change my schedule.",
          topic: "Speaking to the supervisor about schedule changes",
          kw: ["supervisor", "manager"],
          gate: 1,
          deflect: "I'd rather not talk about my supervisor yet.",
          src: "smoke-author",
          reviewed: true,
        },
      ),
      fact("intake", note, {
        vis: "chart",
        sec: "notes",
        ehr: "notes",
        say: "",
        topic: "Written intake report",
        kw: ["intake report"],
        src: "smoke-author",
        reviewed: true,
      }),
    ];
    const upload = (
      await request("/api/files", "POST", {
        name: "synthetic-intake.txt",
        type: "text/plain",
        data: Buffer.from(note).toString("base64"),
      })
    ).file;
    p.sources = [
      {
        id: "smoke-author",
        title: "Engineering-authored synthetic integration scenario",
        excerpt: p.facts.map((f) => f.label).join("\n"),
        reviewed: true,
      },
    ];
    p.artifacts = [
      {
        id: "intake-report",
        title: "Synthetic intake report",
        sec: "notes",
        kind: "report",
        facts: ["intake"],
        release: "question",
        unlock: ["intake report"],
        date: new Date().toISOString().slice(0, 10),
        src: "smoke-author",
        fileId: upload.id,
        reviewed: true,
      },
    ];
    p.obj = [
      {
        id: "concern-objective",
        t: "Explore concern",
        w: 40,
        ty: "fact",
        f: ["concern"],
        tip: "Ask an open question.",
      },
      {
        id: "private-objective",
        t: "Explore the supervisor concern respectfully",
        w: 30,
        ty: "fact",
        f: ["private"],
        tip: "Acknowledge the concern.",
      },
      {
        id: "review-objective",
        t: "Review the intake report",
        w: 30,
        ty: "review",
        s: ["notes"],
        tip: "Explicitly review the released report.",
      },
    ];
    p.rubricApplicable = [1, 2, 3, 4, 7];
    p.reviewAcknowledged = true;
    await request(`/api/profiles/${p.id}`, "PUT", { profile: p });
    await request(`/api/profiles/${p.id}/publish`, "POST", {});
    let enc = (await request("/api/encounters", "POST", { profileId: p.id }))
      .encounter;
    const q = async (question) => {
      enc = (
        await request(`/api/encounters/${enc.id}/turn`, "POST", {
          question,
          requestId: randomUUID(),
        })
      ).encounter;
      console.log(
        JSON.stringify({
          question,
          response: enc.transcript.at(-1).text,
          provider: enc.transcript.at(-1).provider,
        }),
      );
    };
    await q(
      "Hello Taylor, I am a student clinician. Is it okay to discuss your sleep concern? What brings you in?",
    );
    await q("What kind of work do you do?");
    await q("What concerns you about speaking with your supervisor?");
    assert.ok(!enc.disclosed.some((f) => f.id === "private"));
    await q(
      "That sounds difficult. What concerns you about speaking with your supervisor?",
    );
    assert.ok(enc.disclosed.some((f) => f.id === "private"));
    await request(`/api/encounters/${enc.id}/open`, "POST", {
      section: "notes",
    });
    assert.equal(
      (
        await client(
          base + `/api/encounters/${enc.id}/artifacts/intake-report/file`,
        )
      ).status,
      403,
    );
    await q("Could I see your intake report?");
    assert.ok(enc.artifacts.find((a) => a.id === "intake-report").released);
    await request(`/api/encounters/${enc.id}/review`, "POST", {
      artifactId: "intake-report",
    });
    await q("Are you allergic to penicillin?");
    assert.equal(enc.transcript.at(-1).factIds.length, 0);
    await q(
      "Thank you for sharing your concerns. I will discuss the information with my supervising clinician. What questions do you have before we finish?",
    );
    enc = (await request(`/api/encounters/${enc.id}/complete`, "POST", {}))
      .encounter;
    assert.equal(enc.assessment.denominator, 20);
    assert.equal(enc.assessment.na, 2);
    assert.equal(enc.assessment.provider, "bedrock", enc.assessment.failure);
    const drafting = await request("/api/generate", "POST", {
      description:
        "Synthetic patient Casey Lane is 41 years old and works at a bookstore. Casey wants to discuss feeling tired. Medications, allergies, dates, and diagnoses are unspecified.",
    });
    assert.equal(drafting.provider, "bedrock-draft");
    assert.equal(drafting.profile.reviewAcknowledged, false);
    await app.store.flush();
    assert.equal(app.store.sync.status, "synced");
    const s3 = new S3Client({ region: cloud.region() });
    const read = async (key) => {
      const r = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: prefix + "/" + key,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      return Buffer.from(await r.Body.transformToByteArray());
    };
    assert.equal((await read("files/" + upload.id)).toString(), note);
    const snapshot = JSON.parse((await read("state.json")).toString());
    assert.equal(snapshot.encounters[enc.id].status, "complete");
    assert.equal(
      JSON.parse((await read(`profiles/${p.id}/v1.json`)).toString()).p.name,
      p.name,
    );
    const report = {
      at: new Date().toISOString(),
      prefix,
      directory,
      model: cloud.model(),
      storage: "verified read/write",
      encounter: enc,
      draft: drafting.profile,
      draftWarning: drafting.warning,
    };
    await fs.mkdir(path.join(__dirname, "../output"), { recursive: true });
    await fs.writeFile(
      path.join(__dirname, "../output/cloud-smoke.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          prefix,
          directory,
          storage: "verified read/write",
          assessmentProvider: enc.assessment.provider,
          assessmentFailure: enc.assessment.failure,
          draftProvider: drafting.provider,
          model: cloud.model(),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
  }
}
main().catch((e) => {
  console.error(`${e.name}: ${e.message}`);
  process.exitCode = 1;
});
