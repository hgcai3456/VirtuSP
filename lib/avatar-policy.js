"use strict";

const { UNKNOWNS } = require("./conversation");
const { EMPATHY_LEAD } = require("./safety");

// Server-owned courtesies and social lines. These are exact strings the
// encounter engine already commits; they are not a second dialogue model.
const SERVER_LINES = new Set([
  "Hello.",
  "Yes, your message came through.",
  "You're welcome.",
  "I'm doing all right. Thanks for asking.",
  "I'm listening.",
  "Nice to meet you too.",
  "Yes, that's fine.",
  "Thank you.",
  "Okay, I'm listening.",
]);

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function factById(enc, id) {
  return (enc?.p?.facts || []).find((fact) => fact && fact.id === id) || null;
}

function disclosed(enc, fact) {
  if (!fact) return false;
  if (enc?.disclosed?.[fact.id]) return true;
  return Number(fact.gate || 0) <= Number(enc?.trust || 0);
}

function approvedFactLine(enc, factIds) {
  if (!Array.isArray(factIds) || factIds.length === 0) return "";
  const parts = [];
  for (const id of factIds) {
    const fact = factById(enc, id);
    if (!fact || fact.vis !== "ask" || !normalize(fact.say)) return "";
    if (!disclosed(enc, fact)) return "";
    parts.push(normalize(fact.say));
  }
  return parts.join(" ");
}

function approvedCatalog(enc) {
  const lines = new Set(SERVER_LINES);
  for (const phrase of UNKNOWNS) lines.add(phrase);
  const intro = normalize(enc?.p?.intro);
  if (intro) lines.add(intro);
  for (const fact of enc?.p?.facts || []) {
    if (fact?.deflect) lines.add(normalize(fact.deflect));
    if (fact?.vis === "ask" && disclosed(enc, fact) && normalize(fact.say))
      lines.add(normalize(fact.say));
  }
  return lines;
}

function isChartWording(enc, text) {
  for (const fact of enc?.p?.facts || []) {
    if (fact?.vis === "ask") continue;
    if (normalize(fact?.say) === text || normalize(fact?.label) === text)
      return true;
  }
  return false;
}

// Avatar speech is allowed only when the committed turn is exactly
// faculty-approved patient wording, a server-owned courtesy, an approved
// deflection, or a server-owned unknown. Overlap is not a match.
function evaluateTurn(enc, turn) {
  if (!turn || turn.role !== "patient")
    return { ok: false, code: "not-patient-turn" };
  const text = normalize(turn.text);
  if (!text) return { ok: false, code: "empty-turn" };
  if (isChartWording(enc, text))
    return { ok: false, code: "chart-only" };
  const composed = approvedFactLine(enc, turn.factIds);
  if (composed && (text === composed || text === `${EMPATHY_LEAD} ${composed}`))
    return { ok: true, text, kind: "approved-facts" };
  if (approvedCatalog(enc).has(text)) {
    if (isChartWording(enc, text)) return { ok: false, code: "chart-only" };
    return { ok: true, text, kind: "approved-line" };
  }
  const lead = `${EMPATHY_LEAD} `;
  if (text.startsWith(lead) && approvedCatalog(enc).has(text.slice(lead.length)))
    return { ok: true, text, kind: "approved-variant" };
  return { ok: false, code: "unapproved-wording" };
}

module.exports = {
  SERVER_LINES,
  normalize,
  evaluateTurn,
};
