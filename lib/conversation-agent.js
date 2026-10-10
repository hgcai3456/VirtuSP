const { nowIso } = require('./db');
const { writeTransaction } = require('./write-orchestrator');

function asText(value) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function normalizeConversation(raw, extras = {}) {
  const src = raw || {};
  const title = asText(src.title);
  const sourceKey = asText(src.source_key || src.sourceKey);
  if (!title) {
    throw new Error('Conversation is missing a title');
  }
  if (!sourceKey) {
    throw new Error('Conversation is missing a source_key');
  }

  const skipped = [];
  const turns = (Array.isArray(src.turns) ? src.turns : []).map((turn) => {
    const speaker = asText(turn && turn.speaker).toLowerCase();
    const text = asText(turn && turn.text).slice(0, 2000);
    if (!speaker || !text) {
      skipped.push('blank turn');

      return null;
    }

    return {
      speaker,
      text,
      move: asText(turn.move).toLowerCase() || 'say'
    };
  }).filter(Boolean);

  if (!turns.length) {
    throw new Error('Conversation has no usable turns');
  }

  return {
    source_key: sourceKey,
    title,
    topic: asText(src.topic) || null,
    setting: asText(src.setting) || null,
    source_type: asText(src.source_type) || asText(extras.source_type) || 'corpus',
    source_path: asText(src.source_path) || asText(extras.source_path) || null,
    turns,
    skipped
  };
}

class ConversationAgent {
  constructor(db) {
    this.db = db;
    this.findByKey = db.prepare('SELECT id FROM conversations WHERE source_key = ?');
    this.insertConversation = db.prepare(`
      INSERT INTO conversations (
        source_key, title, topic, setting, source_type, source_path, ingested_at
      ) VALUES (
        @source_key, @title, @topic, @setting, @source_type, @source_path, @ingested_at
      )
    `);
    this.insertTurn = db.prepare(`
      INSERT INTO conversation_turns (
        conversation_id, turn_index, speaker, text, move, ingested_at
      ) VALUES (
        @conversation_id, @turn_index, @speaker, @text, @move, @ingested_at
      )
    `);
  }

  ingestConversation(raw, extras = {}) {
    const record = normalizeConversation(raw, extras);

    return writeTransaction(this.db, () => {
      const existing = this.findByKey.get(record.source_key);
      if (existing) {
        return {
          conversation_id: existing.id,
          title: record.title,
          turns_added: 0,
          skipped: ['already ingested']
        };
      }

      const info = this.insertConversation.run({
        source_key: record.source_key,
        title: record.title,
        topic: record.topic,
        setting: record.setting,
        source_type: record.source_type,
        source_path: record.source_path,
        ingested_at: nowIso()
      });
      const conversationId = Number(info.lastInsertRowid);
      const ingestedAt = nowIso();
      record.turns.forEach((turn, index) => {
        this.insertTurn.run({
          conversation_id: conversationId,
          turn_index: index,
          speaker: turn.speaker,
          text: turn.text,
          move: turn.move,
          ingested_at: ingestedAt
        });
      });

      return {
        conversation_id: conversationId,
        title: record.title,
        turns_added: record.turns.length,
        skipped: record.skipped
      };
    });
  }
}

module.exports = {
  ConversationAgent,
  normalizeConversation
};
