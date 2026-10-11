"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const photos = require("../lib/patient-photos");
const { createApp } = require("../lib/http");
const { facultyClient } = require("./http-client");
const assets = path.resolve(__dirname, "../corpus/patient-photos");

test("all eight supplied photos persist as BLOBs with explicit UUID/roster mappings", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.equal(photos.importBundled(db), 8);
    assert.equal(photos.importBundled(db), 8);
    const rows = db
      .prepare('SELECT *, typeof(photo) AS storage FROM "Patient Photos"')
      .all();
    assert.equal(rows.length, 8);
    for (const entry of photos.manifest) {
      const expected = fs.readFileSync(path.join(assets, entry.file));
      const row = rows.find((row) => row.patient_id === entry.patientId);
      assert.equal(row.storage, "blob");
      assert.equal(row.patient_name, entry.name);
      for (const id of [entry.patientId, entry.profileId]) {
        const image = photos.profilePhoto(db, { id });
        assert.equal(image.type, "image/png");
        assert.equal(image.sha256.length, 64);
        assert.deepEqual(image.body, expected);
      }
    }
    assert.equal(
      photos.bundledPhoto({ id: "unknown", name: "Yvette Armstrong" }),
      null,
    );
    assert.equal(photos.profilePhoto(db, { id: "unknown" }), null);
    assert.equal(photos.readPhoto(db, "' OR 1=1 --"), null);
  } finally {
    db.close();
  }
});

test("photo updates survive restart and seeding never replaces stored bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-photo-db-"));
  const file = path.join(directory, "photos.sqlite");
  const entry = photos.manifest[0];
  const replacement = fs.readFileSync(
    path.resolve(__dirname, "../public/img/omar.jpg"),
  );
  let db = new DatabaseSync(file);
  try {
    const data = {
      patientId: entry.patientId,
      name: entry.name,
      body: replacement,
      contentType: "image/jpeg",
    };
    photos.savePhoto(db, data);
    photos.savePhoto(
      db,
      {
        ...data,
        body: fs.readFileSync(path.join(assets, entry.file)),
        contentType: "image/png",
      },
      { replace: false },
    );
    db.close();
    db = new DatabaseSync(file);
    assert.deepEqual(
      photos.profilePhoto(db, { id: entry.profileId }).body,
      replacement,
    );
    photos.importBundled(db);
    assert.deepEqual(photos.readPhoto(db, entry.patientId).body, replacement);
    assert.equal(photos.readPhoto(db, entry.patientId).type, "image/jpeg");
    for (const invalid of ["", "  ", null])
      assert.throws(
        () => photos.savePhoto(db, { ...data, patientId: invalid }),
        /explicit patient/,
      );
    assert.throws(
      () => photos.savePhoto(db, { ...data, name: "" }),
      /explicit patient/,
    );
    for (const body of [
      Buffer.alloc(0),
      Buffer.alloc(5 * 1024 * 1024 + 1),
      new Uint8Array([1]),
    ])
      assert.throws(
        () => photos.savePhoto(db, { ...data, body }),
        /image data/,
      );
    assert.throws(
      () =>
        photos.savePhoto(db, { ...data, body: Buffer.from("not an image") }),
      /supported PNG/,
    );
    assert.throws(
      () => photos.savePhoto(db, { ...data, contentType: "image/png" }),
      /supported PNG/,
    );
    assert.throws(
      () => photos.savePhoto(db, { ...data, contentType: "text/html" }),
      /supported PNG/,
    );
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("profile pictures are returned from the database BLOB with correct MIME and cache policy", async () => {
  process.env.AI_ENABLED = "false";
  process.env.AWS_IMAGES_ENABLED = "false";
  process.env.PROFILE_ARCHIVE = "false";
  delete process.env.S3_BUCKET;
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "virtusp-photo-api-"),
  );
  const db = new DatabaseSync(":memory:");
  // A replacement BLOB proves the route uses the DB, rather than the seed/static image.
  const body = fs.readFileSync(path.join(assets, "dominic.png"));
  const entry = photos.manifest.find((p) => p.profileId === "nisha");
  photos.savePhoto(db, {
    patientId: entry.patientId,
    name: entry.name,
    body,
    contentType: "image/png",
  });
  const app = await createApp({ dataDir: directory, db: [db] });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const faculty = await facultyClient(
    `http://127.0.0.1:${app.server.address().port}`,
  );
  try {
    const response = await faculty("/api/profiles/nisha/image");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
    const next = fs.readFileSync(path.join(assets, "nisha.png"));
    photos.savePhoto(db, {
      patientId: entry.patientId,
      name: entry.name,
      body: next,
      contentType: "image/png",
    });
    assert.deepEqual(
      Buffer.from(
        await (await faculty("/api/profiles/nisha/image")).arrayBuffer(),
      ),
      next,
    );
    assert.equal(
      (await faculty("/api/profiles/no-such-patient/image")).status,
      404,
    );
  } finally {
    await app.store.flush();
    await new Promise((resolve) => app.server.close(resolve));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
