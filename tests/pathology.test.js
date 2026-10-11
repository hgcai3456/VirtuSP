"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDb } = require("../lib/db");
const pathology = require("../lib/pathology");

const header = pathology.COLUMNS.join(",");
const sample = [
  header,
  "90,5.2,110,70,100,55,90,14.2,88,Fit",
  "92,5.1,112,72,98,54,95,14.0,89,Fit",
  "96,5.4,168,100,110,50,120,13.8,87,Hypertension",
  "94,5.3,170,102,108,49,118,13.6,86,Hypertension",
  "88,5.0,108,68,102,56,92,8.2,62,Anemia",
  "91,5.2,111,71,99,53,94,8.0,64,Anemia",
  "180,9.1,116,74,104,52,140,14.1,88,Diabetes",
  "176,8.8,114,73,101,51,136,13.9,87,Diabetes",
].join("\n");

function labProfile(id, name, rows) {
  return {
    id,
    name,
    facts: [],
    artifacts: [
      {
        id: id + "-lab",
        kind: "lab",
        sec: "labs",
        rows,
      },
    ],
  };
}

test("pathology import compares chart markers and leaves the rest unspecified", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-pathology-"));
  const db = openDb(path.join(dir, "pathology.sqlite"));
  try {
    const imported = pathology.insertPathology(db, pathology.parseCsv(sample));
    assert.equal(imported.inserted, 8);
    const again = pathology.insertPathology(db, pathology.parseCsv(sample));
    assert.equal(again.inserted, 8);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM pathology_results").get().n,
      8,
    );

    const pressure = labProfile("pressure", "Pressure Case", [
      { name: "Blood pressure", value: "166/99", unit: "mmHg" },
    ]);
    const hemoglobin = labProfile("heme", "Hemoglobin Case", [
      { name: "Hemoglobin", value: "8.1", unit: "g/dL" },
    ]);
    const peak = labProfile("peak", "Peak Flow Case", [
      { name: "Peak flow", value: "210", unit: "L/min" },
    ]);
    const drop = labProfile("drop", "Orthostatic Case", [
      { name: "Systolic drop on standing", value: "22", unit: "mmHg" },
    ]);
    const evaluations = pathology.evaluatePatients(db, [pressure, hemoglobin, peak, drop]);
    const byId = Object.fromEntries(evaluations.map((row) => [row.patient_id, row]));

    assert.equal(byId.pressure.nearest_condition, "Hypertension");
    assert.deepEqual(JSON.parse(byId.pressure.markers_unspecified), [
      "Blood glucose",
      "HbA1c",
      "LDL",
      "HDL",
      "Triglycerides",
      "Haemoglobin",
      "MCV",
    ]);
    assert.match(byId.pressure.summary, /engineering check/);
    assert.doesNotMatch(byId.pressure.summary, /diagnosis/);

    assert.equal(byId.heme.nearest_condition, "Anemia");
    assert.equal(JSON.parse(byId.heme.markers_present)[0].value, 8.1);

    assert.equal(byId.peak.nearest_condition, null);
    assert.equal(JSON.parse(byId.peak.markers_present).length, 0);
    assert.match(byId.peak.summary, /unspecified/);
    assert.doesNotMatch(byId.peak.markers_unspecified, /normal|negative|Fit/);

    assert.equal(byId.drop.nearest_condition, null);
    assert.equal(JSON.parse(byId.drop.markers_present).length, 0);

    const stored = db.prepare("SELECT COUNT(*) AS n FROM pathology_evaluations").get().n;
    assert.equal(stored, 4);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unitless lipid text stays unspecified and does not borrow total cholesterol", () => {
  const markers = pathology.chartMarkers({
    facts: [
      {
        label: "Organizer values: total cholesterol 260, LDL 195, HDL 30. Units and date unspecified.",
        vis: "chart",
        ehr: "labs",
        sec: "labs",
      },
    ],
    artifacts: [
      {
        sec: "labs",
        kind: "report",
        text: "Organizer values: total cholesterol 260, LDL 195, HDL 30. Units and date unspecified.",
        rows: [],
      },
    ],
  });
  assert.equal(markers.ldl, undefined);
  assert.equal(markers.hdl, undefined);
  assert.equal(markers.blood_glucose, undefined);

  const withUnits = pathology.chartMarkers({
    facts: [
      {
        label: "LDL 195 mg/dL, HDL 30 mg/dL",
        vis: "chart",
        ehr: "labs",
      },
    ],
    artifacts: [],
  });
  assert.equal(withUnits.ldl.value, 195);
  assert.equal(withUnits.hdl.value, 30);
});

test("draft fill keeps the comparison off patient speech and does not copy sample values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-pathology-fill-"));
  const db = openDb(path.join(dir, "pathology.sqlite"));
  try {
    pathology.insertPathology(db, pathology.parseCsv(sample));
    const pressure = labProfile("pressure", "Pressure Case", [
      { name: "Blood pressure", value: "166/99", unit: "mmHg" },
    ]);
    const peak = labProfile("peak", "Peak Flow Case", [
      { name: "Peak flow", value: "210", unit: "L/min" },
    ]);
    const state = {
      drafts: {
        pressure: { ...pressure, facts: [{ id: "spoken", say: "My ankles are swollen.", vis: "ask" }], sources: [] },
        peak: { ...peak, facts: [], sources: [] },
      },
      releases: [{ p: { ...pressure, version: 1 }, at: "2026-10-10T00:00:00.000Z" }],
    };
    const evaluations = pathology.evaluatePatients(db, pathology.patientsFromState(state));
    assert.equal(pathology.fillDrafts(state, evaluations), 2);
    assert.equal(state.drafts.pressure.facts[0].say, "My ankles are swollen.");
    assert.equal(state.drafts.pressure.facts.length, 1);
    assert.equal(state.drafts.pressure.pathologySample.nearestCondition, "Hypertension");
    assert.match(state.drafts.pressure.pathologySample.summary, /166/);
    assert.doesNotMatch(state.drafts.pressure.pathologySample.summary, /\b168\b|\b170\b/);
    assert.equal(state.drafts.peak.pathologySample.nearestCondition, null);
    assert.match(state.drafts.peak.pathologySample.summary, /unspecified/);
    assert.equal(state.releases[0].p.pathologySample, undefined);
    assert.equal(state.drafts.peak.artifacts[0].rows[0].value, "210");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("chart marker reading keeps an orthostatic drop off the blood pressure columns", () => {
  const markers = pathology.chartMarkers({
    facts: [
      {
        label: "Orthostatic systolic drop 22 mmHg",
        vis: "chart",
        lab: true,
        unit: "mmHg",
        ehr: "labs",
      },
      {
        label: "BP 162/98 mmHg (ref <120/80)",
        vis: "chart",
        lab: true,
        unit: "mmHg",
        ehr: "labs",
      },
    ],
    artifacts: [],
  });
  assert.equal(markers.systolic_bp.value, 162);
  assert.equal(markers.diastolic_bp.value, 98);
  assert.equal(markers.haemoglobin, undefined);
});
