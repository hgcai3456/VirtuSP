"use strict";
const { randomUUID } = require("node:crypto");
const cloud = require("./cloud");
const { clone, sections, documentAwarenessFacts } = require("./profiles");
const { selectionTopics } = require("./roster-profiles");
const { assess, assessQuick, present } = require("./assessment");
const {
  UNKNOWN,
  conversationalReply,
  isUnknownReply,
  nextUnknown,
} = require("./conversation");
const {
  EMERGENCY_TEXT,
  criticalPatientText,
  empathyLead,
} = require("./safety");
const presence = require("./presence");
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
  const existing = new Set((p.facts || []).map((f) => f.id));
  for (const awareness of documentAwarenessFacts(p.artifacts)) {
    if (!existing.has(awareness.id)) {
      p.facts.push(awareness);
    }
  }
  p.facts.push({
    id: "$identity",
    label:
      p.age == null ? `${p.name}; age unspecified` : `${p.name}, age ${p.age}`,
    say:
      p.age == null
        ? `I'm ${p.name}. My age hasn't been specified in this case.`
        : `I'm ${p.name}, and I'm ${p.age} years old.`,
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
    learned: [],
    assessment: null,
    presence: presence.emptyReport(),
    handoff: null,
    lastReleased: [],
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
  flagEmergency(enc, enc.transcript[0].text);
  return enc;
}
function flagEmergency(enc, text) {
  if (enc.emergency || !criticalPatientText(text)) return;
  const e = event(enc, "emergency", {
    service: "911",
    acuity: "emergent",
    text: EMERGENCY_TEXT,
  });
  enc.emergency = {
    service: "911",
    acuity: "emergent",
    text: EMERGENCY_TEXT,
    at: e.at,
    eventId: e.id,
  };
}
function permitted(enc, f) {
  return !!enc.disclosed[f.id] || f.gate <= enc.trust;
}
function disclose(enc, f, via, admitted = false) {
  // admitted: the patient chose to share a guarded topic in conversation.
  if (enc.disclosed[f.id] || (!admitted && !permitted(enc, f))) return;
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
  enc.lastReleased = [...new Set([...(enc.lastReleased || []), a.id])];
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
  // Record displayed content, not an assertion that the learner read/understood it.
  if (
    enc.p.artifacts.some((a) => a.sec === s && enc.released[a.id]) ||
    enc.p.facts.some(
      (f) => f.vis === "chart" && f.ehr === s && enc.disclosed[f.id],
    )
  )
    event(enc, "view", { section: s, text: `Opened released ${s} findings` });
}
function viewArtifact(enc, id) {
  const a = enc.p.artifacts.find((a) => a.id === id);
  if (!a || !enc.released[id]) throw new Error("Artifact is not released.");
  event(enc, "view", {
    artifactId: id,
    section: a.sec,
    text: `Opened ${a.title}`,
  });
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
  const topics = new Map(selectionTopics(enc.p).map((f) => [f.id, f.topic]));
  let best = null,
    score = 0;
  for (const f of enc.p.facts.filter((item) => item.vis === "ask")) {
    let hits = (f.kw || []).filter((k) => matchesTerm(lower, k)).length;
    // Broad interview categories are matched against neutral authored topics,
    // never inferred from withheld values. Specific keywords still take priority.
    const topic = topics.get(f.id) || "";
    const categories = [
      [
        /\b(?:medications?|medicines?|meds|pills?|prescriptions?)\b/i,
        /medication routine/i,
      ],
      [/\b(?:eat|eating|food|diet|meals?)\b/i, /diet|meals/i],
      [
        /\b(?:symptoms?|brings?|brought)\b|reason for (?:the )?visit/i,
        /reason for visit/i,
      ],
      [/\ballerg\w*/i, /allerg/i],
    ];
    if (
      !hits &&
      categories.some(
        ([question, descriptor]) =>
          question.test(lower) && descriptor.test(topic),
      )
    )
      hits = 0.5;
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
const WRAPPER_WORDS = new Set(
  "i i'm im my me we you the a an and or but to of in on for with that this it is am are was were have has had not no yes well just really about like been very so because from as at be do did can could would should get got going here today bit little still also too then now think know guess sure maybe somewhat pretty feel feeling sounds kind sorta yeah thanks thank okay ok alright hello hi hey please fine listening talking asking welcome meet nice too said mentioned earlier already told before again".split(
    /\s+/,
  ),
);
const CLINICAL_MARKERS =
  /\b(allerg(?:y|ies|ic)|medication|medicine|meds|pills?|tablet|doses?|diagnos(?:is|ed)?|asthma|diabet\w*|cancer|cholesterol|statin|insulin|metformin|nause\w*|fever|vomit\w*|pregnan\w*|surgery|hypertension|breathless|shortness|chest|pain|ldl|hdl|bp)\b/i;
const CLINICAL_QUESTION =
  /\b(allerg(?:y|ies|ic)?|medication|medicine|meds|pills?|dose|diagnos|symptom|pain|ache|fever|nause|vomit|shortness|breathless|asthma|diabet|cancer|cholesterol|ldl|hdl|blood pressure|hypertension|pregnan|surger|hospital|prescription|statin|insulin|metformin|antibiotic|lab(?:s|oratory)?|test result|journal|diary|document|paperwork)\b/i;
function contentTokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !WRAPPER_WORDS.has(w));
}
function paraphraseStaysGrounded(text, supporting) {
  const source = new Set(contentTokens(supporting.map((f) => f.say).join(" ")));
  const extra = contentTokens(text).filter((w) => !source.has(w));
  const supportWords = supporting
    .map(
      (f) =>
        String(f.say || "")
          .split(/\s+/)
          .filter(Boolean).length,
    )
    .reduce((n, w) => n + w, 0);
  const replyWords = String(text).split(/\s+/).filter(Boolean).length;
  const sourceText = supporting
    .map((f) => f.say)
    .join(" ")
    .toLowerCase();
  const clinical =
    String(text)
      .toLowerCase()
      .match(
        /\b(allerg(?:y|ies|ic)|medication|medicine|meds|pills?|doses?|diagnos(?:is|ed)?|asthma|diabet\w*|cancer|cholesterol|statin|insulin|metformin|nause\w*|fever|vomit\w*|pregnan\w*|surgery|hypertension|breathless|shortness|chest|pain|ldl|hdl)\b/g,
      ) || [];
  if (clinical.some((word) => !sourceText.includes(word))) return false;

  return extra.length <= 12 && replyWords <= supportWords + 30;
}
const BIO_CLAIM =
  /\b(i (?:have|had|feel|felt|work|live|take|am on|was|got)|my (?:wife|husband|kids?|children|son|daughter|job|work|boss|hours?))\b/i;
function isSocialOnly(text) {
  if (!text || numbers(text).length || text.length > 360) return false;
  if (CLINICAL_MARKERS.test(text) || BIO_CLAIM.test(text)) return false;

  return true;
}
function looksClinicalQuestion(question) {
  return (
    CLINICAL_QUESTION.test(question) ||
    /\b(?:medical|health|family) history\b|\b(?:past|prior|previous|chronic) (?:conditions?|illness(?:es)?|operations?|problems?)\b|\b(?:medical|health) (?:conditions?|problems?)\b/i.test(
      question,
    )
  );
}
function localSocial(enc, question) {
  const intro = String(enc.p.intro || "Hello.").trim();
  if (/^\s*(hi|hello|hey)\b/i.test(question)) return intro;
  if (/\bthank/i.test(question)) return "You're welcome.";
  if (
    /\bhow are you\b|\bhow's it going\b|\bhow have you been\b/i.test(question)
  )
    return "I'm doing all right. Thanks for asking.";
  if (/\b(nice to meet|good to meet|pleasure to meet)\b/i.test(question))
    return "Nice to meet you too.";
  if (/\b(is it okay|do you mind|can i ask|may i ask)\b/i.test(question))
    return "Yes, that's fine.";
  if (/\b(take your time|no rush)\b/i.test(question)) return "Thank you.";

  return "Okay, I'm listening.";
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
  if (!supporting.length) {
    if (isUnknownReply(response.text) || deflections.includes(response.text))
      return true;

    return isSocialOnly(response.text);
  }
  const permitted = new Set(numbers(supporting.map((f) => f.say).join(" ")));
  if (!numbers(response.text).every((n) => permitted.has(n))) return false;

  return paraphraseStaysGrounded(response.text, supporting);
}
function conversationTerms(a) {
  const stop = new Set([
    "report",
    "file",
    "document",
    "patient",
    "clinical",
    "test",
    "this",
    "that",
    "with",
    "from",
    "into",
    "about",
    "note",
    "lab",
    "image",
  ]);
  const authored = (a.unlock || [])
    .map((k) => String(k).trim())
    .filter(Boolean);
  if (authored.length) return authored;

  return String(a.title || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()));
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function matchesTerm(hay, term) {
  const t = String(term || "")
    .trim()
    .toLowerCase();
  if (!t) return false;
  if (t.includes(" ")) return hay.includes(t);
  const source = escapeRegExp(t);
  const pattern =
    t.length <= 3
      ? new RegExp(`\\b${source}\\b`, "i")
      : new RegExp(`\\b${source}\\w*`, "i");

  return pattern.test(hay);
}
function isRapportOnly(question) {
  const q = String(question || "").trim();
  if (!q || looksClinicalQuestion(q)) return false;

  return (
    /^(?:hi|hello|hey)(?:\s+there)?(?:[.,!\s]+(?:nice to meet you(?: too)?|how are you(?: today)?)?)*[.\s!]*$/i.test(
      q,
    ) ||
    /^(?:good (?:morning|afternoon|evening)|how are you(?: today)?|nice to meet you|thanks(?: you)?|thank you|okay|ok)[.\s!]*$/i.test(
      q,
    )
  );
}
function relevantHaystack(enc, question) {
  const recent = (enc.transcript || [])
    .filter((t) => t.role === "student" || t.role === "patient")
    .slice(-12)
    .map((t) => t.text)
    .join(" ");

  return `${question || ""} ${recent}`.toLowerCase();
}
function matchesConversation(a, enc, question) {
  if (isRapportOnly(question)) return false;
  const hay = relevantHaystack(enc, question);

  return conversationTerms(a, enc).some((k) => matchesTerm(hay, k));
}
function isContinuation(question) {
  return /^(?:tell me more|go on|continue|and then|anything else|what else|please go on)[.!?\s]*$/i.test(
    String(question || "").trim(),
  );
}
function interactionMemory(enc) {
  const learned = Array.isArray(enc.learned) ? enc.learned : [];

  return {
    rapport: enc.trust || 0,
    exchanges: learned.slice(-6).map((item) => ({
      question: item.question,
      reply: item.reply,
      factIds: (item.factIds || []).filter((id) => enc.disclosed[id]),
    })),
  };
}
function adaptFromMemory(enc, question, reply) {
  const learned = Array.isArray(enc.learned) ? enc.learned : [];
  if (isContinuation(question)) {
    const prior = [...learned]
      .reverse()
      .find((item) => item.factIds?.length && item.reply);
    if (prior) {
      const spoken = String(prior.reply).replace(/^As I said,\s*/i, "");

      return { text: `As I said, ${spoken}`, factIds: prior.factIds.slice() };
    }
  }
  if (
    reply.factIds?.length &&
    learned.some((item) =>
      reply.factIds.every((id) => item.factIds?.includes(id)),
    ) &&
    !/^As I said,/i.test(reply.text)
  )
    return { ...reply, text: `As I said, ${reply.text}` };

  return reply;
}
function rememberExchange(enc, question, reply) {
  if (!Array.isArray(enc.learned)) enc.learned = [];
  enc.learned.push({
    question: String(question || "").slice(0, 240),
    reply: String(reply.text || "").slice(0, 400),
    factIds: (reply.factIds || []).filter((id) => enc.disclosed[id]),
  });
  if (enc.learned.length > 16) enc.learned.splice(0, enc.learned.length - 16);
}
function validReview(review, allowed) {
  const normalize = (s) =>
    String(s)
      .normalize("NFKC")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  return (
    review?.supported === true &&
    Array.isArray(review.claims) &&
    review.claims.length > 0 &&
    review.claims.length <= 20 &&
    review.claims.every(
      (c) =>
        c &&
        c.inferred === false &&
        typeof c.claim === "string" &&
        c.claim.trim() &&
        typeof c.quote === "string" &&
        c.quote.trim() &&
        allowed.some(
          (f) =>
            f.id === c.factId && normalize(f.say).includes(normalize(c.quote)),
        ),
    ) &&
    allowed.every((f) => review.claims.some((c) => c.factId === f.id))
  );
}
// Conversational patient. DIALOGUE_MODE=natural turns it on for any provider
// and DIALOGUE_MODE=strict keeps the staged select / approved-line pipeline.
// Unset, it is on with the Claude API and off with Bedrock, so a Bedrock
// deployment does not change behaviour until someone opts in.
const naturalDialogue = () =>
  cloud.enabled() &&
  (process.env.DIALOGUE_MODE === "natural" ||
    (cloud.provider() === "anthropic" &&
      process.env.DIALOGUE_MODE !== "strict"));
// One model call plays the patient and reports what it conveyed. Returns the
// reply and scoring flags, or throws so the caller can use the staged pipeline.
async function naturalTurn(enc, q) {
  const spoken = enc.p.facts.filter(
    (f) => f.vis === "ask" && f.say && f.id !== "$identity",
  );
  const guarded = spoken.filter((f) => f.gate > 0 && !enc.disclosed[f.id]);
  const open = spoken.filter((f) => !guarded.includes(f));
  const chart = enc.p.facts.filter((f) => f.vis !== "ask");
  const out = await cloud.dialogue({
    persona: {
      name: enc.p.name,
      age: enc.p.age,
      gender: enc.p.gender || "",
      personality: enc.p.personality || "",
      emotionalState: enc.p.emotion || "",
      speakingStyle: enc.p.style || "",
    },
    open: open.map((f) => ({ id: f.id, label: f.label, say: f.say })),
    guarded: guarded.map((f) => ({
      id: f.id,
      topic: f.topic || f.label,
      truth: f.say,
      deflect: f.deflect || "",
    })),
    // Topic names only: chart values never reach the dialogue model.
    chart: chart.map((f) => ({ id: f.id, topic: f.topic || f.ehr })),
    history: enc.transcript
      .slice(0, -1)
      .slice(-16)
      .map((t) => ({
        who: t.role === "patient" ? "You" : "Student",
        text: String(t.text || "").slice(0, 600),
      })),
    question: q,
  });
  const ids = (list, pool) => [
    ...new Set(
      (Array.isArray(list) ? list : []).filter((id) =>
        pool.some((f) => f.id === id),
      ),
    ),
  ];
  const revealed = ids(out.revealed, spoken);
  // Unknown stays unknown: a figure in the reply must come from a fact the
  // patient may speak, from the conversation, or from the student's question.
  const known = new Set(
    numbers(
      [
        q,
        enc.p.age,
        ...spoken.map((f) => f.say + " " + f.label),
        ...enc.transcript.map((t) => t.text),
      ].join(" "),
    ),
  );
  const invented = numbers(out.reply).filter((n) => !known.has(n));
  if (invented.length)
    throw new Error("Reply stated a figure not in the case: " + invented[0]);
  return {
    text: String(out.reply).trim().slice(0, 1200),
    revealed,
    withheld: ids(out.withheld, guarded).filter((id) => !revealed.includes(id)),
    chartAsked: ids(out.chartAsked, chart),
    emotion: out.emotion,
    flags: {
      empathy: out.empathic === true,
      openQuestion: out.openQuestion === true,
      judgmental: out.judgmental === true,
    },
  };
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
  enc.lastReleased = [];
  const start = Date.now();
  const student = event(enc, "student", { text: q });
  enc.transcript.push({ id: student.id, role: "student", text: q });
  let selected = localSelect(enc, q),
    provider = "local",
    failure = null,
    reply = { text: UNKNOWN, factIds: [] };
  const injection = INJECTION.test(q);
  if (naturalDialogue() && !injection)
    try {
      const turn = await naturalTurn(enc, q);
      provider = cloud.provider();
      if (turn.flags.empathy) enc.trust = Math.min(3, enc.trust + 1);
      event(enc, "communication", {
        ...turn.flags,
        source: provider,
        studentEvent: student.id,
      });
      for (const id of turn.withheld)
        event(enc, "gate", {
          factId: id,
          text: "Topic withheld by trust gate",
        });
      for (const id of turn.chartAsked) {
        const f = enc.p.facts.find((item) => item.id === id);
        const locked = enc.p.artifacts.filter(
          (a) => (a.facts || []).includes(id) && !enc.released[a.id],
        );
        if (!locked.length) disclose(enc, f, q);
      }
      for (const a of enc.p.artifacts)
        if (
          ["question", "both"].includes(a.release || "both") &&
          matchesConversation(a, enc, q)
        )
          release(enc, a, q);
      reply = { text: turn.text, factIds: turn.revealed };
      flagEmergency(enc, reply.text);
      for (const id of reply.factIds)
        disclose(
          enc,
          enc.p.facts.find((f) => f.id === id),
          q,
          true,
        );
      const patient = event(enc, "patient", {
        text: reply.text,
        factIds: reply.factIds,
        provider,
        model: cloud.model(),
        emotion: turn.emotion,
        latencyMs: Date.now() - start,
        failure: null,
      });
      enc.transcript.push({
        id: patient.id,
        role: "patient",
        ...reply,
        provider,
        failure: null,
        latencyMs: patient.latencyMs,
      });
      rememberExchange(enc, q, reply);
      enc.requests[requestId] = { eventId: patient.id };
      return;
    } catch (e) {
      // Fall through to the staged pipeline for this turn.
      failure = e.name + ": " + e.message;
    }
  const courtesy = injection ? null : conversationalReply(enc.p, q);
  if (courtesy) {
    selected = {
      factIds: [],
      empathy: false,
      openQuestion: false,
      judgmental: false,
    };
    provider = "approved-conversation";
  }
  if (cloud.enabled() && !injection && !courtesy)
    try {
      // Only faculty-authored neutral topic descriptors are visible to the selector, never hidden values.
      const [picked] = await Promise.all([
        cloud.select(selectionTopics(enc.p), q, enc.transcript.slice(-4)),
        cloud.guard(q),
      ]);
      selected = picked;
      if (
        !Array.isArray(selected.factIds) ||
        selected.factIds.length > 3 ||
        selected.factIds.some((id) => !enc.p.facts.some((f) => f.id === id)) ||
        ["empathy", "openQuestion", "judgmental"].some(
          (k) => typeof selected[k] !== "boolean",
        )
      )
        throw new Error("Invalid semantic selection.");
      provider = cloud.provider();
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
  const lastPatient = enc.transcript.findLast((t) => t.role === "patient");
  const identityQuestion =
    /\b(?:your name|how old|your age|who are you|introduce yourself)\b/i.test(
      q,
    ) ||
    (/\b(?:again|repeat|remind)\b/i.test(q) &&
      lastPatient?.factIds?.includes("$identity"));
  const chosen = [...new Set(selected.factIds)]
    .filter((id) => id !== "$identity" || identityQuestion)
    .map((id) => enc.p.facts.find((f) => f.id === id));
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
  if (
    !allowed.length &&
    !deflections.length &&
    !courtesy &&
    !injection &&
    provider !== "blocked"
  ) {
    for (const extra of localSelect(enc, q).factIds) {
      const f = enc.p.facts.find((item) => item.id === extra);
      if (
        f &&
        f.vis === "ask" &&
        f.say &&
        (enc.disclosed[f.id] || f.gate <= enc.trust) &&
        !allowed.some((item) => item.id === f.id)
      ) {
        allowed.push({ id: f.id, say: f.say });
      }
    }
  }
  for (const a of enc.p.artifacts) {
    if (
      ["question", "both"].includes(a.release || "both") &&
      matchesConversation(a, enc, q) &&
      !injection &&
      !courtesy &&
      provider !== "blocked"
    )
      release(enc, a, q);
  }
  const localFacts = allowed.slice(0, 2);
  reply = courtesy
    ? { text: courtesy, factIds: [] }
    : localFacts.length
      ? {
          text: localFacts.map((f) => f.say).join(" "),
          factIds: localFacts.map((f) => f.id),
        }
      : deflections.length
        ? { text: deflections[0], factIds: [] }
        : looksClinicalQuestion(q) ||
            provider === "blocked" ||
            numbers(q).length
          ? { text: nextUnknown(enc), factIds: [] }
          : { text: localSocial(enc, q), factIds: [] };
  const skipParaphrase =
    localFacts.length > 0 ||
    deflections.length > 0 ||
    (!allowed.length && (looksClinicalQuestion(q) || numbers(q).length));
  if (provider === cloud.provider() && !skipParaphrase) {
    try {
      const candidate = await cloud.paraphrase(
        {
          name: enc.p.name,
          age: enc.p.age,
          gender: enc.p.gender || "",
          personality: enc.p.personality,
          style: enc.p.style,
          emotion: enc.p.emotion,
        },
        allowed,
        q,
        enc.transcript,
        deflections,
        interactionMemory(enc),
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
        const accepted = validReview(
          review,
          allowed.filter((f) => candidate.factIds.includes(f.id)),
        );
        event(enc, "grounding-review", {
          accepted,
          model: cloud.model(),
          factIds: candidate.factIds,
          text: accepted
            ? "Generated reply grounding accepted"
            : "Generated reply grounding rejected",
        });
        if (!accepted)
          throw new Error(
            "Independent grounding review rejected response: " +
              String(review?.reason || "Invalid claim support").slice(0, 300),
          );
      }
      reply = candidate;
    } catch (e) {
      provider = "approved-fallback";
      failure = e.name + ": " + e.message;
    }
  }
  if (provider === "local" || (isContinuation(q) && !reply.factIds.length))
    reply = adaptFromMemory(enc, q, reply);
  if (enc.p.channel === "text" && selected.empathy)
    reply = { ...reply, text: empathyLead(reply.text) };
  flagEmergency(enc, reply.text);
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
    model: provider === cloud.provider() ? cloud.model() : null,
    latencyMs: Date.now() - start,
    failure,
  });
  enc.transcript.push({
    id: patient.id,
    role: "patient",
    ...reply,
    provider,
    failure,
    latencyMs: patient.latencyMs,
  });
  rememberExchange(enc, q, reply);
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
function recordPresence(enc, incoming) {
  return presence.record(enc, incoming);
}

function visitDurationSec(enc) {
  if (!enc?.createdAt) return 0;
  const start = new Date(enc.createdAt).getTime();
  const end = enc.completedAt
    ? new Date(enc.completedAt).getTime()
    : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.max(0, Math.round((end - start) / 1000));
}
// With background: true and a model configured, the visit is closed with the
// instant assessment and the returned promise resolves once the full one has
// replaced it. Otherwise the full assessment is awaited, as before.
async function complete(enc, incomingPresence, { background = false } = {}) {
  if (enc.status === "complete") return;
  enc.status = "complete";
  enc.completedAt = new Date().toISOString();
  enc.durationSec = visitDurationSec(enc);
  event(enc, "complete", {
    text: "Encounter completed",
    durationSec: enc.durationSec,
  });
  presence.finalize(enc, incomingPresence);
  if (background && cloud.enabled()) {
    enc.assessment = assessQuick(enc);
    return { later: finishAssessment(enc) };
  }
  enc.assessment = await assess(enc);
}
// Replaces a pending assessment with the full one. Never rejects: on failure
// the instant assessment stays, marked as final with the reason.
async function finishAssessment(enc) {
  try {
    enc.assessment = await assess(enc);
  } catch (e) {
    enc.assessment = {
      ...enc.assessment,
      pending: false,
      failure: e.name + ": " + e.message,
    };
  }
}
// The short intake line for the chart's Overview tab. Imported cases carry
// the chief complaint; for ones imported before that was stored, it is read
// from the import summary. Nothing a student is graded on eliciting beyond
// the reason for the visit is included.
function overviewOf(p) {
  const fromSummary = /^Chief complaint:\s*(.+)$/m.exec(
    p.sources?.find((s) => s.id === "import-source")?.excerpt || "",
  )?.[1];
  return {
    ethnicity: p.ethnicity || "",
    dob: p.dob || "",
    reason: String(p.overview?.reason || fromSummary || "")
      .trim()
      .slice(0, 240),
  };
}
function publicView(enc) {
  const p = enc.p;
  return {
    id: enc.id,
    profileId: p.id,
    name: p.name,
    age: p.age,
    gender: p.gender || "",
    version: p.version,
    intro: p.intro,
    overview: overviewOf(p),
    // Every student encounter is a video visit. A profile channel of "text"
    // only selects the empathetic lead; it does not change the medium.
    channel: "visit",
    emergency: enc.emergency ? clone(enc.emergency) : null,
    imageUrl: `/api/profiles/${p.id}/image`,
    status: enc.status,
    createdAt: enc.createdAt,
    completedAt: enc.completedAt || null,
    durationSec: enc.durationSec ?? visitDurationSec(enc),
    role: enc.role,
    transcript: clone(enc.transcript),
    disclosed: p.facts
      .filter((f) => enc.disclosed[f.id])
      .map((f) => ({
        id: f.id,
        label: f.label,
        ehr: f.ehr,
        releaseSection: f.vis === "chart" ? f.sec : null,
        wording: f.vis === "ask" ? f.say || "" : "",
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
            justReleased: (enc.lastReleased || []).includes(a.id),
          }
        : { id: a.id, sec: a.sec, released: false },
    ),
    reviewedSections: clone(enc.reviewedSections),
    notes: clone(enc.notes),
    plan: clone(enc.plan),
    handoff: clone(enc.handoff),
    events: enc.events.map((e) => {
      const copy = clone(e);
      if (copy.type === "gate" && !enc.disclosed[copy.factId])
        delete copy.factId;
      return copy;
    }),
    assessment: present(clone(enc.assessment)),
    presence: clone(enc.presence || presence.emptyReport()),
  };
}
module.exports = {
  create,
  ask,
  openSection,
  review,
  viewArtifact,
  reviewSection,
  reconcile,
  handoff,
  complete,
  finishAssessment,
  recordPresence,
  publicView,
  event,
  validResponse,
  validReview,
  interactionMemory,
  UNKNOWN,
  isUnknownReply,
  INJECTION,
};
