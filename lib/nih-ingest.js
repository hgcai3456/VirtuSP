const fs = require('fs');
const path = require('path');
const { counts } = require('./db');
const { searchPubmedPage, fetchPubmed, pace } = require('./pubmed');

const catalogPath = path.join(__dirname, '..', 'data', 'seed', 'illnesses.json');
const defaultCheckpoint = path.join(__dirname, '..', 'data', 'ingest-checkpoint.json');

function checkpointPath(shard) {
  if (!shard) {
    return defaultCheckpoint;
  }

  return path.join(__dirname, '..', 'data', 'ingest-checkpoint-' + shard + '.json');
}

function loadIllnesses() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function illnessQuery(name) {
  return '("' + name + '"[MeSH Terms] OR "' + name + '"[Title/Abstract]) AND hasabstract[text] AND humans[MeSH Terms]';
}

function fallbackQuery(name) {
  return '"' + name + '"[Title/Abstract] AND hasabstract[text]';
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }

  return out;
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

function storeWithRetry(agent, article, extras, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return agent.ingestPublication(article, extras);
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

function emptyState(options) {
  return {
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'running',
    illness_index: 0,
    retstart: 0,
    query_used: '',
    per_illness: options.perIllness,
    chunk: options.chunk,
    delay_ms: options.delay,
    papers: 0,
    facts: 0,
    errors: 0,
    current_illness: '',
    done: [],
    shard: options.shard || 0,
    shards: options.shards || 1
  };
}

async function ingestNih(agent, options = {}) {
  const catalog = loadIllnesses();
  const shard = Number(options.shard) || 0;
  const shards = Math.max(1, Number(options.shards) || 1);
  const illnesses = catalog
    .map((illness, index) => ({ illness, index }))
    .filter((row) => row.index % shards === shard);
  const checkpointFile = options.checkpoint || checkpointPath(shard);
  const perIllness = options.perIllness == null ? 200 : Number(options.perIllness);
  const chunkSize = Math.min(Math.max(Number(options.chunk) || 20, 1), 50);
  const delay = Number(options.delay) || pace.delayMs;
  const onProgress = options.onProgress || (() => {});
  pace.setDelay(delay);

  const saved = options.resume && readCheckpoint(checkpointFile);
  const canResume = saved && Number(saved.shard || 0) === shard && Number(saved.shards || 1) === shards;
  let state = canResume ? saved : emptyState({
    perIllness,
    chunk: chunkSize,
    delay,
    shard,
    shards
  });
  state.status = 'running';
  state.per_illness = perIllness;
  state.chunk = chunkSize;
  state.delay_ms = delay;
  state.shard = shard;
  state.shards = shards;

  const startIndex = Number(state.illness_index) || 0;
  for (let i = startIndex; i < illnesses.length; i += 1) {
    const illness = illnesses[i].illness;
    state.illness_index = i;
    state.current_illness = illness.name;
    if (i !== startIndex) {
      state.retstart = 0;
      state.query_used = '';
    }

    let query = state.query_used || illnessQuery(illness.name);
    let fetchedForIllness = state.retstart || 0;
    const cap = perIllness > 0 ? perIllness : Infinity;

    while (fetchedForIllness < cap) {
      const remaining = cap === Infinity ? chunkSize : Math.min(chunkSize, cap - fetchedForIllness);
      let page;
      try {
        page = await searchPubmedPage(query, { retmax: remaining, retstart: fetchedForIllness });
      } catch (err) {
        state.errors += 1;
        state.last_error = err.message;
        writeCheckpoint(checkpointFile, state);
        throw err;
      }

      if (!page.ids.length && fetchedForIllness === 0 && query === illnessQuery(illness.name)) {
        query = fallbackQuery(illness.name);
        state.query_used = query;
        continue;
      }
      if (!page.ids.length) {
        break;
      }

      let articles = [];
      try {
        articles = await fetchPubmed(page.ids);
      } catch (err) {
        state.errors += 1;
        state.last_error = err.message;
        writeCheckpoint(checkpointFile, state);
        throw err;
      }

      articles.forEach((article) => {
        const stored = storeWithRetry(agent, article, {
          source_type: 'nih',
          source_path: illness.chapter + ':' + illness.name,
          topic: illness.name
        });
        state.papers += 1;
        state.facts += stored.facts_added || 0;
      });

      fetchedForIllness += page.ids.length;
      state.retstart = fetchedForIllness;
      state.query_used = query;
      state.updated_at = new Date().toISOString();
      state.library = counts(agent.db);
      writeCheckpoint(checkpointFile, state);
      onProgress(state, illness, page);

      if (fetchedForIllness >= page.count) {
        break;
      }
    }

    if (!state.done.includes(illness.name)) {
      state.done.push(illness.name);
    }
    state.retstart = 0;
    state.query_used = '';
    state.illness_index = i + 1;
    state.updated_at = new Date().toISOString();
    writeCheckpoint(checkpointFile, state);
  }

  state.status = 'complete';
  state.current_illness = '';
  state.updated_at = new Date().toISOString();
  state.library = counts(agent.db);
  writeCheckpoint(checkpointFile, state);

  return state;
}

function ingestStatus(checkpointFile) {
  return readCheckpoint(checkpointFile || defaultCheckpoint);
}

function ingestStatusAll(shards) {
  const n = Math.max(1, Number(shards) || 2);

  return Array.from({ length: n }, (_, shard) => ({
    shard,
    file: shard ? 'virtusp-' + (shard + 1) + '.sqlite' : 'virtusp.sqlite',
    checkpoint: readCheckpoint(checkpointPath(shard))
  }));
}

module.exports = {
  ingestNih,
  ingestStatus,
  ingestStatusAll,
  loadIllnesses,
  defaultCheckpoint,
  checkpointPath,
  illnessQuery,
  chunk
};
