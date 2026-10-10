const { listMedicalData } = require('./db');
const { asLead, naturalize, loadStyleTurns } = require('./conversation-style');
const cloud = require('./cloud');
const { UNKNOWN, checkResponse, screenRequest, loadLibrary } = require('./grounding-gate');
const { acceptedDocuments, intercept, publicDecision, scopeOf } = require('./response-interceptor');
const { groundingDocuments } = require('./reports');

const STOP = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'them',
  'your', 'about', 'what', 'when', 'tell', 'could', 'would', 'does', 'into',
  'than', 'then', 'also', 'only', 'more', 'some', 'such', 'used', 'using',
  'their', 'there', 'which', 'while', 'after', 'before', 'over', 'under',
  'today', 'just', 'like', 'really', 'please'
]);

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokens(value) {
  return [...new Set((norm(value).match(/[a-z][a-z0-9-]{3,}/g) || []))]
    .filter((word) => !STOP.has(word));
}

function cleanFacts(body) {
  const source = body && body.case_facts ? body.case_facts : {};
  const raw = Array.isArray(source.facts) ? source.facts : [];

  return {
    intro: String(source.intro || '').slice(0, 500),
    facts: raw.slice(0, 200).map((fact) => ({
      id: String(fact.id || '').slice(0, 80),
      say: String(fact.say || '').slice(0, 2000),
      deflect: String(fact.deflect || '').slice(0, 2000),
      label: String(fact.label || '').slice(0, 500),
      vis: fact.vis === 'chart' ? 'chart' : 'ask',
      gate: Math.max(0, Number(fact.gate) || 0),
      kw: (Array.isArray(fact.kw) ? fact.kw : [])
        .map((word) => String(word || '').slice(0, 80))
        .filter(Boolean)
        .slice(0, 40)
    })).filter((fact) => fact.id)
  };
}

function disclosedSet(body) {
  const ids = Array.isArray(body && body.disclosed) ? body.disclosed : [];

  return new Set(ids.map((id) => String(id || '').slice(0, 80)).filter(Boolean).slice(0, 200));
}

function askFacts(caseFacts) {
  return (caseFacts.facts || []).filter((fact) => fact.vis === 'ask' && fact.id);
}

function keywordHits(request, fact) {
  const lower = norm(request);
  const words = lower.match(/[a-z0-9-]+/g) || [];

  return (fact.kw || []).map(norm).filter((keyword) => {
    if (!keyword) {
      return false;
    }
    if (keyword.includes(' ')) {
      const phrase = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      return new RegExp('(^|[^a-z0-9])' + phrase + '([^a-z0-9]|$)').test(lower);
    }

    return words.some((word) => word === keyword || word.startsWith(keyword));
  });
}

function overlapHits(request, fact) {
  const hay = [fact.label, fact.say, fact.deflect].concat(fact.kw || []).join(' ');
  const other = new Set(tokens(hay));

  return tokens(request).filter((word) => other.has(word));
}

