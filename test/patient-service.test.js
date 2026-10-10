const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  answer,
  identifyProblem,
  searchProblem,
  exhaustiveSearch,
  secondLayerReview
} = require('../lib/patient-service');
const { UNKNOWN } = require('../lib/grounding-gate');
const { tempDb, insertJournal, insertFact } = require('./helpers');
const { ConversationAgent } = require('../lib/conversation-agent');

function fact(id, label, kw, extra) {
  return Object.assign({
    id,
    label,
    kw,
    vis: 'ask',
    gate: 0,
    say: '',
    deflect: ''
  }, extra);
}

const facts = [
  fact('d1', 'Chief complaint: thirst and fatigue for months', ['bring', 'here', 'concern', 'problem', 'symptom', 'tired', 'thirst', 'why'], {
    say: "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
  }),
  fact('d2', 'Understanding of diagnosis: partial, confused about diet', ['understand', 'diabetes mean', 'know about', 'diagnos'], {
    say: "They said my sugar is high. I think it means no sweets? Honestly I'm confused about the rest."
  }),
  fact('d3', 'Metformin: patient says she takes it every day', ['medication', 'medicine', 'pills', 'taking', 'metformin', 'prescri'], {
    say: "I take my metformin every day, like I'm supposed to."
  }),
  fact('d4', 'Skips evening metformin dose (GI upset, runs out early)', ['forget', 'miss', 'skip', 'adher', 'trouble', 'difficult', 'consistent', 'every dose', 'ever'], {
    gate: 1,
    deflect: 'I take it. Like I said.',
    say: '...Okay, honestly I skip the evening one a lot. It upsets my stomach and I run out before the refill.'
  }),
  fact('d5', 'Cost barrier: delays refills until payday', ['cost', 'afford', 'insurance', 'pay', 'money'], {
    gate: 1,
    deflect: "I'd rather not talk about money.",
    say: 'Money is tight. Sometimes I wait to refill until payday.'
  }),
  fact('d8', 'Diet: sweet tea, frequent takeout (shift work)', ['eat', 'diet', 'food', 'drink', 'soda', 'meal'], {
    say: 'I drink a lot of sweet tea and eat out a lot because of my work hours.'
  }),
  fact('c1', 'eGFR 58', ['lab', 'kidney', 'egfr'], { vis: 'chart', say: '' }),
  fact('', 'ignored', ['ignored'], { say: 'no id' })
];

