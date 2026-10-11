const synthetics = require("Synthetics");
const log = require("SyntheticsLogger");

// External check of the public health endpoint. Response bodies are not
// stored. This canary does not sign in and does not send clinical content.
const ready = async function () {
  const hostname = process.env.HEALTH_HOSTNAME;
  if (!hostname) throw new Error("HEALTH_HOSTNAME is not set");
  const options = {
    hostname,
    method: "GET",
    path: "/api/ready",
    port: 443,
    protocol: "https:",
    headers: {},
  };
  const step = {
    includeRequestHeaders: false,
    includeResponseHeaders: false,
    includeRequestBody: false,
    includeResponseBody: false,
    restrictedHeaders: ["*"],
  };
  await synthetics.executeHttpStep("ready", options, null, step);
  log.info("ready check finished");
};

exports.handler = async () => ready();
