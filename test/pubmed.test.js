const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  searchPubmed,
  searchPubmedPage,
  fetchPubmed,
  pace
} = require('../lib/pubmed');

const XML = `
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>11942998</PMID>
      <Article>
        <ArticleTitle>Adherence <i>study</i> &amp; more</ArticleTitle>
        <Pagination><MedlinePgn>279-284</MedlinePgn></Pagination>
        <Journal>
          <JournalIssue>
            <Volume>19</Volume>
            <Issue>4</Issue>
            <PubDate><Year>2002</Year></PubDate>
          </JournalIssue>
          <Title>Diabetic Medicine</Title>
          <ISOAbbreviation>Diabetes Med</ISOAbbreviation>
        </Journal>
        <AuthorList>
          <Author><LastName>Donnan</LastName><ForeName>PT</ForeName></Author>
          <Author><LastName>Morris</LastName><Initials>AD</Initials></Author>
          <Author><CollectiveName>Group</CollectiveName></Author>
        </AuthorList>
        <Abstract>
          <AbstractText Label="AIM">Patients showed metformin adherence.</AbstractText>
          <AbstractText>Plain sentence.</AbstractText>
          <AbstractText Label="EMPTY"></AbstractText>
        </Abstract>
        <ELocationID>10.1000/xyz</ELocationID>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <Article>
        <Journal><ISOAbbreviation>Only Iso</ISOAbbreviation></Journal>
        <AuthorList><Author><LastName></LastName></Author></AuthorList>
        <ArticleTitle></ArticleTitle>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>42</PMID>
      <Article>
        <ArticleTitle>Second paper</ArticleTitle>
        <Journal><Title></Title><ISOAbbreviation>Iso Journal</ISOAbbreviation></Journal>
        <AuthorList><Author><ForeName>Ann</ForeName></Author></AuthorList>
        <PubDate><Year>not-a-year</Year></PubDate>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

describe('pubmed', { concurrency: false }, () => {
  let calls;

  before(() => {
    calls = [];
    pace.wait = async () => {};
    pace.backoff = async () => {};
    global.fetch = async (url) => {
      const href = String(url);
      calls.push(href);
      const next = queue.shift();
      if (!next) {
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      }
      if (next.throw) {
        throw next.throw;
      }

      return {
        ok: next.status ? next.status >= 200 && next.status < 300 : true,
        status: next.status || 200,
        json: async () => (next.json === undefined ? {} : next.json),
        text: async () => next.text || ''
      };
    };
  });

  after(() => {
    delete global.fetch;
  });

  const queue = [];

  test('parses articles and searches a page', async () => {
    queue.push({
      json: { esearchresult: { idlist: [11942998, null], count: '12' } }
    });
    const page = await searchPubmedPage('metformin', { retmax: 500, retstart: 10, sort: 'pub date' });
    assert.deepEqual(page.ids, ['11942998', 'null']);
    assert.equal(page.count, 12);
    assert.equal(page.retstart, 10);
    assert.equal(page.retmax, 200);
    assert.match(calls.at(-1), /retmax=200/);
    assert.match(calls.at(-1), /retstart=10/);
    assert.match(calls.at(-1), /sort=pub\+date|sort=pub%20date/);

    queue.push({ json: null });
    const empty = await searchPubmedPage(undefined, { retmax: 0, retstart: 'nope' });
    assert.deepEqual(empty.ids, []);
    assert.equal(empty.count, 0);
    assert.equal(empty.retmax, 20);

    queue.push({ json: { esearchresult: {} } });
    const blank = await searchPubmedPage('', { retmax: 15 });
    assert.deepEqual(blank.ids, []);
    assert.equal(blank.retmax, 15);
    assert.match(calls.at(-1), /esearch/);

    queue.push({ json: { esearchresult: { idlist: ['7'], count: 'x' } } });
    assert.deepEqual(await searchPubmed('metformin', 0), ['7']);
    queue.push({ json: { esearchresult: { idlist: ['8'], count: '1' } } });
    assert.deepEqual(await searchPubmed('metformin', 400), ['8']);
    queue.push({ json: { esearchresult: { idlist: [], count: '0' } } });
    assert.deepEqual(await searchPubmed('none'), []);
  });

  test('fetches and drops articles without a title', async () => {
    assert.deepEqual(await fetchPubmed([]), []);
    assert.deepEqual(await fetchPubmed(['', null]), []);
    queue.push({ text: XML });
    const rows = await fetchPubmed('11942998');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].pmid, '11942998');
    assert.equal(rows[0].doi, '10.1000/xyz');
    assert.match(rows[0].title, /Adherence study & more/);
    assert.match(rows[0].authors, /Donnan PT/);
    assert.match(rows[0].authors, /Morris AD/);
    assert.equal(rows[0].journal_name, 'Diabetic Medicine');
    assert.equal(rows[0].year, 2002);
    assert.match(rows[0].abstract, /AIM: Patients/);
    assert.match(rows[0].abstract, /Plain sentence/);
    assert.equal(rows[0].url, 'https://pubmed.ncbi.nlm.nih.gov/11942998/');
    assert.equal(rows[1].title, 'Second paper');
    assert.equal(rows[1].journal_name, 'Iso Journal');
    assert.equal(rows[1].year, null);
    assert.equal(rows[1].authors, 'Ann');
    assert.equal(rows[1].volume, '');
  });

  test('retries rate limits and stops on a hard error', async () => {
    queue.push({ status: 429 }, { status: 500 }, { json: { esearchresult: { idlist: ['1'], count: '1' } } });
    const page = await searchPubmedPage('retry');
    assert.deepEqual(page.ids, ['1']);

    queue.push({ status: 404 });
    await assert.rejects(searchPubmedPage('missing'), /404/);

    queue.push({ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 });
    await assert.rejects(searchPubmedPage('down'), /500/);
  });
});
