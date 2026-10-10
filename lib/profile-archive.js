"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const cloud = require("./cloud");
const { openDb } = require("./db");
const { writeTransaction } = require("./write-orchestrator");

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const PROFILE_COLUMNS = [
  "id",
  "profile_id",
  "stage",
  "version",
  "name",
  "document",
  "s3_key",
  "updated_at",
];
const ARTIFACT_COLUMNS = [
  "id",
  "profile_id",
  "stage",
  "artifact_id",
  "file_id",
  "name",
  "media_type",
  "size_bytes",
  "s3_key",
  "document",
  "updated_at",
];

function bucketName() {
  return process.env.PROFILE_S3_BUCKET || process.env.S3_BUCKET || "";
}

function objectKey(suffix) {
  return `${process.env.S3_PREFIX || "virtusp"}/${suffix}`;
}

function requireId(value, label) {
  const id = String(value || "");
  if (!SAFE_ID.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}

function stagesOf(state) {
  const stages = [];
  for (const profile of Object.values(state.drafts || {})) {
    stages.push({
      stage: "draft",
      version: null,
      profile,
      document: profile,
    });
  }
  for (const release of state.releases || []) {
    const profile = release && release.p;
    const version = Number(profile && profile.version);
    if (!profile || !Number.isInteger(version) || version < 1)
      throw new Error("A published profile is missing its version.");
    stages.push({
      stage: `v${version}`,
      version,
      profile,
      document: release,
    });
  }
  return stages;
}

function upsert(db, table, row, columns) {
  const assignments = columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  if (typeof db.prepare === "function") {
    const names = columns.map((column) => `@${column}`).join(", ");
    db.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${names}) ON CONFLICT(id) DO UPDATE SET ${assignments}`,
    ).run(row);
    return Promise.resolve();
  }
  const values = columns.map((column) => row[column]);
  const slots = columns.map((_, index) => `$${index + 1}`).join(", ");
  return db.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${slots}) ON CONFLICT (id) DO UPDATE SET ${assignments}`,
    values,
  );
}

async function writeRows(sink, profiles, artifacts) {
  if (sink.kind === "sqlite") {
    writeTransaction(sink.db, () => {
      for (const row of profiles)
        upsert(sink.db, "patient_profiles", row, PROFILE_COLUMNS);
      for (const row of artifacts)
        upsert(sink.db, "patient_profile_artifacts", row, ARTIFACT_COLUMNS);
    });
    return;
  }
  await sink.db.query("BEGIN");
  try {
    for (const row of profiles)
      await upsert(sink.db, "patient_profiles", row, PROFILE_COLUMNS);
    for (const row of artifacts)
      await upsert(sink.db, "patient_profile_artifacts", row, ARTIFACT_COLUMNS);
    await sink.db.query("COMMIT");
  } catch (error) {
    try {
      await sink.db.query("ROLLBACK");
    } catch {
      // The failed transaction is already closed.
    }
    throw error;
  }
}

async function putObject(suffix, body, type) {
  const bucket = bucketName();
  if (!bucket)
    return {
      status: "local",
      message: "S3 bucket not configured",
      key: objectKey(suffix),
    };
  if (!process.env.PROFILE_S3_BUCKET && process.env.S3_BUCKET) {
    const result = await cloud.put(suffix, body, type);
    return { ...result, key: objectKey(suffix) };
  }
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const key = objectKey(suffix);
  const s3 = new S3Client({ region: cloud.region(), maxAttempts: 2 });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: type || "application/octet-stream",
      ServerSideEncryption: "AES256",
    }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  return { status: "synced", at: new Date().toISOString(), key };
}

function rdsCa() {
  const https = require("node:https");
  const os = require("node:os");
  const dest =
    process.env.PGSSLROOTCERT ||
    path.join(os.tmpdir(), "virtusp-rds-global-bundle.pem");
  return fs
    .readFile(dest)
    .then((cached) => {
      if (cached.includes("BEGIN CERTIFICATE")) return cached;
      throw new Error("cached CA is not a certificate");
    })
    .catch(() => {
      if (process.env.PGSSLROOTCERT)
        throw new Error("PGSSLROOTCERT is not a PEM certificate.");
      return new Promise((resolve, reject) => {
        const req = https.get(
          "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem",
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(
                new Error(
                  "RDS CA bundle download failed with HTTP " + res.statusCode,
                ),
              );
              return;
            }
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          },
        );
        req.setTimeout(20000, () =>
          req.destroy(new Error("RDS CA bundle download timed out")),
        );
        req.on("error", reject);
      }).then(async (body) => {
        if (!body.includes("BEGIN CERTIFICATE"))
          throw new Error("RDS CA bundle was not a PEM certificate.");
        await fs.writeFile(dest, body);
        return body;
      });
    });
}

