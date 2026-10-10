const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { openDb } = require('../../lib/db');
const { ConversationAgent } = require('../../lib/conversation-agent');
const { ingestConversations } = require('../../lib/conversation-ingest');

const root = path.join(__dirname, '..', '..');
const cohortQuote = 'This retrospective cohort study examined adherence to prescribed oral hypoglycaemic medication in people with type 2 diabetes.';
const metforminQuote = 'This review discusses gastrointestinal intolerance as a common reason patients stop or skip metformin.';
const approvedLine = "I've been really thirsty and tired for a few months. My doctor says it's diabetes.";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port, dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      VIRTUSP_DB: dbPath,
      VIRTUSP_SHARDS: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('VirtuSP server did not start.\n' + output));
    }, 15000);
    const capture = (chunk) => {
      output += chunk;
      if (output.includes('VirtuSP running')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('VirtuSP server exited with ' + code + '.\n' + output));
    });
  });

  return { child, ready, output: () => output };
}

function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function request(port, method, urlPath, options = {}) {
  const headers = Object.assign({}, options.headers);
  const body = options.body;
  if (body && !headers['Content-Length']) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        if (/json/.test(res.headers['content-type'] || '')) {
          json = JSON.parse(raw.toString('utf8'));
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw,
          json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function multipart(fields, file) {
  const boundary = '----virtusp-integration';
  const chunks = [];
  Object.entries(fields).forEach(([name, value]) => {
    chunks.push(Buffer.from(
      '--' + boundary + '\r\n'
      + 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n'
      + value + '\r\n'
    ));
  });
  chunks.push(Buffer.from(
    '--' + boundary + '\r\n'
    + 'Content-Disposition: form-data; name="file"; filename="' + file.filename + '"\r\n'
    + 'Content-Type: application/pdf\r\n\r\n'
  ));
  chunks.push(file.body);
  chunks.push(Buffer.from('\r\n--' + boundary + '--\r\n'));

  return {
    type: 'multipart/form-data; boundary=' + boundary,
    body: Buffer.concat(chunks)
  };
}

describe('live stack', { concurrency: false, timeout: 60000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-integration-'));
  const dbPath = path.join(dir, 'app.sqlite');
  const checkpoint = path.join(dir, 'conversation-checkpoint.json');
  let server;
  let port;
  let reportId;

  before(async () => {
    port = await freePort();
    server = startServer(port, dbPath);
    await server.ready;
  });

  after(async () => {
    if (reportId && server && server.child.exitCode === null) {
      await request(port, 'DELETE', '/api/reports/' + reportId).catch(() => {});
    }
    if (server) {
      await stopServer(server.child);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('serves the public app and keeps files inside it', async () => {
    const home = await request(port, 'GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.match(home.body.toString('utf8'), /VirtuSP|standardized|patient/i);

    const app = await request(port, 'GET', '/app.html');
    assert.equal(app.status, 200);
    assert.match(app.body.toString('utf8'), /html/i);

    const missing = await request(port, 'GET', '/missing-page.html');
    assert.equal(missing.status, 404);

    const escaped = await request(port, 'GET', '/../package.json');
    assert.equal(escaped.status, 403);

    const video = path.join(root, 'public', 'video', 'dominic.mp4');
    if (fs.existsSync(video)) {
      const clip = await request(port, 'GET', '/video/dominic.mp4', {
        headers: { Range: 'bytes=0-15' }
      });
      assert.equal(clip.status, 206);
      assert.match(clip.headers['content-type'], /video\/mp4/);
      assert.match(clip.headers['content-range'], /^bytes 0-15\//);
      assert.equal(clip.body.length, 16);
    }

    const health = await request(port, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.journals, 0);
    assert.equal(health.json.medical_data, 0);
    assert.equal(health.json.conversations, 0);
  });

  test('seeds the publication library through the running server', async () => {
    const seeded = await request(port, 'POST', '/api/ingest', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: true })
    });
    assert.equal(seeded.status, 200);
    assert.equal(seeded.json.results.length, 4);
    assert.ok(seeded.json.results.every((row) => row.facts_added >= 1));
    assert.equal(seeded.json.counts.journals, 4);
    assert.ok(seeded.json.counts.medical_data >= 4);

    const again = await request(port, 'POST', '/api/ingest', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: true })
    });
    assert.equal(again.status, 200);
    assert.ok(again.json.results.every((row) => row.facts_added === 0));
    assert.equal(again.json.counts.journals, 4);
    assert.equal(again.json.counts.medical_data, seeded.json.counts.medical_data);

    const journals = await request(port, 'GET', '/api/journals');
    assert.equal(journals.json.journals.length, 4);
    assert.ok(journals.json.journals.some((row) => row.pmid === '11942998'));

    const rows = await request(port, 'GET', '/api/medical-data?q=metformin');
    assert.ok(rows.json.medical_data.some((row) => String(row.quote).includes('metformin') || String(row.claim).includes('metformin')));

    const adherence = await request(port, 'GET', '/api/medical-data?q=' + encodeURIComponent('oral hypoglycaemic'));
    assert.ok(adherence.json.medical_data.some((row) => row.quote === cohortQuote));

    const status = await request(port, 'GET', '/api/ingest/status');
    assert.equal(status.status, 200);
    assert.equal(status.json.workers.length, 2);
    assert.ok(status.json.illnesses > 0);
    assert.equal(status.json.counts.journals, 4);
  });

  test('triages a complaint and grounds the reply on the library', async () => {
    const empty = await request(port, 'POST', '/api/triage', {
      headers: { 'Content-Type': 'application/json' },
      body: ''
    });
    assert.equal(empty.status, 400);

    const triage = await request(port, 'POST', '/api/triage', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaint: 'orthopnea' })
    });
    assert.equal(triage.status, 200);
    assert.equal(triage.json.leading.name, 'heart failure');

    const blocked = await request(port, 'POST', '/api/gate', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: 'What dose of metformin should I start her on?'
      })
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.json.send, false);
    assert.equal(blocked.json.interceptor.allow, false);
    assert.equal(blocked.json.response, null);

    const broken = await request(port, 'POST', '/api/gate', {
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(broken.status, 400);

    const grounded = await request(port, 'POST', '/api/gate', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: 'Why do patients stop or skip metformin?',
        response: metforminQuote
      })
    });
    assert.equal(grounded.status, 200);
    assert.equal(grounded.json.send, true);
    assert.equal(grounded.json.allow, true);
    assert.equal(grounded.json.response.text, metforminQuote);
    assert.equal(grounded.json.interceptor.send, true);
  });

  test('stores a chart PDF and serves the same bytes back', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 44 >>\nstream\n(HbA1c 7.4 percent) Tj\nendstream\nendobj\n%%EOF\n');
    const form = multipart({
      patient_id: 'integ-denise',
      encounter_id: 'visit-1',
      kind: 'bloodwork',
      title: 'Morning labs',
      uploaded_by: 'doctor',
      uploader_role: 'Faculty'
    }, {
      filename: 'morning-labs.pdf',
      body: pdf
    });
    const uploaded = await request(port, 'POST', '/api/reports', {
      headers: { 'Content-Type': form.type },
      body: form.body
    });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.json.report.patient_id, 'integ-denise');
    assert.equal(uploaded.json.report.kind, 'bloodwork');
    assert.equal(uploaded.json.report.title, 'Morning labs');
    reportId = uploaded.json.report.id;

    const listed = await request(port, 'GET', '/api/reports?patient_id=integ-denise');
    assert.equal(listed.status, 200);
    assert.equal(listed.json.reports.length, 1);
    assert.equal(listed.json.reports[0].id, reportId);

    const file = await request(port, 'GET', '/api/reports/' + reportId + '/file');
    assert.equal(file.status, 200);
    assert.match(file.headers['content-type'], /application\/pdf/);
    assert.equal(file.body.equals(pdf), true);

    const removed = await request(port, 'DELETE', '/api/reports/' + reportId);
    assert.equal(removed.status, 200);
    assert.equal(removed.json.ok, true);
    reportId = null;

    const gone = await request(port, 'GET', '/api/reports?patient_id=integ-denise');
    assert.deepEqual(gone.json.reports, []);
  });

  test('uses the same database for conversation style and the patient reply', async () => {
    await stopServer(server.child);
    const db = openDb(dbPath);
    const agent = new ConversationAgent(db);
    const state = await ingestConversations(agent, {
      topics: ['greeting'],
      chunk: 20,
      checkpoint,
      pace: { delayMs: 0, wait: async () => {}, backoff: async () => {} }
    });
    assert.equal(state.status, 'complete');
    assert.ok(state.conversations > 0);
    assert.ok(state.turns > 0);
    db.close();

    port = await freePort();
    server = startServer(port, dbPath);
    await server.ready;

    const health = await request(port, 'GET', '/api/health');
    assert.equal(health.json.journals, 4);
    assert.ok(health.json.conversations > 0);
    assert.ok(health.json.conversation_turns > 0);

    const patient = await request(port, 'POST', '/api/patient', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: 'What brings you in today?',
        trust: 1,
        patient_id: 'integ-denise',
        case_facts: {
          facts: [{
            id: 'd1',
            label: 'Chief complaint: thirst and fatigue for months',
            kw: ['bring', 'here', 'concern', 'problem', 'symptom', 'tired', 'thirst', 'why'],
            vis: 'ask',
            gate: 0,
            say: approvedLine
          }]
        }
      })
    });
    assert.equal(patient.status, 200);
    assert.equal(patient.json.send, true);
    assert.equal(patient.json.fact_id, 'd1');
    assert.match(patient.json.reply, /really thirsty and tired for a few months/);
    assert.equal(patient.json.stages.interceptor.send, true);
  });
});
