"use strict";
// Longitudinal views over completed encounters: a student's own performance
// summary, and a faculty review of how one student's performance varies across
// patient demographics. Everything is computed from recorded encounters; no
// model call. A difference between patient groups is a prompt for faculty
// review, not a finding of bias: cases differ clinically and samples are small.
const UNASSIGNED = "unassigned";
const LEVELS = ["insufficient", "minimal", "moderate", "notable"];
// Gap, in percentage points, between the best- and worst-served patient group.
const MODERATE_GAP = 10,
  NOTABLE_GAP = 20,
  SMALL_SAMPLE = 3,
  // A group needs at least this many visits before it is rated at all.
  MIN_PER_GROUP = 2;

const mean = (values) => {
  const list = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  return list.length
    ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
    : null;
};
function ageBand(age) {
  const n = Number(age);
  if (age == null || age === "" || !Number.isFinite(n)) return "";
  if (n < 18) return "Under 18";
  if (n < 40) return "18–39";
  if (n < 65) return "40–64";
  return "65 and over";
}
const tidy = (value) => {
  const s = String(value || "").trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : "";
};

// Occupation, weight and substance use are not structured fields on a patient
// profile. Unless faculty set profile.biasTags, they are read from the case
// text, which can be wrong; the review page says so.
function strings(value, out = [], depth = 0) {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object" && depth < 4)
    for (const v of Object.values(value)) strings(v, out, depth + 1);
  return out;
}
function caseText(p) {
  return strings([p?.original, p?.personality, p?.facts])
    .filter((s) => s.length < 2000)
    .join(" · ");
}
function occupationOf(text) {
  if (/\bunemployed\b|out of work|between jobs/i.test(text))
    return "Unemployed";
  if (
    /janitor|mechanic|construction|labou?rer|factory|warehouse|\bdriver\b|\bcook\b|cleaner|\bfarm|plumber|electrician|carpenter|custodian/i.test(
      text,
    )
  )
    return "Manual or trade work";
  if (
    /producer|engineer|manager|executive|teacher|\bnurse\b|accountant|lawyer|\bclerk\b|office|analyst|\bsales\b|professor|programmer|consultant/i.test(
      text,
    )
  )
    return "Office or professional work";
  if (/\bretired\b/i.test(text)) return "Retired";
  if (/\bstudent\b/i.test(text)) return "Student";
  return "";
}
function weightOf(text) {
  const bmi = /\bBMI\s*(?:of|is|:)?\s*(\d{2}(?:\.\d)?)/i.exec(text);
  if (!bmi) return "";
  const n = Number(bmi[1]);
  return n >= 30 ? "BMI 30 or above" : n >= 25 ? "BMI 25–29" : "BMI under 25";
}
function substanceOf(text) {
  if (!text) return "";
  return /smok|cigarette|tobacco|\bvap(?:e|es|ing)\b|alcohol|\bbeers?\b|\bwine\b|cocaine|opioid|heroin|cannabis|marijuana|substance use/i.test(
    text,
  )
    ? "Substance use in the case"
    : "None mentioned in the case";
}
function tagsOf(p) {
  const text = caseText(p);
  const set = p?.biasTags || {};
  return {
    occupation: set.occupation || occupationOf(text),
    weight: set.weight || weightOf(text),
    substance: set.substance || substanceOf(text),
  };
}

