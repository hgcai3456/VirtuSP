"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
  PutBucketVersioningCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const cloud = require("../lib/cloud");
const root = path.resolve(__dirname, "..");
const client = new S3Client({ region: cloud.region(), maxAttempts: 1 });
const send = (command) =>
  client.send(command, { abortSignal: AbortSignal.timeout(20000) });
async function configure() {
  let bucket = process.env.S3_BUCKET;
  if (!bucket) {
    bucket = `virtusp-${randomUUID()}`;
    await send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(cloud.region() === "us-east-1"
          ? {}
          : {
              CreateBucketConfiguration: { LocationConstraint: cloud.region() },
            }),
      }),
    );
    // Save its name immediately so a denied configuration step can be retried.
    const envPath = path.join(root, ".env");
    const current = await fs.readFile(envPath, "utf8");
    await fs.writeFile(
      envPath,
      /^S3_BUCKET=.*$/m.test(current)
        ? current.replace(/^S3_BUCKET=.*$/m, `S3_BUCKET=${bucket}`)
        : `${current}\nS3_BUCKET=${bucket}\n`,
    );
    process.env.S3_BUCKET = bucket;
    console.log(
      `Created private application bucket ${bucket}; saved S3_BUCKET in .env.`,
    );
  } else await send(new HeadBucketCommand({ Bucket: bucket }));
  await send(
    new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
  await send(
    new PutBucketEncryptionCommand({
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [
          { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
    }),
  );
  await send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  console.log(
    "Public access blocked, encryption and versioning enabled. Run npm run preflight next.",
  );
}
function checkedState(state) {
  if (
    state.schema !== 2 ||
    !state.files ||
    !state.drafts ||
    !Array.isArray(state.releases) ||
    !state.encounters
  )
    throw new Error("Unsupported recovery snapshot.");
  for (const id of Object.keys(state.files))
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || state.files[id].id !== id)
      throw new Error("Invalid recovery file ID.");
  return state;
}
async function backup() {
  if (!process.env.S3_BUCKET) throw new Error("Configure S3_BUCKET first.");
  const directory = path.join(root, "data");
  const state = checkedState(
    JSON.parse(await fs.readFile(path.join(directory, "state.json"), "utf8")),
  );
  for (const file of Object.values(state.files))
    await cloud.put(
      `files/${file.id}`,
      await fs.readFile(path.join(directory, "files", file.id)),
      file.type,
    );
  for (const release of state.releases)
    await cloud.put(
      `profiles/${release.p.id}/v${release.p.version}.json`,
      JSON.stringify(release),
    );
  for (const enc of Object.values(state.encounters))
    await cloud.put(`encounters/${enc.id}.json`, JSON.stringify(enc));
  // The manifest is written last, after every referenced file has a cloud copy.
  await cloud.put("state.json", JSON.stringify(state));
  console.log(
    `Backed up ${Object.keys(state.files).length} files, ${state.releases.length} versions and ${Object.keys(state.encounters).length} encounters.`,
  );
}
async function get(suffix) {
  const r = await send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `${process.env.S3_PREFIX || "virtusp"}/${suffix}`,
    }),
  );
  if (Number(r.ContentLength) > 20 * 1024 * 1024)
    throw new Error("Recovery object exceeds demo size limit.");
  return Buffer.from(await r.Body.transformToByteArray());
}
async function restore() {
  if (!process.env.S3_BUCKET) throw new Error("Configure S3_BUCKET first.");
  const snapshot = await get("state.json");
  const state = checkedState(JSON.parse(snapshot.toString("utf8")));
  const target = path.join(root, `data-recovery-${Date.now()}`);
  await fs.mkdir(path.join(target, "files"), { recursive: true });
  for (const file of Object.values(state.files))
    await fs.writeFile(
      path.join(target, "files", file.id),
      await get(`files/${file.id}`),
    );
  await fs.writeFile(path.join(target, "state.json"), snapshot);
  console.log(
    `Restored to ${target}. Existing data was preserved. To inspect it, set VIRTUSP_DATA_DIR=${path.basename(target)} in .env and restart.`,
  );
}
const actions = { configure, backup, restore };
const action = process.argv[2];
if (!actions[action]) {
  console.error("Usage: node scripts/storage.js configure|backup|restore");
  process.exitCode = 1;
} else
  actions[action]().catch((e) => {
    console.error(`${e.name}: ${e.message}`);
    process.exitCode = 1;
  });
