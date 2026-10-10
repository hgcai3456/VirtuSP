const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pace } = require('../lib/pace');
const {
  ingestConversations,
  ingestStatus,
  checkpointPath,
  defaultCheckpoint,
  chunkSizeOf,
  topicCap
} = require('../lib/conversation-ingest');
const {
  loadCorpus,
  topicsOf,
  searchConversationsPage,
  defaultCorpus
} = require('../lib/conversation-search');
const { ConversationAgent } = require('../lib/conversation-agent');
const { isStyleTurn } = require('../lib/conversation-style');
const { tempDb } = require('./helpers');

function quiet() {
  return {
    wait: async () => {},
    backoff: async () => {}
  };
}

function record(key, topic) {
  return {
    source_key: key,
    title: key,
    topic: topic === undefined ? 'greeting' : topic,
    turns: [{ speaker: 'patient', text: 'Yeah.', move: 'ack' }]
  };
}

describe('conversation ingest', { concurrency: false }, () => {
  let box;
  let dir;
  const realWait = Atomics.wait;
  let envCheckpoint;

  before(() => {
    box = tempDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-convo-'));
    envCheckpoint = process.env.VIRTUSP_CONVERSATION_CHECKPOINT;
    Atomics.wait = () => 'ok';
  });

  after(() => {
    Atomics.wait = realWait;
    if (envCheckpoint == null) delete process.env.VIRTUSP_CONVERSATION_CHECKPOINT;
    else process.env.VIRTUSP_CONVERSATION_CHECKPOINT = envCheckpoint;
    box.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function file(name) {
    return path.join(dir, name);
  }

  function agent(behavior) {
    return {
      db: box.db,
      ingestConversation(row) {
        if (behavior) {
          return behavior(row);
        }

        return { turns_added: 1 };
      }
    };
  }

  test('searches the corpus in pages', () => {
    assert.equal(chunkSizeOf(undefined), 10);
    assert.equal(chunkSizeOf(0), 10);
    assert.equal(chunkSizeOf('nope'), 10);
    assert.equal(chunkSizeOf(0.2), 1);
    assert.equal(chunkSizeOf(100), 50);
    assert.equal(chunkSizeOf(8), 8);
    assert.equal(topicCap(null), Infinity);
    assert.equal(topicCap(undefined), Infinity);
    assert.equal(topicCap(''), Infinity);
    assert.equal(topicCap(0), Infinity);
    assert.equal(topicCap(-2), Infinity);
    assert.equal(topicCap('nope'), Infinity);
    assert.equal(topicCap('3'), 3);
    assert.deepEqual(topicsOf(null), []);
    assert.deepEqual(topicsOf([{ topic: '' }, null, { topic: 'greeting' }, { topic: 'greeting' }]), ['greeting']);

    const corpus = [null, { topic: 'other' }, record('a', 'greeting'), record('b', 'greeting'), record('c', '')];
    assert.equal(searchConversationsPage('', { corpus, retstart: -3, retmax: 0 }).count, 1);
    assert.equal(searchConversationsPage('greeting', { corpus, retstart: 0, retmax: 1 }).items.length, 1);
    assert.equal(searchConversationsPage('greeting', { corpus, retstart: 'nope', retmax: 'nope' }).items.length, 2);
    assert.equal(searchConversationsPage('greeting', { corpus, retstart: 5, retmax: 100 }).items.length, 0);
    assert.equal(searchConversationsPage('missing', { corpus, retmax: 0.2 }).items.length, 0);

    const corpusFile = file('corpus.json');
    fs.writeFileSync(corpusFile, JSON.stringify([record('file-1', 'greeting')]));
    assert.equal(searchConversationsPage('greeting', { file: corpusFile }).items[0].source_key, 'file-1');
    fs.writeFileSync(file('object.json'), '{}');
    assert.deepEqual(loadCorpus(file('object.json')), []);
    assert.throws(() => loadCorpus(file('missing.json')));
    assert.equal(path.basename(defaultCorpus), 'conversations.json');
    const seeded = loadCorpus();
    assert.ok(seeded.length >= 32);
    assert.ok(topicsOf(seeded).includes('greeting'));
    assert.ok(seeded.some((row) => row.turns.some((turn) => isStyleTurn(turn))));
  });

  test('pages, caps, resumes, and completes', async () => {
    const checkpoint = file('run.json');
    const seen = [];
    const state = await ingestConversations(agent(), {
      checkpoint,
      corpus: [record('g1'), record('g2'), record('g3'), record('a1', 'acknowledgement')],
      chunk: 2,
      delay: 10,
      pace: quiet(),
      onProgress(progress, topic, page) {
        seen.push(topic + ':' + progress.retstart + ':' + page.count);
      }
    });
    assert.deepEqual(seen, ['greeting:2:3', 'greeting:3:3', 'acknowledgement:1:1']);
    assert.equal(state.status, 'complete');
    assert.equal(state.conversations, 4);
    assert.equal(state.turns, 4);
    assert.equal(state.current_topic, '');
    assert.deepEqual(state.done, ['greeting', 'acknowledgement']);

    const capped = await ingestConversations(agent(() => ({ turns_added: 0 })), {
      checkpoint: file('cap.json'),
      topics: ['greeting'],
      corpus: [record('c1'), record('c2'), record('c3')],
      perTopic: 2,
      chunk: 10,
      pace: quiet()
    });
    assert.equal(capped.conversations, 2);
    assert.equal(capped.turns, 0);
    assert.equal(capped.per_topic, 2);

    const wide = [];
    await ingestConversations(agent(), {
      checkpoint: file('wide.json'),
      topics: ['greeting'],
      corpus: [record('w1')],
      chunk: 100,
      pace: { delayMs: 15, wait: async () => {}, backoff: async () => {} },
      onProgress(progress, topic, page) {
        wide.push(page);
      }
    });
    assert.equal(wide[0].items.length, 1);

    fs.writeFileSync(checkpoint, JSON.stringify({
      topic_index: 0,
      retstart: 2,
      done: ['greeting'],
      conversations: 3,
      turns: '4',
      errors: 0,
      delay_ms: 40
    }));
    const resumedCalls = [];
    const resumed = await ingestConversations(agent(), {
      checkpoint,
      resume: true,
      topics: ['greeting', 'acknowledgement'],
      pace: quiet(),
      search(topic, page) {
        resumedCalls.push(topic + ':' + page.retstart);
        if (topic === 'greeting' && page.retstart === 2) {
          return { count: 3, items: [record('late')] };
        }

        return { items: [] };
      }
    });
    assert.deepEqual(resumedCalls, ['greeting:2', 'acknowledgement:0']);
    assert.equal(resumed.conversations, 4);
    assert.equal(resumed.turns, 5);
    assert.deepEqual(resumed.done, ['greeting', 'acknowledgement']);

    fs.writeFileSync(checkpoint, '{');
    const fresh = await ingestConversations(agent(), {
      checkpoint,
      resume: true,
      topics: ['solo'],
      pace: quiet(),
      search() {
        return null;
      }
    });
    assert.equal(fresh.conversations, 0);
    assert.deepEqual(fresh.done, ['solo']);

    fs.writeFileSync(checkpoint, JSON.stringify({
      topic_index: '1',
      done: 'nope',
      delay_ms: 0
    }));
    const skipped = await ingestConversations(agent(), {
      checkpoint,
      resume: true,
      topics: ['only'],
      pace: quiet(),
      search() {
        throw new Error('should not search');
      }
    });
    assert.equal(skipped.status, 'complete');
    assert.equal(skipped.conversations, 0);
    assert.deepEqual(skipped.done, []);
    assert.equal(skipped.delay_ms, 800);

    const ignored = [];
    fs.writeFileSync(checkpoint, JSON.stringify({ topic_index: 9, done: ['old'] }));
    await ingestConversations(agent(), {
      checkpoint,
      corpus: [record('new-1', 'fresh')],
      chunk: 'nope',
      pace: quiet(),
      search(topic) {
        ignored.push(topic);

        return { count: 0, items: [] };
      }
    });
    assert.deepEqual(ignored, ['fresh']);
  });

  test('writes the checkpoint and retries rate limits and locked writes', async () => {
    const checkpoint = file('err.json');
    await assert.rejects(ingestConversations(agent(), {
      checkpoint,
      topics: ['greeting'],
      pace: quiet(),
      search() {
        throw new Error('search down');
      }
    }), /search down/);
    assert.match(fs.readFileSync(checkpoint, 'utf8'), /search down/);

    const blank = file('blank.json');
    await assert.rejects(ingestConversations(agent(), {
      checkpoint: blank,
      topics: ['greeting'],
      pace: quiet(),
      search() {
        throw new Error('');
      }
    }), (err) => err.message === '');
    assert.match(fs.readFileSync(blank, 'utf8'), /Error/);

    let tries = 0;
    const limited = file('limit.json');
    const clock = quiet();
    let backs = 0;
    clock.backoff = async () => {
      backs += 1;
    };
    await ingestConversations(agent(), {
      checkpoint: limited,
      topics: ['greeting'],
      pace: clock,
      search() {
        tries += 1;
        if (tries < 3) {
          throw new Error('429 rate limit');
        }

        return { count: 1, items: [record('ok')] };
      }
    });
    assert.equal(tries, 3);
    assert.equal(backs, 2);

    tries = 0;
    backs = 0;
    await assert.rejects(ingestConversations(agent(), {
      checkpoint: limited,
      topics: ['greeting'],
      pace: clock,
      search() {
        tries += 1;
        throw new Error('too many requests');
      }
    }), /too many/);
    assert.equal(tries, 4);
    assert.equal(backs, 3);

    const nested = path.join(dir, 'nested', 'lock.json');
    tries = 0;
    await assert.rejects(ingestConversations({
      db: box.db,
      ingestConversation() {
        tries += 1;
        throw new Error('database is locked');
      }
    }, {
      checkpoint: nested,
      topics: ['greeting'],
      pace: quiet(),
      search() {
        return { count: 1, items: [record('lock')] };
      }
    }), /locked/);
    assert.equal(tries, 8);
    assert.equal(fs.existsSync(nested), true);

    tries = 0;
    await ingestConversations({
      db: box.db,
      ingestConversation() {
        tries += 1;
        if (tries === 1) {
          throw new Error('database is busy');
        }

        return { turns_added: 2 };
      }
    }, {
      checkpoint: nested,
      topics: ['greeting'],
      pace: quiet(),
      search() {
        return { items: [record('busy')], count: 1 };
      }
    });
    assert.equal(tries, 2);

    const shaped = await ingestConversations(agent(), {
      checkpoint: file('shape.json'),
      topics: ['greeting'],
      pace: quiet(),
      search() {
        return { items: 'nope', count: 4 };
      }
    });
    assert.equal(shaped.conversations, 0);

    await assert.rejects(ingestConversations({
      db: box.db,
      ingestConversation() {
        throw new Error('');
      }
    }, {
      checkpoint: nested,
      topics: ['greeting'],
      pace: quiet(),
      search() {
        return { count: 1, items: [record('blank-err')] };
      }
    }), (err) => err.message === '');

    await assert.rejects(ingestConversations({
      db: box.db,
      ingestConversation() {
        const err = new Error('bad row');
        throw err;
      }
    }, {
      checkpoint: nested,
      topics: ['greeting'],
      chunk: 1,
      perTopic: '',
      pace: quiet(),
      search() {
        return { count: 1, items: [{ title: '' }] };
      }
    }), /bad row/);
  });

  test('ingests the seed corpus and a caller-supplied file', async () => {
    const checkpoint = file('seed.json');
    const real = new ConversationAgent(box.db);
    const beforeTurns = box.db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get().n;
    const state = await ingestConversations(real, {
      checkpoint,
      chunk: 10,
      perTopic: 0,
      pace: quiet()
    });
    assert.equal(state.status, 'complete');
    assert.ok(state.conversations >= 32);
    assert.ok(state.turns > state.conversations);
    const after = box.db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get().n;
    assert.ok(after > beforeTurns);

    const again = await ingestConversations(real, {
      checkpoint: file('again.json'),
      pace: quiet(),
      chunk: 50
    });
    assert.equal(again.turns, 0);
    assert.equal(box.db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get().n, after);

    const one = file('one.json');
    fs.writeFileSync(one, JSON.stringify([record('from-file', 'bridge')]));
    const filed = await ingestConversations(new ConversationAgent(box.db), {
      checkpoint: file('filed.json'),
      file: one,
      pace: quiet()
    });
    assert.equal(filed.conversations, 1);
    const stored = box.db.prepare('SELECT * FROM conversations WHERE source_key = ?').get('from-file');
    assert.equal(stored.source_type, 'conversation');
    assert.equal(stored.source_path, 'bridge');

    fs.writeFileSync(file('obj.json'), '{"topic":"nope"}');
    const empty = await ingestConversations(agent(), {
      checkpoint: file('obj-run.json'),
      file: file('obj.json'),
      delay: 0,
      pace: undefined
    });
    assert.equal(empty.conversations, 0);

    const called = [];
    await ingestConversations(agent(), {
      checkpoint: file('search-file.json'),
      file: one,
      delay: 40,
      pace: quiet(),
      search(topic) {
        called.push(topic);

        return { items: [], count: 0 };
      }
    });
    assert.deepEqual(called, ['bridge']);

    await ingestConversations(agent(), {
      checkpoint: file('topics-only.json'),
      topics: ['solo'],
      delay: 0,
      pace: quiet(),
      search() {
        return { count: 1, items: [] };
      }
    });

    delete process.env.VIRTUSP_CONVERSATION_CHECKPOINT;
    assert.equal(checkpointPath(), defaultCheckpoint);
    process.env.VIRTUSP_CONVERSATION_CHECKPOINT = file('env.json');
    assert.equal(checkpointPath(), file('env.json'));
    assert.equal(ingestStatus(file('missing.json')), null);
    fs.writeFileSync(file('bad.json'), '{');
    assert.equal(ingestStatus(file('bad.json')), null);
    fs.writeFileSync(file('env.json'), JSON.stringify({ status: 'running' }));
    assert.equal(ingestStatus().status, 'running');
    assert.equal(ingestStatus('').status, 'running');
    delete process.env.VIRTUSP_CONVERSATION_CHECKPOINT;

    const target = defaultCheckpoint;
    const backup = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const origWait = Pace.prototype.wait;
    const origBackoff = Pace.prototype.backoff;
    Pace.prototype.wait = async () => {};
    Pace.prototype.backoff = async () => {};
    try {
      const done = await ingestConversations(agent(), {
        corpus: [],
        delay: 0
      });
      assert.equal(done.status, 'complete');
      assert.equal(fs.existsSync(target), true);
      await ingestConversations(agent(), { corpus: [], delay: 40 });
      await ingestConversations(agent(), { corpus: [] });
    } finally {
      Pace.prototype.wait = origWait;
      Pace.prototype.backoff = origBackoff;
      if (backup) fs.writeFileSync(target, backup);
      else fs.rmSync(target, { force: true });
    }
  });
});