// One completed encounter reduced to comparable numbers.
function metrics(enc) {
  const a = enc.assessment;
  const scored = a && a.provider !== "local-provisional" && a.denominator;
  const tags = enc.events.filter((e) => e.type === "communication");
  const questions = enc.events.filter((e) => e.type === "student").length;
  const found = a?.coaching?.findings;
  const domains = {};
  for (const d of a?.domains || [])
    domains[d.domain] = scored && d.score != null ? d.score : null;
  const said = (id) => enc.events.find((e) => e.id === id)?.text || "";
  const bias = tagsOf(enc.p);
  const first = (list) => {
    const item = (list || [])[0];
    return typeof item === "string" ? item : item?.text || "";
  };
  return {
    id: enc.id,
    studentId: enc.studentId || null,
    attemptId: enc.attemptId || null,
    profileId: enc.p.id,
    patient: enc.p.name,
    age: enc.p.age ?? null,
    ageBand: ageBand(enc.p.age),
    gender: tidy(enc.p.gender),
    ethnicity: String(enc.p.ethnicity || "").trim(),
    occupation: bias.occupation,
    weight: bias.weight,
    substance: bias.substance,
    completedAt: enc.completedAt || enc.createdAt,
    questions,
    minutes:
      enc.completedAt && enc.createdAt
        ? Math.max(
            1,
            Math.round(
              (new Date(enc.completedAt) - new Date(enc.createdAt)) / 60000,
            ),
          )
        : null,
    rubricTotal: scored ? a.total : null,
    rubricMax: scored ? a.denominator : null,
    rubricPct: scored ? Math.round((a.total / a.denominator) * 100) : null,
    domains,
    empathy: domains[2] ?? null,
    objectivePct: a?.coaching?.objectivePercent ?? null,
    findingsPct:
      found && found.total
        ? Math.round((found.elicited.length / found.total) * 100)
        : null,
    openQuestions: tags.filter((t) => t.openQuestion).length,
    empathicStatements: tags.filter((t) => t.empathy).length,
    judgmental: tags.filter((t) => t.judgmental).length,
    reviewRequired: !!a?.reviewRequired,
    // Short evidence for the visit pop-up and the faculty deep dive.
    strength: scored ? first(a.strengths) : "",
    gap: scored ? first(a.gaps) : "",
    empathyNote: scored
      ? a.domains?.find((d) => d.domain === 2)?.reason || ""
      : "",
    judgmentalLines: tags
      .filter((t) => t.judgmental)
      .map((t) => said(t.studentEvent))
      .filter(Boolean)
      .slice(0, 2),
    firstQuestion: enc.events.find((e) => e.type === "student")?.text || "",
  };
}
// Feedback on a group of trials is held until the whole group is finished.
const released = (store, e) =>
  !e.attemptId || store.state.attempts?.[e.attemptId]?.status === "complete";
function completed(store, studentId, onlyReleased = false) {
  return Object.values(store.state.encounters)
    .filter(
      (e) =>
        e.status === "complete" &&
        e.assessment &&
        (e.studentId || null) === (studentId || null) &&
        (!onlyReleased || released(store, e)),
    )
    .map(metrics)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}
// Averages for a set of encounters.
function aggregate(list) {
  const questions = list.reduce((sum, m) => sum + m.questions, 0);
  return {
    n: list.length,
    rubricPct: mean(list.map((m) => m.rubricPct)),
    empathy: mean(list.map((m) => m.empathy)),
    objectivePct: mean(list.map((m) => m.objectivePct)),
    findingsPct: mean(list.map((m) => m.findingsPct)),
    questions: mean(list.map((m) => m.questions)),
    minutes: mean(list.map((m) => m.minutes)),
    openShare: questions
      ? Math.round(
          (list.reduce((sum, m) => sum + m.openQuestions, 0) / questions) * 100,
        )
      : null,
    empathicPerVisit: mean(list.map((m) => m.empathicStatements)),
    judgmental: list.reduce((sum, m) => sum + m.judgmental, 0),
  };
}
function domainMeans(list, anchors) {
  return anchors.map((a) => {
    const value = mean(list.map((m) => m.domains[a.domain]));
    return {
      domain: a.domain,
      name: a.name,
      mean: value,
      // Faculty wording for the level this average sits nearest.
      descriptor:
        value == null
          ? ""
          : [a.absent, a.developing, a.competent, a.strong][
              Math.min(3, Math.max(0, Math.round(value) - 1))
            ] || "",
    };
  });
}
function summarise(store, student, anchors, onlyReleased = false) {
  const list = completed(store, student.id, onlyReleased);
  const scored = list.filter((m) => m.rubricPct != null);
  // Change between the latest scored encounter and the average of earlier ones.
  const trend =
    scored.length > 1
      ? Math.round(
          (scored[0].rubricPct -
            mean(scored.slice(1).map((m) => m.rubricPct))) *
            10,
        ) / 10
      : null;
  const patients = [...new Set(list.map((m) => m.patient))].map((name) => ({
    name,
    profileId: list.find((m) => m.patient === name).profileId,
    ...aggregate(list.filter((m) => m.patient === name)),
  }));
  return {
    student: { id: student.id, alias: student.alias },
    kpis: { ...aggregate(list), trend },
    domains: domainMeans(list, anchors),
    patients,
    encounters: list,
    ...flagged(store, student, list, onlyReleased),
  };
}

