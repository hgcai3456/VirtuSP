#!/usr/bin/env node
"use strict";

const { runAppointmentRegression } = require("../lib/appointment-regression");

function has(name) {
  return process.argv.includes(name);
}

async function main() {
  if (has("--help")) {
    console.log("VirtuSP appointment regression");
    console.log("");
    console.log("  node agents/appointment-regression.js");
    console.log("");
    console.log("Replays one synthetic appointment. The student speaks as the doctor.");
    console.log("Exits 0 only when every turn passes.");
    return;
  }

  const report = await runAppointmentRegression();
  console.log("Appointment: " + report.doctor + " with " + report.patient);
  console.log("");
  report.cases.forEach((item) => {
    const mark = item.status === "pass" ? "PASS" : "FAIL";
    console.log(mark + "  " + item.phase + "  " + item.id);
    if (item.status !== "pass") {
      console.log("  expected: " + item.expected);
      console.log("  observed: " + item.observed);
    }
  });
  console.log("");
  const percent = report.total ? Math.round((report.passed / report.total) * 100) : 0;
  console.log("Passed " + report.passed + " of " + report.total + " (" + percent + "%).");
  if (report.passed !== report.total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
