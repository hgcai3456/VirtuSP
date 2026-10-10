const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { withWrite } = require('./write-orchestrator');

const defaultDbPath = path.join(__dirname, '..', 'data', 'virtusp.sqlite');
const schemaPath = path.join(__dirname, '..', 'data', 'schema.sql');

function shardCount() {
  return Math.max(1, Number(process.env.VIRTUSP_SHARDS || 2));
}

function shardPath(index) {
  if (!index) {
    return process.env.VIRTUSP_DB || defaultDbPath;
  }

  return path.join(path.dirname(defaultDbPath), 'virtusp-' + (index + 1) + '.sqlite');
}

function sqliteJournal() {
  return String(process.env.VIRTUSP_SQLITE_JOURNAL || 'WAL').toUpperCase() === 'DELETE'
    ? 'DELETE'
    : 'WAL';
}

function openDb(dbPath = process.env.VIRTUSP_DB || defaultDbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.file = dbPath;
  try {
    db.exec('PRAGMA busy_timeout = 30000');
    withWrite(db, () => {
      db.exec('PRAGMA foreign_keys = ON');
      const journal = sqliteJournal();
      if (journal === 'DELETE') {
        db.exec('PRAGMA locking_mode = EXCLUSIVE');
      }
      try {
        db.exec('PRAGMA journal_mode = ' + journal);
      } catch (err) {
        if (!/locked/i.test(err && err.message || '')) {
          throw err;
        }
      }
      db.exec(fs.readFileSync(schemaPath, 'utf8'));
      ensureColumn(db, 'reports', 'extracted_text', 'TEXT');
    });
  } catch (err) {
    try {
      db.close();
    } catch (closeErr) {
      // The original open error is the one the caller handles.
    }
    throw err;
  }

  return db;
}

function ensureColumn(db, table, column, type) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.some((col) => col.name === column)) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type);
  }
}

function openShards(n) {
  const count = n || shardCount();

  return Array.from({ length: count }, (_, i) => openDb(shardPath(i)));
}

function asList(dbOrShards) {
  if (!dbOrShards) {
    return [];
  }
  if (Array.isArray(dbOrShards)) {
    return dbOrShards;
  }

  return [dbOrShards];
}

function nowIso() {
  return new Date().toISOString();
}

function listJournalsOne(db) {
  return db.prepare(`
    SELECT j.*,
      (SELECT COUNT(*) FROM medical_data m WHERE m.journal_id = j.id) AS fact_count
    FROM journals j
    ORDER BY j.ingested_at DESC, j.id DESC
  `).all();
}

function listJournals(dbOrShards) {
  return asList(dbOrShards).flatMap((db, shard) => (
    listJournalsOne(db).map((row) => Object.assign({ shard }, row))
  ));
}

function listMedicalDataOne(db, filters = {}) {
  const where = [];
  const params = {};

  if (filters.journalId) {
    where.push('m.journal_id = @journalId');
    params.journalId = Number(filters.journalId);
  }

  if (filters.q) {
    where.push(`(
      m.claim LIKE @q OR m.quote LIKE @q OR m.topic LIKE @q OR m.keywords LIKE @q
      OR j.title LIKE @q OR j.authors LIKE @q OR j.pmid LIKE @q
    )`);
    params.q = '%' + String(filters.q).replace(/%/g, '') + '%';
  }

  if (filters.limit) {
    params.limit = Math.max(1, Math.min(20, Number(filters.limit) || 5));
  }

  const sql = `
    SELECT m.*,
      j.title AS journal_title,
      j.authors,
      j.journal_name,
      j.year,
      j.pmid,
      j.doi,
      j.url
    FROM medical_data m
    JOIN journals j ON j.id = m.journal_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY m.ingested_at DESC, m.id DESC
    ${filters.limit ? 'LIMIT @limit' : ''}
  `;

  return db.prepare(sql).all(params);
}

function listMedicalData(dbOrShards, filters = {}) {
  return asList(dbOrShards).flatMap((db, shard) => {
    if (filters.journalId != null && filters.shard != null && Number(filters.shard) !== shard) {
      return [];
    }

    return listMedicalDataOne(db, filters).map((row) => Object.assign({ shard }, row));
  });
}

function listConversationsOne(db) {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM conversation_turns t WHERE t.conversation_id = c.id) AS turn_count
    FROM conversations c
    ORDER BY c.ingested_at DESC, c.id DESC
  `).all();
}

function listConversations(dbOrShards) {
  return asList(dbOrShards).flatMap((db, shard) => (
    listConversationsOne(db).map((row) => Object.assign({ shard }, row))
  ));
}

function listConversationTurnsOne(db, filters = {}) {
  const where = [];
  const params = {};

  if (filters.conversationId) {
    where.push('t.conversation_id = @conversationId');
    params.conversationId = Number(filters.conversationId);
  }

  if (filters.speaker) {
    where.push('t.speaker = @speaker');
    params.speaker = String(filters.speaker).toLowerCase();
  }

  if (filters.move) {
    where.push('t.move = @move');
    params.move = String(filters.move).toLowerCase();
  }

  if (filters.topic) {
    where.push('c.topic = @topic');
    params.topic = String(filters.topic);
  }

  if (filters.q) {
    where.push('(t.text LIKE @q OR t.speaker LIKE @q OR c.topic LIKE @q OR c.title LIKE @q)');
    params.q = '%' + String(filters.q).replace(/%/g, '') + '%';
  }

  if (filters.limit) {
    params.limit = Math.max(1, Math.min(500, Number(filters.limit) || 50));
  }

  const sql = `
    SELECT t.*,
      c.topic,
      c.title,
      c.source_key,
      c.setting
    FROM conversation_turns t
    JOIN conversations c ON c.id = t.conversation_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.ingested_at DESC, t.id DESC
    ${filters.limit ? 'LIMIT @limit' : ''}
  `;

  return db.prepare(sql).all(params);
}

function listConversationTurns(dbOrShards, filters = {}) {
  return asList(dbOrShards).flatMap((db, shard) => {
    if (filters.conversationId != null && filters.shard != null && Number(filters.shard) !== shard) {
      return [];
    }

    return listConversationTurnsOne(db, filters).map((row) => Object.assign({ shard }, row));
  });
}

function countsOne(db) {
  return {
    journals: db.prepare('SELECT COUNT(*) AS n FROM journals').get().n,
    medical_data: db.prepare('SELECT COUNT(*) AS n FROM medical_data').get().n,
    conversations: db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n,
    conversation_turns: db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get().n
  };
}

function counts(dbOrShards) {
  return asList(dbOrShards).reduce((acc, db) => {
    const n = countsOne(db);
    acc.journals += n.journals;
    acc.medical_data += n.medical_data;
    acc.conversations += n.conversations;
    acc.conversation_turns += n.conversation_turns;

    return acc;
  }, { journals: 0, medical_data: 0, conversations: 0, conversation_turns: 0 });
}

function writeDb(dbOrShards) {
  return asList(dbOrShards)[0];
}

module.exports = {
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
};
