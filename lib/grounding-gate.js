const { listMedicalData, listJournals, counts } = require('./db');

const UNKNOWN = "I'm not sure about that. Could you ask me another way?";
const STOP = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'them',
  'your', 'about', 'what', 'when', 'tell', 'could', 'would', 'does', 'into',
  'than', 'then', 'also', 'only', 'more', 'some', 'such', 'used', 'using',
  'their', 'there', 'which', 'while', 'after', 'before', 'over', 'under'
]);
const TOPICS = [
  'diabetes', 'metformin', 'adherence', 'hypoglycaemic', 'hypoglycemic',
  'gastrointestinal', 'stomach', 'copd', 'inhaler', 'smoking', 'cessation',
  'mortality', 'hba1c', 'egfr', 'kidney', 'technique', 'spacer', 'insulin',
  'dose', 'refill', 'medication', 'thirst', 'fatigue', 'breath', 'spirometry',
  'allergy', 'sulfa', 'diet'
];
const GENERATION = /\b(prescri\w*|recommend(ed)? dose|what dose|start (them|her|him|me) on|treat (with|using)|guideline|contraindicat\w*|is it safe to give|should i (start|increase|decrease|switch|prescri\w*)|insulin units|mg\/kg|first[- ]line therapy)\b/i;
const MEDICAL_CLAIM = /\b(causes?|cures?|always|never|proven to|must take|will (fix|cure|reverse)|guaranteed|the correct dose is|you should (take|start|stop|increase|double))\b/i;
const MEDICALISH = new RegExp('\\b(' + TOPICS.join('|') + '|associated|increased|decreased|reduced|risk|trial|cohort|adherence|intolerance|errors?)\\b', 'i');

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

function topicsIn(value) {
  const lower = norm(value);

  return TOPICS.filter((word) => lower.includes(word));
}

function citeRow(row, shared) {
  return {
    source: 'medical_data',
    id: row.id,
    journal_id: row.journal_id,
    pmid: row.pmid || '',
    title: row.journal_title || '',
    claim: row.claim,
    quote: row.quote,
    shared
  };
}

function scoreAgainstLibrary(text, library) {
  const hits = library.map((row) => {
    const hay = [row.claim, row.quote, row.topic, row.keywords, row.journal_title, row.abstract].join(' ');
    const shared = overlap(text, hay);
    const topicHits = topicsIn(text).filter((word) => norm(hay).includes(word));
    const contained = norm(text).length >= 20 && (
      norm(row.claim).includes(norm(text)) ||
      norm(row.quote).includes(norm(text)) ||
      (norm(row.quote).length >= 40 && norm(text).includes(norm(row.quote).slice(0, 80)))
    );
    const score = (contained ? 6 : 0) + shared.length + topicHits.length;
    const strong = contained || shared.length >= 3 || score >= 5;

    return { row, shared: [...new Set(shared.concat(topicHits))], score, strong, contained };
  }).filter((hit) => hit.score >= 2)
    .sort((a, b) => b.score - a.score);

  return hits.slice(0, 5);
}

function caseTexts(caseFacts) {
  const facts = (caseFacts && caseFacts.facts) || [];
  const intro = caseFacts && caseFacts.intro ? [{ id: 'intro', say: caseFacts.intro, label: 'Opening line' }] : [];

  return intro.concat(facts).map((fact) => ({
    id: fact.id || '',
    say: fact.say || '',
    deflect: fact.deflect || '',
    text: [fact.say, fact.deflect, fact.label].filter(Boolean).join('\n')
  })).filter((row) => row.text);
}

function matchCase(text, caseFacts) {
  const needle = norm(text);
  if (!needle) {
    return null;
  }

  return caseTexts(caseFacts).find((row) => {
    const hay = norm(row.text);
    const say = norm(row.say);
    const deflect = norm(row.deflect);
    if (hay === needle || hay.includes(needle) || (hay.length >= 12 && needle.includes(hay))) {
      return true;
    }
    if ((say.length >= 12 && needle.includes(say)) || (deflect.length >= 12 && needle.includes(deflect))) {
      return true;
    }

    return overlap(needle, hay).length >= 4;
  }) || null;
}

function sentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function loadLibrary(dbOrShards) {
  const facts = listMedicalData(dbOrShards);
  const journals = listJournals(dbOrShards);
  const byKey = new Map(journals.map((j) => [String(j.shard) + ':' + j.id, j]));

  return facts.map((row) => {
    const journal = byKey.get(String(row.shard) + ':' + row.journal_id) || {};

    return Object.assign({ abstract: journal.abstract || '' }, row);
  });
}

function checkRequest(text, library) {
  const request = String(text || '').trim();
  if (!request) {
    return { allow: false, reason: 'Empty request was not sent.', matches: [] };
  }

  const hits = scoreAgainstLibrary(request, library);
  const matches = hits.map((hit) => citeRow(hit.row, hit.shared));
  const generation = GENERATION.test(request);
  const claim = MEDICAL_CLAIM.test(request);
  // Shared topic words are not enough to authorize a prescribing question or an absolute claim.
  const supported = hits.some((hit) => hit.contained);

  if ((generation || claim) && !supported) {
    return {
      allow: false,
      reason: 'Request blocked: no journal or medical_data row supports this clinical ask. It was not sent.',
      matches,
      kind: generation ? 'generation' : 'claim'
    };
  }

  return {
    allow: true,
    reason: matches.length
      ? 'Request allowed against the publication library.'
      : 'Request allowed as an interview turn (no unsupported clinical claim).',
    matches,
    kind: generation ? 'generation' : (claim ? 'claim' : 'interview')
  };
}

function checkResponse(text, library, caseFacts) {
  const response = String(text || '').trim();
  if (!response) {
    return { allow: false, reason: 'Empty response was not sent.', text: UNKNOWN, matches: [] };
  }
  if (norm(response) === norm(UNKNOWN)) {
    return { allow: true, reason: 'Unknown fallback is allowed.', text: response, matches: [] };
  }

  const caseHit = matchCase(response, caseFacts);
  const libraryHits = scoreAgainstLibrary(response, library);
  const matches = libraryHits.map((hit) => citeRow(hit.row, hit.shared));
  if (caseHit) {
    matches.unshift({ source: 'case', id: caseHit.id, claim: caseHit.text, quote: caseHit.text, pmid: '', title: 'Approved case fact' });
  }

  const medicalLines = sentences(response).filter((line) => MEDICALISH.test(line) || MEDICAL_CLAIM.test(line) || GENERATION.test(line));
  const unsupported = medicalLines.filter((line) => {
    if (matchCase(line, caseFacts)) {
      return false;
    }

    return !scoreAgainstLibrary(line, library).some((hit) => hit.strong);
  });

  if (unsupported.length) {
    return {
      allow: false,
      reason: 'Response blocked: a medical line is not in journals, medical_data, or an approved case fact.',
      text: UNKNOWN,
      matches,
      unsupported
    };
  }

  if (!caseHit && !libraryHits.length && (MEDICAL_CLAIM.test(response) || GENERATION.test(response))) {
    return {
      allow: false,
      reason: 'Response blocked: ungrounded clinical content.',
      text: UNKNOWN,
      matches
    };
  }

  return {
    allow: true,
    reason: caseHit ? 'Response grounded on an approved case fact.' : 'Response grounded on the publication library.',
    text: response,
    matches
  };
}

function screenRequest(text, loadLibrary) {
  const request = String(text || '').trim();
  if (!request || (!GENERATION.test(request) && !MEDICAL_CLAIM.test(request))) {
    return checkRequest(request, []);
  }

  return checkRequest(request, typeof loadLibrary === 'function' ? loadLibrary() : []);
}

function gate(db, body) {
  const library = loadLibrary(db);
  const request = checkRequest(body.request, library);
  const result = {
    allow: request.allow,
    send: request.allow,
    request,
    response: null,
    library: counts(db)
  };

  if (!request.allow) {
    return result;
  }

  if (body.response != null && String(body.response).trim()) {
    result.response = checkResponse(body.response, library, body.case_facts || {});
    result.allow = result.response.allow;
  }

  return result;
}

module.exports = {
  UNKNOWN,
  GENERATION,
  MEDICAL_CLAIM,
  gate,
  checkRequest,
  checkResponse,
  screenRequest,
  loadLibrary,
  scoreAgainstLibrary,
  matchCase
};