async function openPostgres() {
  if (!process.env.PGHOST) return null;
  for (const name of ["PGUSER", "PGPASSWORD", "PGDATABASE"])
    if (!process.env[name]) throw new Error(`Set ${name} for RDS.`);
  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    throw new Error("RDS archival requires the pg package.");
  }
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    application_name: "virtusp-profile-archive",
    connectionTimeoutMillis: 10000,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? false
        : {
            rejectUnauthorized: true,
            ca: await rdsCa(),
            servername: process.env.PGHOST,
          },
  });
  await client.connect();
  await client.query(
    await fs.readFile(
      path.join(__dirname, "../infra/rds/sql/003_profiles.sql"),
      "utf8",
    ),
  );
  return client;
}

async function defaultSinks() {
  const sqlite = openDb();
  const sinks = [{ kind: "sqlite", name: "sqlite", db: sqlite }];
  const postgres = await openPostgres();
  if (postgres)
    sinks.push({ kind: "postgres", name: "rds", db: postgres, close: true });
  return sinks;
}

async function archiveState(state, options = {}) {
  const filesDir = options.filesDir;
  const put = options.put || putObject;
  const sinks = options.sinks || (await defaultSinks());
  const updatedAt = new Date().toISOString();
  const profiles = [];
  const artifacts = [];
  const errors = [];
  let files = 0;
  let objects = 0;
  let s3 = { status: "synced", at: updatedAt, objects: 0 };
  const uploaded = new Set();

  async function send(suffix, body, type) {
    const result = await put(suffix, body, type);
    objects += 1;
    if (result.status === "failed") throw new Error(result.message);
    if (result.status !== "synced") s3 = result;
    else if (s3.status === "synced") s3.at = result.at || s3.at;
    return result.key || objectKey(suffix);
  }

  try {
    for (const item of stagesOf(state || {})) {
      const profileId = requireId(item.profile.id, "profile id");
      const stage = requireId(item.stage, "profile stage");
      const document = Buffer.from(JSON.stringify(item.document), "utf8");
      const profileKey = await send(
        `profiles/${profileId}/${stage}.json`,
        document,
        "application/json",
      );
      profiles.push({
        id: `${profileId}:${stage}`,
        profile_id: profileId,
        stage,
        version: item.version,
        name: String(item.profile.name || "Untitled"),
        document: document.toString("utf8"),
        s3_key: profileKey,
        updated_at: updatedAt,
      });

      const records = [];
      for (const artifact of item.profile.artifacts || [])
        records.push({ kind: "artifact", record: artifact });
      for (const source of item.profile.sources || [])
        if (source && source.fileId)
          records.push({ kind: "source", record: source });

      for (const entry of records) {
        const artifactId = requireId(
          entry.record.id,
          `${entry.kind} id`,
        );
        const meta = Buffer.from(JSON.stringify(entry.record), "utf8");
        let fileId = null;
        let mediaType = "application/json";
        let size = meta.length;
        let key = await send(
          `profiles/${profileId}/${stage}/artifacts/${artifactId}.json`,
          meta,
          "application/json",
        );
        if (entry.record.fileId) {
          fileId = requireId(entry.record.fileId, "file id");
          const file = (state.files || {})[fileId];
          const fileKey = `profiles/${profileId}/files/${fileId}`;
          if (!file) {
            errors.push(`Missing file metadata for ${fileId}.`);
            continue;
          }
          if (!uploaded.has(fileKey)) {
            let bytes;
            try {
              bytes = await fs.readFile(path.join(filesDir, fileId));
            } catch (error) {
              if (error.code === "ENOENT") {
                errors.push(`Missing artifact file ${fileId}.`);
                continue;
              }
              throw error;
            }
            key = await send(fileKey, bytes, file.type || "application/octet-stream");
            uploaded.add(fileKey);
            files += 1;
            size = bytes.length;
            mediaType = file.type || "application/octet-stream";
          } else {
            key = objectKey(fileKey);
            size = Number(file.size) || size;
            mediaType = file.type || mediaType;
          }
        }
        artifacts.push({
          id: `${profileId}:${stage}:${artifactId}`,
          profile_id: profileId,
          stage,
          artifact_id: artifactId,
          file_id: fileId,
          name: String(entry.record.title || entry.record.name || artifactId),
          media_type: mediaType,
          size_bytes: size,
          s3_key: key,
          document: meta.toString("utf8"),
          updated_at: updatedAt,
        });
      }
    }
    if (!errors.length)
      for (const sink of sinks) await writeRows(sink, profiles, artifacts);
    s3.objects = objects;
    if (errors.length)
      s3 = { status: "failed", message: errors[0], objects };
    return {
      profiles: profiles.length,
      artifacts: artifacts.length,
      files,
      objects,
      databases: sinks.map((sink) => sink.name),
      s3,
      errors,
    };
  } finally {
    if (!options.sinks)
      for (const sink of sinks) {
        try {
          if (sink.kind === "sqlite") sink.db.close();
          else if (sink.close) await sink.db.end();
        } catch {
          // Closing a finished archive must not hide the archive result.
        }
      }
  }
}

module.exports = {
  archiveState,
  bucketName,
  objectKey,
  stagesOf,
};
