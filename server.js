"use strict";
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const { createApp } = require("./lib/http");
const cloud = require("./lib/cloud");
if (require.main === module)
  createApp()
    .then(({ server }) => {
      const port = Number(process.env.PORT) || 3000;
      server.listen(port, process.env.HOST || "127.0.0.1", () =>
        console.log(
          `VirtuSP at http://localhost:${port} (${cloud.enabled() ? "Bedrock configured" : "local fallback"})`,
        ),
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { createApp };
