"use strict";

const { mergeChart } = require("./patient-response");

function fromDisclosed(disclosed) {
  return mergeChart(
    [],
    (disclosed || []).map((fact) => ({
      value: fact.label,
      category: fact.ehr || "history",
      timestamp: fact.provenance?.at || null,
      turnId: fact.provenance?.turnId || fact.provenance?.eventId || null,
      source: fact.provenance?.source || "patient_statement",
      confidence: fact.provenance?.confidence || "authored",
      field: fact.id,
    })),
  );
}

module.exports = { fromDisclosed };
