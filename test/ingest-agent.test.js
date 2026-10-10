const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IngestAgent, extractFacts, includesQuote } = require('../lib/ingest-agent');
const { pace } = require('../lib/pubmed');
const { tempDb } = require('./helpers');

const QUOTE = 'This retrospective cohort study showed metformin adherence was associated with reduced mortality in diabetes patients.';

describe('ingest agent', { concurrency: false }, () => {
  let box;
  let agent;
  let dir;

  before(() => {
    box = tempDb();
    agent = new IngestAgent(box.db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-ingest-'));
    pace.wait = async () => {};
    pace.backoff = async () => {};
  });

  after(() => {
    box.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    delete global.fetch;
  });

  beforeEach(() => {
    box.db.prepare('DELETE FROM medical_data').run();
    box.db.prepare('DELETE FROM journals').run();
  });

  test('extracts only grounded sentences', () => {
    assert.equal(includesQuote(null, null), false);
    assert.equal(includesQuote(QUOTE, 'too short'), false);
    assert.equal(includesQuote(QUOTE, QUOTE), true);
    assert.deepEqual(extractFacts('Short.', 'file'), []);
    const facts = extractFacts(QUOTE + ' No hint here in this fairly long sentence without the words.', 'abstract');
    assert.equal(facts.length, 1);
    assert.match(facts[0].topic, /metformin/);
    assert.match(facts[0].topic, /diabetes/);
    assert.equal(facts[0].section, 'abstract');
  });

  test('rejects a publication without a title and stores grounded facts', () => {
    assert.throws(() => agent.ingestPublication({}), /title/);
    assert.throws(() => agent.ingestPublication(null), /title/);

    const first = agent.ingestPublication({
      title: 'Metformin cohort',
      pmid: '111',
      doi: '10.1/abc',
      authors: 'Ada',
      journal: 'BMJ',
      year: '2001',
      volume: '2',
      issue: '3',
      pages: '4-5',
      synopsis: QUOTE,
      facts: [{
        claim: 'Custom claim about the cohort.',
        quote: QUOTE,
        topic: 'adherence',
        section: 'results',
        population: 'adults',
        intervention: 'metformin',
        outcome: 'mortality',
        evidence_level: 'cohort',
        keywords: 'custom'
      }, {
        quote: 'not in the source text at all and long enough',
        claim: 'not in the source text at all and long enough'
      }, {
        quote: '   ',
        claim: '   '
      }]
    }, { source_type: 'manual', source_path: 'desk', topic: 'diabetes' });

    assert.equal(first.facts_added, 1);
    assert.equal(first.pmid, '111');
    assert.ok(first.skipped.includes('ungrounded: quote is not in the source text'));
    assert.ok(first.skipped.includes('empty claim'));
    const row = box.db.prepare('SELECT * FROM journals WHERE id = ?').get(first.journal_id);
    assert.equal(row.journal_name, 'BMJ');
    assert.equal(row.year, 2001);
    assert.match(row.url, /111/);
    const fact = box.db.prepare('SELECT * FROM medical_data WHERE journal_id = ?').get(first.journal_id);
    assert.match(fact.topic, /diabetes/);
    assert.match(fact.topic, /adherence/);
    assert.equal(fact.keywords, 'custom');
    assert.equal(fact.population, 'adults');

    const again = agent.ingestPublication({
      title: 'Metformin cohort revised',
      pmid: '111',
      abstract: QUOTE
    });
    assert.equal(again.journal_id, first.journal_id);
    assert.equal(again.facts_added, 0);
    assert.equal(box.db.prepare('SELECT title, authors FROM journals WHERE id = ?').get(first.journal_id).authors, 'Ada');

    const byDoi = agent.ingestPublication({
      title: 'DOI match',
      doi: '10.1/abc',
      year: 1999,
      abstract: QUOTE
    });
    assert.equal(byDoi.journal_id, first.journal_id);

    const byTitle = agent.ingestPublication({
      title: 'Title only paper',
      year: 0,
      abstract: QUOTE
    });
    const sameTitle = agent.ingestPublication({
      title: 'Title only paper',
      facts: []
    });
    assert.equal(sameTitle.journal_id, byTitle.journal_id);
    assert.equal(sameTitle.facts_added, 0);

    const extracted = agent.ingestPublication({
      title: 'Extracted paper',
      pmid: '222',
      url: 'https://example.test/p',
      abstract: QUOTE,
      source_type: 'note'
    });
    assert.equal(extracted.facts_added, 1);
    assert.equal(box.db.prepare('SELECT source_type FROM journals WHERE pmid = ?').get('222').source_type, 'note');
  });

  test('ingests json, text, and the seed file', () => {
    const jsonPath = path.join(dir, 'papers.json');
    fs.writeFileSync(jsonPath, JSON.stringify([
      { title: 'From json', abstract: QUOTE, pmid: '333' },
      { title: 'Second json', abstract: 'Too short.' }
    ]));
    const jsonOne = path.join(dir, 'one.json');
    fs.writeFileSync(jsonOne, JSON.stringify({ title: 'Single json', abstract: QUOTE, pmid: '334' }));
    const textPath = path.join(dir, 'note.txt');
    fs.writeFileSync(textPath, QUOTE);

    const fromJson = agent.ingestFile(jsonPath);
    assert.equal(fromJson.length, 2);
    assert.equal(fromJson[0].facts_added, 1);
    assert.equal(fromJson[0].pmid, '333');
    const single = agent.ingestFile(jsonOne);
    assert.equal(single[0].title, 'Single json');
    const fromText = agent.ingestFile(textPath);
    assert.equal(fromText[0].title, 'note');
    assert.equal(fromText[0].facts_added, 1);
    assert.equal(box.db.prepare('SELECT source_path FROM journals WHERE title = ?').get('note').source_path, path.resolve(textPath));

    const seeded = agent.ingestSeed(jsonOne);
    assert.equal(seeded.length, 1);
    const realSeed = agent.ingestSeed();
    assert.ok(realSeed.length >= 1);
    assert.ok(realSeed.some((row) => row.pmid === '11942998'));
  });

  test('ingests pubmed ids and queries through fetch', async () => {
    const xml = `<PubmedArticle><MedlineCitation><PMID>555</PMID><Article><ArticleTitle>Fetched title</ArticleTitle><Abstract><AbstractText>${QUOTE}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>`;
    const queue = [];
    global.fetch = async () => {
      const next = queue.shift();

      return {
        ok: true,
        status: 200,
        json: async () => next.json,
        text: async () => next.text || ''
      };
    };
    queue.push({ text: xml });
    const byId = await agent.ingestPubmedIds(['555']);
    assert.equal(byId[0].pmid, '555');
    assert.equal(byId[0].facts_added, 1);

    queue.push({ json: { esearchresult: { idlist: [], count: '0' } } });
    assert.deepEqual(await agent.ingestPubmedQuery('none', 3), []);
    queue.push({ json: { esearchresult: { idlist: ['555'], count: '1' } } });
    queue.push({ text: xml });
    const byQuery = await agent.ingestPubmedQuery('metformin');
    assert.equal(byQuery.length, 1);
    assert.equal(byQuery[0].facts_added, 0);
  });
});
