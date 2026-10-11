const CORE = require('./virtusp-core');
const { randomUUID } = require('crypto');
const safeMatches = CORE.matchesKeyword;
const canonicalQuestion = text => String(text).trim().replace(/\s+/g, ' ');
const now = () => new Date().toISOString();
const ROLES = ['Primary care physician'];
function validate(p) {
  const found = [];
  const err = (m, r) => found.push({ s: 'error', m, r });
  const warn = (m, r) => found.push({ s: 'warning', m, r });
  const ids = new Set();

  (p.facts || []).forEach((f) => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.id || '') || typeof f.label !== 'string' || !['ask','chart'].includes(f.vis)) err('Invalid fact identity or visibility', f.id);
    if (!Array.isArray(f.kw) || f.kw.some(k => typeof k !== 'string' || k.length > 100)) err('Invalid fact keywords', f.id);
    if (f.say != null && (typeof f.say !== 'string' || f.say.length > 4000)) err('Invalid approved wording', f.id);
    if (f.deflect != null && typeof f.deflect !== 'string') err('Invalid approved deflection', f.id);
    if (ids.has(f.id)) {
      err('Duplicate fact id', f.id);
    }
    ids.add(f.id);
    if (!f.src) {
      err('Missing source', f.id);
    } else if (/unverified/i.test(f.src)) {
      warn('Unverified source: faculty must confirm', f.id);
    }
    if (f.vis === 'ask' && !f.say) {
      err('Disclosable fact has no approved patient wording (model could not ground it)', f.id);
    }
    if (f.lab && (!f.unit || !f.ref)) {
      err('Lab missing unit or reference range', f.id);
    }
    if (f.vis === 'chart' && !f.sec) {
      err('Chart fact has no release section', f.id);
    }
  });

  (p.facts || []).filter((f) => f.allergyDrug).forEach((a) => {
    (p.facts || []).filter((f) => f.drug === a.allergyDrug).forEach((m) => {
      err('Allergy conflicts with medication', a.id + '/' + m.id);
    });
  });

  if (!(p.obj || []).length) {
    err('No learning objectives', 'obj');
  }
  (p.obj || []).forEach((o) => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(o.id || '') || !Number.isFinite(o.w) || o.w <= 0 || !['manual','fact','review','mm','emp','ho'].includes(o.ty)) err('Invalid objective identity, weight or type', o.id);
    if (o.ty === 'manual') warn('Objective is not assessed until faculty maps its required evidence', o.id);
    if (o.ty === 'fact' && (!Array.isArray(o.f) || !o.f.length)) err('Fact objective requires referenced facts', o.id);
    if (o.ty === 'review' && (!Array.isArray(o.s) || !o.s.length)) err('Review objective requires chart sections', o.id);
    (o.f || []).forEach((i) => {
      if (!ids.has(i)) {
        err('Objective references unknown fact ' + i, o.id);
      }
    });
  });

  const total = (p.obj || []).reduce((a, o) => a + Number(o.w || 0), 0);
  if (total !== 100) {
    warn('Objective weights sum to ' + total + ', not 100', 'obj');
  }
  if (p.mm && (!ids.has(p.mm.a) || !ids.has(p.mm.b))) {
    err('Mismatch references unknown facts', 'mm');
  }
  (p.artifacts || []).forEach(a => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id || '') || !Array.isArray(a.facts) || a.facts.some(id => !ids.has(id)) || !Array.isArray(a.unlock) || a.unlock.some(k => typeof k !== 'string')) err('Invalid artifact references or triggers', a.id);
  });

  return found;
}