describe('patient service', { concurrency: false }, () => {
  let box;
  const realNow = Date.now;

  before(() => {
    box = tempDb();
    const journalId = insertJournal(box.db, {
      title: 'Thirst and fatigue in diabetes',
      pmid: '777',
      abstract: 'Thirst and fatigue are documented in diabetes adherence studies.'
    });
    insertFact(box.db, journalId, {
      claim: 'Thirst and fatigue are documented in diabetes.',
      quote: 'Thirst and fatigue are documented in diabetes adherence studies.',
      topic: 'thirst',
      keywords: 'fatigue'
    });
    const bareId = insertJournal(box.db, {
      title: 'Second paper',
      pmid: null,
      abstract: 'Another thirst note.'
    });
    insertFact(box.db, bareId, {
      claim: 'Another thirst note.',
      quote: 'Another thirst note.',
      topic: 'thirst',
      keywords: ''
    });
  });

  after(() => {
    Date.now = realNow;
    box.cleanup();
  });

  function ask(request, extra) {
    return answer(box.db, Object.assign({
      request,
      trust: 0,
      case_facts: { intro: 'Hello', facts }
    }, extra));
  }

  test('sends a unique approved line and holds a gated fact', () => {
    const chief = ask('What brings you in today?');
    assert.equal(chief.certain, true);
    assert.equal(chief.fact_id, 'd1');
    assert.equal(chief.trust_hold, false);
    assert.equal(chief.emotion, 'neutral');
    assert.match(chief.reply, /thirsty/);
    assert.equal(chief.request.allow, true);
    assert.equal(chief.stages.review.agreed, true);

    const meds = ask('Tell me how you take your metformin.');
    assert.equal(meds.fact_id, 'd3');
    assert.match(meds.reply, /metformin every day/);

    const held = ask('I am sorry this has been hard. What gets in the way of every dose?');
    assert.equal(held.fact_id, 'd4');
    assert.equal(held.trust_hold, true);
    assert.equal(held.emotion, 'embarrassed');
    assert.equal(held.reply, 'I take it. Like I said.');
    assert.match(held.grounded, /^blocked:d4$/);

    const open = ask('I am sorry this has been hard. What gets in the way of every dose?', { trust: 1 });
    assert.equal(open.trust_hold, false);
    assert.equal(open.emotion, 'relieved');
    assert.match(open.reply, /skip the evening/);

    const disclosed = ask('I am sorry this has been hard. What gets in the way of every dose?', {
      trust: 0,
      disclosed: ['d4']
    });
    assert.equal(disclosed.trust_hold, false);
    assert.match(disclosed.reply, /skip the evening/);

    const diet = ask('What do you usually eat and drink?');
    assert.equal(diet.fact_id, 'd8');
  });

  test('falls back when the stages disagree or the ask is clinical', () => {
    const mixed = ask('How are cost and meals affecting your routine?');
    assert.equal(mixed.certain, false);
    assert.equal(mixed.send, true);
    assert.equal(mixed.reply, UNKNOWN);
    assert.equal(mixed.stages.review.agreed, false);

    const hello = ask('Hello there');
    assert.equal(hello.certain, false);
    assert.equal(hello.reply, UNKNOWN);
    assert.equal(hello.response, null);

    const dose = ask('What dose of metformin should I prescribe?');
    assert.equal(dose.send, false);
    assert.equal(dose.reply, null);
    assert.equal(dose.request.allow, false);
    assert.equal(dose.stages.review.agreed, false);
  });

  test('clamps facts, trust, disclosure, and candidate lists', () => {
    const longId = 'x'.repeat(120);
    const many = Array.from({ length: 6 }, (_, i) => fact(
      'm' + i,
      'label ' + i,
      ['sharedtoken', 'extra' + i],
      { say: 'Fine line ' + i + ' stays ordinary.' }
    ));
    many.push(fact(longId, 'gated open', ['specialtoken'], {
      gate: -4,
      say: 'y'.repeat(50),
      kw: ['specialtoken'].concat(Array.from({ length: 50 }, (_, n) => 'kw' + n))
    }));
    const out = answer(box.db, {
      request: ' specialtoken ',
      trust: 9,
      disclosed: [longId, '', null].concat(Array.from({ length: 210 }, (_, n) => 'id' + n)),
      case_facts: {
        intro: 'z'.repeat(800),
        facts: many.concat([{ id: '', say: 'drop me' }, { say: 'also drop' }, 'nope'])
      }
    });
    assert.equal(out.fact_id.length, 80);
    assert.equal(out.trust_hold, false);
    const crowded = identifyProblem(
      'sharedtoken extra0 extra1 extra2 extra3 extra4 extra5',
      { facts: many.filter((item) => String(item.id).startsWith('m')) }
    );
    assert.equal(crowded.candidates.length, 5);

    const negative = answer(null, {
      trust: -3,
      case_facts: { facts: 'nope' }
    });
    assert.equal(negative.certainty, 0);
    assert.equal(negative.request.allow, false);

    const numericTrust = ask('What brings you in today?', { trust: '2', disclosed: 'nope' });
    assert.equal(numericTrust.fact_id, 'd1');
  });

  test('scores phrases, prefixes, ties, and library hits', () => {
    const phraseFacts = [
      fact('a', 'blood sugar nocturnal polyuria pattern observed clinically', ['blood sugar'], {
        say: 'blood sugar nocturnal polyuria pattern observed clinically todayish'
      }),
      fact('b', 'other marker', ['blood', 'sugar'], { say: 'plain blood and sugar note' }),
      fact('c', 'sugar (high) note', ['sugar (high)'], { say: 'sugar (high) is the whole phrase here' }),
      fact('d', 'metformin start', ['metform', ''], { say: 'starts with the stem' }),
      fact('e', 'tied alpha', ['zebra'], { say: 'one zebra' }),
      fact('f', 'tied beta', ['zebra'], { say: 'two zebra' })
    ];
    const caseFacts = { facts: phraseFacts };
    const identified = identifyProblem('please check blood sugar nocturnal polyuria pattern observed clinically', caseFacts);
    assert.equal(identified.fact_id, 'a');
    const searched = searchProblem(identified, caseFacts, box.db);
    assert.equal(searched.confirmed, false);
    assert.equal(searched.fact_id, null);
    assert.ok(searched.case_hits[0].id === 'b');

    const emptySearch = searchProblem({ unique: false, fact_id: null, matched_terms: [] }, caseFacts, box.db);
    assert.equal(emptySearch.confirmed, false);
    assert.deepEqual(emptySearch.library_matches, []);

    const tied = identifyProblem('zebra animal', caseFacts);
    assert.equal(tied.unique, false);
    assert.equal(tied.fact_id, null);
    const tiedSearch = searchProblem(tied, caseFacts, box.db);
    assert.equal(tiedSearch.confirmed, false);

    const splitFacts = [
      fact('p', 'solo nocturnal polyuria pattern observed', ['solo'], {
        say: 'solo nocturnal polyuria pattern observed'
      }),
      fact('q', 'other', ['solo'], { say: 'solo only' })
    ];
    const split = identifyProblem('solo nocturnal polyuria pattern observed', { facts: splitFacts });
    assert.equal(split.unique, true);
    const splitSearch = searchProblem(split, { facts: splitFacts }, box.db);
    assert.equal(splitSearch.confirmed, false);
    assert.equal(splitSearch.fact_id, null);

    const prefix = identifyProblem('metformin please', { facts: phraseFacts });
    assert.equal(prefix.fact_id, 'd');

    const special = identifyProblem('sugar (high) today', { facts: phraseFacts });
    assert.equal(special.fact_id, 'c');

    const confirmed = searchProblem(
      { unique: true, fact_id: 'd', matched_terms: ['metform'], problem: 'metformin start' },
      { facts: phraseFacts },
      box.db
    );
    assert.equal(confirmed.confirmed, true);
    assert.equal(confirmed.fact_id, 'd');

    const broad = exhaustiveSearch('blood sugar nocturnal polyuria', caseFacts, box.db);
    assert.ok(broad.candidates.length);
    assert.equal(typeof broad.unique, 'boolean');
    assert.ok(broad.margin >= 0);

    const none = exhaustiveSearch('qqqq', { facts: [] }, box.db);
    assert.equal(none.fact_id, null);
    assert.equal(none.unique, false);

    const libraries = searchProblem(
      { unique: true, fact_id: 'd1', matched_terms: ['thirst', 'fatigue', 'ab', 'diabetes', 'extra', 'papers'] },
      { facts },
      [box.db, box.db]
    );
    assert.ok(libraries.library_matches.length);
    assert.ok(libraries.library_matches.length <= 5);
    assert.ok(libraries.library_matches.some((hit) => hit.pmid === '777'));
    assert.ok(libraries.library_matches.some((hit) => hit.pmid === ''));
  });

  test('second review rejects an empty line', () => {
    const caseFacts = {
      facts: [fact('e1', 'empty line', ['zephyr'], { say: '', deflect: '' })]
    };
    const request = 'zephyr please';
    const identified = identifyProblem(request, caseFacts);
    const searched = searchProblem(identified, caseFacts, box.db);
    const exhaustive = exhaustiveSearch(request, caseFacts, box.db);
    const review = secondLayerReview({
      request,
      caseFacts,
      trust: 0,
      disclosed: new Set(),
      db: box.db,
      identified,
      searched,
      exhaustive
    });
    assert.equal(review.certainty, 0);
    assert.match(review.reason, /no patient line/);
  });

  test('reloads the publication library after the cache window', () => {
    let reads = 0;
    const inner = box.db;
    const wrapped = {
      prepare(sql) {
        if (/SELECT/.test(sql) && !/LIMIT|LIKE/.test(sql)) {
          reads += 1;
        }

        return inner.prepare(sql);
      }
    };
    const body = {
      request: 'What dose of metformin should I prescribe?',
      trust: 0,
      case_facts: { facts: [] }
    };
    Date.now = () => realNow() + 100000;
    answer(wrapped, body);
    const afterFirst = reads;
    answer(wrapped, body);
    assert.equal(reads, afterFirst);
    Date.now = () => realNow() + 100000 + 16000;
    answer(wrapped, body);
    assert.ok(reads > afterFirst);
    Date.now = realNow;
  });

  test('keeps the approved line and adds a spoken lead from ingested conversations', () => {
    const spoken = tempDb();
    try {
      new ConversationAgent(spoken.db).ingestConversation({
        source_key: 'ack-1',
        title: 'Acknowledging',
        topic: 'acknowledgement',
        setting: 'clinic',
        turns: [
          { speaker: 'clinician', text: 'Does that sound right?', move: 'ask' },
          { speaker: 'patient', text: 'Yeah.', move: 'ack' },
          { speaker: 'patient', text: 'I got here a few minutes early.', move: 'share' }
        ]
      });
      const meds = answer(spoken.db, {
        request: 'Tell me how you take your metformin.',
        trust: 0,
        case_facts: {
          facts: [fact('d3', 'Metformin: patient says she takes it every day', ['metformin'], {
            say: "I take my metformin every day, like I'm supposed to."
          })]
        }
      });
      assert.equal(meds.certain, true);
      assert.equal(meds.fact_id, 'd3');
      assert.equal(meds.reply, "Yeah. I take my metformin every day, like I'm supposed to.");

      const held = answer(spoken.db, {
        request: 'What gets in the way of every dose?',
        trust: 0,
        case_facts: {
          facts: [fact('d4', 'Skips evening dose', ['every dose'], {
            gate: 1,
            deflect: 'I take it. Like I said.',
            say: 'Okay, honestly I skip the evening one a lot.'
          })]
        }
      });
      assert.equal(held.certain, true);
      assert.equal(held.trust_hold, true);
      assert.equal(held.reply, 'Yeah. I take it. Like I said.');
    } finally {
      spoken.cleanup();
    }
  });
});
