const { listMedicalData } = require('./db');
const { UNKNOWN, GENERATION, MEDICAL_CLAIM } = require('./grounding-gate');

const TIMELY_PUBLICATION_YEARS = 15;
const SCOPE_REASON = 'This chat stays on medicine and the documents provided by the patient and the faculty. That message was not sent.';

const STOP = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'them',
  'your', 'about', 'what', 'when', 'tell', 'could', 'would', 'does', 'into',
  'than', 'then', 'also', 'only', 'more', 'some', 'such', 'used', 'using',
  'their', 'there', 'which', 'while', 'after', 'before', 'over', 'under',
  'today', 'just', 'like', 'really', 'please', 'should'
]);

const JAILBREAK = /\b(ignore (?:all |any |your )?(?:previous|prior|above) (?:instructions|rules|guardrails)|disregard (?:the |your )?(?:rules|guardrails|instructions)|jailbreak|developer mode)\b/i;
const OFF_TOPIC = /\b(python|javascript|typescript|sql query|stock price|nasdaq|dow jones|bitcoin|ethereum|cryptocurrency|weather forecast|super bowl|world series|nba finals|\bnfl\b|premier league|netflix|spotify|horoscope|capital of|president of|election result|video game|recipe for|who won the|write (?:me )?(?:a )?(?:poem|song|story|essay|joke|script|code)|tell me a joke)\b/i;
const COURTESY = /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|thanks|thank you|how are you|nice to meet you|who are you|what is your name|what's your name)[.!?\s]*$/i;
const GREETING = /^(?:hi|hello|hey|good morning|good afternoon|good evening)\b/i;
const FOLLOW = /^(?:ok|okay|yes|yeah|yep|no|nope|go on|continue|and then|tell me more|anything else|please|sure|right|i see|understood)[.!?\s]*$/i;
const HISTORY = /\b(what brings you|why are you here|how can i help|how have you been|what seems to be|when did (?:this|it|that) start|how long|how often|have you noticed|do you have|are you having|does it hurt|is there anything else)\b/i;
const PUBLICATION = /\b(pmid|pubmed|journal|paper|study|trial|abstract|publication|cohort)\b/i;
const DOCUMENT_ASK = /\b(report|lab|result|scan|ecg|ekg|imaging|chart|note|upload|document|bloodwork|spirometry)\b/i;
const MEDICAL = /\b(pain|hurt|ache|symptom|sick|illness|medicine|medication|dose|pill|tablet|history|allerg|diagnos|lab|blood|heart|chest|lung|breath|sugar|diabet|pressure|smok|diet|eat|drink|sleep|nausea|vomit|fever|cough|clinic|doctor|nurse|hospital|test|scan|result|kidney|stomach|inhaler|insulin|metformin|refill|adher|fatigue|thirst|tired|spirometry|hba1c|a1c|egfr|chart|note|report|exam|pregnant|dizz|headache|rash|surgery|treatment|weight|appetite|pharmacy|glucose|lisinopril|copd|asthma|wound|bleed|swelling|infection|anxiety|depress|mood|bowel|urine|vision|hearing|exercise|alcohol|hypoglyc|gastrointestinal|spacer)\b/i;

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokens(value) {
  return [...new Set((norm(value).match(/[a-z][a-z0-9-]{3,}/g) || []))]
    .filter((word) => !STOP.has(word));
}

function overlap(a, b) {
  const other = new Set(tokens(b));

  return tokens(a).filter((word) => other.has(word));
}

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sourceOf(value) {
  const name = String(value || '').toLowerCase();
  if (name === 'patient') {
    return 'patient';
  }
  if (name === 'faculty' || name === 'doctor' || name === 'clinician') {
    return 'faculty';
  }

  return '';
}

