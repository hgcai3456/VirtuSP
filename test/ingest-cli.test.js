const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pace } = require('../lib/pubmed');
const { checkpointPath } = require('../lib/nih-ingest');
const { tempDb } = require('./helpers');

const QUOTE = 'This retrospective cohort study showed metformin adherence was associated with reduced mortality in diabetes patients.';

describe('ingest cli', { concurrency: false }, () => {
  const realArgv = process.argv.slice();
  const realExit = process.exit;
  const realLog = console.log;
  const realError = console.error;
  let box;
  let dir;
  const queue = [];

  before(() => {
    box = tempDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-cli-'));
    process.env.VIRTUSP_DB = box.dbPath;
    pace.wait = async () => {};
    pace.backoff = async () => {};
    global.fetch = async (url) => {
      const href = String(url);
      const next = queue.shift();
      if (href.includes('esearch')) {
        const ids = next && next.ids ? next.ids : [];

        return {
          ok: true,
          status: 200,
          json: async () => ({ esearchresult: { idlist: ids, count: String(ids.length) } }),
          text: async () => ''
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => (next && next.text) || `<PubmedArticle><MedlineCitation><PMID>777</PMID><Article><ArticleTitle>CLI paper</ArticleTitle><Abstract><AbstractText>${QUOTE}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>`
      };
    };
  });

  after(() => {
    process.argv = realArgv;
    process.exit = realExit;
    console.log = realLog;
    console.error = realError;
    delete process.env.VIRTUSP_DB;
    delete global.fetch;
    box.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function run(args) {
    const logs = [];
    const errors = [];
    let code = null;
    console.log = (...parts) => logs.push(parts.map(String).join(' '));
    console.error = (...parts) => errors.push(parts.map(String).join(' '));
    process.exit = (status) => {
      code = status == null ? 0 : status;
    };
    process.argv = ['node', path.join(__dirname, '..', 'agents', 'ingest.js'), ...args];
    const loaded = require.resolve('../agents/ingest.js');
    delete require.cache[loaded];
    require('../agents/ingest.js');
    const start = Date.now();
    while (code == null && Date.now() - start < 60000) {
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    return { logs: logs.join('\n'), errors: errors.join('\n'), code };
  }

  test('prints help, status, seed, file, pubmed, and query results', async () => {
    const help = await run([]);
    assert.equal(help.code, 0);
    assert.match(help.logs, /VirtuSP ingest agent/);

    const status = await run(['--status']);
    assert.equal(status.code, 0);
    assert.match(status.logs, /virtusp/);

    const wide = await run(['--status', '--shards', '3']);
    assert.equal(wide.code, 0);

    const file = path.join(dir, 'paper.json');
    fs.writeFileSync(file, JSON.stringify({
      title: 'CLI json',
      pmid: '4242',
      abstract: QUOTE,
      facts: [
        { claim: 'Grounded', quote: QUOTE },
        { claim: 'Not in the source and definitely long enough', quote: 'Not in the source and definitely long enough' }
      ]
    }));
    const ingested = await run(['--file', file]);
    assert.equal(ingested.code, 0);
    assert.match(ingested.logs, /added 1/);
    assert.match(ingested.logs, /PMID 4242/);
    assert.match(ingested.logs, /skipped/);

    const plain = path.join(dir, 'empty.txt');
    fs.writeFileSync(plain, 'No grounded fact in this short note.');
    const empty = await run(['--file', plain]);
    assert.match(empty.logs, /no new facts/);
    assert.doesNotMatch(empty.logs, /PMID/);

    const seeded = await run(['--seed']);
    assert.equal(seeded.code, 0);
    assert.match(seeded.logs, /journals=/);

    queue.push({ ids: ['777'] });
    const pubmed = await run(['--pubmed', '777']);
    assert.equal(pubmed.code, 0);
    assert.match(pubmed.logs, /CLI paper/);

    queue.push({ ids: [] });
    const none = await run(['--query', 'none', '--limit', '2']);
    assert.equal(none.code, 0);

    queue.push({ ids: ['777'] });
    const found = await run(['--query', 'metformin']);
    assert.match(found.logs, /journals=/);

    const broken = await run(['--file']);
    assert.equal(broken.code, 1);
    assert.match(broken.errors, /ENOENT|no such file|undefined/i);
  });

  test('runs a bounded NIH ingest without keeping the checkpoint change', async () => {
    const target = checkpointPath(0);
    const backup = fs.existsSync(target) ? fs.readFileSync(target) : null;
    try {
      box.db.prepare('DELETE FROM medical_data').run();
      box.db.prepare('DELETE FROM journals').run();
      queue.push({ ids: ['1'] }, { text: '<PubmedArticleSet></PubmedArticleSet>' });
      const named = await run([
        '--nih',
        '--shards', '1000',
        '--shard', '0',
        '--per-illness', '1',
        '--chunk', '1',
        '--delay', '10'
      ]);
      assert.equal(named.code, 0);
      assert.match(named.logs, /NIH ingest/);
      assert.match(named.logs, /journals=0/);

      box.db.prepare(`
        INSERT INTO journals (title, source_type, ingested_at)
        VALUES ('Seeded', 'file', '2020-01-01T00:00:00.000Z')
      `).run();
      queue.push({ ids: ['1'] }, { text: '' });
      const alias = await run([
        '--all-illnesses',
        '--all',
        '--shards', '1000',
        '--shard', '0',
        '--chunk', '1'
      ]);
      assert.equal(alias.code, 0);
      assert.match(alias.logs, /journals=1/);

      const paced = await run([
        '--nih',
        '--per-illness', '1',
        '--chunk', '1'
      ]);
      assert.equal(paced.code, 0);
      assert.match(paced.logs, /NIH ingest/);
    } finally {
      if (backup) fs.writeFileSync(target, backup);
      else fs.rmSync(target, { force: true });
    }
  });
});
