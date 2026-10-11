#!/usr/bin/env node
"use strict";
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const path = require("node:path");
const { Store } = require("../lib/store");
const { archiveState } = require("../lib/profile-archive");

function redact(error) {
  const message = String((error && error.message) || error || "profile archive failed");
  const password = process.env.PGPASSWORD;
  if (!password) return message;
  return message.split(password).join("[redacted]");
}

async function main() {
  const store = await new Store().init();
  const report = await archiveState(store.state, {
    filesDir: path.join(store.dir, "files"),
  });
  console.log(
    JSON.stringify({
      profiles: report.profiles,
      artifacts: report.artifacts,
      files: report.files,
      databases: report.databases,
      s3: report.s3.status,
      objects: report.objects,
    }),
  );
  if (report.errors.length) {
    console.error(report.errors.join("\n"));
    process.exit(1);
  }
  if (report.s3.status !== "synced") {
    console.error(report.s3.message || "S3 copy was not synced.");
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(redact(error));
  process.exit(1);
});
