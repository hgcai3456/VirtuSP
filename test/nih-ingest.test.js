const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ingestNih,
  ingestStatus,
  ingestStatusAll,
  loadIllnesses,
  checkpointPath,
  illnessQuery,
  chunk
} = require('../lib/nih-ingest');
const { pace } = require('../lib/pubmed');
const { tempDb } = require('./helpers');

function page(ids, count) {
  return { json: { esearchresult: { idlist: ids, count: String(count) } } };
}

function articleXml(title) {
  return `<PubmedArticle><MedlineCitation><PMID>1</PMID><Article><ArticleTitle>${title}</ArticleTitle></Article></MedlineCitation></PubmedArticle>`;
}

describe('nih ingest', { concurrency: false }, () => {
  let box;
  let dir;
  const queue = [];
  const realWait = Atomics.wait;
  let catalog;

  before(() => {
    box = tempDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-nih-'));
    catalog = loadIllnesses();
    pace.wait = async () => {};
    pace.backoff = async () => {};
    Atomics.wait = () => 'ok';
    global.fetch = async () => {
      const next = queue.shift() || page([], 0);

      return {
        ok: true,
        status: 200,
        json: async () => next.json || {},
        text: async () => next.text || ''
      };
    };
  });

  after(() => {
    Atomics.wait = realWait;
    delete global.fetch;
    box.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function file(name) {
    return path.join(dir, name);
  }

  function agent(behavior) {
    return {
      db: box.db,
      ingestPublication() {
        if (behavior) {
          return behavior();
        }

        return { facts_added: 2 };
      }
    };
  }

  test('checkpoint helpers and chunking', () => {
    assert.match(illnessQuery('asthma'), /MeSH Terms/);
    assert.deepEqual(chunk(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
    assert.deepEqual(chunk([], 5), []);
    assert.match(checkpointPath(0), /ingest-checkpoint\.json$/);
    assert.match(checkpointPath(1), /ingest-checkpoint-1\.json$/);
    assert.equal(ingestStatus(file('missing.json')), null);
    fs.writeFileSync(file('bad.json'), '{');
    assert.equal(ingestStatus(file('bad.json')), null);
    const nested = path.join(dir, 'nested', 'state.json');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, JSON.stringify({ status: 'running', shard: 0 }));
    assert.equal(ingestStatus(nested).status, 'running');
    assert.ok(ingestStatus('') == null || typeof ingestStatus('') === 'object');
    assert.ok(ingestStatus() == null || typeof ingestStatus() === 'object');
    const all = ingestStatusAll(0);
    assert.equal(all.length, 2);
    assert.equal(all[0].file, 'virtusp.sqlite');
    assert.match(all[1].file, /virtusp-2/);
    assert.equal(ingestStatusAll(1).length, 1);
  });

  test('falls back, pages, resumes, and completes', async () => {
    const checkpoint = file('run.json');
    queue.push(page([], 0), page(['1'], 1), { text: articleXml('First paper') });
    const calls = [];
    const state = await ingestNih(agent(() => {
      calls.push('store');

      return { facts_added: 3 };
    }), {
      checkpoint,
      shard: 0,
      shards: catalog.length,
      perIllness: 1,
      chunk: 100,
      delay: 0,
      onProgress(progress, illness, result) {
        assert.equal(illness.name, catalog[0].name);
        assert.equal(result.ids.length, 1);
        assert.equal(progress.library.journals, 0);
      }
    });
    assert.equal(calls.length, 1);
    assert.equal(state.status, 'complete');
    assert.equal(state.papers, 1);
    assert.equal(state.facts, 3);
    assert.ok(state.done.includes(catalog[0].name));
    assert.equal(state.current_illness, '');

    const second = file('two.json');
    queue.push(page(['9', '8'], 3), { text: articleXml('A') }, page(['7'], 3), { text: articleXml('B') });
    const progressed = [];
    await ingestNih(agent(), {
      checkpoint: second,
      shard: 1,
      shards: catalog.length,
      perIllness: 5,
      chunk: 2,
      delay: 50,
      onProgress(progress) {
        progressed.push(progress.retstart);
      }
    });
    assert.deepEqual(progressed, [2, 3]);

    const unlimited = file('zero.json');
    queue.push(page(['1'], 1), { text: articleXml('C') });
    const zero = await ingestNih(agent(() => ({ facts_added: 0 })), {
      checkpoint: unlimited,
      shard: 0,
      shards: catalog.length,
      perIllness: 0,
      chunk: 0.2
    });
    assert.equal(zero.facts, 0);
    assert.equal(zero.papers, 1);

    fs.writeFileSync(checkpoint, JSON.stringify({
      shard: 0,
      shards: catalog.length,
      illness_index: 0,
      retstart: 4,
      query_used: 'custom query',
      done: [catalog[0].name],
      papers: 0,
      facts: 0,
      errors: 0
    }));
    queue.push(page([], 0));
    const resumed = await ingestNih(agent(), {
      checkpoint,
      resume: true,
      shard: 0,
      shards: catalog.length,
      perIllness: 10,
      chunk: 1,
      delay: 20
    });
    assert.equal(resumed.papers, 0);
    assert.deepEqual(resumed.done, [catalog[0].name]);

    fs.writeFileSync(checkpoint, JSON.stringify({ shard: 9, shards: 9, illness_index: 0 }));
    queue.push(page([], 0), page([], 0));
    await ingestNih(agent(), {
      checkpoint,
      resume: true,
      shard: 0,
      shards: catalog.length,
      perIllness: null,
      chunk: 1,
      delay: 20
    });

    const wide = Math.max(1, catalog.length - 1);
    const both = file('both.json');
    queue.push(page([], 0), page([], 0), page([], 0), page([], 0));
    const resets = [];
    await ingestNih({
      db: box.db,
      ingestPublication() {
        return { facts_added: 1 };
      }
    }, {
      checkpoint: both,
      shard: 0,
      shards: wide,
      perIllness: 1,
      chunk: 1,
      delay: 15,
      onProgress(progress) {
        resets.push(progress.illness_index);
      }
    });
    assert.equal(resets.length, 0);
  });

  test('writes the checkpoint and rethrows search or fetch failures', async () => {
    const checkpoint = file('err.json');
    global.fetch = async () => {
      throw new Error('search down');
    };
    await assert.rejects(ingestNih(agent(), {
      checkpoint,
      shard: 0,
      shards: catalog.length,
      perIllness: 1,
      chunk: 1,
      delay: 10
    }), /search down/);
    assert.match(fs.readFileSync(checkpoint, 'utf8'), /search down/);

    let fetchCalls = 0;
    global.fetch = async (url) => {
      fetchCalls += 1;
      if (String(url).includes('efetch')) {
        throw new Error('fetch down');
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ esearchresult: { idlist: ['1'], count: '1' } }),
        text: async () => ''
      };
    };
    await assert.rejects(ingestNih(agent(), {
      checkpoint,
      shard: 'nope',
      shards: 'nope',
      chunk: 0,
      perIllness: 1
    }), /fetch down/);
    assert.ok(fetchCalls >= 1);

    const locked = file('lock.json');
    let tries = 0;
    global.fetch = async (url) => {
      if (String(url).includes('efetch')) {
        return { ok: true, status: 200, json: async () => ({}), text: async () => articleXml('Locked') };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ esearchresult: { idlist: ['1'], count: '1' } }),
        text: async () => ''
      };
    };
    await assert.rejects(ingestNih({
      db: box.db,
      ingestPublication() {
        tries += 1;
        const err = new Error('database is locked');
        throw err;
      }
    }, {
      checkpoint: locked,
      shard: 0,
      shards: catalog.length,
      perIllness: 1,
      chunk: 1,
      delay: 10
    }), /locked/);
    assert.equal(tries, 8);

    tries = 0;
    await ingestNih({
      db: box.db,
      ingestPublication() {
        tries += 1;
        if (tries === 1) {
          throw new Error('database is busy');
        }

        return { facts_added: 1 };
      }
    }, {
      checkpoint: locked,
      shard: 0,
      shards: catalog.length,
      perIllness: 1,
      chunk: 1,
      delay: 10
    });
    assert.equal(tries, 2);

    await assert.rejects(ingestNih({
      db: box.db,
      ingestPublication() {
        const err = new Error('');
        throw err;
      }
    }, {
      checkpoint: locked,
      shard: 0,
      shards: catalog.length,
      perIllness: 1,
      chunk: 1,
      delay: 10
    }), (err) => err.message === '');
  });

  test('default checkpoint path is restored after a one-illness run', async () => {
    const target = checkpointPath(0);
    const backup = fs.existsSync(target) ? fs.readFileSync(target) : null;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ esearchresult: { idlist: [], count: '0' } }),
      text: async () => ''
    });
    try {
      const state = await ingestNih(agent(), {
        shard: 0,
        shards: catalog.length,
        perIllness: 1,
        chunk: 1,
        delay: 10
      });
      assert.equal(state.status, 'complete');
      assert.equal(fs.existsSync(target), true);
    } finally {
      if (backup) fs.writeFileSync(target, backup);
      else fs.rmSync(target, { force: true });
    }
  });
});
