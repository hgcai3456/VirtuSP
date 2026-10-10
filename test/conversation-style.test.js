const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  asLead,
  isStyleTurn,
  styleTurns,
  styleNorms,
  pickLead,
  naturalize,
  loadStyleTurns,
  loadStyleNorms,
  hash
} = require('../lib/conversation-style');
const { intercept } = require('../lib/response-interceptor');
const { UNKNOWN } = require('../lib/grounding-gate');
const { ConversationAgent } = require('../lib/conversation-agent');
const { tempDb } = require('./helpers');

const SAY = "I take my metformin every day, like I'm supposed to.";

function fact(extra) {
  return Object.assign({
    id: 'd3',
    say: SAY,
    deflect: '',
    label: 'Metformin: patient says she takes it every day',
    kw: ['metformin']
  }, extra);
}

describe('conversation style', { concurrency: false }, () => {
  let box;

  beforeEach(() => {
    box = tempDb();
  });

  afterEach(() => {
    box.cleanup();
  });

  test('accepts only short non-clinical patient leads', () => {
    assert.equal(isStyleTurn(null), false);
    assert.equal(isStyleTurn('Yeah.'), false);
    assert.equal(isStyleTurn({ speaker: 'clinician', move: 'ack', text: 'Yeah.' }), false);
    assert.equal(isStyleTurn({ speaker: 'patient', move: 'greet', text: 'Hey.' }), false);
    assert.equal(isStyleTurn({ speaker: 'patient', move: 'ack', text: '   ' }), false);
    assert.equal(isStyleTurn({ speaker: 'patient', text: 'Yeah.' }), false);
    assert.equal(isStyleTurn({ move: 'ack', text: 'Yeah.' }), false);
    assert.equal(isStyleTurn({
      speaker: 'patient',
      move: 'ack',
      text: 'one two three four five six seven eight nine'
    }), false);
    assert.equal(isStyleTurn({ speaker: 'patient', move: 'ack', text: 'I take metformin daily.' }), false);
    assert.equal(isStyleTurn({ speaker: 'patient', move: 'ack', text: 'Yeah 2' }), false);
    assert.equal(isStyleTurn({
      speaker: 'Patient',
      move: 'ACK',
      text: 'one two three four five six seven eight'
    }), true);
    assert.equal(asLead(''), '');
    assert.equal(asLead('  Yeah  '), 'Yeah.');
    assert.equal(asLead('Yeah?'), 'Yeah?');
    assert.equal(hash(''), 0);
    assert.ok(hash('Yeah.') > 0);
    assert.deepEqual(styleTurns(null), []);
    assert.equal(styleTurns([{ speaker: 'patient', move: 'ack', text: 'Yeah.' }]).length, 1);
    assert.equal([...styleNorms([
      { speaker: 'patient', move: 'ack', text: 'Yeah' },
      { speaker: 'clinician', move: 'ack', text: 'Hello.' }
    ])][0], 'yeah.');
    assert.deepEqual(loadStyleTurns(null), []);
    assert.equal(loadStyleNorms(null).size, 0);
  });

  test('picks a lead from overlap, then a stable hash, and keeps the approved line', () => {
    const think = { id: 2, speaker: 'patient', move: 'hedge', text: 'Let me think.' };
    const also = { id: 3, speaker: 'patient', move: 'hedge', text: 'Think it over.' };
    const yeah = { id: 4, speaker: 'patient', move: 'ack', text: 'Yeah.' };
    assert.equal(pickLead('line', 'please think about the metformin schedule', [yeah, think, also]), 'Let me think.');
    const line = 'I take my metformin every day.';
    const pool = [yeah, { speaker: 'patient', move: 'ack', text: 'Okay.' }];
    const chosen = pool[hash(line) % pool.length];
    assert.equal(pickLead(line, 'metformin schedule please', pool), asLead(chosen.text));
    assert.equal(pickLead(line, 'metformin', []), '');
    assert.equal(naturalize('', [yeah], 'hi'), '');
    assert.equal(naturalize('Already fine.', [], 'hi'), 'Already fine.');
    assert.equal(naturalize('Yeah. I already said it.', [yeah], 'hello'), 'Yeah. I already said it.');
    assert.equal(naturalize(SAY, [yeah], 'Tell me how you take your metformin.'), 'Yeah. ' + SAY);
  });

  test('grounds a spoken lead and rejects one that was not ingested', () => {
    new ConversationAgent(box.db).ingestConversation({
      source_key: 'leads',
      title: 'Leads',
      topic: 'acknowledgement',
      turns: [
        { speaker: 'patient', text: 'Yeah', move: 'ack' },
        { speaker: 'patient', text: 'Well.', move: 'hedge' },
        { speaker: 'patient', text: 'I got here a few minutes early.', move: 'share' }
      ]
    });
    assert.equal(loadStyleTurns(box.db).length, 2);
    assert.equal(loadStyleNorms(box.db).has('yeah.'), true);

    const empty = { id: 'e', say: '', deflect: '', label: '', kw: [] };
    const main = fact();
    const held = fact({
      id: 'd4',
      say: 'Okay, honestly I skip the evening one a lot.',
      deflect: 'I take it. Like I said.',
      label: 'Skips evening dose',
      kw: ['dose']
    });
    const now = new Date('2026-06-01T00:00:00Z');

    const exact = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: SAY,
      caseFacts: { facts: [empty, main] },
      db: null,
      now
    });
    assert.equal(exact.allow, true);
    assert.equal(exact.text, SAY);

    const spoken = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: 'Yeah. ' + SAY,
      caseFacts: { facts: [empty, main] },
      db: box.db,
      now
    });
    assert.equal(spoken.allow, true);
    assert.equal(spoken.text, 'Yeah. ' + SAY);

    const bare = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: 'Yeah ' + SAY,
      caseFacts: { facts: [main] },
      db: box.db,
      now
    });
    assert.equal(bare.allow, true);

    const both = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: 'Yeah. Well. ' + SAY,
      caseFacts: { facts: [main] },
      db: box.db,
      now
    });
    assert.equal(both.allow, true);

    const deflect = intercept({
      request: 'What gets in the way of every dose?',
      proposed: 'Yeah. I take it. Like I said.',
      caseFacts: { facts: [held] },
      db: box.db,
      now
    });
    assert.equal(deflect.allow, true);
    assert.equal(deflect.text, 'Yeah. I take it. Like I said.');

    const unknown = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: 'Yeah. Gone. ' + SAY,
      caseFacts: { facts: [empty, main] },
      db: box.db,
      now
    });
    assert.equal(unknown.allow, false);
    assert.equal(unknown.send, true);
    assert.equal(unknown.text, UNKNOWN);

    const unstyled = intercept({
      request: 'Tell me how you take your metformin.',
      proposed: 'Yeah. ' + SAY,
      caseFacts: { facts: [main] },
      db: null,
      now
    });
    assert.equal(unstyled.allow, false);
    assert.equal(unstyled.text, UNKNOWN);
  });
});
