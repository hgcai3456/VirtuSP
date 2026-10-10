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

function request(urlPath, headers) {
  const port = server.address().port;

  return new Promise((resolve, reject) => {
    const req = http.get({ port, path: urlPath, headers: headers || {} }, (res) => {
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
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY') {
        throw err;
      }
    }
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

    const sibling = await request('/../public-extra/secret.txt');
    assert.equal(sibling.status, 403);

    const encoded = await request('/%');
    assert.equal(encoded.status, 400);

    const folderFile = await request('/css');
    assert.equal(folderFile.status, 404);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');

    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body.toString('utf8')).ok, true);
  });

  test('serves a media byte range and rejects a bad one', async () => {
    const video = await request('/video/nisha.mp4', { Range: 'bytes=0-15' });
    assert.equal(video.status, 206);
    assert.match(video.headers['content-type'], /video\/mp4/);
    assert.equal(video.headers['content-length'], '16');
    assert.match(video.headers['content-range'], /^bytes 0-15\/\d+$/);
    assert.equal(video.body.length, 16);

    const whole = await request('/video/nisha.mp4');
    assert.equal(whole.status, 200);
    assert.match(whole.headers['content-type'], /video\/mp4/);
    assert.equal(Number(whole.headers['content-length']), whole.body.length);

    const backwards = await request('/video/nisha.mp4', { Range: 'bytes=20-10' });
    assert.equal(backwards.status, 416);
    assert.match(backwards.headers['content-range'], /^bytes \*\/\d+$/);

    const open = await request('/video/nisha.mp4', { Range: 'bytes=-' });
    assert.equal(open.status, 416);

    const ignored = await request('/unit-coverage-probe.bin', { Range: 'bytes=0-0' });
    assert.equal(ignored.status, 200);
    assert.equal(ignored.body.toString('utf8'), 'probe');

    const slash = await request('/%5Csecret.txt');
    assert.equal(slash.status, 400);
    assert.equal(slash.body.toString('utf8'), 'Bad request');
  });
});
