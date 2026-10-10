const { listConversationTurns } = require('./db');

const MOVES = new Set(['ack', 'hedge', 'bridge']);
const BAN = /\b(pain|hurt|ache|symptom|sick|illness|medicine|medication|dose|pill|diagnos|allerg|blood|heart|chest|lung|breath|sugar|diabet|pressure|smok|nausea|fever|cough|doctor|nurse|hospital|clinic|kidney|stomach|insulin|metformin|cancer|pregnant|surgery|treatment|infection|anxiety|depress|prescrib|cures?|causes?|always|never|guaranteed|mg|mcg)\b|\d/i;
const STOP = new Set([
  'the', 'and', 'you', 'your', 'for', 'that', 'this', 'with', 'have', 'what',
  'how', 'are', 'was', 'just', 'like'
]);

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function asLead(text) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return '';
  }
  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed + '.';
}

function isStyleTurn(turn) {
  if (!turn || typeof turn !== 'object') {
    return false;
  }

  const speaker = String(turn.speaker || '').toLowerCase();
  const move = String(turn.move || '').toLowerCase();
  const text = String(turn.text || '').replace(/\s+/g, ' ').trim();
  if (speaker !== 'patient' || !MOVES.has(move) || !text) {
    return false;
  }

  const count = text.split(' ').filter(Boolean).length;
  if (count > 8 || BAN.test(text)) {
    return false;
  }

  return true;
}

function styleTurns(turns) {
  return (Array.isArray(turns) ? turns : []).filter(isStyleTurn);
}

function tokens(value) {
  return [...new Set((norm(value).match(/[a-z][a-z0-9-]{2,}/g) || []))]
    .filter((word) => !STOP.has(word));
}

function hash(text) {
  let sum = 0;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    sum = (sum + value.charCodeAt(i)) % 100000;
  }

  return sum;
}

function pickLead(line, request, turns) {
  const pool = styleTurns(turns);
  if (!pool.length) {
    return '';
  }

  const want = new Set(tokens(request));
  const ranked = pool.map((turn, index) => ({
    turn,
    index,
    score: tokens(turn.text).filter((word) => want.has(word)).length
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = ranked[0].score > 0 ? ranked[0].turn : pool[hash(line) % pool.length];

  return asLead(chosen.text);
}

function naturalize(line, turns, request) {
  const text = String(line || '').trim();
  if (!text) {
    return text;
  }

  const lead = pickLead(text, request, turns);
  if (!lead || norm(text).startsWith(norm(lead))) {
    return text;
  }

  return lead + ' ' + text;
}

function loadStyleTurns(db) {
  if (!db) {
    return [];
  }

  return styleTurns(listConversationTurns(db, { speaker: 'patient', limit: 500 }));
}

function styleNorms(turns) {
  return new Set(styleTurns(turns).map((turn) => norm(asLead(turn.text))));
}

function loadStyleNorms(db) {
  return styleNorms(loadStyleTurns(db));
}

module.exports = {
  asLead,
  isStyleTurn,
  styleTurns,
  styleNorms,
  pickLead,
  naturalize,
  loadStyleTurns,
  loadStyleNorms,
  hash
};
