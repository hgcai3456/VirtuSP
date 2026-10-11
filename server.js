"use strict";
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
require("./lib/observability/register");
const { createApp } = require("./lib/http");
const observability = require("./lib/observability");
const cloud = require("./lib/cloud");
if (require.main === module)
  createApp()
    .then(({ server }) => {
      const host = process.env.HOST || "127.0.0.1";
      const requested = process.env.PORT;
      const port =
        requested == null || requested === "" ? 3000 : Number(requested);
      server.listen(port, host, () => {
        observability.startHeartbeat();
        const bound = server.address();
        console.log(
          `VirtuSP running at http://${host}:${bound.port} (${cloud.enabled() ? (cloud.provider() === "anthropic" ? "Claude API" : "Bedrock") + " configured" : "local fallback"})`,
        );
      });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { createApp };
