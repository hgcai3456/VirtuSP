const fs = require('fs');
const path = require('path');
const { counts } = require('./db');
const { Pace } = require('./pace');
const { loadCorpus, topicsOf, searchConversationsPage } = require('./conversation-search');

const defaultCheckpoint = path.join(__dirname, '..', 'data', 'conversation-checkpoint.json');

function checkpointPath() {
  return process.env.VIRTUSP_CONVERSATION_CHECKPOINT || defaultCheckpoint;
}

function readCheckpoint(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function writeCheckpoint(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sleepSync(ms) {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function storeWithRetry(agent, record, extras, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return agent.ingestConversation(record, extras);
    } catch (err) {
      lastErr = err;
      if (!/locked|busy/i.test(err.message || '')) {
        throw err;
      }
      sleepSync(400 * (i + 1));
    }
  }
  throw lastErr;
}

function chunkSizeOf(value) {
  const requested = Number(value);

  return Math.min(50, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : 10));
}

function topicCap(value) {
  if (value == null || value === '') {
    return Infinity;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return Infinity;
  }

  return n;
}

function clockFor(options) {
  if (options.pace) {
    return options.pace;
  }
  const delay = Number(options.delay);
  const ms = Number.isFinite(delay) && delay > 0 ? delay : 800;

  return new Pace(ms);
}

async function withRateLimit(fn, clock) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const retry = /429|rate|too many/i.test(err.message || '') && attempt < 3;
      if (!retry) {
        throw err;
      }
      await clock.backoff(attempt);
    }
  }
}

function emptyState(options) {
  return {
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'running',
    topic_index: 0,
    retstart: 0,
    per_topic: options.perTopic,
    chunk: options.chunk,
    delay_ms: options.delay,
    conversations: 0,
    turns: 0,
    errors: 0,
    current_topic: '',
    done: []
  };
}

function restore(saved) {
  const state = saved;
  state.done = Array.isArray(state.done) ? state.done : [];
  state.conversations = Number(state.conversations) || 0;
  state.turns = Number(state.turns) || 0;
  state.errors = Number(state.errors) || 0;
  state.topic_index = Number(state.topic_index) || 0;
  state.retstart = Number(state.retstart) || 0;

  return state;
}

function corpusOf(options) {
  if (Array.isArray(options.corpus)) {
    return options.corpus;
  }
  if (options.search && options.topics) {
    return [];
  }

  return loadCorpus(options.file);
}

async function ingestConversations(agent, options = {}) {
  const corpus = corpusOf(options);
  const topics = options.topics || topicsOf(corpus);
  const checkpointFile = options.checkpoint || checkpointPath();
  const size = chunkSizeOf(options.chunk);
  const cap = topicCap(options.perTopic);
  const clock = clockFor(options);
  const search = options.search || ((topic, page) => searchConversationsPage(topic, Object.assign({
    corpus,
    file: options.file
  }, page)));
  const onProgress = options.onProgress || (() => {});
  const saved = options.resume ? readCheckpoint(checkpointFile) : null;
  let state = saved ? restore(saved) : emptyState({
    perTopic: cap === Infinity ? 0 : cap,
    chunk: size,
    delay: clock.delayMs || Number(options.delay) || 800
  });
  state.status = 'running';
  state.chunk = size;
  state.delay_ms = clock.delayMs || state.delay_ms || 800;
  state.per_topic = cap === Infinity ? 0 : cap;

  const start = Number(state.topic_index) || 0;
  for (let i = start; i < topics.length; i += 1) {
    const topic = topics[i];
    state.topic_index = i;
    state.current_topic = topic;
    if (i !== start) {
      state.retstart = 0;
    }

    let fetched = Number(state.retstart) || 0;
    while (fetched < cap) {
      const remaining = cap === Infinity ? size : Math.min(size, cap - fetched);
      await clock.wait();
      let page;
      try {
        page = await withRateLimit(() => Promise.resolve(search(topic, {
          retmax: remaining,
          retstart: fetched
        })), clock);
      } catch (err) {
        state.errors += 1;
        state.last_error = err.message || String(err);
        state.updated_at = new Date().toISOString();
        writeCheckpoint(checkpointFile, state);
        throw err;
      }

      const items = page && Array.isArray(page.items) ? page.items : [];
      if (!items.length) {
        break;
      }

      for (let n = 0; n < items.length; n += 1) {
        let stored;
        try {
          stored = storeWithRetry(agent, items[n], {
            source_type: 'conversation',
            source_path: topic
          });
        } catch (err) {
          state.errors += 1;
          state.last_error = err.message || String(err);
          state.updated_at = new Date().toISOString();
          writeCheckpoint(checkpointFile, state);
          throw err;
        }
        state.conversations += 1;
        state.turns += stored.turns_added || 0;
      }

      fetched += items.length;
      state.retstart = fetched;
      state.updated_at = new Date().toISOString();
      state.library = counts(agent.db);
      writeCheckpoint(checkpointFile, state);
      onProgress(state, topic, page);

      const total = page && Number(page.count);
      if (Number.isFinite(total) && fetched >= total) {
        break;
      }
    }

    if (!state.done.includes(topic)) {
      state.done.push(topic);
    }
    state.retstart = 0;
    state.topic_index = i + 1;
    state.updated_at = new Date().toISOString();
    writeCheckpoint(checkpointFile, state);
  }

  state.status = 'complete';
  state.current_topic = '';
  state.updated_at = new Date().toISOString();
  state.library = counts(agent.db);
  writeCheckpoint(checkpointFile, state);

  return state;
}

function ingestStatus(file) {
  return readCheckpoint(file || checkpointPath());
}

module.exports = {
  ingestConversations,
  ingestStatus,
  checkpointPath,
  defaultCheckpoint,
  chunkSizeOf,
  topicCap
};
