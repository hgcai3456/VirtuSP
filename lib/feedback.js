"use strict";
// Deterministic coaching built from the encounter record alone: no model call,
// so it is available in local mode and every statement traces to an event.
// Findings the student did not reach are described only by their neutral
// faculty-authored topic, never by label, wording or ID, so a completed
// attempt does not hand over the answers for the next one.
const SECTION_NAMES = {
  hx: "History",
  meds: "Medications",
  labs: "Labs",
  img: "Imaging",
  notes: "Notes",
  soc: "Social",
};
const short = (text, max = 140) => {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
const topicOf = (f) => f.topic || SECTION_NAMES[f.ehr] || "History";

function findings(enc) {
  const linked = new Map();
  for (const o of enc.p.obj || [])
    for (const id of o.f || []) if (!linked.has(id)) linked.set(id, o.t);
  const turnOf = turnNumbers(enc);
  const facts = enc.p.facts.filter((f) => f.id !== "$identity");
  const elicited = facts
    .filter((f) => enc.disclosed[f.id])
    .map((f) => ({
      label: f.label,
      topic: topicOf(f),
      source: f.vis === "chart" ? "chart" : "patient",
      objective: linked.get(f.id) || null,
      evidence: [enc.disclosed[f.id].eventId],
      turn: turnOf(enc.disclosed[f.id].eventId),
    }));
  // Several undisclosed facts can share a topic; list each topic once.
  const missed = [];
  for (const f of facts.filter((f) => !enc.disclosed[f.id])) {
    const source = f.vis === "chart" ? "chart" : "patient";
    const withheld = enc.events.filter(
      (e) => e.type === "gate" && e.factId === f.id,
    );
    let item = missed.find(
      (m) => m.topic === topicOf(f) && m.source === source,
    );
    if (!item) {
      item = {
        topic: topicOf(f),
        source,
        section: SECTION_NAMES[f.vis === "chart" ? f.sec : f.ehr] || null,
        objective: null,
        heldBack: false,
        evidence: [],
      };
      missed.push(item);
    }
    item.objective ||= linked.get(f.id) || null;
    if (withheld.length) {
      item.heldBack = true;
      item.evidence.push(...withheld.map((e) => e.id));
    }
  }
  const reports = (enc.p.artifacts || []).map((a) => ({
    title: a.title,
    section: SECTION_NAMES[a.sec] || a.sec,
    status: enc.reviewed.includes(a.id)
      ? "reviewed"
      : enc.released[a.id]
        ? "released, not reviewed"
        : "not released",
    evidence: enc.events
      .filter(
        (e) =>
          (e.type === "release" || e.type === "review") &&
          e.artifactId === a.id,
      )
      .map((e) => e.id),
  }));
  // Objective-linked items first: these are what faculty asked for.
  const keyFirst = (a, b) => !!b.objective - !!a.objective;
  return {
    elicited: elicited.sort(keyFirst),
    missed: missed.sort(keyFirst),
    reports,
    total: facts.length,
  };
}

function turnNumbers(enc) {
  let turn = 0;
  const byEvent = new Map();
  for (const e of enc.events) {
    if (e.type === "student") turn++;
    byEvent.set(e.id, turn);
  }
  return (id) => byEvent.get(id) || 0;
}

function flow(enc) {
  const steps = [];
  let current = null;
  for (const e of enc.events) {
    if (e.type === "student") {
      current = {
        kind: "question",
        turn: steps.filter((s) => s.kind === "question").length + 1,
        eventId: e.id,
        text: short(e.text),
        open: false,
        empathy: false,
        judgmental: false,
        heldBack: false,
        gained: [],
        credited: [],
      };
      steps.push(current);
    } else if (e.type === "communication" && current) {
      current.open = e.openQuestion === true;
      current.empathy = e.empathy === true;
      current.judgmental = e.judgmental === true;
      current.classifier = e.source;
    } else if (e.type === "gate" && current) current.heldBack = true;
    else if (
      e.type === "disclose" &&
      current &&
      !/^section /.test(e.via || "")
    ) {
      current.gained.push(short(e.text, 90));
      for (const o of enc.p.obj || [])
        if ((o.f || []).includes(e.factId) && !current.credited.includes(o.t))
          current.credited.push(o.t);
    } else if (["open", "review", "reconcile", "handoff"].includes(e.type))
      steps.push({
        kind: e.type,
        eventId: e.id,
        afterTurn: steps.filter((s) => s.kind === "question").length,
        text:
          e.type === "open"
            ? `Opened ${SECTION_NAMES[e.section] || "chart overview"}`
            : e.type === "reconcile"
              ? "Recorded a clinical note"
              : e.type === "handoff"
                ? "Submitted a handoff"
                : short(e.text, 90),
      });
  }
  const questions = steps.filter((s) => s.kind === "question");
  const observations = [];
  const note = (kind, text, evidence = []) =>
    observations.push({ kind, text, evidence });
  if (!questions.length) {
    note("improve", "No questions were asked before the encounter ended.");
    return { steps, observations, questions: 0 };
  }
  const first = questions[0];
  if (first.open)
    note(
      "strength",
      "The first question was an open invitation, which lets the patient set out the concern in their own words.",
      [first.eventId],
    );
  else
    note(
      "improve",
      "The first question was specific rather than open. Starting with an open invitation usually surfaces the patient's main concern sooner.",
      [first.eventId],
    );
  const open = questions.filter((q) => q.open);
  note(
    open.length * 2 >= questions.length ? "strength" : "improve",
    `${open.length} of ${questions.length} questions were open-ended.`,
    open.map((q) => q.eventId),
  );
  const empathic = questions.filter((q) => q.empathy);
  if (empathic.length)
    note(
      "strength",
      `Acknowledged the patient's perspective ${empathic.length} time${empathic.length > 1 ? "s" : ""}, first at question ${empathic[0].turn}.`,
      empathic.map((q) => q.eventId),
    );
  else
    note(
      "improve",
      "No statement acknowledging the patient's feelings or perspective was recorded.",
    );
  const judgmental = questions.filter((q) => q.judgmental);
  if (judgmental.length)
    note(
      "improve",
      `${judgmental.length} question${judgmental.length > 1 ? "s" : ""} used wording classified as judgmental.`,
      judgmental.map((q) => q.eventId),
    );
  // Guarded topics: was rapport built before or after the patient held back?
  const turnOf = turnNumbers(enc);
  const gatedFacts = [
    ...new Set(
      enc.events.filter((e) => e.type === "gate").map((e) => e.factId),
    ),
  ];
  for (const id of gatedFacts) {
    const f = enc.p.facts.find((f) => f.id === id);
    if (!f) continue;
    const gates = enc.events.filter(
      (e) => e.type === "gate" && e.factId === id,
    );
    const heldAt = turnOf(gates[0].id);
    const shared = enc.disclosed[id];
    if (shared) {
      const sharedAt = turnOf(shared.eventId);
      const bridge = empathic.find(
        (q) => q.turn > heldAt && q.turn <= sharedAt,
      );
      note(
        "strength",
        `"${topicOf(f)}" was held back at question ${heldAt} and shared at question ${sharedAt}${bridge ? `, after you acknowledged the patient's perspective at question ${bridge.turn}` : ""}.`,
        [gates[0].id, shared.eventId],
      );
    } else
      note(
        "improve",
        `"${topicOf(f)}" was asked about at question ${heldAt} but the patient was not ready to share it${gates.length > 1 ? ` (asked ${gates.length} times)` : ""}. Acknowledging how the patient feels before returning to it can help.`,
        gates.map((e) => e.id),
      );
  }
  const chartSteps = steps.filter(
    (s) =>
      s.kind === "review" || (s.kind === "open" && !/overview/.test(s.text)),
  );
  if (chartSteps.length)
    note(
      "note",
      `The chart was first opened after question ${chartSteps[0].afterTurn} of ${questions.length}.`,
      [chartSteps[0].eventId],
    );
  else if ((enc.p.facts || []).some((f) => f.vis === "chart"))
    note("improve", "The chart was not opened during this encounter.");
  const dry = questions.filter((q) => !q.gained.length && !q.heldBack);
  if (questions.length >= 4 && dry.length * 2 > questions.length)
    note(
      "note",
      `${dry.length} of ${questions.length} questions did not add a new finding.`,
      dry.map((q) => q.eventId),
    );
  return { steps, observations, questions: questions.length };
}

function nextSteps(enc, assessment, found) {
  const steps = [];
  const add = (source, text, evidence = []) => {
    const clean = short(text, 220);
    if (clean && !steps.some((s) => s.text === clean))
      steps.push({ source, text: clean, evidence });
  };
  // Faculty objectives lead: heaviest unfinished objective first.
  for (const o of [...(assessment.objectives || [])]
    .filter((o) => o.credit < 1)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3))
    add(
      "objective",
      o.next ? `${o.title}: ${o.next}` : `Work on: ${o.title}`,
      o.evidence,
    );
  for (const m of found.missed.filter((m) => m.heldBack).slice(0, 1))
    add(
      "finding",
      `Return to "${m.topic}" after acknowledging how the patient feels; they held it back this time.`,
      m.evidence,
    );
  if (assessment.provider !== "local-provisional")
    for (const d of [...assessment.domains]
      .filter((d) => d.score !== null && d.score <= 2 && d.next)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2))
      add("rubric", `${d.name}: ${d.next}`, d.evidence);
  for (const m of found.missed
    .filter((m) => m.objective && !m.heldBack)
    .slice(0, 2))
    add(
      "finding",
      m.source === "chart"
        ? `Open ${m.section || "the chart"} to review "${m.topic}".`
        : `Ask about "${m.topic}".`,
    );
  return steps.slice(0, 5);
}

