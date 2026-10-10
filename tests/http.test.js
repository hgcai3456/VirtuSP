"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../server");
test("HTTP lifecycle: publication, stale-edit regression, reusability, restart and protected reports", async () => {
  process.env.AI_ENABLED = "false";
  delete process.env.S3_BUCKET;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-test-"));
  let app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (url, method = "GET", payload) => {
    const r = await fetch(base + url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const patients = await request("/api/profiles");
    assert.equal(patients.data.profiles.length, 11);
    const omar = patients.data.profiles.find((p) => p.name === "Omar Sinclair");
    assert.equal(omar.version, null);
    assert.equal(
      (await request(`/api/profiles/${omar.id}/publish`, "POST", {})).status,
      422,
    );
    await request(`/api/profiles/${omar.id}/prepare`, "POST", {});
    let p = (await request("/api/profiles/" + omar.id)).data.profile;
    p.facts.forEach((f) => (f.reviewed = true));
    p.sources.forEach((s) => (s.reviewed = true));
    p.reviewAcknowledged = true;
    await request("/api/profiles/" + p.id, "PUT", { profile: p });
    assert.equal(
      (await request(`/api/profiles/${p.id}/publish`, "POST", {})).status,
      201,
    );
    const encounter = (
      await request("/api/encounters", "POST", { profileId: p.id, version: 1 })
    ).data.encounter;
    assert.ok(!JSON.stringify(encounter).includes("LDL 195"));
    p.facts.find((f) => f.id === "concern").say =
      "I want to discuss medication concerns today.";
    await request("/api/profiles/" + p.id, "PUT", { profile: p });
    await request(`/api/profiles/${p.id}/publish`, "POST", {});
    const r1 = await request(`/api/encounters/${encounter.id}/turn`, "POST", {
      question: "What brings you in today?",
      requestId: "first",
    });
    assert.equal(
      r1.data.encounter.transcript.at(-1).text,
      "I'm uncomfortable with taking medication.",
    );
    const later = (
      await request("/api/encounters", "POST", { profileId: p.id, version: 2 })
    ).data.encounter;
    const r2 = await request(`/api/encounters/${later.id}/turn`, "POST", {
      question: "What brings you in today?",
      requestId: "second",
    });
    assert.equal(r2.data.encounter.transcript.at(-1).text, p.facts[0].say);
    const started = (
      await request("/api/profiles", "POST", {
        starter: {
          name: "Pat Rivera",
          age: 33,
          concern: "I get winded on stairs.",
        },
      })
    ).data.profile;
    assert.equal(started.name, "Pat Rivera");
    assert.equal(started.age, 33);
    assert.equal(started.facts[0].id, "concern");
    const fresh = (await request("/api/profiles", "POST", {})).data.profile;
    assert.equal(fresh.age, null);
    fresh.age = 40;
    fresh.name = "Unseen Demo Patient";
    fresh.facts = [
      {
        ...p.facts[0],
        id: "unseen",
        say: "I need to discuss my authored concern.",
        label: "Authored concern",
      },
    ];
    fresh.sources = p.sources;
    fresh.obj = [
      {
        id: "o",
        t: "Explore concern",
        w: 100,
        ty: "fact",
        f: ["unseen"],
        tip: "Ask openly.",
      },
    ];
    fresh.reviewAcknowledged = true;
    await request(`/api/profiles/${fresh.id}`, "PUT", { profile: fresh });
    assert.equal(
      (await request(`/api/profiles/${fresh.id}/publish`, "POST", {})).status,
      201,
    );
    const newEnc = (
      await request("/api/encounters", "POST", { profileId: fresh.id })
    ).data.encounter;
    const turn = await request(`/api/encounters/${newEnc.id}/turn`, "POST", {
      question: "What brings you in today?",
      requestId: "fresh",
    });
    assert.equal(
      turn.data.encounter.transcript.at(-1).text,
      fresh.facts[0].say,
    );
    const denise = (
      await request("/api/encounters", "POST", { profileId: "denise" })
    ).data.encounter;
    assert.equal(
      (await request(`/api/encounters/${denise.id}/artifacts/den-ecg/file`))
        .status,
      403,
    );
    assert.equal((await fetch(base + "/img/denise-ecg.jpg")).status, 404);
    await request(`/api/encounters/${denise.id}/open`, "POST", {
      section: "img",
    });
    assert.equal(
      (
        await fetch(
          base + `/api/encounters/${denise.id}/artifacts/den-ecg/file`,
        )
      ).status,
      403,
    );
    await request(`/api/encounters/${denise.id}/turn`, "POST", {
      question: "Have you been having chest pain?",
      requestId: "denise-ecg",
    });
    assert.equal(
      (
        await fetch(
          base + `/api/encounters/${denise.id}/artifacts/den-ecg/file`,
        )
      ).status,
      200,
    );
    await request(`/api/encounters/${newEnc.id}/complete`, "POST", {});
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    app = await createApp({ dataDir: dir });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    assert.equal(
      (await request(`/api/encounters/${newEnc.id}`)).data.encounter.status,
      "complete",
    );
    assert.ok(
      (await request(`/api/encounters/${newEnc.id}`)).data.encounter.assessment,
    );
    const malformed = await fetch(base + "/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "fake.pdf",
        type: "application/pdf",
        data: Buffer.from("not pdf").toString("base64"),
      }),
    });
    assert.equal(malformed.status, 400);
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
