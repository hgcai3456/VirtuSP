const { IngestAgent } = require('./ingest-agent');
const { listJournals, listMedicalData, counts, writeDb } = require('./db');
const { gate } = require('./grounding-gate');
const { acceptedDocuments, intercept, publicDecision } = require('./response-interceptor');
const { groundingDocuments, handleReports } = require('./reports');
const { ingestStatusAll, loadIllnesses } = require('./nih-ingest');
const { triage } = require('./triage');
const { handlePatient } = require('./patient-controller');

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 2e6) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      if (!buf) {
        resolve({});

        return;
      }
      try {
        resolve(JSON.parse(buf));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function queryOf(url) {
  return Object.fromEntries(url.searchParams.entries());
}

async function handleApi(req, res, db) {
  const url = new URL(req.url, 'http://localhost');
  const pathName = url.pathname.replace(/\/+$/, '') || '/';
  const agent = new IngestAgent(writeDb(db));

  try {
    if (pathName === '/api/reports' || /^\/api\/reports\/\d+(\/file)?$/.test(pathName)) {
      return handleReports(req, res, db, { send, url, pathName });
    }

    if (req.method === 'GET' && pathName === '/api/ingest/status') {
      const workers = ingestStatusAll(2);

      return send(res, 200, {
        illnesses: loadIllnesses().length,
        workers,
        checkpoint: workers[0] && workers[0].checkpoint,
        counts: counts(db)
      });
    }

    if (req.method === 'GET' && pathName === '/api/health') {
      return send(res, 200, Object.assign({ ok: true }, counts(db)));
    }

    if (req.method === 'GET' && pathName === '/api/journals') {
      return send(res, 200, { journals: listJournals(db) });
    }

    if (req.method === 'GET' && pathName === '/api/medical-data') {
      const q = queryOf(url);

      return send(res, 200, {
        medical_data: listMedicalData(db, { q: q.q, journalId: q.journal_id })
      });
    }

    if (req.method === 'POST' && pathName === '/api/patient') {
      return handlePatient(req, res, db, { readBody, send });
    }

    if (req.method === 'POST' && pathName === '/api/triage') {
      const body = await readBody(req);

      return send(res, 200, triage(db, body));
    }

    if (req.method === 'POST' && pathName === '/api/gate') {
      const body = await readBody(req);
      if (!body.request) {
        return send(res, 400, { error: 'Provide request text to validate before send.' });
      }

      const result = gate(db, body);
      if (!result.request || !result.request.allow) {
        result.interceptor = {
          allow: false,
          send: false,
          reason: result.request ? result.request.reason : 'Request was not sent.',
          scope: 'blocked',
          relevant: false,
          timely: false,
          grounded: false,
          replaced: false
        };

        return send(res, 200, result);
      }

      const offered = body.response == null ? null : String(body.response);
      const decision = intercept({
        request: body.request,
        proposed: offered,
        caseFacts: body.case_facts || {},
        documents: acceptedDocuments(body.documents).concat(groundingDocuments(db, body.patient_id)),
        db,
        now: new Date()
      });
      result.interceptor = publicDecision(decision);
      if (!decision.send) {
        result.allow = false;
        result.send = false;
        result.request.allow = false;
        result.request.reason = decision.reason;
        result.response = null;

        return send(res, 200, result);
      }
      if (offered != null) {
        result.allow = decision.allow;
        result.send = true;
        result.response = result.response || { matches: [] };
        result.response.allow = decision.allow;
        result.response.text = decision.text;
        result.response.reason = decision.reason;
      }

      return send(res, 200, result);
    }

    if (req.method === 'POST' && pathName === '/api/ingest') {
      const body = await readBody(req);
      let results = [];

      if (body.publication) {
        results = [agent.ingestPublication(body.publication, { source_type: 'manual' })];
      } else if (body.pmid) {
        results = await agent.ingestPubmedIds([body.pmid]);
      } else if (body.query) {
        results = await agent.ingestPubmedQuery(body.query, body.limit || 5);
      } else if (body.seed) {
        results = agent.ingestSeed();
      } else {
        return send(res, 400, {
          error: 'Provide publication, pmid, query, or seed: true'
        });
      }

      return send(res, 200, { results, counts: counts(db) });
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, err.status || 400, { error: err.message || String(err) });
  }
}

module.exports = { handleApi };