// Questions worth rewording, most instructive first. The model is asked to
// reword only these, with the issue stated, so a suggestion always answers a
// recorded turn rather than inventing a critique.
function rewriteCandidates(enc, flowResult) {
  const questions = flowResult.steps.filter((s) => s.kind === "question");
  const picked = [];
  const pick = (q, issue) => {
    if (q && picked.length < 3 && !picked.some((p) => p.eventId === q.eventId))
      picked.push({
        eventId: q.eventId,
        turn: q.turn,
        question: q.text,
        issue,
      });
  };
  for (const q of questions.filter((q) => q.judgmental))
    pick(q, "The wording could come across as judgmental. Ask without blame.");
  for (const q of questions.filter(
    (q) => q.heldBack && !q.empathy && !q.gained.length,
  ))
    pick(
      q,
      "The patient was not ready to answer. Acknowledge their perspective and normalize the topic before asking.",
    );
  if (questions[0] && !questions[0].open)
    pick(
      questions[0],
      "The opening question was narrow. Start with an open invitation.",
    );
  for (const q of questions.filter(
    (q) => !q.open && !q.gained.length && !q.heldBack,
  ))
    pick(q, "A closed question that added nothing new. Make it open-ended.");
  return picked;
}
// Accepts only rewrites that answer a listed question, read as a single
// question and introduce no number the student did not use.
function validRewrites(result, candidates) {
  if (!Array.isArray(result?.rewrites)) throw new Error("Missing rewrites.");
  const digits = (s) => String(s).match(/\d+/g) || [];
  return result.rewrites
    .map((r) => {
      const source = candidates.find((c) => c.eventId === r?.id);
      if (
        !source ||
        typeof r.rewrite !== "string" ||
        !r.rewrite.trim() ||
        r.rewrite.length > 240 ||
        typeof r.why !== "string" ||
        r.why.length > 200 ||
        digits(r.rewrite).some((n) => !digits(source.question).includes(n))
      )
        return null;
      return { ...source, rewrite: r.rewrite.trim(), why: r.why.trim() };
    })
    .filter(Boolean);
}
function coaching(enc, assessment) {
  const found = findings(enc);
  const earned = (assessment.objectives || []).reduce(
      (sum, o) => sum + o.earned,
      0,
    ),
    weight = (assessment.objectives || []).reduce(
      (sum, o) => sum + o.weight,
      0,
    );
  return {
    findings: found,
    flow: flow(enc),
    nextSteps: nextSteps(enc, assessment, found),
    objectivePercent: weight ? Math.round((earned / weight) * 100) : null,
    notice:
      "Built from the recorded encounter. Question types come from automated classification and are observations, not ratings.",
  };
}
module.exports = {
  coaching,
  findings,
  flow,
  nextSteps,
  rewriteCandidates,
  validRewrites,
};
