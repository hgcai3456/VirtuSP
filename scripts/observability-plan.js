"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const dir = path.join(__dirname, "..", "infra", "aws");
const terraform = spawnSync("terraform", ["version"], { encoding: "utf8" });
if (terraform.error || terraform.status !== 0) {
  console.log(
    "BLOCKED: terraform is not available. When it is, run: terraform -chdir=infra/aws init && terraform -chdir=infra/aws plan -out=tfplan-observability",
  );
  process.exit(0);
}
const plan = spawnSync(
  "terraform",
  ["plan", "-input=false", "-out=tfplan-observability"],
  { cwd: dir, encoding: "utf8" },
);
process.stdout.write(plan.stdout || "");
process.stderr.write(plan.stderr || "");
if (plan.status !== 0) {
  console.error("BLOCKED: terraform plan did not succeed. No resources were applied.");
  process.exitCode = plan.status || 1;
}
