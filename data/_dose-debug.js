const { GENERATION, MEDICAL_CLAIM, screenRequest } = require('../lib/grounding-gate');
const { intercept } = require('../lib/response-interceptor');
const { answer } = require('../lib/patient-service');
const { openShards } = require('../lib/db');

const q = 'What dose of metformin should I prescribe?';
console.log('G', GENERATION.test(q), 'C', MEDICAL_CLAIM.test(q));
console.log('G2', /\bwhat dose\b/i.test(q), /\bprescrib\b/i.test(q), /\bprescribe\b/i.test(q));

const FACTS = {
  facts: [{
    id: 'd3',
    label: 'Metformin: patient says she takes it every day',
    kw: ['medication', 'medicine', 'pills', 'taking', 'metformin', 'prescri'],
    say: "I take my metformin every day, like I'm supposed to."
  }]
};
const out = intercept({
  request: q,
  proposed: FACTS.facts[0].say,
  caseFacts: FACTS,
  documents: [],
  library: [],
  now: new Date('2026-10-10T16:00:00Z')
});
console.log('intercept', JSON.stringify({
  allow: out.allow,
  send: out.send,
  text: out.text,
  reason: out.reason
}));

const db = openShards();
const started = Date.now();
const screened = screenRequest(q, () => require('../lib/grounding-gate').loadLibrary(db));
console.log('screen', Date.now() - started, JSON.stringify({
  allow: screened.allow,
  kind: screened.kind,
  reason: screened.reason,
  matches: (screened.matches || []).slice(0, 3).map((match) => ({
    id: match.id,
    pmid: match.pmid,
    title: match.title,
    shared: match.shared
  }))
}));

const serviceFacts = {
  facts: FACTS.facts.map((fact) => Object.assign({ vis: 'ask', gate: 0, deflect: '' }, fact))
};
const dose = answer(db, { request: q, trust: 0, case_facts: serviceFacts });
console.log('answer', JSON.stringify({
  send: dose.send,
  certain: dose.certain,
  reply: dose.reply,
  request: dose.request,
  review: dose.stages.review,
  interceptor: dose.stages.interceptor
}));
