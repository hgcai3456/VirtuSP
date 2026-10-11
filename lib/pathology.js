"use strict";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { nowIso } = require("./db");
const { writeTransaction } = require("./write-orchestrator");
const { rosterProfiles } = require("./roster-profiles");

const SOURCE = "kaggle:pareshbadnore/diagnostic-pathology-test-results";
const DOWNLOAD_URL =
  "https://www.kaggle.com/api/v1/datasets/download/pareshbadnore/diagnostic-pathology-test-results?file_name=health_markers_dataset.csv";
const COLUMNS = [
  "Blood_glucose",
  "HbA1C",
  "Systolic_BP",
  "Diastolic_BP",
  "LDL",
  "HDL",
  "Triglycerides",
  "Haemoglobin",
  "MCV",
  "Condition",
];
const PANEL = [
  { key: "blood_glucose", label: "Blood glucose", unit: "mg/dL", min: 40, max: 600, units: ["mg/dl"] },
  { key: "hba1c", label: "HbA1c", unit: "%", min: 3, max: 20, units: ["%"] },
  { key: "systolic_bp", label: "Systolic blood pressure", unit: "mmHg", min: 70, max: 260, units: ["mmhg"] },
  { key: "diastolic_bp", label: "Diastolic blood pressure", unit: "mmHg", min: 40, max: 160, units: ["mmhg"] },
  { key: "ldl", label: "LDL", unit: "mg/dL", min: 20, max: 400, units: ["mg/dl"] },
  { key: "hdl", label: "HDL", unit: "mg/dL", min: 5, max: 150, units: ["mg/dl"] },
  { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", min: 20, max: 2000, units: ["mg/dl"] },
  { key: "haemoglobin", label: "Haemoglobin", unit: "g/dL", min: 3, max: 22, units: ["g/dl"] },
  { key: "mcv", label: "MCV", unit: "fL", min: 50, max: 140, units: ["fl"] },
];
const BY_KEY = new Map(PANEL.map((marker) => [marker.key, marker]));

function panelByKey(key) {
  return BY_KEY.get(key);
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) {
    throw new Error("Pathology file is empty");
  }
  const header = splitCsvLine(lines[0]);
  if (header.join(",") !== COLUMNS.join(",")) {
    throw new Error("Pathology file is missing the expected columns");
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length !== COLUMNS.length) {
      throw new Error("Pathology row " + i + " has " + cols.length + " columns");
    }
    const numbers = cols.slice(0, 9).map((value) => Number(value));
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error("Pathology row " + i + " has a non-numeric marker");
    }
    const condition = cols[9];
    if (!condition) {
      throw new Error("Pathology row " + i + " has no condition");
    }
    rows.push({
      source_row: i,
      blood_glucose: numbers[0],
      hba1c: numbers[1],
      systolic_bp: numbers[2],
      diastolic_bp: numbers[3],
      ldl: numbers[4],
      hdl: numbers[5],
      triglycerides: numbers[6],
      haemoglobin: numbers[7],
      mcv: numbers[8],
      condition,
    });
  }
  if (!rows.length) {
    throw new Error("Pathology file has no data rows");
  }
  return rows;
}

function insertPathology(db, rows, source = SOURCE) {
  const ingestedAt = nowIso();
  return writeTransaction(db, () => {
    db.prepare("DELETE FROM pathology_results WHERE source = ?").run(source);
    const insert = db.prepare(`
      INSERT INTO pathology_results (
        source, source_row, blood_glucose, hba1c, systolic_bp, diastolic_bp,
        ldl, hdl, triglycerides, haemoglobin, mcv, condition, ingested_at
      ) VALUES (
        @source, @source_row, @blood_glucose, @hba1c, @systolic_bp, @diastolic_bp,
        @ldl, @hdl, @triglycerides, @haemoglobin, @mcv, @condition, @ingested_at
      )
    `);
    for (const row of rows) {
      insert.run({ ...row, source, ingested_at: ingestedAt });
    }
    return {
      source,
      inserted: rows.length,
      ingested_at: ingestedAt,
    };
  });
}

function loadRows(db, source = SOURCE) {
  return db
    .prepare(
      `SELECT blood_glucose, hba1c, systolic_bp, diastolic_bp, ldl, hdl,
              triglycerides, haemoglobin, mcv, condition
       FROM pathology_results
       WHERE source = ?
       ORDER BY source_row`,
    )
    .all(source);
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cohortStats(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.condition)) groups.set(row.condition, []);
    groups.get(row.condition).push(row);
  }
  const stats = [];
  for (const [condition, list] of groups) {
    const markers = {};
    for (const marker of PANEL) {
      const values = list
        .map((row) => row[marker.key])
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      const center = median(values);
      const deviations = values
        .map((value) => Math.abs(value - center))
        .sort((a, b) => a - b);
      markers[marker.key] = { median: center, mad: median(deviations) };
    }
    stats.push({ condition, n: list.length, markers });
  }
  return stats;
}