function createEncounter(profile) {
 let enc, rt = 'ov';
 const requestLedger = new Map();
 const release = {p: profile};
 const attachCaseExtras = p => JSON.parse(JSON.stringify(p));
  enc = {
    id: 'ENC-' + randomUUID(),
    p: attachCaseExtras(release.p),
    trust: 0,
    disc: new Map(),
    opened: new Set(['ov']),
    reviewedSections: new Set(),
    reviewedArtifacts: new Set(),
    ev: [],
    tr: [{ w: 'Patient', t: release.p.intro }],
    prov: [],
    role: ROLES[0],
    emp: 0,
    open: 0,
    turns: 0,
    ho: null,
    plan: [],
    notes: [],
    rec: false,
    blocked: 0,
    prof: 0,
    judg: 0,
    arts: new Map(),
    lastArt: null
  };
  log('start', `Launched ${profile.name} profile v${profile.version}`);

 function log(type, text) {enc.ev.push({n: enc.ev.length + 1, t: now(), role: enc.role, type, text});}
function releaseArtifact(art, via) {
  if (!art || enc.arts.has(art.id)) {
    return;
  }

  enc.arts.set(art.id, { via, t: now() });
  enc.lastArt = art.id;
  (art.facts || []).forEach((id) => {
    const fact = enc.p.facts.find((f) => f.id === id);
    if (fact) {
      disclose(fact, via);
    }
  });
  if (art.sec) {
    // Release does not establish that the learner opened the section.
    rt = art.sec;
  }
  log('artifact', art.title + ' released via ' + via);
}

function releaseByQuestion(q) {
  const lower = String(q || '');
  (enc.p.artifacts || []).forEach((art) => {
    if ((art.unlock || []).some((k) => safeMatches(lower, k))) {
      releaseArtifact(art, q);
    }
  });
  enc.p.facts.filter((f) => f.vis === 'chart' && !f.artifact && !(enc.p.artifacts || []).some(a => a.facts.includes(f.id))).forEach((f) => {
    if ((f.kw || []).some((k) => safeMatches(lower, k))) {
      disclose(f, q);
    }
  });
}

function disclose(f, q) {
  if (enc.disc.has(f.id)) {
    return;
  }

  enc.disc.set(f.id, { q });
  enc.prov.push({
    f,
    who: f.vis === 'chart' ? f.role : 'Patient',
    rec: enc.role,
    t: now(),
    st: f.type
  });
  log('disclose', `${f.id} released (${f.type}) via ${q}`);
}

function registerRequest(question, requestId) {
  const id = requestId || `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const key = `${enc ? enc.id : 'enc'}:${id}`;
  const payload = canonicalQuestion(question);
  const previous = requestLedger.get(key);

  if (!previous) {
    requestLedger.set(key, { payload });
    return { status: 'ok', requestId: id };
  }

  if (previous.payload === payload) {
    return { status: 'replay', requestId: id };
  }

  return { status: 'conflict', requestId: id, previous: previous.payload, current: payload };
}

function ask(q, requestId) {
  if (!enc || !String(q).trim()) {
    return;
  }

  const requestState = registerRequest(q, requestId);
  if (requestState.status === 'replay') {
    return requestLedger.get(`${enc.id}:${requestState.requestId}`).result;
  }

  if (requestState.status === 'conflict') {
    throw Object.assign(new Error('Request ID already used with a different payload'), {status: 409});

  }

  const lower = String(q).trim().toLowerCase();
  const routeText = /how can i help you|what brings you in/.test(lower) ? 'bring' : lower;
  const profile = enc.p;
  enc.turns += 1;
  enc.tr.push({ w: 'Student', t: q });
  log('student', q);

  if (/(understand|sorry|must be|sounds|thank you for|worr|concern about|appreciate|no judg|i hear|that must)/.test(lower)) {
    enc.emp += 1;
    enc.prof += 1;
    enc.trust = Math.min(3, enc.trust + 1);
    log('empathy', 'Empathic acknowledgment');
  }
  if (/please|appreciate your time/.test(lower)) {
    enc.prof += 1;
  }
  if (/(noncompliant|you need to|why didn't you|should have taken|that's stupid)/.test(lower)) {
    enc.judg += 1;
    log('professionalism', 'Judgmental wording logged');
  }
  if (/^(how|what|tell|can you|could you|walk me)/.test(lower)) {
    enc.open += 1;
  }

  const greetingReply = CORE.conversationReply(q);
  const topic = CORE.normalizeText(q);
  const unsupportedDomain = ['family', 'smok', 'allerg'].some(domain =>
    topic.includes(domain) && !profile.facts.some(f => f.vis === 'ask' && (f.kw || []).some(k => k.includes(domain))));
  const unsafe = CORE.isUnsafeQuestion(q) || unsupportedDomain;

  let best = null;
  let score = 0;
  profile.facts.filter((f) => f.vis === 'ask' && !unsafe).forEach((f) => {
    const s = (f.kw || []).filter((k) => safeMatches(routeText, k)).length;
    if (s > score && (!CORE.isConfirmationQuestion(q) || enc.disc.has(f.id))) {
      score = s;
      best = f;
    }
  });

  let reply;
  let grounded = 'fallback';
  let emotion = 'neutral';

  if (greetingReply && !best) {
    reply = greetingReply;
    grounded = 'greeting';
  } else if (!best) {
    reply = "I'm not sure about that. Could you ask me another way?";
  } else if (best.gate > enc.trust && !enc.disc.has(best.id)) {
    reply = best.deflect || "I'm not sure about that.";
    grounded = 'blocked:' + best.id;
    emotion = 'embarrassed';
    enc.blocked += 1;
    log('gate', `${best.id} withheld (trust ${enc.trust}<${best.gate})`);
  } else {
    reply = best.say;
    grounded = best.id;
    disclose(best, q);
    if (best.gate) {
      emotion = 'relieved';
    }
  }

  enc.tr.push({ w: 'Patient', t: reply, g: grounded });
  if (!greetingReply && !unsafe && !CORE.isConfirmationQuestion(q)) releaseByQuestion(q);
  surfaceMM();


  const result = { reply, grounded, emotion };
  requestLedger.get(`${enc.id}:${requestState.requestId}`).result = result;
  return result;
}

function askHint(i) {
  const hints = (enc && enc.p && enc.p.hints) || [];
  if (hints[i]) {
    ask(hints[i]);
  }
}

function surfaceMM() {
  const mismatch = enc.p.mm;
  if (mismatch && enc.disc.has(mismatch.a) && enc.disc.has(mismatch.b) && !enc.mmS) {
    enc.mmS = 1;
    log('mismatch', 'Patient report and chart now both visible (discrepancy surfaced)');
  }
}

function openSec(s) {
  if (!enc.opened.has(s)) {
    enc.opened.add(s);
    log('open', 'Opened ' + s);
    enc.p.facts.filter((f) => f.sec === s && f.vis === 'chart' && !f.artifact && f.release !== 'question' && !(enc.p.artifacts || []).some(a => a.facts.includes(f.id))).forEach((f) => disclose(f, 'section ' + s));
    (enc.p.artifacts || []).filter((a) => a.sec === s && a.kind === 'lab' && a.release !== 'question').forEach((a) => releaseArtifact(a, 'opened ' + s));
    surfaceMM();

  }
  rt = s;

}

function recordSectionReview(section) {
  if (!enc || !enc.opened.has(section) || !enc.p.facts.some(f => f.sec === section && enc.disc.has(f.id))) {
    return;
  }
  enc.reviewedSections = enc.reviewedSections || new Set();
  enc.reviewedSections.add(section);
  log('review', 'Recorded review of ' + section);


}

function reviewArtifact(id) {
  if (!enc || !enc.arts.has(id)) {
    return;
  }
  enc.reviewedArtifacts = enc.reviewedArtifacts || new Set();
  enc.reviewedArtifacts.add(id);
  log('review', 'Recorded review of artifact ' + id);


}

function reconcile(t) {
  if (!String(t).trim()) {
    return;
  }

  const ok = enc.p.mm && enc.mmS && enc.p.mm.kw.some((k) => t.toLowerCase().includes(k));
  enc.notes.push({ t, who: enc.role, at: now(), ok });
  if (ok) {
    enc.rec = true;
  }
  log('reconcile', `Clinician claim documented${ok ? ' (addresses discrepancy)' : ''}: ${t}`);


}


 return { state: enc, ask, openSec, recordSectionReview, reviewArtifact, reconcile };
}
module.exports = { createEncounter, validate };
