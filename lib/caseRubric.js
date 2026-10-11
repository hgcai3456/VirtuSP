"use strict";
// Case-specific faculty rubrics: points checklists that apply to particular
// kinds of patient, scored in addition to the general seven-domain rubric.
// Each rubric is a JSON file in corpus/rubrics, so faculty wording lives in
// data rather than code.
const fs = require("node:fs");
const path = require("node:path");
const cloud = require("./cloud");
const DIR = path.join(__dirname, "..", "corpus", "rubrics");
const STATUSES = ["met", "partly", "not_met", "not_observable"];
const CREDIT = { met: 1, partly: 0.5, not_met: 0 };

function load() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
}
const rubrics = load();
const list = () =>
  rubrics.map((r) => ({
    id: r.id,
    title: r.title,
    appliesTo: r.appliesTo || null,
  }));

function ageMatch(p) {
  const age = Number(p?.age);
  if (p?.age == null || p.age === "" || !Number.isFinite(age)) return null;

  return (
    rubrics.find(
      (r) =>
        r.appliesTo &&
        (r.appliesTo.maxAge == null || age <= r.appliesTo.maxAge) &&
        (r.appliesTo.minAge == null || age >= r.appliesTo.minAge),
    ) || null
  );
}
// A specialty checklist runs only when faculty select its id. Age can suggest
// one; it never applies a hearing rubric to an unrelated pediatric case.
function forProfile(p) {
  const choice = String(p?.caseRubric || "");
  if (!choice || choice === "none") return null;

  return rubrics.find((r) => r.id === choice) || null;
}
function suggest(p) {
  if (String(p?.caseRubric || "")) return null;

  return ageMatch(p);
}
function selectionIssue(p) {
  const choice = String(p?.caseRubric || "");
  if (!choice || choice === "none") return "";
  if (!rubrics.some((r) => r.id === choice))
    return `Case rubric “${choice}” is not a known checklist. Choose a listed rubric or leave the general rubric.`;

  return "";
}

// Checks a model's scoring against the rubric and the encounter record.
function validate(result, rubric, enc) {
  if (!Array.isArray(result?.criteria)) throw new Error("Missing criteria.");
  const spoken = new Set(
    enc.events
      .filter((e) => e.type === "student" || e.type === "patient")
      .map((e) => e.id),
  );
  const expected = rubric.sections.flatMap((s) => s.criteria);
  const byId = new Map();
  for (const c of result.criteria) {
    const spec = expected.find((x) => x.id === c?.id);
    if (!spec || byId.has(c.id))
      throw new Error("Unknown or repeated criterion.");
    if (!STATUSES.includes(c.status))
      throw new Error("Invalid criterion status.");
    if (c.status === "not_observable" && !spec.allowNotObservable)
      throw new Error("This criterion cannot be marked not observable.");
    if (typeof c.reason !== "string" || !c.reason.trim())
      throw new Error("Each criterion needs a reason.");
    if (!Array.isArray(c.evidence) || c.evidence.some((id) => !spoken.has(id)))
      throw new Error("Criterion cites evidence outside the conversation.");
    if (["met", "partly"].includes(c.status) && !c.evidence.length)
      throw new Error("Credit requires cited evidence.");
    byId.set(c.id, c);
  }
  if (byId.size !== expected.length)
    throw new Error("Every criterion must be scored exactly once.");
  return byId;
}

function build(rubric, scored) {
  const round = (n) => Math.round(n * 100) / 100;
  let total = 0,
    max = 0;
  const sections = rubric.sections.map((s) => {
    let earned = 0,
      available = 0;
    const criteria = s.criteria.map((c) => {
      const points = s.points * c.share;
      const r = scored?.get(c.id);
      const status = r ? r.status : "not_scored";
      if (r && status !== "not_observable") {
        available += points;
        earned += points * CREDIT[status];
      }
      return {
        id: c.id,
        text: c.text,
        points: round(points),
        status,
        earned:
          r && status !== "not_observable"
            ? round(points * CREDIT[status])
            : null,
        reason: r ? r.reason.trim() : "",
        evidence: r ? r.evidence : [],
      };
    });
    total += earned;
    max += available;
    return {
      id: s.id,
      title: s.title,
      points: s.points,
      earned: scored ? round(earned) : null,
      available: scored ? round(available) : null,
      criteria,
    };
  });
  return {
    id: rubric.id,
    title: rubric.title,
    session: rubric.session || "",
    course: rubric.course || "",
    source: rubric.source || "",
    pointsNote: rubric.pointsNote || "",
    sections,
    total: scored ? round(total) : null,
    max: scored ? round(max) : null,
    fullPoints: rubric.sections.reduce((sum, s) => sum + s.points, 0),
  };
}

// Returns null when no case rubric applies to this patient.
async function score(enc) {
  const rubric = forProfile(enc.p);
  if (!rubric) return null;
  const base = {
    provider: "not-scored",
    model: null,
    failure: null,
    notice:
      "Faculty checklist for this kind of case. Model scoring is a draft for faculty review, not a grade.",
  };
  if (!cloud.enabled())
    return {
      ...build(rubric, null),
      ...base,
      notice:
        "Faculty checklist for this kind of case. It needs a model or a faculty member to score; no points are shown in local mode.",
    };
  try {
    const scored = validate(
      await cloud.checklist({
        rubric: {
          title: rubric.title,
          sections: rubric.sections.map((s) => ({
            title: s.title,
            criteria: s.criteria.map((c) => ({
              id: c.id,
              text: c.text,
              notObservableAllowed: !!c.allowNotObservable,
            })),
          })),
        },
        conversation: enc.events
          .filter((e) => e.type === "student" || e.type === "patient")
          .map((e) => ({ id: e.id, speaker: e.type, text: e.text })),
      }),
      rubric,
      enc,
    );
    return {
      ...build(rubric, scored),
      ...base,
      provider: "bedrock",
      model: cloud.model(),
    };
  } catch (e) {
    return {
      ...build(rubric, null),
      ...base,
      failure: e.name + ": " + e.message,
    };
  }
}
module.exports = {
  list,
  forProfile,
  suggest,
  selectionIssue,
  validate,
  build,
  score,
  rubrics,
};