// Compares group averages along one demographic attribute.
function dimension(id, title, list, labelOf, minPerGroup = MIN_PER_GROUP) {
  const labels = [...new Set(list.map(labelOf).filter(Boolean))];
  const groups = labels
    .map((label) => ({
      label,
      ...aggregate(list.filter((m) => labelOf(m) === label)),
      encounterIds: list.filter((m) => labelOf(m) === label).map((m) => m.id),
    }))
    // Largest group first; ties in name order so the listing is stable.
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const result = {
    id,
    title,
    groups,
    level: "insufficient",
    gaps: [],
    examples: [],
  };
  if (groups.length < 2) {
    result.summary = groups.length
      ? `Only ${groups[0].label} patients seen so far; nothing to compare.`
      : "No completed encounters record this attribute.";
    return result;
  }
  // One visit with a patient group says nothing about a pattern, so a level
  // is given only when two groups each have enough visits. The numbers are
  // still listed for the faculty reader.
  const rateable = groups.filter((g) => g.n >= minPerGroup).length >= 2;
  // Each measure on a 0–100 scale so gaps are comparable.
  const measures = [
    ["rubricPct", "Rubric", (g) => g.rubricPct, "%"],
    ["empathy", "Rapport and empathy", (g) => g.empathy, "/4"],
    ["objectivePct", "Learning objectives", (g) => g.objectivePct, "%"],
    ["openShare", "Open questions", (g) => g.openShare, "%"],
    ["minutes", "Time with the patient", (g) => g.minutes, " min"],
  ];
  for (const [key, label, read, unit] of measures) {
    const have = groups.filter((g) => read(g) != null);
    if (have.length < 2) continue;
    const high = have.reduce((a, b) => (read(b) > read(a) ? b : a));
    const low = have.reduce((a, b) => (read(b) < read(a) ? b : a));
    const raw = Math.round((read(high) - read(low)) * 10) / 10;
    result.gaps.push({
      key,
      label,
      unit,
      high: { label: high.label, value: read(high), n: high.n },
      low: { label: low.label, value: read(low), n: low.n },
      gap: raw,
      points: key === "empathy" ? Math.round(raw * 25) : Math.round(raw),
    });
  }
  // Rated on the rubric and empathy gaps; other measures are shown as context.
  const rated = result.gaps.filter((g) =>
    ["rubricPct", "empathy"].includes(g.key),
  );
  const basis = rated.length
    ? rated
    : result.gaps.filter((g) => g.key === "objectivePct");
  if (!basis.length) {
    result.summary = "Not enough scored encounters to compare these groups.";
    return result;
  }
  const widest = basis.reduce((a, b) => (b.points > a.points ? b : a));
  result.widest = widest;
  // Evidence from the lower-scoring group: what was said, what the rubric noted.
  result.examples = list
    .filter((m) => labelOf(m) === widest.low.label)
    .sort((a, b) => (a.empathy ?? 9) - (b.empathy ?? 9))
    // The same wording in a repeat visit is shown once.
    .filter(
      (m, i, all) =>
        all.findIndex(
          (o) =>
            (o.judgmentalLines[0] || o.firstQuestion) ===
            (m.judgmentalLines[0] || m.firstQuestion),
        ) === i,
    )
    .slice(0, 2)
    .map((m) => ({
      id: m.id,
      patient: m.patient,
      at: m.completedAt,
      group: widest.low.label,
      quote: m.judgmentalLines[0] || m.firstQuestion,
      quoteKind: m.judgmentalLines[0]
        ? "Wording tagged as judgmental"
        : "Opening question",
      note: m.empathyNote || m.gap,
    }));
  if (!rateable) {
    result.smallSample = true;
    result.summary = `Too few visits to rate: at least ${minPerGroup} with each of two patient groups are needed. So far ${groups.map((g) => `${g.n} with ${g.label}`).join(", ")}.`;
    return result;
  }
  result.level =
    widest.points >= NOTABLE_GAP
      ? "notable"
      : widest.points >= MODERATE_GAP
        ? "moderate"
        : "minimal";
  result.smallSample = groups.some((g) => g.n < SMALL_SAMPLE);
  result.summary =
    widest.gap === 0
      ? `${widest.label} was the same across ${groups.map((g) => g.label).join(", ")} patients.`
      : `${widest.label} averaged ${widest.high.value}${widest.unit} with ${widest.high.label} patients and ${widest.low.value}${widest.unit} with ${widest.low.label} patients.`;
  return result;
}

