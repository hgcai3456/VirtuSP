"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");
const { cookieClient } = require("./http-client");
const obs = require("../lib/observability");
const { runScenario } = require("../scripts/observability-scenario");

describe("observability", { concurrency: false }, () => {
test("telemetry schema, redaction, retries, and unknown cost", async () => {
  obs.resetForTests();
  process.env.OBS_ENABLED = "true";
  process.env.OBS_ENVIRONMENT = "test";
  const secret = "Bearer sk-secret-token student.secret@example.test";
  obs.log("http.request", {
    operation: "GET /api/health",
    outcome: "ok",
    error_code: secret,
    provider: "bedrock",
    model_alias: "us.xai.grok-4.7",
  });
  const exported = obs.snapshot().serialized.join("\n");
  assert.equal(exported.includes("sk-secret"), false);
  assert.equal(exported.includes("example.test"), false);
  assert.equal(exported.includes("Bearer"), false);
  const record = obs.snapshot().logs.at(-1);
  for (const field of [
    "schema",
    "timestamp",
    "severity",
    "service",
    "environment",
    "request_id",
    "trace_id",
    "outcome",
  ])
    assert.ok(field in record, field);

  let tries = 0;
  const value = await obs.providerCall(
    {
      provider: "bedrock",
      operation: "dependency.bedrock.converse",
      modelId: "us.xai.grok-4.7",
      executionMode: "live",
      maxAttempts: 3,
    },
    async () => {
      tries += 1;
      if (tries < 3) {
        throw Object.assign(new Error(secret), {
          name: "ThrottlingException",
          code: "ThrottlingException",
        });
      }
      return { ok: true, usage: null };
    },
  );
  assert.equal(value.ok, true);
  assert.equal(tries, 3);
  const attempts = obs
    .snapshot()
    .emf.filter((item) => item.ProviderAttempt != null);
  const logical = obs
    .snapshot()
    .emf.filter(
      (item) => item.ProviderLogicalRequest != null && item.Outcome === "ok",
    );
  assert.equal(attempts.length, 3);
  assert.equal(logical.length, 1);
  assert.equal(exported.includes(secret) || obs.snapshot().serialized.join("\n").includes("sk-secret"), false);

  const unknown = obs.estimateCost(
    "us.xai.grok-4.7",
    { inputTokens: 10, outputTokens: 5 },
    "us-west-2",
  );
  assert.equal(unknown.estimatedUsd, null);
  assert.equal(unknown.basis, "unknown");
  const priced = obs.estimateCost(
    "us.xai.grok-4.7",
    { inputTokens: 1000, outputTokens: 0, cacheReadInputTokens: 0 },
    "us-west-2",
    {
      source: "unit-test price",
      effectiveDate: "2026-10-01",
      models: {
        "us.xai.grok-4.7": {
          regions: ["us-west-2"],
          inputPer1k: 0.003,
          outputPer1k: 0.015,
          cacheReadPer1k: 0.001,
          cacheWritePer1k: 0.004,
        },
      },
    },
  );
  assert.equal(priced.basis, "estimated");
  assert.equal(priced.estimatedUsd, 0.003);

  obs.emit("ApiRequest", 1, {
    Operation: "GET /api/health",
    Outcome: "ok",
    EncounterId: "11111111-1111-1111-1111-111111111111",
  });
  const point = obs.snapshot().emf.find((item) => item.ApiRequest === 1);
  assert.equal(point.EncounterId, undefined);
  assert.equal(JSON.stringify(point).includes("11111111"), false);
});

test("stream cancellation is not a server error and export failure stays open", () => {
  obs.resetForTests();
  const { EventEmitter } = require("node:events");
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.writableEnded = false;
  obs.watchStream(req, res);
  req.emit("close");
  const cancelled = obs.snapshot().logs.find((item) => item.outcome === "cancelled");
  assert.ok(cancelled);
  assert.equal(cancelled.outcome, "cancelled");
  assert.doesNotThrow(() => obs.failOpen(new Error("collector down")));
});

test("fault injection is refused in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.OBS_FAULT_INJECTION = "1";
  assert.throws(() => obs.armFault("persistence"), /production/);
  process.env.NODE_ENV = previous;
});

test("faculty timeline is protected and a persistence failure is visible", async () => {
  process.env.AI_ENABLED = "false";
  process.env.OBS_ENABLED = "true";
  process.env.OBS_FAULT_INJECTION = "1";
  process.env.OBS_ENVIRONMENT = "test";
  obs.resetForTests();
  const result = await runScenario();
  assert.equal(result.label, "Local synthetic test telemetry");
  assert.ok(result.events >= 3);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-obs-fail-"));
  const app = await createApp({ dataDir: dir });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const faculty = cookieClient(base);
  try {
    await faculty("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "faculty" }),
    });
    const anon = await fetch(base + "/api/observability/summary");
    assert.equal(anon.status, 401);
    const { Store } = require("../lib/store");
    const store = await new Store(dir).init();
    obs.armFault("persistence", 1);
    await assert.rejects(() => store.save(), /Injected persistence failure/);
    const failed = obs
      .snapshot()
      .emf.some((item) => item.PersistenceFailure != null);
    assert.equal(failed, true);
    const health = await fetch(base + "/api/health");
    assert.equal(health.status, 200);
  } finally {
    obs.clearFaults();
    await new Promise((resolve) => app.server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CloudWatch reads search the published dimension set", () => {
  const aws = require("../lib/observability/aws-read");
  const queries = aws.metricQueries("local");
  assert.equal(queries[0].Expression.startsWith("SUM(SEARCH("), true);
  assert.equal(Object.hasOwn(queries[0], "MetricStat"), false);
  assert.equal(aws.sumOrNull({ Values: [] }), null);
  assert.equal(aws.sumOrNull({ Values: [2, 3] }), 5);
});

test("trace exporter stays idle without an endpoint", () => {
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const started = require("../lib/observability/register-sdk").start();
  assert.equal(started.started, false);
  assert.equal(started.reason, "no_endpoint");
});

test("pinned telemetry packages construct without registering a global exporter", async () => {
  const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
  const { Resource } = require("@opentelemetry/resources");
  const { CloudWatchClient } = require("@aws-sdk/client-cloudwatch");
  const { CloudWatchLogsClient } = require("@aws-sdk/client-cloudwatch-logs");
  assert.equal(typeof CloudWatchClient, "function");
  assert.equal(typeof CloudWatchLogsClient, "function");
  const provider = new NodeTracerProvider({
    resource: new Resource({ "service.name": "virtusp-test" }),
  });
  await provider.shutdown();
});

test("operator page does not invent a healthy value", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../public/observability.html"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(__dirname, "../public/js/observability.js"),
    "utf8",
  );
  for (const label of [
    "Live AWS telemetry",
    "Local synthetic test telemetry",
    "No data",
    "Not configured",
    "Not assessed",
  ])
    assert.equal(script.includes(label), true, label);
  assert.equal(html.includes("99.5"), false);
  assert.equal(script.includes("99.9"), false);
});
});
