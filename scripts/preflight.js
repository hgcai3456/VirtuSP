"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const cloud = require("../lib/cloud");
cloud
  .preflight()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.checks
      .filter((c) => !c.optional)
      .every((c) => c.ok)
      ? 0
      : 1;
  })
  .catch((error) => {
    console.error(error.name + ": " + error.message);
    process.exitCode = 1;
  });
