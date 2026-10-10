"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..");
const script = path.join(repo, "perf", "run-jmeter.ps1");
const junit = path.join(repo, "reports", "junit", "perf.xml");

fs.mkdirSync(path.dirname(junit), { recursive: true });
fs.mkdirSync(path.join(repo, "reports", "perf"), { recursive: true });

const candidates =
  process.platform === "win32"
    ? ["powershell.exe", "pwsh.exe"]
    : ["pwsh", "powershell"];

function findShell() {
  for (const name of candidates) {
    const probe = spawnSync(name, ["-NoProfile", "-Command", "Write-Output ok"], {
      encoding: "utf8",
    });
    if (probe.status === 0) return name;
  }
  return null;
}

const shell = findShell();
if (!shell) {
  console.error(
    "Performance CI needs PowerShell (powershell or pwsh) to run perf/run-jmeter.ps1.",
  );
  process.exit(1);
}

const result = spawnSync(
  shell,
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-Ci",
    "-JUnitPath",
    junit,
  ],
  { cwd: repo, stdio: "inherit" },
);

process.exit(result.status == null ? 1 : result.status);
