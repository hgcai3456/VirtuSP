"use strict";
const roster = require("../public/js/roster.js");
const RETIRED_IDS = new Set([
  "denise",
  "marcus",
  "mramirez",
  "comparison-alex-demo",
]);
const RETIRED_NAMES = new Set([
  "denise carter",
  "marcus lee",
  "marcus ramirez",
  "alex morgan",
]);
function isHiddenFromStudio(p) {
  if (!p) {
    return true;
  }
  if (
    RETIRED_IDS.has(p.id) ||
    RETIRED_NAMES.has(String(p.name || "").toLowerCase())
  ) {
    return true;
  }

  return p.origin === "organizer";
}

function fromRoster(r) {
  return {
    id: r.id,
    name: r.name,
    age: r.age,
    gender: r.voice === "female" ? "female" : "male",
    intro: r.intro,
    personality: r.personality,
    style: r.style,
    emotion: r.emotion,
    // Retain the complete authored source. Presentation fields are faculty
    // context, not a replacement for gated encounter facts.
    summary: [r.complaint, r.history, r.diagnosis].filter(Boolean).join(". "),
    originalRoster: structuredClone(r),
    rosterDataRevision: 1,
    origin: "roster",
    preparedDemo: true,
    reviewAcknowledged: true,
    rubricApplicable: [1, 2, 3, 4, 5, 6, 7],
    hints: r.hints || [],
    facts: (r.facts || []).map((f) => ({
      ...f,
      reviewed: true,
      date:
        f.date ||
        (f.lab ? /\d{4}-\d{2}-\d{2}/.exec(f.label)?.[0] || "" : f.date),
    })),
    artifacts: (r.artifacts || []).map((a) => ({
      ...a,
      release: a.unlock?.length ? "question" : "section",
      reviewed: true,
    })),
    obj: r.obj || [],
    mm: r.mm,
    sources: [
      {
        id: "approved-case",
        title: "Approved case",
        excerpt: [r.complaint, r.history, r.diagnosis]
          .filter(Boolean)
          .join(" "),
        reviewed: true,
      },
    ],
    caseRubric: "",
    missing: [],
  };
}

function rosterProfiles() {
  return roster.map(fromRoster);
}

function rosterIds() {
  return roster.map((p) => p.id);
}

function restoreRosterContext(p, source) {
  if (
    p.origin !== "roster" ||
    p.rosterDataRevision ||
    p.name !== source.name ||
    p.age !== source.age
  )
    return false;
  // Only fill missing context; never replace authored facts or descriptions.
  if (!p.summary) p.summary = source.summary;
  if (!p.originalRoster)
    p.originalRoster = structuredClone(source.originalRoster);
  p.rosterDataRevision = 1;
  return true;
}

module.exports = {
  isHiddenFromStudio,
  rosterProfiles,
  rosterIds,
  restoreRosterContext,
  RETIRED_IDS,
};
