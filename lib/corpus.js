"use strict";
// The upstream .jsonl actually contains consecutive pretty-printed JSON objects.
// Parse JSON boundaries without evaluating any source text or rewriting its values.
function patientRecords(text) {
  const records = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) {
      if (/\s/.test(c)) continue;
      if (c !== "{") throw new Error("Expected a patient JSON object.");
      start = i;
      depth = 1;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      const record = JSON.parse(text.slice(start, i + 1));
      if (!record.patient_overview?.name)
        throw new Error("Patient name missing in source record.");
      records.push(record);
      start = -1;
    }
  }
  if (start >= 0 || quoted) throw new Error("Incomplete patient JSON object.");
  return records;
}
function profileDocuments(record, provenance) {
  const disclosure = record.information_disclosure || {};
  const heading = `Organizer-linked synthetic patient material\nSource: ${provenance.url}\nRevision: ${provenance.revision}\nAttribution: VHS (Virtual Human Simulation) project, Rutgers University\nDerived by splitting supplied sections; no patient facts were generated.\nFaculty review is required before publication.\n`;
  const brief = {
    patient_overview: record.patient_overview,
    demographics: record.demographics,
    nutrition_profile: record.nutrition_profile,
    psychosocial_profile: record.psychosocial_profile,
    information_disclosure: Object.fromEntries(
      Object.entries(disclosure).filter(
        ([key]) => key !== "hidden_information",
      ),
    ),
    learning_opportunities: record.learning_opportunities,
  };
  const chart = {
    patient: record.patient_overview.name,
    clinical_profile: record.clinical_profile,
    medication_profile: record.medication_profile,
    hidden_information: disclosure.hidden_information,
  };
  return {
    "case-brief.txt":
      heading +
      "Upload purpose: Case brief. Follow explicit disclosure conditions. Reluctant material requires a guarded disclosure rule, not immediate disclosure.\n\n" +
      JSON.stringify(brief, null, 2) +
      "\n",
    "clinical-record.txt":
      heading +
      "Upload purpose: Chart report. All findings in this document are chart-only until faculty explicitly authors patient-known wording. Dates absent from the source remain unspecified.\n\n" +
      JSON.stringify(chart, null, 2) +
      "\n",
    "faculty-notes.txt":
      heading +
      "Faculty-only source assumptions and optional details. These are not automatically approved patient facts.\n\n" +
      JSON.stringify(record.metadata || {}, null, 2) +
      "\n",
  };
}
module.exports = { patientRecords, profileDocuments };
