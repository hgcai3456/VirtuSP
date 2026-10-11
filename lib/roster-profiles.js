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
    rosterDialogueRevision: 1,
    origin: "roster",
    preparedDemo: true,
    reviewAcknowledged: true,
    rubricApplicable: [1, 2, 3, 4, 5, 6, 7],
    hints: r.hints || [],
    facts: [
      ...(r.facts || []),
      ...(r.patientHistory
        ? [
            {
              id: "authored-history",
              label: r.patientHistory.say,
              say: r.patientHistory.say,
              topic: r.patientHistory.topic,
              kw: r.patientHistory.kw,
              vis: "ask",
              ehr: "hx",
              gate: 0,
              type: "reported",
              src: "Authored roster history",
            },
          ]
        : []),
    ].map((f) => ({
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

// Older immutable releases predate neutral topics. Recover only matching
// authored metadata at inference time, without modifying those releases or
// passing labels, keywords, answers or source descriptions to the selector.
function selectionTopics(profile) {
  const source =
    profile.origin === "roster" &&
    roster.find(
      (p) =>
        p.id === profile.id && p.name === profile.name && p.age === profile.age,
    );
  return profile.facts.map((f) => {
    const original = source?.facts?.find((item) => item.id === f.id);
    const coarse =
      !f.topic ||
      ["hx", "meds", "labs", "img", "notes", "soc", "Patient history"].includes(
        f.topic,
      );
    const matches =
      original &&
      ["label", "say", "vis", "gate"].every((key) => original[key] === f[key]);
    return {
      id: f.id,
      kind: f.vis === "ask" ? "patient interview" : "chart record",
      topic:
        coarse && matches
          ? original.topic
          : f.topic || "Unspecified patient topic",
    };
  });
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

function restoreRosterDialogue(p, source) {
  if (
    p.origin !== "roster" ||
    p.rosterDialogueRevision ||
    p.name !== source.name ||
    p.age !== source.age
  )
    return false;
  const base = source.facts.filter((f) => f.id !== "authored-history");
  // Only upgrade unchanged bundled cases. Faculty additions/clinical edits need
  // faculty publication, and no old release or encounter is rewritten.
  if (
    p.facts.length !== base.length ||
    !base.every((f) => {
      const saved = p.facts.find((item) => item.id === f.id);
      return (
        saved &&
        ["label", "say", "vis", "gate", "deflect", "ehr", "sec"].every(
          (key) => saved[key] === f[key],
        )
      );
    })
  )
    return false;
  const topics = new Map(selectionTopics(p).map((f) => [f.id, f.topic]));
  for (const f of p.facts) f.topic = topics.get(f.id);
  const history = source.facts.find((f) => f.id === "authored-history");
  if (history) p.facts.push(structuredClone(history));
  p.rosterDialogueRevision = 1;
  return true;
}

module.exports = {
  isHiddenFromStudio,
  rosterProfiles,
  rosterIds,
  selectionTopics,
  restoreRosterContext,
  restoreRosterDialogue,
  RETIRED_IDS,
};