// Clinically matched comparison groups: the same case presented with a
// different demographic. These are the most direct evidence available.
function matched(store, studentId, onlyReleased = false) {
  return Object.values(store.state.attempts || {})
    .filter(
      (a) =>
        (a.studentId || null) === (studentId || null) &&
        (!onlyReleased || a.status === "complete"),
    )
    .map((attempt) => {
      const group = store.state.groups?.[attempt.groupId];
      if (group?.kind !== "comparison") return null;
      const trials = attempt.trials
        .map((t) => store.state.encounters[t.encounterId])
        .filter((e) => e?.status === "complete" && e.assessment)
        .map(metrics);
      if (trials.length < 2) return null;
      const differs = ["age", "gender", "ethnicity"].filter(
        (k) => new Set(trials.map((t) => String(t[k] ?? ""))).size > 1,
      );
      const compare = dimension(
        "matched-" + attempt.id,
        group.title,
        trials,
        (m) => m.patient,
        // A matched pair is one visit per presentation by design.
        1,
      );
      return {
        attemptId: attempt.id,
        id: compare.id,
        title: group.title,
        differs,
        trials,
        level: compare.level,
        gaps: compare.gaps,
        groups: compare.groups,
        widest: compare.widest,
        examples: compare.examples,
        summary: compare.summary,
      };
    })
    .filter(Boolean);
}
// basis: where the grouping comes from, shown to faculty.
const DIMENSIONS = [
  ["age", "Age", (m) => m.ageBand, "record"],
  ["ethnicity", "Race and ethnicity", (m) => m.ethnicity, "record"],
  ["occupation", "Socioeconomic and occupation", (m) => m.occupation, "text"],
  ["gender", "Gender", (m) => m.gender, "record"],
  ["substance", "Substance use", (m) => m.substance, "text"],
  ["weight", "Weight and BMI", (m) => m.weight, "text"],
];
function variance(store, student, onlyReleased = false) {
  const list = completed(store, student.id, onlyReleased);
  const dimensions = DIMENSIONS.map(([id, title, read, basis]) => ({
    ...dimension(id, title, list, read),
    basis,
  }));
  const comparisons = matched(store, student.id, onlyReleased);
  const overall = [...dimensions, ...comparisons].reduce(
    (top, d) => (LEVELS.indexOf(d.level) > LEVELS.indexOf(top) ? d.level : top),
    "insufficient",
  );
  return {
    overall,
    dimensions,
    comparisons,
    thresholds: {
      moderate: MODERATE_GAP,
      notable: NOTABLE_GAP,
      smallSample: SMALL_SAMPLE,
      minPerGroup: MIN_PER_GROUP,
    },
    limitations: [
      "A gap between patient groups is a prompt for review, not a finding of bias.",
      "Patients differ clinically as well as demographically, except in matched comparison groups.",
      `A patient group is rated only after ${MIN_PER_GROUP} visits; averages over fewer than ${SMALL_SAMPLE} are still unstable.`,
      "Occupation, weight and substance-use groups are read automatically from each case's text and can be wrong; age, gender and ethnicity come from the patient record.",
    ],
  };
}
// Marks each visit that sits in the lower-scoring group of a rated gap, so
// the visit's debrief can name the variance it was part of. Students get
// this short flag; the full comparison stays on the faculty page.
function flagged(store, student, list, onlyReleased) {
  const v = variance(store, student, onlyReleased);
  const items = [...v.comparisons, ...v.dimensions];
  for (const m of list) m.biasFlags = [];
  for (const item of items) {
    if (!["moderate", "notable"].includes(item.level) || !item.widest?.gap)
      continue;
    const low = item.groups.find((g) => g.label === item.widest.low.label);
    for (const m of list)
      if (low?.encounterIds.includes(m.id))
        m.biasFlags.push({
          id: item.id,
          label: `${item.trials ? "Matched case" : item.title} variance`,
          level: item.level,
          detail: item.summary,
          basis: item.trials ? "matched" : item.basis,
        });
  }
  // False until some comparison has enough visits to be rated at all.
  return { biasRated: items.some((i) => i.level !== "insufficient") };
}
// Bias mitigation modules faculty can assign, one per comparison category.
// Only the assignment is recorded; the module content itself is not built.
const MODULES = [
  ["age", "Mod #508", "Geriatric Communication & Ageist Assumption Avoidance"],
  [
    "ethnicity",
    "Mod #310",
    "Culturally Responsive Communication Across Race & Ethnicity",
  ],
  [
    "occupation",
    "Mod #402",
    "Socioeconomic Determinants in Treatment Compliance",
  ],
  [
    "gender",
    "Mod #615",
    "Gender-Equitable History Taking & Inclusive Language",
  ],
  [
    "substance",
    "Mod #720",
    "Non-Stigmatizing Substance Use & Mental Health Interviewing",
  ],
  ["weight", "Mod #804", "Weight-Neutral Clinical Reasoning & BMI Anchoring"],
].map(([id, code, title]) => ({ id, code, title }));
function modulesFor(store, studentId, dimensions = []) {
  const saved = store.state.moduleAssignments?.[studentId || UNASSIGNED] || {};
  return (
    MODULES.map((m) => ({
      ...m,
      assignedAt: saved[m.id]?.assignedAt || null,
      // Suggested when this student's gap in the category is rated.
      suggested: ["moderate", "notable"].includes(
        dimensions.find((d) => d.id === m.id)?.level,
      ),
    }))
      // Suggested modules first.
      .sort((a, b) => b.suggested - a.suggested)
  );
}
function assignModule(store, studentId, moduleId, assigned) {
  if (!studentId || studentId === UNASSIGNED || typeof studentId !== "string")
    throw Object.assign(
      new Error("Choose a student before assigning a practice prompt. Unassigned encounters have no student recipient."),
      { status: 400 },
    );
  const key = studentId;
  if (!Object.hasOwn(store.state.students || {}, key))
    throw Object.assign(new Error("Student not found."), { status: 404 });
  if (!MODULES.some((m) => m.id === moduleId))
    throw Object.assign(new Error("Module not found."), { status: 404 });
  if (typeof assigned !== "boolean")
    throw Object.assign(new Error("Choose whether to assign this practice prompt."), { status: 400 });
  store.state.moduleAssignments ||= {};
  const mine = (store.state.moduleAssignments[key] ||= {});
  if (assigned) mine[moduleId] ||= { assignedAt: new Date().toISOString() };
  else delete mine[moduleId];
  return modulesFor(store, studentId);
}
function notesFor(store, studentId) {
  const saved = store.state.facultyNotes?.[studentId || UNASSIGNED];
  return saved ? { ...saved } : { text: "", flagged: false, updatedAt: null };
}
function saveNotes(store, studentId, input) {
  const key = studentId || UNASSIGNED;
  if (key !== UNASSIGNED && !store.state.students?.[key])
    throw Object.assign(new Error("Student not found."), { status: 404 });
  if (typeof input?.text !== "string" || input.text.length > 5000)
    throw Object.assign(new Error("Provide notes up to 5000 characters."), {
      status: 400,
    });
  store.state.facultyNotes ||= {};
  store.state.facultyNotes[key] = {
    text: input.text,
    flagged: input.flagged === true,
    updatedAt: new Date().toISOString(),
  };
  return notesFor(store, studentId);
}
function roster(store) {
  return [
    ...Object.values(store.state.students || {}),
    { id: null, alias: "Unassigned demo encounters" },
  ];
}
// Average rubric profile across students, shown only when it means something.
function cohort(store, anchors) {
  // Deliberately scripted learner behavior must not become a human cohort baseline.
  const all = Object.values(store.state.students || {})
    .filter((s) => !s.aiDemo)
    .map((s) => completed(store, s.id));
  const active = all.filter((list) => list.some((m) => m.rubricPct != null));
  if (active.length < 2) return null;
  const everyone = active.flat();
  return {
    students: active.length,
    encounters: everyone.length,
    rubricPct: mean(everyone.map((m) => m.rubricPct)),
    empathy: mean(everyone.map((m) => m.empathy)),
    objectivePct: mean(everyone.map((m) => m.objectivePct)),
    domains: domainMeans(everyone, anchors),
  };
}
// A learner sees only their own performance; never variance analysis or notes.
function studentView(store, studentId, anchors) {
  const student = store.state.students?.[studentId];
  if (!student)
    throw Object.assign(new Error("Student not found."), { status: 404 });
  const me = summarise(store, student, anchors, true);
  // Group tags and flagged wording exist for faculty comparison only.
  for (const m of me.encounters)
    for (const key of ["occupation", "weight", "substance", "judgmentalLines"])
      delete m[key];
  // Only the modules faculty assigned, without the reason they were suggested.
  me.modules = modulesFor(store, studentId)
    .filter((m) => m.assignedAt)
    .map(({ suggested, ...m }) => m);
  return { me, cohort: cohort(store, anchors) };
}
function facultyView(store, anchors) {
  return {
    cohort: cohort(store, anchors),
    students: roster(store).map((student) => {
      const v = variance(store, student);
      return {
        ...summarise(store, student, anchors),
        variance: v,
        notes: notesFor(store, student.id),
        modules: modulesFor(store, student.id, v.dimensions),
      };
    }),
  };
}
module.exports = {
  metrics,
  aggregate,
  dimension,
  variance,
  tagsOf,
  studentView,
  facultyView,
  saveNotes,
  assignModule,
  UNASSIGNED,
};
