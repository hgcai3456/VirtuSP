"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Verifier } = require("@pact-foundation/pact");
const { createApp } = require("../../server");
const { handlers, encounter } = require("./states");

process.env.PACT_DO_NOT_TRACK = "true";
process.env.AI_ENABLED = "false";
process.env.ELEVENLABS_API_KEY = "";
process.env.ELEVENLABS_VOICE_ID = "";
process.env.AVATAR_ENABLED = "false";
process.env.AWS_IMAGES_ENABLED = "false";
process.env.VIRTUSP_RATE_LIMIT = "100000";
process.env.VIRTUSP_REQUIRE_HTTPS = "false";
process.env.OBS_AWS_READ = "false";
process.env.OBS_ENVIRONMENT = "local";
process.env.PROFILE_ARCHIVE = "false";
delete process.env.S3_BUCKET;

const root = path.resolve(__dirname, "../..");
const pactFile = path.join(root, "pacts", "virtusp-web-virtusp-api.json");

function brokerOptions() {
  const baseUrl = process.env.PACT_BROKER_BASE_URL || "";
  const token = process.env.PACT_BROKER_TOKEN || "";
  if (!baseUrl || !token) return {};
  return {
    pactBrokerUrl: baseUrl,
    pactBrokerToken: token,
    publishVerificationResult: true,
    providerVersion: process.env.PACT_PROVIDER_VERSION || "1.0.0",
  };
}

test("provider satisfies every Pact interaction and the avatar event stream", async (t) => {
  assert.ok(fs.existsSync(pactFile), "consumer pact file is missing");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-pact-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const session = await encounter(base);
  const stream = await fetch(`${base}/api/encounters/${session.encounterId}/avatar/events`, {
    headers: { Cookie: session.cookie },
  });
  assert.equal(stream.status, 200, "GET /api/encounters/:id/avatar/events");
  assert.match(stream.headers.get("content-type") || "", /text\/event-stream/);
  await stream.body.cancel();

  await new Verifier({
    provider: "virtusp-api",
    providerBaseUrl: base,
    pactUrls: [pactFile],
    stateHandlers: handlers(base),
    logLevel: "warn",
    timeout: 300000,
    validateSSL: false,
    ...brokerOptions(),
  }).verifyProvider();
});
