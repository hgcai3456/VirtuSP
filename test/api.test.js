const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { handleApi } = require('../lib/api');
const { pace } = require('../lib/pubmed');
const { tempDb, mockReq, mockRes, parsed, insertJournal } = require('./helpers');

describe('api', { concurrency: false }, () => {
  let box;

  before(() => {
    box = tempDb();
    insertJournal(box.db, { title: 'Listed journal', pmid: '101' });
    pace.wait = async () => {};
    pace.backoff = async () => {};
    global.fetch = async (url) => {
      const href = String(url);
      if (href.includes('esearch')) {
        const empty = href.includes('none');

        return {
          ok: true,
          status: 200,
          json: async () => ({ esearchresult: { idlist: empty ? [] : ['101'], count: empty ? '0' : '1' } }),
          text: async () => ''
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '<PubmedArticle><MedlineCitation><PMID>101</PMID><Article><ArticleTitle>Fetched adherence study</ArticleTitle><Abstract><AbstractText>This retrospective cohort study showed metformin adherence was associated with reduced mortality in diabetes patients.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>'
      };
    };
  });

  after(() => {
    delete global.fetch;
    box.cleanup();
  });

  async function call(method, url, body, headers) {
    const res = mockRes();
    const req = mockReq({ method, url, body, headers, error: body instanceof Error ? body : undefined });
    await handleApi(req, res, box.db);

    return res;
  }

  test('serves health, journals, medical data, and ingest status', async () => {
    const health = await call('GET', '/api/health/');
    assert.equal(health.statusCode, 200);
    assert.equal(parsed(health).ok, true);
    assert.equal(parsed(health).journals, 1);

    const journals = await call('GET', '/api/journals');
    assert.equal(parsed(journals).journals.length, 1);

    const rows = await call('GET', '/api/medical-data?q=metformin&journal_id=1');
    assert.ok(Array.isArray(parsed(rows).medical_data));

    const status = await call('GET', '/api/ingest/status');
    assert.equal(parsed(status).workers.length, 2);
    assert.ok(parsed(status).illnesses > 0);

    const missing = await call('GET', '/api/missing');
    assert.equal(missing.statusCode, 404);

    const reports = await call('GET', '/api/reports?patient_id=bad id');
    assert.equal(reports.statusCode, 400);
  });

  test('reads JSON bodies for patient, triage, and the gate', async () => {
    const patient = await call('POST', '/api/patient', JSON.stringify({
      request: 'Hello there',
      trust: 0,
      case_facts: { facts: [] }
    }));
    assert.equal(patient.statusCode, 200);
    assert.equal(parsed(patient).send, true);

    const triage = await call('POST', '/api/triage', JSON.stringify({ complaint: 'orthopnea' }));
    assert.equal(triage.statusCode, 200);
    assert.equal(parsed(triage).leading.name, 'heart failure');

    const thin = await call('POST', '/api/triage', '');
    assert.equal(thin.statusCode, 400);

    const badJson = await call('POST', '/api/gate', '{');
    assert.equal(badJson.statusCode, 400);
    assert.match(parsed(badJson).error, /Invalid JSON/);

    const noRequest = await call('POST', '/api/gate', JSON.stringify({}));
    assert.equal(noRequest.statusCode, 400);

    const gated = await call('POST', '/api/gate', JSON.stringify({
      request: 'What brings you in today?',
      response: 'Hello there'
    }));
    assert.equal(gated.statusCode, 200);
    assert.equal(parsed(gated).allow, true);

    const broken = mockRes();
    await handleApi(mockReq({
      method: 'POST',
      url: '/api/gate',
      error: new Error('socket')
    }), broken, box.db);
    assert.equal(broken.statusCode, 400);
    assert.match(parsed(broken).error, /socket/);

    const huge = mockRes();
    await handleApi(mockReq({
      method: 'POST',
      url: '/api/gate',
      body: 'x'.repeat(2000001)
    }), huge, box.db);
    assert.equal(huge.statusCode, 400);
    assert.match(parsed(huge).error, /too large/);
  });

  test('ingests a publication, a pmid, a query, and the seed file', async () => {
    const quote = 'This retrospective cohort study showed metformin adherence was associated with reduced mortality in diabetes patients.';
    const publication = await call('POST', '/api/ingest', JSON.stringify({
      publication: { title: 'Manual paper', abstract: quote, pmid: '303' }
    }));
    assert.equal(publication.statusCode, 200);
    assert.equal(parsed(publication).results[0].facts_added, 1);

    const pmid = await call('POST', '/api/ingest', JSON.stringify({ pmid: '101' }));
    assert.equal(pmid.statusCode, 200);
    assert.ok(parsed(pmid).results.length >= 1);

    const query = await call('POST', '/api/ingest', JSON.stringify({ query: 'metformin adherence', limit: 0 }));
    assert.equal(query.statusCode, 200);

    const none = await call('POST', '/api/ingest', JSON.stringify({ query: 'none', limit: 2 }));
    assert.deepEqual(parsed(none).results, []);

    const seed = await call('POST', '/api/ingest', JSON.stringify({ seed: true }));
    assert.equal(seed.statusCode, 200);
    assert.ok(parsed(seed).results.length >= 1);

    const missing = await call('POST', '/api/ingest', JSON.stringify({}));
    assert.equal(missing.statusCode, 400);
  });

  test('uses the error status when a database call fails', async () => {
    const denied = mockRes();
    await handleApi(mockReq({ method: 'GET', url: '/api/health' }), denied, {
      prepare() {
        const err = new Error('unavailable');
        err.status = 503;
        throw err;
      }
    });
    assert.equal(denied.statusCode, 503);

    const plain = mockRes();
    await handleApi(mockReq({ method: 'GET', url: '/api/health' }), plain, {
      prepare() {
        throw new Error('bad');
      }
    });
    assert.equal(plain.statusCode, 400);
    assert.equal(parsed(plain).error, 'bad');
  });
});
