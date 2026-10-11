"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REQUIRED_PHASES,
  runAppointmentRegression,
} = require("../lib/appointment-regression");

test("a student doctor and a synthetic patient complete one grounded appointment", async () => {
  const report = await runAppointmentRegression();
  const failed = report.cases.filter((item) => item.status !== "pass");
  assert.equal(
    failed.length,
    0,
    failed.map((item) => item.id + " — " + item.observed).join("\n"),
  );
  assert.equal(report.passed, report.total);
  assert.equal(report.doctor, "Student clinician");
  assert.equal(report.patient, "Jordan Hale");
  REQUIRED_PHASES.forEach((phase) => {
    assert.ok(
      report.cases.some((item) => item.phase === phase && item.status === "pass"),
      phase,
    );
  });
});
