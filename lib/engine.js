"use strict";
const { randomUUID } = require("node:crypto");
const cloud = require("./cloud");
const { clone, sections } = require("./profiles");
const { assess } = require("./assessment");
const UNKNOWN =
  "I'm not sure about that. It hasn't been specified in my history.";
const INJECTION =
  /ignore (?:all |previous |the )?instructions|system prompt|developer message|reveal (?:all |hidden |the )|pretend (?:you are|to be) (?:a |the )?(?:doctor|another patient)|override (?:the |your )?(?:rules|profile)/i;
function event(enc, type, detail = {}) {
  const e = {
    id: `${enc.id}-E${enc.events.length + 1}`,
    at: new Date().toISOString(),
    type,
    role: enc.role,
    ...detail,
  };
  enc.events.push(e);
  return e;
}
function create(profile) {
  const p = clone(profile);
  p.facts.push({
    id: "$identity",
    label: `${p.name}, age ${p.age}`,
    say: `I'm ${p.name}, and I'm ${p.age} years old.`,
    topic: "Patient name and age",
    kw: ["your name", "how old", "your age"],
    vis: "ask",
    ehr: "hx",
    gate: 0,
    type: "confirmed",
    src: "Published patient identity",
  });
  const enc = {
    id: randomUUID(),
    p,
    role: "Student clinician",
    status: "active",
    createdAt: new Date().toISOString(),
    trust: 0,
    disclosed: {},
    released: {},
    reviewed: [],
    reviewedSections: [],
    events: [],
    transcript: [],
    notes: [],
    plan: [],
    requests: {},
    assessment: null,
    handoff: null,
  };
  const e = event(enc, "start", {
    text: `Started ${profile.name}, profile v${profile.version}`,
  });
  enc.transcript.push({
    id: e.id,
    role: "patient",
    text: profile.intro || `Hello, I'm ${profile.name}.`,
    provider: "approved",
    factIds: [],
  });
  return enc;
}
function permitted(enc, f) {
  return !!enc.disclosed[f.id] || f.gate <= enc.trust;
}
function disclose(enc, f, via) {
  if (enc.disclosed[f.id] || !permitted(enc, f)) return;
  const e = event(enc, "disclose", {
    factId: f.id,
    section: f.ehr,
    text: f.label,
    via,
  });
  enc.disclosed[f.id] = { eventId: e.id, at: e.at, via };
}
function release(enc, a, via) {
  if (enc.released[a.id]) return;
  if (
    (a.facts || []).some(
      (id) =>
        !permitted(
          enc,
          enc.p.facts.find((f) => f.id === id),
        ),
    )
  )
    return;
  const e = event(enc, "release", {
    artifactId: a.id,
    section: a.sec,
    text: a.title,
    via,
  });
  enc.released[a.id] = { eventId: e.id, at: e.at, via };
  for (const id of a.facts || []) {
    const f = enc.p.facts.find((f) => f.id === id);
    if (f) disclose(enc, f, via);
  }
}
function openSection(enc, s) {
  if (!sections.includes(s) && s !== "ov")
    throw new Error("Unknown chart section.");
  event(enc, "open", { section: s, text: `Opened ${s}` });
  // Opening a section releases authored section/both reports; question-only reports stay locked.
  for (const a of enc.p.artifacts.filter(
    (a) => a.sec === s && ["section", "both"].includes(a.release || "both"),
  ))
    release(enc, a, "section " + s);
  const linked = new Set(
    enc.p.artifacts
      .filter((a) => !enc.released[a.id])
      .flatMap((a) => a.facts || []),
  );
  for (const f of enc.p.facts.filter(
    (f) => f.vis === "chart" && f.sec === s && !linked.has(f.id),
  ))
    disclose(enc, f, "section " + s);
}
function review(enc, id) {
  const a = enc.p.artifacts.find((a) => a.id === id);
  if (!a || !enc.released[id]) throw new Error("Artifact is not released.");
  if (!enc.reviewed.includes(id)) {
    enc.reviewed.push(id);
    if (!enc.reviewedSections.includes(a.sec)) enc.reviewedSections.push(a.sec);
    event(enc, "review", {
      artifactId: id,
      section: a.sec,
      text: `Reviewed ${a.title}`,
    });
  }
}
function reviewSection(enc, s) {
  if (!sections.includes(s)) throw new Error("Invalid section.");
  if (!enc.p.facts.some((f) => f.ehr === s && enc.disclosed[f.id]))
    throw new Error("No released findings in this section.");
  if (!enc.reviewedSections.includes(s)) {
    enc.reviewedSections.push(s);
    event(enc, "review", {
      section: s,
      text: `Reviewed released ${s} findings`,
    });
  }
}
function localSelect(enc, q) {
  const lower = q.toLowerCase();
  let best = null,
    score = 0;
  for (const f of enc.p.facts) {
    const hits = (f.kw || []).filter((k) =>
      lower.includes(k.toLowerCase()),
    ).length;
    if (hits > score) {
      score = hits;
      best = f;
    }
  }
  return {
    factIds: best ? [best.id] : [],
    empathy:
      /sorry|sounds (?:hard|difficult|worrying)|thank you for|no judgment|i understand|i hear|appreciate/.test(
        lower,
      ),
    openQuestion: /^(what|how|tell me|can you describe|could you explain)/.test(
      lower,
    ),
    judgmental: /noncompliant|stupid|you should have|why didn't you/.test(
      lower,
    ),
  };
}
function numbers(text) {
  return String(text).match(/\d+(?:\.\d+)?/g) || [];
}
function validResponse(response, allowed, deflections) {
  if (
    !response ||
    typeof response.text !== "string" ||
    !response.text.trim() ||
    response.text.length > 1800 ||
    !Array.isArray(response.factIds) ||
    response.factIds.length > 3
  )
    return false;
  const ids = new Set(allowed.map((f) => f.id));
  if (
    new Set(response.factIds).size !== response.factIds.length ||
    response.factIds.some((id) => !ids.has(id))
  )
    return false;
  const supporting = allowed.filter((f) => response.factIds.includes(f.id));
  if (!supporting.length)
    return response.text === UNKNOWN || deflections.includes(response.text);
  const permitted = new Set(numbers(supporting.map((f) => f.say).join(" ")));
  return numbers(response.text).every((n) => permitted.has(n));
}
async function ask(enc, q, requestId) {
  if (enc.status !== "active")
    throw new Error("This encounter is complete. Start a new attempt.");
  if (typeof q !== "string" || !q.trim() || q.length > 2000)
    throw new Error("Question must be 1–2000 characters.");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId || ""))
    throw new Error("A valid request ID is required.");
  if (enc.requests[requestId]) return;
  q = q.trim();
  const start = Date.now();
  const student = event(enc, "student", { text: q });
  enc.transcript.push({ id: student.id, role: "student", text: q });
  let selected = localSelect(enc, q),
    provider = "local",
    failure = null,
    reply = { text: UNKNOWN, factIds: [] };
  const injection = INJECTION.test(q);
  if (cloud.enabled() && !injection)
    try {
      await cloud.guard(q);
      // Only faculty-authored neutral topic descriptors are visible to the selector, never hidden values.
      selected = await cloud.select(
        enc.p.facts.map((f) => ({ id: f.id, topic: f.topic || f.ehr })),
        q,
        enc.transcript.slice(-12),
      );
      if (
        !Array.isArray(selected.factIds) ||
        selected.factIds.length > 3 ||
        selected.factIds.some((id) => !enc.p.facts.some((f) => f.id === id)) ||
        ["empathy", "openQuestion", "judgmental"].some(
          (k) => typeof selected[k] !== "boolean",
        )
      )
        throw new Error("Invalid semantic selection.");
      provider = "bedrock";
    } catch (e) {
      failure = e.name + ": " + e.message;
      provider = e.name === "GuardrailBlocked" ? "blocked" : "local-fallback";
      selected =
        provider === "blocked"
          ? {
              factIds: [],
              empathy: false,
              openQuestion: false,
              judgmental: false,
            }
          : localSelect(enc, q);
    }
  if (injection) {
    selected = {
      factIds: [],
      empathy: false,
      openQuestion: false,
      judgmental: false,
    };
    provider = "blocked";
  }
  if (selected.empathy) enc.trust = Math.min(3, enc.trust + 1);
  event(enc, "communication", {
    empathy: selected.empathy === true,
    openQuestion: selected.openQuestion === true,
    judgmental: selected.judgmental === true,
    source: provider,
    studentEvent: student.id,
  });
  const chosen = enc.p.facts.filter((f) => selected.factIds.includes(f.id));
  const allowed = [],
    deflections = [];
  for (const f of chosen) {
    if (f.gate > enc.trust && !enc.disclosed[f.id]) {
      if (f.deflect) deflections.push(f.deflect);
      event(enc, "gate", {
        factId: f.id,
        text: "Topic withheld by trust gate",
      });
    } else if (f.vis === "ask") {
      allowed.push({ id: f.id, say: f.say });
    } else {
      const locked = enc.p.artifacts.filter(
        (a) => (a.facts || []).includes(f.id) && !enc.released[a.id],
      );
      if (!locked.length) disclose(enc, f, q);
    }
  }
  for (const a of enc.p.artifacts) {
    if (
      ["question", "both"].includes(a.release || "both") &&
      (a.unlock || []).some((k) => q.toLowerCase().includes(k.toLowerCase())) &&
      !injection &&
      provider !== "blocked"
    )
      release(enc, a, q);
  }
  reply = allowed.length
    ? { text: allowed[0].say, factIds: [allowed[0].id] }
    : deflections.length
      ? { text: deflections[0], factIds: [] }
      : { text: UNKNOWN, factIds: [] };
  if (provider === "bedrock")
    try {
      const candidate = await cloud.paraphrase(
        {
          name: enc.p.name,
          age: enc.p.age,
          personality: enc.p.personality,
          style: enc.p.style,
          emotion: enc.p.emotion,
        },
        allowed,
        q,
        enc.transcript,
        deflections,
      );
      if (!validResponse(candidate, allowed, deflections))
        throw new Error(
          "Response schema, facts or clinical numbers failed validation.",
        );
      if (candidate.factIds.length) {
        const review = await cloud.verify(
          allowed.filter((f) => candidate.factIds.includes(f.id)),
          candidate,
          deflections,
        );
        if (review.supported !== true)
          throw new Error("Independent grounding review rejected response.");
      }
      reply = candidate;
    } catch (e) {
      provider = "approved-fallback";
      failure = e.name + ": " + e.message;
    }
  for (const id of reply.factIds)
    disclose(
      enc,
      enc.p.facts.find((f) => f.id === id),
      q,
    );
  const patient = event(enc, "patient", {
    text: reply.text,
    factIds: reply.factIds,
    provider,
    model: provider === "bedrock" ? cloud.model() : null,
    latencyMs: Date.now() - start,
    failure,
  });
  enc.transcript.push({
    id: patient.id,
    role: "patient",
    ...reply,
    provider,
    latencyMs: patient.latencyMs,
  });
  enc.requests[requestId] = { eventId: patient.id };
}
function reconcile(enc, text) {
  if (typeof text !== "string" || !text.trim() || text.length > 5000)
    throw new Error("Provide a note up to 5000 characters.");
  const mm = enc.p.mm;
  const addressesMismatch = !!(
    mm &&
    enc.disclosed[mm.a] &&
    enc.disclosed[mm.b] &&
    mm.kw.some((k) => text.toLowerCase().includes(k.toLowerCase()))
  );
  const e = event(enc, "reconcile", { text, addressesMismatch });
  enc.notes.push({
    id: e.id,
    text,
    at: e.at,
    role: enc.role,
    addressesMismatch,
  });
}
function handoff(enc, text) {
  if (typeof text !== "string" || !text.trim() || text.length > 10000)
    throw new Error("Provide a handoff up to 10000 characters.");
  const facts = enc.p.facts.filter((f) => enc.disclosed[f.id]);
  const included = facts.filter((f) =>
    text.toLowerCase().includes(String(f.k || f.id).toLowerCase()),
  );
  const e = event(enc, "handoff", { text });
  enc.handoff = {
    id: e.id,
    text,
    coverage: facts.length ? included.length / facts.length : 0,
    included: included.map((f) => f.id),
  };
}
async function complete(enc) {
  if (enc.status === "complete") return;
  enc.status = "complete";
  enc.completedAt = new Date().toISOString();
  event(enc, "complete", { text: "Encounter completed" });
  enc.assessment = await assess(enc);
}
function publicView(enc) {
  const p = enc.p;
  return {
    id: enc.id,
    name: p.name,
    age: p.age,
    version: p.version,
    intro: p.intro,
    imageUrl: `/api/profiles/${p.id}/image`,
    status: enc.status,
    role: enc.role,
    transcript: clone(enc.transcript),
    disclosed: p.facts
      .filter((f) => enc.disclosed[f.id])
      .map((f) => ({
        id: f.id,
        label: f.label,
        ehr: f.ehr,
        type: f.type,
        src: f.src,
        provenance: enc.disclosed[f.id],
      })),
    artifacts: p.artifacts.map((a) =>
      enc.released[a.id]
        ? {
            ...clone(a),
            fileUrl: a.fileId
              ? `/api/encounters/${enc.id}/artifacts/${a.id}/file`
              : null,
            released: enc.released[a.id],
            reviewed: enc.reviewed.includes(a.id),
          }
        : { id: a.id, title: a.title, sec: a.sec, released: false },
    ),
    reviewedSections: clone(enc.reviewedSections),
    notes: clone(enc.notes),
    plan: clone(enc.plan),
    handoff: clone(enc.handoff),
    events: clone(enc.events),
    assessment: clone(enc.assessment),
  };
}
module.exports = {
  create,
  ask,
  openSection,
  review,
  reviewSection,
  reconcile,
  handoff,
  complete,
  publicView,
  event,
  validResponse,
  UNKNOWN,
  INJECTION,
};