function normalizeUnit(unit) {
  return String(unit || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function setMarker(found, key, value, unit) {
  const marker = panelByKey(key);
  if (!marker || !Number.isFinite(value)) return;
  if (value < marker.min || value > marker.max) return;
  const normalized = normalizeUnit(unit);
  if (normalized && !marker.units.includes(normalized)) return;
  found[key] = {
    key,
    label: marker.label,
    value,
    unit: unit || marker.unit,
  };
}

function markerFromName(name) {
  const text = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
  if (!text || /orthostatic|drop|standing/.test(text)) return null;
  if (text === "bp" || text === "blood pressure" || /\bblood pressure\b/.test(text)) {
    return "blood_pressure";
  }
  if (/\bhba1c\b|\ba1c\b/.test(text)) return "hba1c";
  if (/\bhaemoglobin\b|\bhemoglobin\b|\bhgb\b/.test(text)) return "haemoglobin";
  if (/\bldl\b/.test(text)) return "ldl";
  if (/\bhdl\b/.test(text)) return "hdl";
  if (/triglyceride/.test(text)) return "triglycerides";
  if (/\bmcv\b|corpuscular volume/.test(text)) return "mcv";
  if (/\bglucose\b|\bblood sugar\b/.test(text)) return "blood_glucose";
  if (/^bp\b/.test(text)) return "blood_pressure";
  return null;
}

function unitsUnspecified(text) {
  return /\bunits?\b[^.]{0,40}\bunspecified\b/i.test(String(text || ""));
}

function scanNamed(found, blob) {
  const patterns = [
    ["hba1c", /\b(?:hba1c|a1c)\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(%)/gi],
    ["haemoglobin", /\b(?:haemoglobin|hemoglobin|hgb)\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(g\/dl)/gi],
    ["ldl", /\bldl\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(mg\/dl)/gi],
    ["hdl", /\bhdl\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(mg\/dl)/gi],
    ["triglycerides", /\btriglycerides?\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(mg\/dl)/gi],
    ["blood_glucose", /\b(?:blood glucose|glucose|blood sugar)\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(mg\/dl)/gi],
    ["mcv", /\bmcv\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*(fl)/gi],
  ];
  for (const [key, pattern] of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(blob);
    if (match) setMarker(found, key, Number(match[1]), match[2]);
  }
  const pressure = blob.match(
    /\b(?:blood pressure|\bbp)\b[^0-9]{0,16}(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(mmhg)/i,
  );
  if (pressure) {
    setMarker(found, "systolic_bp", Number(pressure[1]), pressure[3]);
    setMarker(found, "diastolic_bp", Number(pressure[2]), pressure[3]);
  }
}

function applyReading(found, name, rawValue, unit, text) {
  const blob = [name, rawValue, text]
    .filter((part) => part != null && part !== "")
    .join(" ");
  if (unitsUnspecified(blob)) return;
  const explicit = String(unit || "").trim();
  const kind = markerFromName(name);
  if (kind && explicit) {
    const reading = String(rawValue == null ? "" : rawValue);
    if (kind === "blood_pressure") {
      const pair = reading.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
      if (pair) {
        setMarker(found, "systolic_bp", Number(pair[1]), explicit);
        setMarker(found, "diastolic_bp", Number(pair[2]), explicit);
      }
    } else {
      const match = reading.match(/(\d+(?:\.\d+)?)/);
      if (match) setMarker(found, kind, Number(match[1]), explicit);
    }
    return;
  }
  scanNamed(found, blob);
}

function chartMarkers(profile) {
  const found = {};
  for (const fact of profile?.facts || []) {
    const onChart = fact.vis === "chart" || fact.lab || fact.ehr === "labs" || fact.sec === "labs";
    if (!onChart) continue;
    applyReading(found, fact.label, fact.label, fact.unit, fact.label);
  }
  for (const artifact of profile?.artifacts || []) {
    const labs = !artifact.sec || artifact.sec === "labs" || artifact.kind === "lab";
    if (!labs) continue;
    for (const row of artifact.rows || []) {
      applyReading(found, row.name, row.value, row.unit, row.name);
    }
  }
  return found;
}

function scaledDistance(cohort, present) {
  const keys = Object.keys(present);
  if (!keys.length) return null;
  let sum = 0;
  for (const key of keys) {
    const marker = cohort.markers[key];
    const scale = Math.max((marker.mad || 0) * 1.4826, 1e-6);
    sum += Math.abs(present[key].value - marker.median) / scale;
  }
  return sum / keys.length;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function formatValue(marker) {
  const rounded = Math.round(marker.value * 100) / 100;
  return marker.label + " " + rounded + " " + marker.unit;
}

function evaluatePatient(profile, stats, sampleRows) {
  const present = chartMarkers(profile);
  const presentList = PANEL.filter((marker) => present[marker.key]).map((marker) => present[marker.key]);
  const unspecified = PANEL.filter((marker) => !present[marker.key]).map((marker) => marker.label);
  const distances = {};
  let nearest = null;
  let second = null;
  if (presentList.length && stats.length) {
    for (const cohort of stats) {
      const distance = scaledDistance(cohort, present);
      distances[cohort.condition] = round4(distance);
      const entry = { condition: cohort.condition, distance, n: cohort.n };
      if (!nearest || distance < nearest.distance) {
        second = nearest;
        nearest = entry;
      } else if (!second || distance < second.distance) {
        second = entry;
      }
    }
  }
  const separated = nearest && (!second || nearest.distance + 0.25 < second.distance);
  const chosen = separated ? nearest : null;
  const name = profile.name || profile.id;
  const remainder = unspecified.length
    ? unspecified.join(", ") + " stay unspecified. "
    : "";
  const check =
    "This engineering check compares the published chart with the imported sample.";
  let summary;
  if (!presentList.length) {
    summary =
      name +
      " has none of the nine imported panel markers on the published chart, so this comparison stays unspecified. " +
      check;
  } else if (!chosen) {
    summary =
      name +
      " has " +
      presentList.map(formatValue).join(", ") +
      " on the published chart. Those values sit similarly close to more than one labeled group in the imported sample, so no single group is selected. " +
      remainder +
      check;
  } else {
    summary =
      name +
      " has " +
      presentList.map(formatValue).join(", ") +
      " on the published chart. The closest labeled group in the imported sample is " +
      chosen.condition +
      " (" +
      chosen.n +
      " sample rows, distance " +
      round4(chosen.distance) +
      "). " +
      remainder +
      check;
  }
  return {
    patient_id: profile.id,
    patient_name: name,
    markers_present: JSON.stringify(presentList),
    markers_unspecified: JSON.stringify(unspecified),
    nearest_condition: chosen ? chosen.condition : null,
    distance: chosen ? round4(chosen.distance) : null,
    distances: JSON.stringify(distances),
    sample_rows: sampleRows,
    summary,
  };
}

function evaluatePatients(db, patients, source = SOURCE) {
  const rows = loadRows(db, source);
  if (!rows.length) {
    throw new Error("Import pathology rows before evaluating patients");
  }
  const stats = cohortStats(rows);
  const evaluatedAt = nowIso();
  const evaluations = patients.map((patient) => evaluatePatient(patient, stats, rows.length));
  writeTransaction(db, () => {
    db.prepare("DELETE FROM pathology_evaluations").run();
    const insert = db.prepare(`
      INSERT INTO pathology_evaluations (
        patient_id, patient_name, markers_present, markers_unspecified,
        nearest_condition, distance, distances, sample_rows, summary, evaluated_at
      ) VALUES (
        @patient_id, @patient_name, @markers_present, @markers_unspecified,
        @nearest_condition, @distance, @distances, @sample_rows, @summary, @evaluated_at
      )
    `);
    for (const row of evaluations) {
      insert.run({ ...row, evaluated_at: evaluatedAt });
    }
  });
  return evaluations.map((row) => ({ ...row, evaluated_at: evaluatedAt }));
}

function patientsFromState(state) {
  const byId = new Map();
  for (const release of state?.releases || []) {
    if (release?.p?.id) byId.set(release.p.id, release.p);
  }
  for (const profile of rosterProfiles()) {
    if (!byId.has(profile.id)) byId.set(profile.id, profile);
  }
  for (const draft of Object.values(state?.drafts || {})) {
    if (draft?.id) byId.set(draft.id, draft);
  }
  return [...byId.values()].sort((a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id)),
  );
}

function fillDrafts(state, evaluations) {
  const byId = new Map((evaluations || []).map((row) => [row.patient_id, row]));
  let filled = 0;
  for (const draft of Object.values(state?.drafts || {})) {
    const evaluation = byId.get(draft?.id);
    if (!evaluation) continue;
    draft.pathologySample = {
      source: SOURCE,
      sampleRows: evaluation.sample_rows,
      nearestCondition: evaluation.nearest_condition,
      distance: evaluation.distance,
      markersPresent: JSON.parse(evaluation.markers_present),
      markersUnspecified: JSON.parse(evaluation.markers_unspecified),
      summary: evaluation.summary,
      evaluatedAt: evaluation.evaluated_at,
    };
    filled += 1;
  }
  return filled;
}

function readState(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function defaultStatePath() {
  const dir = process.env.VIRTUSP_DATA_DIR || path.join(__dirname, "..", "data");
  return path.join(dir, "state.json");
}

function downloadTo(dest, url = DOWNLOAD_URL, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "virtusp-pathology" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 5) {
          reject(new Error("Pathology download followed too many redirects"));
          return;
        }
        resolve(downloadTo(dest, new URL(res.headers.location, url).href, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error("Pathology download failed with HTTP " + res.statusCode));
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error("Pathology download timed out")));
    req.on("error", reject);
  });
}

module.exports = {
  SOURCE,
  DOWNLOAD_URL,
  COLUMNS,
  PANEL,
  parseCsv,
  insertPathology,
  loadRows,
  chartMarkers,
  evaluatePatient,
  evaluatePatients,
  patientsFromState,
  fillDrafts,
  readState,
  defaultStatePath,
  downloadTo,
};
