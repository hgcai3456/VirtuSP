"use strict";

// Formats an already approved patient line. It does not invent clinical text
// and it drops any fact the encounter has not disclosed.
function projectRecord(input = {}) {
  const text = typeof input.text === "string" ? input.text.slice(0, 2000) : "";
  const disclosed = input.disclosed || {};
  const facts = Array.isArray(input.facts) ? input.facts : [];
  const revealed = [];
  const seen = new Set();
  for (const id of input.factIds || []) {
    if (seen.has(id)) continue;
    const fact = facts.find((item) => item && item.id === id);
    const proof = disclosed[id];
    if (!fact || !proof) continue;
    if (fact.vis === "hidden" || fact.examiner) continue;
    seen.add(id);
    revealed.push({
      category: String(fact.ehr || "history").slice(0, 40),
      field: String(fact.id).slice(0, 80),
      value: String(fact.label || "").slice(0, 240),
      source: "patient_statement",
      confidence: "authored",
      turn_id: proof.turnId || proof.eventId || null,
      timestamp: proof.at || null,
    });
  }
  return {
    spoken_response: text,
    facts_revealed: revealed,
    chart_updates: revealed.slice(),
    patient_state: { engagement: "normal" },
  };
}

function mergeChart(existing, incoming) {
  const next = (existing || []).map((item) => ({ ...item }));
  for (const fact of incoming || []) {
    if (!fact || !fact.field) continue;
    const prior = next.find((item) => item.field === fact.field);
    if (!prior) {
      next.push({ ...fact });
      continue;
    }
    if (prior.value !== fact.value) prior.conflict = true;
  }
  return next;
}

module.exports = { projectRecord, mergeChart };
