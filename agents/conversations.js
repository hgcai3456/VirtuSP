#!/usr/bin/env node
const { openDb, counts } = require('../lib/db');
const { ConversationAgent } = require('../lib/conversation-agent');
const { ingestConversations, ingestStatus } = require('../lib/conversation-ingest');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) {
    return fallback;
  }

  return process.argv[i + 1];
}

function has(name) {
  return process.argv.includes(name);
}

async function main() {
  if (has('--help')) {
    console.log('VirtuSP conversation ingest — search the corpus in chunks so the pace stays under the rate limit');
    console.log('');
    console.log('  node agents/conversations.js --chunk 10 --delay 800');
    console.log('  node agents/conversations.js --resume --chunk 10 --delay 800');
    console.log('  node agents/conversations.js --status');
    console.log('  node agents/orchestrator.js --conversations');
    return;
  }

  if (has('--status')) {
    console.log(JSON.stringify(ingestStatus(), null, 2));
    return;
  }

  const db = openDb();
  const agent = new ConversationAgent(db);
  const state = await ingestConversations(agent, {
    resume: has('--resume'),
    chunk: Number(arg('--chunk') || 10),
    delay: Number(arg('--delay') || 800),
    perTopic: has('--per-topic') ? Number(arg('--per-topic')) : 0,
    file: has('--file') ? arg('--file') : undefined,
    onProgress(progress, topic, page) {
      const added = page && page.items ? page.items.length : 0;
      console.log(
        topic
        + ' +' + added
        + ' (topic ' + progress.retstart + '/' + ((page && page.count) || 0) + ')'
        + ' conversations=' + progress.conversations
        + ' turns=' + progress.turns
      );
    }
  });
  const n = counts(db);
  console.log('');
  console.log(
    'Conversation ingest ' + state.status
    + ' · conversations=' + state.conversations
    + ' turns=' + state.turns
    + ' errors=' + state.errors
  );
  console.log('conversations=' + n.conversations + ' conversation_turns=' + n.conversation_turns);
  db.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
