"use strict";
// Local SQLite only: does not load .env or contact cloud providers.
const { openDb } = require("../lib/db");
const photos = require("../lib/patient-photos");
const db = openDb(process.argv[2] || process.env.VIRTUSP_DB);
try {
  const count = photos.importBundled(db);
  const rows = db
    .prepare(
      'SELECT patient_name, length(photo) AS bytes, typeof(photo) AS storage FROM "Patient Photos" ORDER BY patient_name',
    )
    .all();
  console.log(
    JSON.stringify(
      {
        database: db.file,
        table: "Patient Photos",
        imported: count,
        photos: rows,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
