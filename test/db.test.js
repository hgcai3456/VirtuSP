const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const {
  defaultDbPath,
  shardCount,
  shardPath,
  openDb,
  openShards,
  asList,
  nowIso,
  listJournals,
  listMedicalData,
  listConversations,
  listConversationTurns,
  counts,
  writeDb
} = require('../lib/db');
const { tempDb, insertJournal, insertFact } = require('./helpers');

describe('db', { concurrency: false }, () => {
  const env = {};
  let box;

  beforeEach(() => {
    env.VIRTUSP_DB = process.env.VIRTUSP_DB;
    env.VIRTUSP_SHARDS = process.env.VIRTUSP_SHARDS;
    env.VIRTUSP_SQLITE_JOURNAL = process.env.VIRTUSP_SQLITE_JOURNAL;
    env.VIRTUSP_SQLITE_EXCLUSIVE = process.env.VIRTUSP_SQLITE_EXCLUSIVE;
    delete process.env.VIRTUSP_SQLITE_JOURNAL;
    delete process.env.VIRTUSP_SQLITE_EXCLUSIVE;
    box = tempDb();
  });

  afterEach(() => {
    box.cleanup();
    if (env.VIRTUSP_DB == null) delete process.env.VIRTUSP_DB;
    else process.env.VIRTUSP_DB = env.VIRTUSP_DB;
    if (env.VIRTUSP_SHARDS == null) delete process.env.VIRTUSP_SHARDS;
    else process.env.VIRTUSP_SHARDS = env.VIRTUSP_SHARDS;
    if (env.VIRTUSP_SQLITE_JOURNAL == null) delete process.env.VIRTUSP_SQLITE_JOURNAL;
    else process.env.VIRTUSP_SQLITE_JOURNAL = env.VIRTUSP_SQLITE_JOURNAL;
    if (env.VIRTUSP_SQLITE_EXCLUSIVE == null) delete process.env.VIRTUSP_SQLITE_EXCLUSIVE;
    else process.env.VIRTUSP_SQLITE_EXCLUSIVE = env.VIRTUSP_SQLITE_EXCLUSIVE;
  });

  test('shard paths follow the env and the default file', () => {
    delete process.env.VIRTUSP_SHARDS;
    delete process.env.VIRTUSP_DB;
    assert.equal(shardCount(), 2);
    assert.equal(shardPath(0), defaultDbPath);
    assert.match(shardPath(1), /virtusp-2\.sqlite$/);

    process.env.VIRTUSP_SHARDS = '0';
    assert.equal(shardCount(), 1);
    process.env.VIRTUSP_SHARDS = '4';
    assert.equal(shardCount(), 4);
    process.env.VIRTUSP_DB = box.dbPath;
    assert.equal(shardPath(0), box.dbPath);
    assert.match(shardPath(2), /virtusp-3\.sqlite$/);
  });

  test('DELETE journal mode locks the file for the shared cloud volume', () => {
    process.env.VIRTUSP_SQLITE_JOURNAL = 'delete';
    const opened = openDb(box.dbPath + '-delete.sqlite');
    assert.equal(opened.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    assert.equal(opened.prepare('PRAGMA locking_mode').get().locking_mode, 'exclusive');
    opened.close();

    process.env.VIRTUSP_SQLITE_JOURNAL = 'MEMORY';
    const wal = openDb(box.dbPath + '-wal.sqlite');
    assert.equal(wal.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    wal.close();
  });

  test('DELETE journal can stay shared when exclusive locking is turned off', () => {
    process.env.VIRTUSP_SQLITE_JOURNAL = 'delete';
    process.env.VIRTUSP_SQLITE_EXCLUSIVE = '0';
    const opened = openDb(box.dbPath + '-shared.sqlite');
    assert.equal(opened.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    assert.equal(opened.prepare('PRAGMA locking_mode').get().locking_mode, 'normal');
    opened.close();
  });

  test('openShards uses the requested count or the env count', () => {
    process.env.VIRTUSP_DB = box.dbPath;
    process.env.VIRTUSP_SHARDS = '1';
    const one = openShards();
    assert.equal(one.length, 1);
    one.forEach((db) => db.close());

    const two = openShards(1);
    assert.equal(two.length, 1);
    two.forEach((db) => db.close());
  });

  test('journal mode lock is ignored and other pragma errors surface', () => {
    const original = DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec = function exec(sql) {
      if (String(sql).includes('journal_mode')) {
        const err = new Error('database is locked');
        DatabaseSync.prototype.exec = original;
        throw err;
      }

      return original.call(this, sql);
    };

    const opened = openDb(box.dbPath + '-locked.sqlite');
    assert.equal(typeof opened.prepare, 'function');
    opened.close();

    DatabaseSync.prototype.exec = function exec(sql) {
      if (String(sql).includes('journal_mode')) {
        const err = new Error('disk I/O error');
        DatabaseSync.prototype.exec = original;
        throw err;
      }

      return original.call(this, sql);
    };
    assert.throws(() => openDb(box.dbPath + '-io.sqlite'), /disk I\/O error/);
    DatabaseSync.prototype.exec = original;

    const blank = new Error('');
    DatabaseSync.prototype.exec = function exec(sql) {
      if (String(sql).includes('journal_mode')) {
        DatabaseSync.prototype.exec = original;
        throw blank;
      }

      return original.call(this, sql);
    };
    assert.throws(() => openDb(box.dbPath + '-blank.sqlite'), (err) => err === blank);
    DatabaseSync.prototype.exec = original;
  });

  test('lists, counts, and filters span shards', () => {
    const other = tempDb();
    try {
      assert.deepEqual(asList(null), []);
      assert.deepEqual(asList(box.db), [box.db]);
      assert.equal(writeDb(null), undefined);
      assert.equal(writeDb([box.db, other.db]), box.db);
      assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T/);

      const first = insertJournal(box.db, { title: 'Alpha thirst study', pmid: '111', ingested_at: '2021-01-01T00:00:00.000Z' });
      insertFact(box.db, first, { claim: 'Thirst claim', quote: 'Thirst quote about kidneys', topic: 'thirst', keywords: 'thirst' });
      const second = insertJournal(other.db, { title: 'Beta 100% match', pmid: '222', ingested_at: '2022-01-01T00:00:00.000Z' });
      insertFact(other.db, second, { claim: 'Fatigue claim', quote: 'Fatigue quote', topic: 'fatigue', keywords: 'fatigue' });

      const journals = listJournals([box.db, other.db]);
      assert.equal(journals.length, 2);
      assert.equal(journals[0].shard, 0);
      assert.equal(journals[0].title, 'Alpha thirst study');
      assert.equal(journals[0].fact_count, 1);
      assert.deepEqual(counts([box.db, other.db]), {
        journals: 2,
        medical_data: 2,
        conversations: 0,
        conversation_turns: 0,
        pathology_results: 0,
        pathology_evaluations: 0
      });
      assert.deepEqual(counts(null), {
        journals: 0,
        medical_data: 0,
        conversations: 0,
        conversation_turns: 0,
        pathology_results: 0,
        pathology_evaluations: 0
      });

      const all = listMedicalData([box.db, other.db]);
      assert.equal(all.length, 2);
      assert.equal(all[0].journal_title, 'Alpha thirst study');

      const filtered = listMedicalData(box.db, { q: '%thirst%', journalId: first, limit: 100 });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].shard, 0);
      assert.equal(listMedicalData(box.db, { limit: 0 }).length, 1);
      assert.equal(listMedicalData(box.db, { limit: 'nope', q: 'thirst' }).length, 1);
      assert.equal(listMedicalData([box.db, other.db], { journalId: first, shard: 2 }).length, 0);
      assert.equal(listMedicalData([box.db, other.db], { journalId: second, shard: 1 }).length, 1);
      assert.equal(listMedicalData(box.db, { q: 'not-present' }).length, 0);
    } finally {
      other.cleanup();
    }
  });

  test('lists and filters conversations across shards', () => {
    const { ConversationAgent } = require('../lib/conversation-agent');
    const other = tempDb();
    try {
      assert.deepEqual(listConversations(null), []);
      assert.deepEqual(listConversationTurns(null), []);

      const alpha = new ConversationAgent(box.db).ingestConversation({
        source_key: 'alpha',
        title: 'Alpha talk',
        topic: 'greeting',
        setting: 'clinic',
        turns: [
          { speaker: 'Patient', text: 'Yeah.', move: 'ACK' },
          { speaker: 'clinician', text: 'Hello there.', move: 'ask' },
          { speaker: 'patient', text: '100 percent note', move: 'share' }
        ]
      });
      const beta = new ConversationAgent(other.db).ingestConversation({
        sourceKey: 'beta',
        title: 'Beta talk',
        topic: 'closing',
        turns: [{ speaker: 'patient', text: 'Thanks.', move: 'close' }]
      });

      const conversations = listConversations([box.db, other.db]);
      assert.equal(conversations.length, 2);
      assert.deepEqual(conversations.map((row) => row.shard).sort(), [0, 1]);
      assert.equal(conversations.find((row) => row.shard === 0).turn_count, 3);
      assert.equal(conversations.find((row) => row.shard === 0).title, 'Alpha talk');
      assert.equal(counts([box.db, other.db]).conversations, 2);
      assert.equal(counts([box.db, other.db]).conversation_turns, 4);

      const turns = listConversationTurns([box.db, other.db]);
      assert.equal(turns.length, 4);
      assert.equal(listConversationTurns(box.db, { speaker: 'Patient', move: 'ACK', topic: 'greeting' }).length, 1);
      assert.equal(listConversationTurns(box.db, { q: '100% percent' }).length, 1);
      assert.equal(listConversationTurns(box.db, { q: 'not-present' }).length, 0);
      assert.equal(listConversationTurns(box.db, { topic: 'closing' }).length, 0);
      assert.equal(listConversationTurns(box.db, { conversationId: alpha.conversation_id, limit: 1 }).length, 1);
      assert.equal(listConversationTurns(box.db, { conversationId: alpha.conversation_id, limit: 1000 }).length, 3);
      assert.equal(listConversationTurns(box.db, { conversationId: alpha.conversation_id, limit: 'nope' }).length, 3);
      assert.equal(listConversationTurns(box.db, { limit: 0 }).length, 3);
      assert.equal(listConversationTurns([box.db, other.db], { conversationId: 999, shard: 1 }).length, 0);
      assert.equal(listConversationTurns([box.db, other.db], { conversationId: alpha.conversation_id, shard: 0 }).length, 3);
      assert.equal(listConversationTurns(other.db, { conversationId: beta.conversation_id }).length, 1);
      assert.equal(listConversationTurns([box.db, other.db], { conversationId: 999 }).length, 0);
      assert.equal(listConversationTurns([box.db, other.db], { shard: 1 }).length, 4);
    } finally {
      other.cleanup();
    }
  });
});
