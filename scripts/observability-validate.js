"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { METRICS, OBJECTIVES, OPERATIONS } = require("../lib/observability/catalog");

const root = path.join(__dirname, "..");
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log("ok " + name);
    return;
  }
  failed += 1;
  console.error("fail " + name + (detail ? ": " + detail : ""));
}

const required = [
  "name",
  "purpose",
  "unit",
  "type",
  "producer",
  "dimensions",
  "exportPath",
  "consumers",
  "missing",
  "retries",
];
for (const metric of METRICS) {
  for (const key of required) check(`catalog ${metric.name} ${key}`, metric[key] != null);
  check(`catalog ${metric.name} export`, metric.exportPath === "emf-stdout");
}
check("objectives", OBJECTIVES.length === 3);
check("operations bounded", OPERATIONS.length > 10 && OPERATIONS.length < 200);

const doc = fs.readFileSync(path.join(root, "docs/OBSERVABILITY.md"), "utf8");
for (const metric of METRICS) check(`doc names ${metric.name}`, doc.includes(metric.name));

const terraform = fs.readFileSync(
  path.join(root, "infra/aws/observability-dashboards.tf"),
  "utf8",
);
for (const name of ["service", "encounters", "ai", "safety", "infrastructure", "cost"])
  check(`dashboard ${name}`, terraform.includes(`aws_cloudwatch_dashboard" "${name}"`));

const alarms = fs.readFileSync(path.join(root, "infra/aws/observability.tf"), "utf8");
check("no duplicate metric filter", !alarms.includes("aws_cloudwatch_log_metric_filter"));
check("heartbeat alarm", alarms.includes("telemetry-heartbeat"));
check("synthetics gated", alarms.includes("var.enable_synthetics"));
check("signals gated", alarms.includes("var.enable_application_signals"));

const agent = JSON.parse(
  fs.readFileSync(path.join(root, "infra/aws/cloudwatch-agent.json"), "utf8"),
);
check(
  "application signals config",
  agent.traces && agent.traces.traces_collected && agent.traces.traces_collected.application_signals,
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const script of [
  "obs:local",
  "obs:test",
  "obs:smoke",
  "obs:validate",
  "obs:plan",
  "obs:verify-aws",
  "obs:teardown-plan",
])
  check(`script ${script}`, typeof packageJson.scripts[script] === "string");

if (failed) {
  console.error(failed + " checks failed");
  process.exitCode = 1;
} else {
  console.log("observability configuration checks passed");
}
