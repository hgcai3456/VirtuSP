const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-server-'));
process.env.VIRTUSP_DB = path.join(dir, 'app.sqlite');
process.env.VIRTUSP_SHARDS = '1';
process.env.PORT = '0';

const originalCreate = http.createServer;
let server;
http.createServer = function create(handler) {
  server = originalCreate.call(http, handler);

  return server;
};

require('../server');

function request(urlPath) {
  const port = server.address().port;

  return new Promise((resolve, reject) => {
    const req = http.get({ port, path: urlPath }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
  });
}

describe('server', () => {
  const probe = path.join(__dirname, '..', 'public', 'unit-coverage-probe.bin');

  before(async () => {
    await new Promise((resolve) => {
      if (server.listening) resolve();
      else server.once('listening', resolve);
    });
    fs.writeFileSync(probe, 'probe');
  });

  after(async () => {
    fs.rmSync(probe, { force: true });
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    http.createServer = originalCreate;
  });

  test('serves pages, static types, missing files, and the api', async () => {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.match(home.body.toString('utf8'), /html/i);

    const css = await request('/css/app.css?v=1');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /text\/css/);

    const script = await request('/js/app.js');
    assert.match(script.headers['content-type'], /javascript/);

    const icon = await request('/favicon.svg');
    assert.match(icon.headers['content-type'], /svg/);

    const bin = await request('/unit-coverage-probe.bin');
    assert.equal(bin.status, 200);
    assert.match(bin.headers['content-type'], /octet-stream/);
    assert.equal(bin.body.toString('utf8'), 'probe');

    const missing = await request('/missing-page.html');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.toString('utf8'), 'Not found');

    const folder = await request('/css/');
    assert.equal(folder.status, 404);

    const escaped = await request('/../package.json');
    assert.equal(escaped.status, 403);
    assert.equal(escaped.body.toString('utf8'), 'Forbidden');

    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body.toString('utf8')).ok, true);
  });
});