function scoreFacts(request, facts, mode) {
  return facts.map((fact) => {
    const matched = keywordHits(request, fact);
    const overlap = mode === 'keyword' ? [] : overlapHits(request, fact);
    const score = mode === 'keyword' ? matched.length : matched.length * 3 + overlap.length;

    return {
      id: fact.id,
      label: fact.label || '',
      score,
      matched,
      overlap
    };
  }).filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function uniqueTop(rows) {
  if (!rows.length) {
    return { unique: false, fact_id: null, margin: 0 };
  }

  const top = rows[0];
  const second = rows[1] ? rows[1].score : 0;
  const unique = top.score > second;

  return {
    unique,
    fact_id: unique ? top.id : null,
    margin: top.score - second
  };
}

function slimCandidates(rows) {
  return rows.slice(0, 5).map((row) => ({
    id: row.id,
    label: row.label,
    score: row.score
  }));
}

function libraryMatches(db, terms) {
  const seen = new Map();
  [...new Set((terms || []).map(norm).filter((term) => term.length >= 4))].slice(0, 4).forEach((term) => {
    listMedicalData(db, { q: term, limit: 5 }).forEach((row) => {
      const key = String(row.shard) + ':' + row.id;
      if (!seen.has(key)) {
        seen.set(key, {
          id: row.id,
          pmid: row.pmid || '',
          title: row.journal_title || '',
          topic: row.topic || '',
          score: term.length
        });
      }
    });
  });

  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

function identifyProblem(request, caseFacts) {
  const ranked = scoreFacts(request, askFacts(caseFacts));
  const pick = uniqueTop(ranked);
  const winner = pick.fact_id ? ranked[0] : null;

  return {
    problem: winner ? winner.label : '',
    fact_id: pick.fact_id,
    unique: pick.unique,
    matched_terms: winner ? winner.matched : [],
    candidates: slimCandidates(ranked)
  };
}

function searchProblem(identified, caseFacts, db) {
  const query = (identified.matched_terms || []).join(' ');
  if (!query) {
    return { confirmed: false, fact_id: null, query: '', case_hits: [], library_matches: [] };
  }

  const ranked = scoreFacts(query, askFacts(caseFacts), 'keyword');
  const pick = uniqueTop(ranked);
  const confirmed = Boolean(identified.unique && pick.unique && pick.fact_id === identified.fact_id);

  return {
    confirmed,
    fact_id: confirmed ? pick.fact_id : null,
    query,
    case_hits: slimCandidates(ranked),
    library_matches: libraryMatches(db, identified.matched_terms)
  };
}

function exhaustiveSearch(request, caseFacts, db) {
  const facts = askFacts(caseFacts);
  const phrase = scoreFacts(request, facts);
  const byId = new Map();

  phrase.forEach((row) => {
    byId.set(row.id, { id: row.id, label: row.label, score: row.score * 2 });
  });
  tokens(request).forEach((word) => {
    scoreFacts(word, facts, 'keyword').forEach((row) => {
      const prev = byId.get(row.id) || { id: row.id, label: row.label, score: 0 };
      prev.score += row.score;
      byId.set(row.id, prev);
    });
  });

  const ranked = [...byId.values()]
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const pick = uniqueTop(ranked);

  return {
    fact_id: pick.fact_id,
    unique: pick.unique,
    margin: pick.margin,
    candidates: slimCandidates(ranked),
    library_matches: libraryMatches(db, tokens(request))
  };
}

function approvedLine(fact, trust, disclosed) {
  const open = disclosed.has(fact.id) || trust >= fact.gate;
  if (!open) {
    return { text: fact.deflect || '', hold: true };
  }

  return { text: fact.say || '', hold: false };
}

const LIBRARY_TTL_MS = 15000;
let cachedLibrary = null;
let cachedAt = 0;

function libraryFor(db) {
  const now = Date.now();
  if (cachedLibrary && now - cachedAt < LIBRARY_TTL_MS) {
    return cachedLibrary;
  }

  cachedLibrary = loadLibrary(db);
  cachedAt = Date.now();

  return cachedLibrary;
}

function publicSide(side) {
  if (!side) {
    return null;
  }

  return {
    allow: side.allow,
    reason: side.reason,
    kind: side.kind || '',
    matches: (side.matches || []).slice(0, 5).map((match) => ({
      source: match.source,
      id: match.id,
      pmid: match.pmid || '',
      title: match.title || ''
    }))
  };
}

function uncertain(requestCheck, reason) {
  return {
    certainty: 0,
    send: true,
    reply: UNKNOWN,
    fact_id: null,
    grounded: 'fallback',
    emotion: 'neutral',
    trust_hold: false,
    agreed: false,
    reason,
    request: requestCheck,
    response: null
  };
}

function secondLayerReview(input) {
  const requestCheck = screenRequest(input.request, () => libraryFor(input.db));
  if (!requestCheck.allow) {
    return {
      certainty: 0,
      send: false,
      reply: null,
      fact_id: null,
      grounded: null,
      emotion: 'neutral',
      trust_hold: false,
      agreed: false,
      reason: requestCheck.reason,
      request: requestCheck,
      response: null
    };
  }

  const ranked = scoreFacts(input.request, askFacts(input.caseFacts), 'keyword');
  const pick = uniqueTop(ranked);
  const sameFact = Boolean(
    input.identified.unique &&
    input.searched.confirmed &&
    input.exhaustive.unique &&
    pick.unique &&
    input.identified.fact_id &&
    input.identified.fact_id === input.searched.fact_id &&
    input.identified.fact_id === input.exhaustive.fact_id &&
    input.identified.fact_id === pick.fact_id
  );

  if (!sameFact) {
    return uncertain(requestCheck, 'Second review did not confirm a single approved fact.');
  }

  const fact = askFacts(input.caseFacts).find((row) => row.id === pick.fact_id);
  const line = approvedLine(fact, input.trust, input.disclosed);
  const verbatim = norm(line.text) && (
    norm(line.text) === norm(fact.say) || norm(line.text) === norm(fact.deflect)
  );
  if (!verbatim) {
    return uncertain(requestCheck, 'Approved fact has no patient line for this trust level.');
  }

  const spoken = naturalize(line.text, loadStyleTurns(input.db), input.request);
  const responseCheck = checkResponse(spoken, [], input.caseFacts);
  if (!responseCheck.allow || norm(responseCheck.text) !== norm(spoken)) {
    return uncertain(requestCheck, responseCheck.reason || 'Response is not grounded.');
  }

  return {
    certainty: 100,
    send: true,
    reply: spoken,
    fact_id: fact.id,
    grounded: line.hold ? 'blocked:' + fact.id : fact.id,
    emotion: line.hold ? 'embarrassed' : (fact.gate ? 'relieved' : 'neutral'),
    trust_hold: line.hold,
    agreed: true,
    reason: 'Second review confirmed this approved patient line.',
    request: requestCheck,
    response: responseCheck
  };
}

function outOfScope(scope) {
  return {
    certain: false,
    certainty: 0,
    send: false,
    reply: null,
    fact_id: null,
    grounded: null,
    emotion: 'neutral',
    trust_hold: false,
    request: publicSide({
      allow: false,
      reason: scope.reason,
      kind: scope.kind,
      matches: []
    }),
    response: null,
    stages: {
      identify: { problem: '', fact_id: null, unique: false, candidates: [] },
      search: { confirmed: false, fact_id: null, query: '', case_hits: [], library_matches: [] },
      exhaustive: { fact_id: null, unique: false, margin: 0, candidates: [], library_matches: [] },
      review: { certainty: 0, agreed: false, reason: scope.reason },
      interceptor: {
        allow: false,
        send: false,
        reason: scope.reason,
        scope: scope.kind,
        relevant: false,
        timely: false,
        grounded: false,
        replaced: false
      }
    }
  };
}

function answer(db, body) {
  const request = String((body && body.request) || '').trim().slice(0, 4000);
  const caseFacts = cleanFacts(body || {});
  const documents = acceptedDocuments(body && body.documents).concat(groundingDocuments(db, body && body.patient_id));
  const scope = scopeOf(request, caseFacts, documents);
  if (!scope.allow) {
    return outOfScope(scope);
  }

  const trust = Math.max(0, Math.min(3, Number(body && body.trust) || 0));
  const disclosed = disclosedSet(body);
  const identified = identifyProblem(request, caseFacts);
  const searched = searchProblem(identified, caseFacts, db);
  const exhaustive = exhaustiveSearch(request, caseFacts, db);
  const review = secondLayerReview({
    request,
    caseFacts,
    trust,
    disclosed,
    db,
    identified,
    searched,
    exhaustive
  });

  const payload = {
    certain: review.certainty === 100,
    certainty: review.certainty,
    send: review.send,
    reply: review.reply,
    fact_id: review.fact_id,
    grounded: review.grounded,
    emotion: review.emotion,
    trust_hold: review.trust_hold,
    request: publicSide(review.request),
    response: publicSide(review.response),
    stages: {
      identify: {
        problem: identified.problem,
        fact_id: identified.fact_id,
        unique: identified.unique,
        candidates: identified.candidates
      },
      search: {
        confirmed: searched.confirmed,
        fact_id: searched.fact_id,
        query: searched.query,
        case_hits: searched.case_hits,
        library_matches: searched.library_matches
      },
      exhaustive: {
        fact_id: exhaustive.fact_id,
        unique: exhaustive.unique,
        margin: exhaustive.margin,
        candidates: exhaustive.candidates,
        library_matches: exhaustive.library_matches
      },
      review: {
        certainty: review.certainty,
        agreed: review.agreed,
        reason: review.reason
      }
    }
  };

  if (!review.send) {
    payload.stages.interceptor = {
      allow: false,
      send: false,
      reason: 'Blocked before a reply was composed.',
      scope: 'blocked',
      relevant: false,
      timely: false,
      grounded: false,
      replaced: false
    };

    return payload;
  }

  const decision = intercept({
    request,
    proposed: review.reply,
    caseFacts,
    documents,
    db,
    now: new Date()
  });
  payload.stages.interceptor = publicDecision(decision);

  if (!decision.send) {
    payload.certain = false;
    payload.certainty = 0;
    payload.send = false;
    payload.reply = null;
    payload.fact_id = null;
    payload.grounded = null;
    payload.emotion = 'neutral';
    payload.trust_hold = false;
    payload.request = publicSide({
      allow: false,
      reason: decision.reason,
      kind: 'out_of_scope',
      matches: []
    });
    payload.response = null;
    payload.stages.review = { certainty: 0, agreed: false, reason: decision.reason };

    return payload;
  }

  if (!decision.allow) {
    payload.certain = false;
    payload.certainty = 0;
    payload.reply = decision.text;
    payload.fact_id = null;
    payload.grounded = 'fallback';
    payload.emotion = 'neutral';
    payload.trust_hold = false;
    payload.response = publicSide({
      allow: true,
      reason: decision.reason,
      kind: 'fallback',
      matches: []
    });
    payload.stages.review = { certainty: 0, agreed: false, reason: decision.reason };
  } else {
    payload.reply = decision.text;
  }

  return payload;
}

function normalizeSpeech(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function keepsApprovedLine(text, approved, leads) {
  const reply = normalizeSpeech(text);
  const line = normalizeSpeech(approved);
  if (!reply || !line) {
    return false;
  }
  if (reply === line) {
    return true;
  }
  if (!reply.endsWith(line)) {
    return false;
  }

  const lead = reply.slice(0, reply.length - line.length).trim();

  return leads.some((item) => normalizeSpeech(item) === lead);
}

// Bedrock may phrase the one line the server already approved. A draft that
// adds facts, or that the interceptor will not send unchanged, is discarded.
async function compose(db, body) {
  const local = answer(db, body);
  if (!local.certain || !local.reply || !cloud.enabled()) {
    return Object.assign({ provider: 'approved' }, local);
  }

  const request = String((body && body.request) || '').trim().slice(0, 4000);
  const leads = loadStyleTurns(db).map((turn) => asLead(turn.text)).slice(0, 8);
  try {
    const drafted = await cloud.composePatient({
      question: request,
      approved: local.reply,
      leads
    });
    if (!keepsApprovedLine(drafted.text, local.reply, leads)) {
      return Object.assign({ provider: 'approved' }, local);
    }

    const decision = intercept({
      request,
      proposed: drafted.text,
      caseFacts: cleanFacts(body || {}),
      documents: acceptedDocuments(body && body.documents).concat(groundingDocuments(db, body && body.patient_id)),
      db,
      now: new Date()
    });
    if (!decision.allow || normalizeSpeech(decision.text) !== normalizeSpeech(drafted.text)) {
      return Object.assign({ provider: 'approved' }, local);
    }

    return Object.assign({}, local, {
      reply: decision.text,
      provider: 'bedrock',
      stages: Object.assign({}, local.stages, {
        interceptor: publicDecision(decision)
      })
    });
  } catch {
    return Object.assign({ provider: 'approved' }, local);
  }
}

module.exports = {
  answer,
  compose,
  identifyProblem,
  searchProblem,
  exhaustiveSearch,
  secondLayerReview
};
