"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { emptyDraftIds } = require("../lib/cleanup");
test("Empty draft cleanup preserves authored content, uploads and all referenced versions", () => {
  const blank = (id) => ({
    id,
    name: "New Patient",
    age: null,
    intro: "Hello.",
    facts: [],
    sources: [],
    artifacts: [],
    obj: [],
  });
  const state = {
    drafts: {},
    releases: [],
    encounters: {},
    groups: {},
    assignments: {},
    attempts: {},
  };
  for (const id of [
    "empty",
    "age",
    "fact",
    "source",
    "artifact",
    "background",
    "published",
    "encounter",
    "group",
    "assigned",
    "trial",
  ])
    state.drafts[id] = blank(id);
  state.drafts.age.age = 0;
  state.drafts.fact.facts = [{ label: "Clinical finding" }];
  state.drafts.source.sources = [{ fileId: "uploaded-file" }];
  state.drafts.artifact.artifacts = [{ text: "Report" }];
  state.drafts.background.background = "Authored information";
  state.releases = [{ p: blank("published") }];
  state.encounters.e = { p: blank("encounter") };
  state.groups.g = { profileIds: ["group"] };
  state.assignments.a = { cases: [{ profileId: "assigned" }] };
  state.attempts.t = { trials: [{ profileId: "trial" }] };
  assert.deepEqual(emptyDraftIds(state), ["empty"]);
});