function acceptedDocuments(list) {
  const raw = Array.isArray(list) ? list : [];

  return raw.slice(0, 40).map((doc) => {
    const source = sourceOf(doc && doc.source);
    const text = String((doc && doc.text) || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    if (!source || text.length < 8) {
      return null;
    }

    return {
      id: String((doc && doc.id) || '').slice(0, 80) || source,
      source,
      title: String((doc && doc.title) || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      date: String((doc && doc.date) || '').slice(0, 40),
      text
    };
  }).filter(Boolean);
}

function factsOf(caseFacts) {
  const source = caseFacts || {};
  const intro = String(source.intro || '').trim();
  const facts = Array.isArray(source.facts) ? source.facts : [];
  const rows = facts.map((fact) => ({
    id: String(fact.id || ''),
    say: String(fact.say || ''),
    deflect: String(fact.deflect || ''),
    label: String(fact.label || ''),
    kw: Array.isArray(fact.kw) ? fact.kw.map((word) => String(word || '')) : []
  }));
  if (intro) {
    rows.unshift({
      id: 'intro',
      say: intro,
      deflect: '',
      label: 'Opening line',
      kw: ['hello', 'hi', 'name']
    });
  }

  return rows;
}

function requestTouches(request, fact) {
  const hay = [fact.label, fact.say, fact.deflect].concat(fact.kw || []).join(' ');
  const shared = overlap(request, hay);
  if (shared.length >= 2 || shared.some((word) => word.length >= 6)) {
    return true;
  }

  const lower = norm(request);
  const words = lower.match(/[a-z0-9-]+/g) || [];

  return (fact.kw || []).some((keyword) => {
    const key = norm(keyword);
    if (key.length < 4) {
      return false;
    }
    if (key.includes(' ')) {
      return lower.includes(key);
    }

    return words.some((word) => word === key || word.startsWith(key));
  });
}

function touchesProvided(request, caseFacts, documents) {
  if (factsOf(caseFacts).some((fact) => requestTouches(request, fact))) {
    return true;
  }

  return (documents || []).some((doc) => requestTouches(request, {
    label: doc.title,
    say: doc.text,
    deflect: '',
    kw: []
  }));
}

function scopeOf(request, caseFacts, documents) {
  const text = String(request || '').trim();
  if (!text) {
    return { allow: false, kind: 'empty', reason: 'Empty request was not sent.' };
  }
  if (JAILBREAK.test(text)) {
    return { allow: false, kind: 'jailbreak', reason: SCOPE_REASON };
  }
  if (OFF_TOPIC.test(text)) {
    return { allow: false, kind: 'out_of_scope', reason: SCOPE_REASON };
  }
  if (COURTESY.test(text) || (GREETING.test(text) && !MEDICAL.test(text) && text.split(/\s+/).length <= 6)) {
    return { allow: true, kind: 'courtesy', reason: 'Courtesy is part of the encounter and adds no clinical claim.' };
  }
  if (FOLLOW.test(text)) {
    return { allow: true, kind: 'follow', reason: 'Short follow-up stays inside the encounter.' };
  }
  if (MEDICAL.test(text) || HISTORY.test(text) || PUBLICATION.test(text) || DOCUMENT_ASK.test(text) || touchesProvided(text, caseFacts, documents)) {
    return { allow: true, kind: 'medicine', reason: 'Request is about medicine or a provided document.' };
  }

  return { allow: false, kind: 'out_of_scope', reason: SCOPE_REASON };
}

function matchCase(text, caseFacts) {
  const needle = norm(text);
  if (!needle) {
    return null;
  }

  return factsOf(caseFacts).find((fact) => norm(fact.say) === needle || (fact.deflect && norm(fact.deflect) === needle)) || null;
}

function lineInBlob(line, blob) {
  const needle = norm(line);
  const hay = norm(blob);
  if (!needle || !hay || needle.length < 12) {
    return false;
  }
  if (hay.includes(needle)) {
    return true;
  }

  return needle.includes(hay) && hay.length >= 40 && needle.length - hay.length <= 12;
}

function matchDocuments(text, documents) {
  const lines = sentences(text);
  if (!lines.length) {
    return null;
  }

  const hits = [];
  const ok = lines.every((line) => {
    const hit = (documents || []).find((doc) => lineInBlob(line, doc.text) || lineInBlob(line, [doc.title, doc.text].join(' ')));
    if (hit) {
      hits.push(hit);
    }

    return Boolean(hit);
  });

  return ok ? hits[0] : null;
}

function lookupQuotes(db, text) {
  const lines = sentences(text);
  if (!db || !lines.length) {
    return null;
  }

  let winner = null;
  const ok = lines.every((line) => {
    const needle = norm(line);
    if (needle.length < 12) {
      return false;
    }
    const rows = listMedicalData(db, { q: needle.slice(0, 60), limit: 8 });
    const hit = rows.find((row) => [row.quote, row.claim, row.abstract].some((blob) => lineInBlob(line, blob)));
    if (hit) {
      winner = winner || hit;
    }

    return Boolean(hit);
  });

  return ok ? winner : null;
}

function matchPublication(text, library) {
  const lines = sentences(text);
  if (!lines.length || !library || !library.length) {
    return null;
  }

  let winner = null;
  const ok = lines.every((line) => {
    const hit = library.find((row) => [row.quote, row.claim, row.abstract].some((blob) => lineInBlob(line, blob)));
    if (hit) {
      winner = winner || hit;
    }

    return Boolean(hit);
  });

  return ok ? winner : null;
}

function supportFor(proposed, input) {
  const caseHit = matchCase(proposed, input.caseFacts);
  if (caseHit) {
    return {
      grounded: true,
      kind: 'case',
      id: caseHit.id,
      title: 'Approved faculty case fact',
      text: [caseHit.say, caseHit.deflect, caseHit.label].join('\n'),
      year: null,
      date: '',
      source: 'faculty',
      fact: caseHit
    };
  }

  const docHit = matchDocuments(proposed, input.documents);
  if (docHit) {
    return {
      grounded: true,
      kind: 'document',
      id: docHit.id,
      title: docHit.title || 'Uploaded document',
      text: docHit.text,
      year: null,
      date: docHit.date || '',
      source: docHit.source,
      fact: {
        label: docHit.title,
        say: docHit.text,
        deflect: '',
        kw: []
      }
    };
  }

  const paper = input.db
    ? lookupQuotes(input.db, proposed)
    : matchPublication(proposed, Array.isArray(input.library) ? input.library : []);
  if (paper) {
    return {
      grounded: true,
      kind: 'publication',
      id: paper.id,
      title: paper.journal_title || paper.title || '',
      text: [paper.quote, paper.claim, paper.abstract].filter(Boolean).join('\n'),
      year: Number(paper.year) || null,
      date: '',
      source: 'publication',
      pmid: paper.pmid || '',
      fact: {
        label: paper.journal_title || paper.title || '',
        say: paper.quote || '',
        deflect: paper.claim || '',
        kw: []
      }
    };
  }

  return {
    grounded: false,
    kind: '',
    id: '',
    title: '',
    text: '',
    year: null,
    date: '',
    source: '',
    fact: null
  };
}

function replyHitsQuestion(request, proposed) {
  const shared = overlap(request, proposed);

  return shared.length >= 2 || shared.some((word) => word.length >= 5);
}

function relevantTo(request, proposed, support, scope) {
  if (!support || !support.grounded) {
    return { allow: false, reason: 'Reply is not relevant because it is not tied to a provided source.' };
  }
  if (scope.kind === 'courtesy') {
    const greeting = /^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(support.fact.say || '');
    if (support.id === 'intro' || greeting) {
      return { allow: true, reason: 'Courtesy reply is the approved introduction.' };
    }

    return { allow: false, reason: 'A greeting cannot release a clinical fact.' };
  }
  if ((GENERATION.test(request) || MEDICAL_CLAIM.test(request)) && support.kind === 'case') {
    return { allow: false, reason: 'A prescribing or directive question is not answered from a patient line.' };
  }
  if (support.kind === 'case' && requestTouches(request, support.fact)) {
    return { allow: true, reason: 'Reply is the faculty line for this question.' };
  }
  if (replyHitsQuestion(request, proposed)) {
    return { allow: true, reason: 'Reply uses the same subject as the question.' };
  }
  if (support.kind === 'document' && DOCUMENT_ASK.test(request)) {
    return { allow: true, reason: 'Reply quotes the document the question asked about.' };
  }

  return { allow: false, reason: 'Reply does not address the current question.' };
}

function dayStamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function yearsIn(text) {
  return [...new Set(String(text || '').match(/\b(?:19|20)\d{2}\b/g) || [])];
}

function timelyFor(proposed, support, now) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const missingYear = yearsIn(proposed).filter((year) => !String(support.text || '').includes(year) && !String(support.date || '').includes(year));
  if (missingYear.length) {
    return { allow: false, reason: 'Reply states a year that is not in its source.' };
  }
  if (support.kind === 'case') {
    return { allow: true, reason: 'Faculty case wording is the current encounter script.' };
  }
  if (support.kind === 'document') {
    if (support.source !== 'patient' && support.source !== 'faculty') {
      return { allow: false, reason: 'Only patient and faculty documents can ground a reply.' };
    }
    const stamp = dayStamp(support.date);
    if (stamp != null && stamp > today) {
      return { allow: false, reason: 'Document date is later than today, so it cannot ground a current reply.' };
    }

    return { allow: true, reason: 'Reply quotes a current patient or faculty document.' };
  }
  if (support.kind === 'publication') {
    const year = Number(support.year);
    const oldest = now.getUTCFullYear() - TIMELY_PUBLICATION_YEARS;
    if (!year || year < oldest || year > now.getUTCFullYear()) {
      return { allow: false, reason: 'Publication is outside the current ' + TIMELY_PUBLICATION_YEARS + '-year window.' };
    }

    return { allow: true, reason: 'Publication is inside the current window and the reply quotes it.' };
  }

  return { allow: false, reason: 'Reply has no timely source.' };
}

function cite(support) {
  if (!support || !support.grounded) {
    return [];
  }

  return [{
    source: support.kind,
    id: support.id,
    title: support.title || '',
    pmid: support.pmid || ''
  }];
}

function fallback(reason, scope, extra) {
  return {
    allow: false,
    send: true,
    text: UNKNOWN,
    reason,
    scope,
    relevant: extra.relevant || { allow: false, reason },
    timely: extra.timely || { allow: false, reason },
    grounded: extra.grounded || { allow: false, reason, matches: [] }
  };
}

function blocked(scope) {
  const idle = { allow: false, reason: 'Not reviewed.' };

  return {
    allow: false,
    send: false,
    text: null,
    reason: scope.reason,
    scope,
    relevant: idle,
    timely: idle,
    grounded: { allow: false, reason: 'Not reviewed.', matches: [] }
  };
}

function intercept(input) {
  const request = String((input && input.request) || '');
  const proposed = input && input.proposed == null ? null : String(input.proposed || '');
  const caseFacts = (input && input.caseFacts) || {};
  const documents = acceptedDocuments(input && input.documents);
  const now = input && input.now instanceof Date ? input.now : new Date();
  const scope = scopeOf(request, caseFacts, documents);

  if (!scope.allow) {
    return blocked(scope);
  }
  if (proposed == null) {
    return {
      allow: true,
      send: true,
      text: null,
      reason: 'No response was offered.',
      scope,
      relevant: { allow: true, reason: 'No response was offered.' },
      timely: { allow: true, reason: 'No response was offered.' },
      grounded: { allow: true, reason: 'No response was offered.', matches: [] }
    };
  }
  if (!norm(proposed) || norm(proposed) === norm(UNKNOWN)) {
    return {
      allow: true,
      send: true,
      text: UNKNOWN,
      reason: 'Unknown fallback adds no clinical claim.',
      scope,
      relevant: { allow: true, reason: 'Fallback does not add a claim.' },
      timely: { allow: true, reason: 'Fallback does not state a time.' },
      grounded: { allow: true, reason: 'Fallback is an approved non-answer.', matches: [] }
    };
  }

  const support = supportFor(proposed, {
    caseFacts,
    documents,
    library: input && input.library,
    loadLibrary: input && input.loadLibrary
  });
  const grounded = support.grounded
    ? { allow: true, reason: 'Reply quotes ' + (support.kind === 'case' ? 'a faculty case fact.' : support.kind === 'document' ? 'a patient or faculty document.' : 'a publication.'), matches: cite(support) }
    : { allow: false, reason: 'Reply is not in a faculty case fact, a publication quote, or a patient or faculty document.', matches: [] };
  if (!grounded.allow) {
    return fallback(grounded.reason, scope, { grounded });
  }

  const relevant = relevantTo(request, proposed, support, scope);
  if (!relevant.allow) {
    return fallback(relevant.reason, scope, { relevant, grounded });
  }

  const timely = timelyFor(proposed, support, now);
  if (!timely.allow) {
    return fallback(timely.reason, scope, { relevant, timely, grounded });
  }

  return {
    allow: true,
    send: true,
    text: String(proposed).trim(),
    reason: [relevant.reason, timely.reason, grounded.reason].join(' '),
    scope,
    relevant,
    timely,
    grounded
  };
}

function publicDecision(decision) {
  const row = decision || {};

  return {
    allow: Boolean(row.allow),
    send: Boolean(row.send),
    reason: row.reason || '',
    scope: row.scope ? row.scope.kind : '',
    relevant: Boolean(row.relevant && row.relevant.allow),
    timely: Boolean(row.timely && row.timely.allow),
    grounded: Boolean(row.grounded && row.grounded.allow),
    replaced: Boolean(row.send && !row.allow)
  };
}

module.exports = {
  TIMELY_PUBLICATION_YEARS,
  SCOPE_REASON,
  acceptedDocuments,
  intercept,
  publicDecision,
  scopeOf
};
