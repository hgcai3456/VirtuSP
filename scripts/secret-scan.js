"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const listed = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (listed.status !== 0) {
  console.error("git ls-files failed");
  process.exit(1);
}
const pattern =
  /AKIA[0-9A-Z]{16}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|aws_secret_access_key[ \t]*=[ \t]*\S+/i;
let failed = 0;
for (const file of listed.stdout.split(/\r?\n/).filter(Boolean)) {
  if (file.startsWith("corpus/") || file.endsWith(".png") || file.endsWith(".jpg")) continue;
  let text = "";
  try {
    text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  } catch {
    continue;
  }
  if (pattern.test(text)) {
    failed += 1;
    console.error("secret pattern in " + file);
  }
}
if (failed) process.exit(1);
console.log("secret scan found no access keys or private keys in tracked files");
