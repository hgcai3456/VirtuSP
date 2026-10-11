"use strict";
const { randomUUID, randomInt } = require("node:crypto");
const profiles = require("./profiles");
const engine = require("./engine");
const {
  rosterProfiles,
  rosterIds,
  bundledPatients,
  restoreRosterContext,
  restoreRosterDialogue,
} = require("./roster-profiles");
// With BUNDLED_PATIENTS=false the library holds only patients faculty import,
// generate or write. Cases that shipped with the app are cleared from existing
// data once and are not added at start. Finished and running visits keep
// their own copy of the case.
const FORMER_BUILT_INS = ["denise", "marcus"];
function removeBuiltIns(store) {
  const s = store.state;
  let changed = false;
  const pinned = (id) =>
    Object.values(s.attempts || {}).some((a) =>
      (a.trials || []).some((t) => t.profileId === id && !t.encounterId),
    );
  for (const id of [...rosterIds(), ...FORMER_BUILT_INS]) {
    const draft = s.drafts[id];
    if (!draft || !["roster", "scaffold", undefined].includes(draft.origin))
      continue;
    delete s.drafts[id];
    // A version a student is still due to start stays available to them.
    if (!pinned(id)) s.releases = s.releases.filter((r) => r.p.id !== id);
    changed = true;
  }
  for (const [id, group] of Object.entries(s.groups || {}))
    if ((group.profileIds || []).some((p) => !s.drafts[p])) {
      delete s.groups[id];
      for (const [key, a] of Object.entries(s.assignments || {}))
        if (a.groupId === id && !a.attemptId) delete s.assignments[key];
      changed = true;
    }
  return changed;
}
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
function initialize(store) {
  const s = store.state;
  let changed = false;
  for (const key of [
    "students",
    "groups",
    "assignments",
    "attempts",
    "biasResults",
  ])
    if (!s[key]) {
      s[key] = {};
      changed = true;
    }
  for (const p of Object.values(s.drafts)) {
    if (p.original && !p.sourceContextRevision) {
      if (!p.summary)
        p.summary = [p.original.summary, p.original.notes]
          .filter(Boolean)
          .join("\n\n");
      p.sourceContextRevision = 1;
      changed = true;
    }
  }
  const seeds = require("../corpus/prepared-groups.json");
  // Without bundled patients, a prepared group is seeded only when its own
  // cases ship with it.
  const shipped = new Set(seeds.profiles.map((p) => p.id));
  for (const group of seeds.groups.filter(
    (g) => bundledPatients() || g.profileIds.every((id) => shipped.has(id)),
  ))
    if (
      !s.groups[group.id] ||
      (s.groups[group.id].seedRevision || 0) < (group.seedRevision || 0)
    ) {
      for (const id of group.profileIds) {
        if (!s.drafts[id])
          s.drafts[id] = profiles.clone(
            seeds.profiles.find((p) => p.id === id),
          );
      }
      const previous = s.groups[group.id];
      s.groups[group.id] = profiles.clone(group);
      if (typeof previous?.availableToAll === "boolean")
        s.groups[group.id].availableToAll = previous.availableToAll;
      changed = true;
    }
  if (!bundledPatients() && removeBuiltIns(store)) changed = true;
  for (const p of bundledPatients() ? rosterProfiles() : []) {
    const structuralErrors = profiles
      .validate({ ...profiles.clone(p), reviewAcknowledged: true })
      .filter((i) => i.severity === "error");
    if (structuralErrors.length)
      throw fail("Roster case is invalid: " + structuralErrors[0].message, 500);
    if (!s.drafts[p.id]) {
      s.drafts[p.id] = profiles.clone(p);
      changed = true;
    }
    if (restoreRosterContext(s.drafts[p.id], p)) changed = true;
    if (restoreRosterDialogue(s.drafts[p.id], p)) changed = true;
    const latest = store.latest(p.id);
    // Append contextual restoration to bundled releases. Existing releases,
    // assigned versions and encounter snapshots remain immutable.
    if (latest?.kind === "bundled-demo") {
      const restored = profiles.clone(latest.p);
      const contextChanged = restoreRosterContext(restored, p);
      const dialogueChanged = restoreRosterDialogue(restored, p);
      if (contextChanged || dialogueChanged) {
        s.releases.push({
          p: { ...restored, version: latest.p.version + 1 },
          at: new Date().toISOString(),
          kind: "bundled-demo",
        });
        changed = true;
      }
    }
    if (!latest && s.drafts[p.id].origin === "roster") {
      s.releases.push({
        p: { ...profiles.clone(p), version: 1 },
        at: new Date().toISOString(),
        kind: "bundled-demo",
      });
      changed = true;
    }
  }
  // Bundled demo releases are prepared in the repository, not generated or
  // clinically approved by a faculty user. Separate IDs preserve earlier work.
  for (const p of seeds.profiles.filter(
    (p) => p.preparedDemo && p.name !== "Alex Morgan",
  )) {
    if (!store.latest(p.id)) {
      const structuralErrors = profiles
        .validate({ ...profiles.clone(p), reviewAcknowledged: true })
        .filter((i) => i.severity === "error");
      if (structuralErrors.length)
        throw fail("Bundled demo case is invalid.", 500);
      s.drafts[p.id] ||= profiles.clone(p);
      s.releases.push({
        p: { ...profiles.clone(p), version: 1 },
        at: new Date().toISOString(),
        kind: "bundled-demo",
      });
      changed = true;
    }
  }
  if (!Object.keys(s.students).length) {
    for (const alias of ["Student A", "Student B"]) {
      const id = randomUUID();
      s.students[id] = { id, alias };
    }
    changed = true;
  }
  return changed;
}
function groupView(store, g, faculty) {
  const cases = g.profileIds.map((id) => {
    const release = store.latest(id);
    return {
      profileId: id,
      name: store.state.drafts[id]?.name,
      version: release?.p.version || null,
    };
  });
  const published = cases.every((c) => c.version);
  const matched =
    published &&
    cases.length >= 2 &&
    (g.kind === "practice" ||
      cases.every(
        (c) =>
          comparable(store.latest(c.profileId).p, g) ===
          comparable(store.latest(cases[0].profileId).p, g),
      ));
  return {
    ...profiles.clone(g),
    cases,
    trialCount: cases.length,
    preparationStatus: !published
      ? "faculty-review-required"
      : matched
        ? "ready"
        : "clinical-mismatch",
    ...(!faculty ? { sourceNote: undefined } : {}),
  };
}
function createGroup(store, input) {
  const ids = [
    ...new Set(Array.isArray(input.profileIds) ? input.profileIds : []),
  ];
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120
  )
    throw fail("Enter a group name (1–120 characters).");
  if (
    ids.length < 2 ||
    ids.length > 20 ||
    ids.some((id) => typeof id !== "string" || !store.latest(id))
  )
    throw fail("Select 2–20 published patients.");
  if (!["practice", "comparison"].includes(input.kind))
    throw fail("Choose practice or demographic comparison.");
  const group = {
    id: randomUUID(),
    title: input.title.trim(),
    purpose:
      typeof input.purpose === "string" ? input.purpose.slice(0, 1000) : "",
    kind: input.kind,
    profileIds: ids,
    availableToAll: true,
    provenance: "Faculty-created group of existing published cases",
    differences: "Review the selected patient demographics and case settings.",
    limitations:
      "Practice groups may differ clinically; differences alone do not establish bias.",
    createdAt: new Date().toISOString(),
  };
  store.state.groups[group.id] = group;
  return group;
}
function comparable(p, group) {
  const exploratory = group?.comparisonDesign === "varied-backgrounds";
  const varied = exploratory ? group.variedFactIds || [] : [];
  return JSON.stringify({
    age: exploratory ? undefined : p.age,
    gender: exploratory ? undefined : p.gender,
    personality: p.personality,
    style: p.style,
    emotion: p.emotion,
    facts: p.facts
      .filter((f) => !["ethnicity", "$identity"].includes(f.id))
      .map((f) => ({
        ...f,
        ...(varied.includes(f.id)
          ? {
              label: undefined,
              say: undefined,
              src: undefined,
              origin: undefined,
            }
          : {}),
        reviewed: undefined,
      })),
    objectives: p.obj,
    artifacts: p.artifacts.map((a) => ({ ...a, reviewed: undefined })),
    discrepancy: p.mm,
    rubricApplicable: p.rubricApplicable,
    caseRubric: p.caseRubric,
  });
}
function canSee(session, enc) {
  return session.role === "faculty" || enc.studentId === session.studentId;
}
function assessmentReady(store, session, enc) {
  return (
    session.role === "faculty" ||
    !enc.attemptId ||
    store.state.attempts[enc.attemptId]?.status === "complete"
  );
}
function view(store, session, enc) {
  const result = engine.publicView(enc);
  result.studentId = enc.studentId || null;
  result.attemptId = enc.attemptId || null;
  const attempt = store.state.attempts[enc.attemptId];
  if (attempt && attempt.kind !== "individual")
    result.groupProgress = {
      trial: attempt.trials.findIndex((t) => t.encounterId === enc.id) + 1,
      total: attempt.trials.length,
      completed: attempt.trials.filter((t) => finished(store, t)).length,
      title: store.state.groups[attempt.groupId]?.title,
    };
  result.ethnicity = enc.p.ethnicity || "";
  result.feedbackHeld = !assessmentReady(store, session, enc);
  if (result.feedbackHeld) result.assessment = null;
  // Evidence-bearing faculty analysis is never placed in the learner projection.
  if (session.role === "faculty")
    result.biasAnalysis = biasView(store, "encounter", enc.id);
  return result;
}
function summary(store, session, enc) {
  const a = assessmentReady(store, session, enc) ? enc.assessment : null;
  return {
    id: enc.id,
    studentId: enc.studentId || null,
    attemptId: enc.attemptId || null,
    name: enc.p.name,
    version: enc.p.version,
    profileId: enc.p.id,
    status: enc.status,
    createdAt: enc.createdAt,
    interviewStartedAt: enc.interviewStartedAt || null,
    completedAt: enc.completedAt,
    durationMs: Number.isFinite(enc.durationMs) ? enc.durationMs : null,
    duration: Number.isFinite(enc.durationMs)
      ? engine.formatDuration(enc.durationMs)
      : null,
    turns: enc.transcript.filter((t) => t.role === "student").length,
    feedbackHeld: !assessmentReady(store, session, enc),
    total: a?.total ?? null,
    denominator: a?.denominator ?? null,
    provisional: a ? a.provider === "local-provisional" : null,
    objectivePercent: a?.coaching?.objectivePercent ?? null,
    findingsElicited: a?.coaching?.findings.elicited.length ?? null,
    findingsTotal: a?.coaching?.findings.total ?? null,
  };
}
function assign(store, groupId, studentId, profileId) {
  const s = store.state,
    g = s.groups[groupId];
  if (profileId) {
    const release = store.latest(profileId);
    if (
      groupId ||
      !s.students[studentId] ||
      !release ||
      release.p.comparisonOnly ||
      require("./roster-profiles").isHiddenFromStudio(release.p)
    )
      throw fail("Choose an available published patient and student.");
    const a = {
      id: randomUUID(),
      kind: "individual",
      studentId,
      profileId,
      title: release.p.name,
      createdAt: new Date().toISOString(),
      cases: [{ profileId, version: release.p.version }],
      attemptId: null,
    };
    s.assignments[a.id] = a;
    return a;
  }
  if (!g || !s.students[studentId])
    throw fail("Choose an existing group and student.");
  const releases = g.profileIds.map((id) => store.latest(id));
  if (releases.some((r) => !r))
    throw fail(
      "Review and publish both prepared cases before assigning this group.",
      422,
    );
  if (groupView(store, g, true).preparationStatus !== "ready")
    throw fail(
      "The comparison cases have different clinical or scenario settings. Review both cases before assigning.",
      422,
    );
  const a = {
    id: randomUUID(),
    groupId,
    studentId,
    createdAt: new Date().toISOString(),
    cases: releases.map((r) => ({ profileId: r.p.id, version: r.p.version })),
    groupSnapshot: profiles.clone(g),
    attemptId: null,
  };
  s.assignments[a.id] = a;
  return a;
}
function start(store, assignment, studentId) {
  if (assignment.studentId !== studentId)
    throw fail("Assignment not found.", 404);
  if (assignment.attemptId) return store.state.attempts[assignment.attemptId];
  const cases = profiles.clone(assignment.cases);
  for (let i = cases.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cases[i], cases[j]] = [cases[j], cases[i]];
  }
  const attempt = {
    id: randomUUID(),
    assignmentId: assignment.id,
    groupId: assignment.groupId,
    kind: assignment.kind || "group",
    title:
      assignment.title ||
      assignment.groupSnapshot?.title ||
      store.state.groups[assignment.groupId]?.title,
    groupSnapshot: profiles.clone(
      assignment.groupSnapshot ||
        store.state.groups[assignment.groupId] ||
        null,
    ),
    studentId,
    status: "active",
    createdAt: new Date().toISOString(),
    trials: cases.map((c) => ({ ...c, encounterId: null })),
  };
  store.state.attempts[attempt.id] = attempt;
  assignment.attemptId = attempt.id;
  return attempt;
}
function finished(store, trial) {
  const e = store.state.encounters[trial.encounterId];
  return e?.status === "complete" && !!e.assessment;
}
function next(store, attempt) {
  const trial = attempt.trials.find((t) => !finished(store, t));
  if (!trial) throw fail("All trials are complete.", 409);
  if (!trial.encounterId) {
    const release = store.state.releases.find(
      (r) => r.p.id === trial.profileId && r.p.version === trial.version,
    );
    if (!release) throw fail("Pinned patient version is unavailable.", 409);
    const enc = engine.create(release.p);
    enc.studentId = attempt.studentId;
    enc.attemptId = attempt.id;
    store.state.encounters[enc.id] = enc;
    trial.encounterId = enc.id;
  }
  return store.state.encounters[trial.encounterId];
}
function completeTrial(store, enc) {
  const attempt = store.state.attempts[enc.attemptId];
  if (attempt && attempt.trials.every((t) => finished(store, t))) {
    attempt.status = "complete";
    attempt.completedAt ||= new Date().toISOString();
  }
}
function attemptView(store, a) {
  return {
    ...profiles.clone(a),
    groupSnapshot: undefined,
    title:
      a.title || a.groupSnapshot?.title || store.state.groups[a.groupId]?.title,
    completed: a.trials.filter((t) => finished(store, t)).length,
    trials: a.trials.map((t) => ({
      ...t,
      name: store.state.releases.find(
        (r) => r.p.id === t.profileId && r.p.version === t.version,
      )?.p.name,
      status: t.encounterId
        ? store.state.encounters[t.encounterId]?.status
        : "not-started",
    })),
  };
}
function biasView(store, type, id) {
  return profiles.clone(
    store.state.biasResults[`${type}:${id}`] || {
      status: "pending",
      findings: [],
      limitations: [
        "Awaiting analysis. Faculty can run the OSCE bias assessment after completion.",
      ],
    },
  );
}
function detectorContext(store, type, id) {
  const target =
    type === "encounter"
      ? store.state.encounters[id]
      : store.state.attempts[id];
  if (!target || !["encounter", "attempt"].includes(type))
    throw fail("Analysis target not found.", 404);
  const encounters =
    type === "encounter"
      ? [target]
      : target.trials
          .filter((t) => t.encounterId)
          .map((t) => store.state.encounters[t.encounterId]);
  return {
    targetType: type,
    targetId: id,
    studentId: target.studentId || null,
    attempt: type === "attempt" ? attemptView(store, target) : null,
    group:
      target.groupSnapshot ||
      store.state.attempts[target.attemptId]?.groupSnapshot ||
      store.state.groups[
        target.groupId || store.state.attempts[target.attemptId]?.groupId
      ] ||
      null,
    encounters: encounters.map((e) => ({
      id: e.id,
      status: e.status,
      createdAt: e.createdAt,
      completedAt: e.completedAt || null,
      profile: profiles.clone(e.p),
      transcript: profiles.clone(e.transcript),
      events: profiles.clone(e.events),
      assessment: profiles.clone(e.assessment),
    })),
  };
}
function saveBias(store, type, id, result) {
  const context = detectorContext(store, type, id);
  if (
    !result ||
    !["pending", "complete", "unavailable"].includes(result.status) ||
    typeof result.detectorVersion !== "string" ||
    !result.detectorVersion.trim() ||
    !Array.isArray(result.findings) ||
    !Array.isArray(result.limitations) ||
    result.limitations.some((v) => typeof v !== "string") ||
    JSON.stringify(result).length > 50000
  )
    throw fail("Provide status, detectorVersion, findings and limitations.");
  for (const finding of result.findings) {
    if (
      typeof finding.text !== "string" ||
      !finding.text.trim() ||
      !Array.isArray(finding.evidence) ||
      !finding.evidence.length
    )
      throw fail("Each finding needs text and encounter evidence.");
    for (const ref of finding.evidence) {
      const e = context.encounters.find((e) => e.id === ref.encounterId);
      if (!e || !e.events.some((event) => event.id === ref.eventId))
        throw fail(
          "Bias evidence must reference an existing event in this analysis target.",
        );
    }
  }
  if (result.status !== "complete" && result.findings.length)
    throw fail("Only completed analysis may contain findings.");
  let rubricAssessment;
  if (result.rubricAssessment) {
    if (result.status !== "complete")
      throw fail("Only completed analysis may contain rubric ratings.");
    rubricAssessment = require("./bias").validateSaved(
      result.rubricAssessment,
      context,
    );
  }
  const saved = {
    status: result.status,
    detectorVersion: result.detectorVersion,
    findings: profiles.clone(result.findings),
    limitations: profiles.clone(result.limitations),
    ...(rubricAssessment
      ? { rubricAssessment: profiles.clone(rubricAssessment) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  store.state.biasResults[`${type}:${id}`] = saved;
  return profiles.clone(saved);
}
module.exports = {
  comparisonKey: comparable,
  createGroup,
  initialize,
  groupView,
  canSee,
  assessmentReady,
  view,
  summary,
  assign,
  start,
  next,
  completeTrial,
  attemptView,
  biasView,
  detectorContext,
  saveBias,
};
