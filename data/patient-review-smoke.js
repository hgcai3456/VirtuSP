const { answer } = require('../lib/patient-service');
const { openShards } = require('../lib/db');

const F = (id, label, kw, extra) => Object.assign({
  id, label, kw, vis: 'ask', gate: 0, say: '', deflect: ''
}, extra);

const facts = [
  F('d1', 'Chief complaint: thirst and fatigue for months', ['bring', 'here', 'concern', 'problem', 'symptom', 'tired', 'thirst', 'why'], {
    say: "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
  }),
  F('d2', 'Understanding of diagnosis: partial, confused about diet', ['understand', 'diabetes mean', 'know about', 'diagnos'], {
    say: "They said my sugar is high. I think it means no sweets? Honestly I'm confused about the rest."
  }),
  F('d3', 'Metformin: patient says she takes it every day', ['medication', 'medicine', 'pills', 'taking', 'metformin', 'prescri'], {
    say: "I take my metformin every day, like I'm supposed to."
  }),
  F('d4', 'Skips evening metformin dose (GI upset, runs out early)', ['forget', 'miss', 'skip', 'adher', 'trouble', 'difficult', 'consistent', 'every dose', 'ever'], {
    gate: 1,
    deflect: 'I take it. Like I said.',
    say: '...Okay, honestly I skip the evening one a lot. It upsets my stomach and I run out before the refill.'
  }),
  F('d5', 'Cost barrier: delays refills until payday', ['cost', 'afford', 'insurance', 'pay', 'money'], {
    gate: 1,
    deflect: "I'd rather not talk about money.",
    say: 'Money is tight. Sometimes I wait to refill until payday.'
  }),
  F('d8', 'Diet: sweet tea, frequent takeout (shift work)', ['eat', 'diet', 'food', 'drink', 'soda', 'meal'], {
    say: 'I drink a lot of sweet tea and eat out a lot because of my work hours.'
  }),
  F('c1', 'eGFR 58', ['lab', 'kidney', 'egfr'], { vis: 'chart', say: '' })
];

const db = openShards();
const questions = [
  ['What brings you in today?', 0],
  ['Tell me how you take your metformin.', 0],
  ['I am sorry this has been hard. What gets in the way of every dose?', 0],
  ['I am sorry this has been hard. What gets in the way of every dose?', 1],
  ['How are cost and meals affecting your routine?', 0],
  ['What do you usually eat and drink?', 0],
  ['What dose of metformin should I prescribe?', 0],
  ['Hello there', 0]
];

const started = Date.now();
questions.forEach(([request, trust]) => {
  const t = Date.now();
  const out = answer(db, { request, trust, case_facts: { facts } });
  console.log(JSON.stringify({
    request,
    trust,
    ms: Date.now() - t,
    certain: out.certain,
    send: out.send,
    reply: out.reply,
    fact_id: out.fact_id,
    hold: out.trust_hold,
    identify: out.stages.identify.fact_id,
    search: out.stages.search.fact_id,
    exhaustive: out.stages.exhaustive.fact_id,
    reason: out.stages.review.reason
  }));
});
console.log('total', Date.now() - started);
