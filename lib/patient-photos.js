"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { withWrite } = require("./write-orchestrator");
const manifest = require("../corpus/patient-photos.json");
const assets = path.join(__dirname, "../corpus/patient-photos");
const identities = new Map(
  manifest.flatMap((p) => [
    [p.patientId, p],
    [p.profileId, p],
  ]),
);
const initialized = new WeakSet();
const schema = `CREATE TABLE IF NOT EXISTS "Patient Photos" (
  patient_id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
  photo BLOB NOT NULL CHECK (typeof(photo) = 'blob' AND length(photo) > 0),
  sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

function initialize(db) {
  if (initialized.has(db)) return;
  withWrite(db, () => db.exec(schema));
  initialized.add(db);
}
function bundledPhoto(profile) {
  return identities.get(profile?.id) || null;
}
function savePhoto(
  db,
  { patientId, name, body, contentType },
  { replace = true } = {},
) {
  if (
    typeof patientId !== "string" ||
    !patientId.trim() ||
    typeof name !== "string" ||
    !name.trim()
  )
    throw new Error("Patient photo requires an explicit patient ID and name.");
  if (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024)
    throw new Error("Patient photo must contain 1 byte to 5 MB of image data.");
  const png = body
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    body.length >= 3 && body[0] === 255 && body[1] === 216 && body[2] === 255;
  if (!(
    (contentType === "image/png" && png) ||
    (contentType === "image/jpeg" && jpeg)
  ))
    throw new Error(
      "Patient photo bytes do not match a supported PNG/JPEG content type.",
    );
  initialize(db);
  const hash = createHash("sha256").update(body).digest("hex");
  withWrite(db, () =>
    db
      .prepare(
        `INSERT INTO "Patient Photos"
    (patient_id, patient_name, content_type, photo, sha256, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ${
      replace
        ? `ON CONFLICT(patient_id) DO UPDATE SET patient_name=excluded.patient_name,
    content_type=excluded.content_type, photo=excluded.photo,
    sha256=excluded.sha256, updated_at=excluded.updated_at`
        : "ON CONFLICT(patient_id) DO NOTHING"
    }`,
      )
      .run(patientId, name, contentType, body, hash, new Date().toISOString()),
  );
  return hash;
}
function readPhoto(db, patientId) {
  initialize(db);
  const row = db
    .prepare(
      'SELECT content_type, photo, sha256 FROM "Patient Photos" WHERE patient_id = ?',
    )
    .get(patientId);
  return row
    ? {
        body: Buffer.from(row.photo),
        type: row.content_type,
        sha256: row.sha256,
      }
    : null;
}
function seedPhoto(db, entry) {
  // Preserve existing BLOBs: normal reads never replace an imported photo.
  if (!readPhoto(db, entry.patientId)) {
    savePhoto(
      db,
      {
        patientId: entry.patientId,
        name: entry.name,
        body: fs.readFileSync(path.join(assets, entry.file)),
        contentType: "image/png",
      },
      { replace: false },
    );
  }
  return readPhoto(db, entry.patientId);
}
function profilePhoto(db, profile) {
  const entry = bundledPhoto(profile);
  return entry ? seedPhoto(db, entry) : readPhoto(db, profile.id);
}
function importBundled(db) {
  for (const entry of manifest) seedPhoto(db, entry);
  return manifest.length;
}
module.exports = {
  initialize,
  bundledPhoto,
  savePhoto,
  readPhoto,
  profilePhoto,
  importBundled,
  manifest,
};
