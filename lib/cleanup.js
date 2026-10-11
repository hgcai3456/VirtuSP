"use strict";
// Delete only untouched placeholder drafts. Releases, cases in use and uploads survive.
function emptyDraftIds(state) {
  const protectedIds = new Set([
    ...state.releases.map((r) => r.p.id),
    ...Object.values(state.encounters).map((e) => e.p.id),
    ...Object.values(state.groups || {}).flatMap((g) => g.profileIds || []),
    ...Object.values(state.assignments || {}).flatMap((a) =>
      (a.cases || []).map((c) => c.profileId),
    ),
    ...Object.values(state.attempts || {}).flatMap((a) =>
      (a.trials || []).map((c) => c.profileId),
    ),
  ]);
  return Object.values(state.drafts)
    .filter(
      (p) =>
        !protectedIds.has(p.id) &&
        /^(?:new patient|untitled patient)?$/i.test(
          String(p.name || "").trim(),
        ) &&
        p.age == null &&
        [
          "gender",
          "ethnicity",
          "education",
          "background",
          "summary",
          "description",
          "personality",
          "style",
          "emotion",
          "caseRubric",
          "image",
          "voiceId",
        ].every((k) => !p[k]) &&
        ["facts", "sources", "artifacts", "obj", "hints", "mm"].every(
          (k) => !p[k]?.length,
        ) &&
        !p.original &&
        ["", "Hello."].includes(p.intro || ""),
    )
    .map((p) => p.id);
}
module.exports = { emptyDraftIds };
