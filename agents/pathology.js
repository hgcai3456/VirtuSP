#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { openDb, counts } = require("../lib/db");
const pathology = require("../lib/pathology");

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return "";
  return process.argv[i + 1] || "";
}

async function main() {
  const dest =
    arg("--file") ||
    path.join(__dirname, "..", "data", "pathology", "health_markers_dataset.csv");
  if (!fs.existsSync(dest) || process.argv.includes("--download")) {
    console.log("Downloading " + pathology.SOURCE);
    await pathology.downloadTo(dest);
  }
  const text = fs.readFileSync(dest, "utf8");
  const rows = pathology.parseCsv(text);
  const db = openDb(process.env.VIRTUSP_DB || undefined);
  try {
    const imported = pathology.insertPathology(db, rows);
    const statePath = arg("--state") || pathology.defaultStatePath();
    const state = pathology.readState(statePath);
    const patients = pathology.patientsFromState(state);
    const evaluations = pathology.evaluatePatients(db, patients);
    const filled = state ? pathology.fillDrafts(state, evaluations) : 0;
    if (state && filled) {
      const tmp = statePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, statePath);
    }
    const n = counts(db);
    console.log(
      "pathology_results=" +
        n.pathology_results +
        " pathology_evaluations=" +
        n.pathology_evaluations +
        " drafts=" +
        filled +
        " source=" +
        imported.source,
    );
    for (const row of evaluations) {
      const group = row.nearest_condition || "unspecified";
      console.log(row.patient_name + " (" + row.patient_id + "): " + group);
      console.log("  " + row.summary);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
