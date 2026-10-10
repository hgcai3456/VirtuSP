const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { ConversationAgent, normalizeConversation } = require('../lib/conversation-agent');
const { tempDb } = require('./helpers');

describe('conversation agent', { concurrency: false }, () => {
  let box;

  beforeEach(() => {
    box = tempDb();
  });

  afterEach(() => {
    box.cleanup();
  });

  test('stores a conversation once and skips blank turns', () => {
    const agent = new ConversationAgent(box.db);
    const first = agent.ingestConversation({
      sourceKey: 'visit-1',
      title: '  Opening the visit  ',
      topic: 'greeting',
      turns: [
        { speaker: 'Patient', text: '  Hey.  ', move: 'ACK' },
        { speaker: '', text: 'no speaker' },
        null,
        { speaker: 'clinician', text: '   ' },
        { speaker: 'patient', text: 'x'.repeat(2005) }
      ]
    }, { source_type: 'manual', source_path: 'seed' });

    assert.equal(first.turns_added, 2);
    assert.deepEqual(first.skipped, ['blank turn', 'blank turn', 'blank turn']);
    const row = box.db.prepare('SELECT * FROM conversations WHERE id = ?').get(first.conversation_id);
    assert.equal(row.source_key, 'visit-1');
    assert.equal(row.title, 'Opening the visit');
    assert.equal(row.topic, 'greeting');
    assert.equal(row.setting, null);
    assert.equal(row.source_type, 'manual');
    assert.equal(row.source_path, 'seed');
    const turns = box.db.prepare('SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY turn_index').all(first.conversation_id);
    assert.equal(turns[0].speaker, 'patient');
    assert.equal(turns[0].text, 'Hey.');
    assert.equal(turns[0].move, 'ack');
    assert.equal(turns[0].turn_index, 0);
    assert.equal(turns[1].text.length, 2000);
    assert.equal(turns[1].move, 'say');

    const again = agent.ingestConversation({
      source_key: 'visit-1',
      title: 'Opening the visit',
      source_type: 'file',
      source_path: 'other',
      setting: 'clinic',
      turns: [{ speaker: 'patient', text: 'Okay.', move: 'ack' }]
    });
    assert.equal(again.conversation_id, first.conversation_id);
    assert.equal(again.turns_added, 0);
    assert.deepEqual(again.skipped, ['already ingested']);
    assert.equal(box.db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get().n, 2);

    const typed = normalizeConversation({
      source_key: 'plain',
      title: 'Plain',
      turns: [{ speaker: 'patient', text: 'So.' }]
    });
    assert.equal(typed.source_type, 'corpus');
    assert.equal(typed.source_path, null);
    assert.equal(typed.turns[0].move, 'say');
  });

  test('rejects a conversation that has no title, key, or turns', () => {
    const agent = new ConversationAgent(box.db);
    assert.throws(() => agent.ingestConversation({ source_key: 'x', turns: [] }), /missing a title/);
    assert.throws(() => agent.ingestConversation({ title: 'T', turns: [{ speaker: 'patient', text: 'Hi.' }] }), /source_key/);
    assert.throws(() => agent.ingestConversation({ title: 'T', source_key: 'x' }), /no usable turns/);
    assert.throws(() => agent.ingestConversation({ title: 'T', source_key: 'x', turns: [{ speaker: ' ', text: ' ' }] }), /no usable turns/);
    assert.throws(() => normalizeConversation(null), /missing a title/);
  });
});
