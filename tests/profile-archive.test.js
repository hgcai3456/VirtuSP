"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { openDb } = require("../lib/db");
const { archiveState } = require("../lib/profile-archive");

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-profiles-"));
  const filesDir = path.join(dir, "files");
  await fs.mkdir(filesDir);
  await fs.writeFile(path.join(filesDir, "file-a"), Buffer.from("lab-bytes"));
  await fs.writeFile(path.join(filesDir, "file-b"), Buffer.from("source-bytes"));
  const profile = {
    id: "omar-demo",
    name: "Omar Demo",
    facts: [{ id: "f1", say: "I feel tired." }],
    artifacts: [
      {
        id: "lab-report",
        title: "Lipid panel",
        fileId: "file-a",
        src: "chart",
      },
    ],
    sources: [{ id: "brief", title: "Case brief", fileId: "file-b" }],
  };
  const state = {
    schema: 2,
    drafts: { "omar-demo": profile },
    releases: [
      {
        p: { ...profile, version: 1 },
        at: "2026-10-10T00:00:00.000Z",
      },
    ],
    files: {
      "file-a": {
        id: "file-a",
        name: "lipid.txt",
        type: "text/plain",
        size: 9,
      },
      "file-b": {
        id: "file-b",
        name: "brief.txt",
        type: "text/plain",
        size: 12,
      },
    },
    encounters: {},
  };
  const db = openDb(path.join(dir, "profiles.sqlite"));
  const queries = [];
  const pg = {
    async query(sql, params) {
      queries.push({ sql, params });
    },
  };
  const objects = [];
  const put = async (suffix, body, type) => {
    objects.push({ suffix, body: Buffer.from(body), type });
    return { status: "synced", at: "2026-10-10T01:00:00.000Z", key: `virtusp/${suffix}` };
  };
  return { dir, filesDir, state, db, pg, queries, objects, put };
}

test("profile archive copies every draft, release, and artifact to S3 and both databases", async () => {
  const box = await fixture();
  try {
    const report = await archiveState(box.state, {
      filesDir: box.filesDir,
      put: box.put,
      sinks: [
        { kind: "sqlite", name: "sqlite", db: box.db },
        { kind: "postgres", name: "rds", db: box.pg },
      ],
    });
    assert.equal(report.errors.length, 0);
    assert.equal(report.profiles, 2);
    assert.equal(report.artifacts, 4);
    assert.equal(report.files, 2);
    assert.equal(report.s3.status, "synced");
    assert.deepEqual(report.databases, ["sqlite", "rds"]);
    const suffixes = box.objects.map((object) => object.suffix);
    assert.ok(suffixes.includes("profiles/omar-demo/draft.json"));
    assert.ok(suffixes.includes("profiles/omar-demo/v1.json"));
    assert.ok(
      suffixes.includes("profiles/omar-demo/draft/artifacts/lab-report.json"),
    );
    assert.ok(suffixes.includes("profiles/omar-demo/files/file-a"));
    assert.ok(suffixes.includes("profiles/omar-demo/files/file-b"));
    const lab = box.objects.find(
      (object) => object.suffix === "profiles/omar-demo/files/file-a",
    );
    assert.equal(lab.body.toString(), "lab-bytes");
    assert.equal(lab.type, "text/plain");
    const draft = JSON.parse(
      box.objects
        .find((object) => object.suffix === "profiles/omar-demo/draft.json")
        .body.toString(),
    );
    assert.equal(draft.facts[0].say, "I feel tired.");
    const rows = box.db
      .prepare(
        "SELECT id, stage, s3_key FROM patient_profiles ORDER BY stage",
      )
      .all();
    assert.deepEqual(
      rows.map((row) => row.id),
      ["omar-demo:draft", "omar-demo:v1"],
    );
    assert.equal(rows[0].s3_key, "virtusp/profiles/omar-demo/draft.json");
    const artifact = box.db
      .prepare(
        "SELECT file_id, s3_key, size_bytes FROM patient_profile_artifacts WHERE artifact_id = ?",
      )
      .get("lab-report");
    assert.equal(artifact.file_id, "file-a");
    assert.equal(artifact.s3_key, "virtusp/profiles/omar-demo/files/file-a");
    assert.equal(artifact.size_bytes, 9);
    assert.equal(
      box.queries.filter((query) => query.sql.startsWith("INSERT INTO patient_profiles"))
        .length,
      2,
    );
    assert.equal(
      box.queries.filter((query) =>
        query.sql.startsWith("INSERT INTO patient_profile_artifacts"),
      ).length,
      4,
    );

    box.state.drafts["omar-demo"].name = "Omar Updated";
    const again = await archiveState(box.state, {
      filesDir: box.filesDir,
      put: box.put,
      sinks: [{ kind: "sqlite", name: "sqlite", db: box.db }],
    });
    assert.equal(again.errors.length, 0);
    const names = box.db
      .prepare("SELECT name FROM patient_profiles WHERE stage = 'draft'")
      .all();
    assert.equal(names.length, 1);
    assert.equal(names[0].name, "Omar Updated");
  } finally {
    box.db.close();
    await fs.rm(box.dir, { recursive: true, force: true });
  }
});

test("profile archive keeps a missing artifact file out of both databases", async () => {
  const box = await fixture();
  try {
    await fs.rm(path.join(box.filesDir, "file-a"));
    const report = await archiveState(box.state, {
      filesDir: box.filesDir,
      put: box.put,
      sinks: [
        { kind: "sqlite", name: "sqlite", db: box.db },
        { kind: "postgres", name: "rds", db: box.pg },
      ],
    });
    assert.equal(report.s3.status, "failed");
    assert.match(report.errors[0], /Missing artifact file file-a/);
    assert.equal(
      box.db.prepare("SELECT COUNT(*) AS n FROM patient_profiles").get().n,
      0,
    );
    assert.equal(
      box.queries.filter((query) => query.sql.startsWith("INSERT")).length,
      0,
    );
  } finally {
    box.db.close();
    await fs.rm(box.dir, { recursive: true, force: true });
  }
});

test("profile archive rejects an unsafe profile id before writing", async () => {
  const box = await fixture();
  try {
    box.state.drafts["../secret"] = {
      ...box.state.drafts["omar-demo"],
      id: "../secret",
    };
    await assert.rejects(
      archiveState(box.state, {
        filesDir: box.filesDir,
        put: box.put,
        sinks: [{ kind: "sqlite", name: "sqlite", db: box.db }],
      }),
      /Invalid profile id/,
    );
    assert.equal(
      box.objects.filter((object) => object.suffix.includes("..")).length,
      0,
    );
  } finally {
    box.db.close();
    await fs.rm(box.dir, { recursive: true, force: true });
  }
});
