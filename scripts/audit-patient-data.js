"use strict";
// Read-only inventory of the encounter store. Does not call Store.init(),
// which runs migrations, or load credentials or connect to AWS.
const fs = require("node:fs"),
  path = require("node:path");
const { isHiddenFromStudio } = require("../lib/roster-profiles");
const directory = path.resolve(process.env.VIRTUSP_DATA_DIR || "data");
const state = JSON.parse(
  fs.readFileSync(path.join(directory, "state.json"), "utf8"),
);
const inventory = {
  store: directory,
  counts: Object.fromEntries(
    ["drafts", "releases", "encounters", "files"].map((k) => [
      k,
      Object.keys(state[k] || {}).length,
    ]),
  ),
  patients: Object.values(state.drafts).map((p) => ({
    id: p.id,
    name: p.name,
    age: p.age,
    savedLibrary: isHiddenFromStudio(p),
    facts: p.facts.length,
    clinicalNotes: p.facts.filter(
      (f) => f.vis === "chart" && (f.sec === "notes" || f.ehr === "notes"),
    ).length,
    reports: p.artifacts.length,
    sources: p.sources.length,
    hasDescription: !!p.summary,
    hasOriginalSource: !!(p.original || p.originalRoster),
    headingOnlyCandidates: p.facts
      .filter(
        (f) =>
          f.vis === "chart" &&
          f.label.trim().toLowerCase() ===
            String(f.topic || "")
              .trim()
              .toLowerCase(),
      )
      .map((f) => f.id),
  })),
  missingOriginalFiles: Object.values(state.files)
    .filter((f) => !fs.existsSync(path.join(directory, "files", f.id)))
    .map((f) => f.id),
};
const index = process.argv.indexOf("--before");
if (index >= 0) {
  if (!process.argv[index + 1])
    throw new Error("Provide a JSON snapshot after --before.");
  const before = JSON.parse(fs.readFileSync(process.argv[index + 1], "utf8"));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  inventory.comparison = {
    removedDrafts: Object.values(before.drafts)
      .filter((p) => !state.drafts[p.id])
      .map((p) => ({ id: p.id, name: p.name })),
    changedDrafts: Object.values(before.drafts)
      .filter((p) => state.drafts[p.id])
      .map((p) => ({
        id: p.id,
        name: p.name,
        fields: Object.keys({ ...p, ...state.drafts[p.id] }).filter(
          (k) => !equal(p[k], state.drafts[p.id][k]),
        ),
      }))
      .filter((p) => p.fields.length),
    priorReleasesPreserved: before.releases.every((p) =>
      state.releases.some((q) => equal(p, q)),
    ),
    priorEncountersPreserved: Object.values(before.encounters).every((e) =>
      equal(e, state.encounters[e.id]),
    ),
    priorFilesPreserved: Object.values(before.files).every((f) =>
      equal(f, state.files[f.id]),
    ),
  };
}
console.log(JSON.stringify(inventory, null, 2));
