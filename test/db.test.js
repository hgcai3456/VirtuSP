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
    box = tempDb();
  });

  afterEach(() => {
    box.cleanup();
    if (env.VIRTUSP_DB == null) delete process.env.VIRTUSP_DB;
    else process.env.VIRTUSP_DB = env.VIRTUSP_DB;
    if (env.VIRTUSP_SHARDS == null) delete process.env.VIRTUSP_SHARDS;
    else process.env.VIRTUSP_SHARDS = env.VIRTUSP_SHARDS;
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
      assert.equal(journals[0].shard, 1);
      assert.equal(journals[0].title, 'Beta 100% match');
      assert.equal(journals[0].fact_count, 1);
      assert.deepEqual(counts([box.db, other.db]), { journals: 2, medical_data: 2 });
      assert.deepEqual(counts(null), { journals: 0, medical_data: 0 });

      const all = listMedicalData([box.db, other.db]);
      assert.equal(all.length, 2);
      assert.equal(all[0].journal_title, 'Beta 100% match');

      const filtered = listMedicalData(box.db, { q: '100% thirst', journalId: first, limit: 100 });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].shard, 0);
      assert.equal(listMedicalData(box.db, { limit: 0 }).length, 1);
      assert.equal(listMedicalData(box.db, { limit: 'nope', q: 'thirst' }).length, 1);
      assert.equal(listMedicalData([box.db, other.db], { journalId: first, shard: 1 }).length, 0);
      assert.equal(listMedicalData([box.db, other.db], { journalId: second, shard: 1 }).length, 1);
      assert.equal(listMedicalData(box.db, { q: 'not-present' }).length, 0);
    } finally {
      other.cleanup();
    }
  });
});
