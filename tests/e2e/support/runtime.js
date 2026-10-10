const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..', '..', '..');
const port = process.env.E2E_PORT || '4173';

let driver = null;
let server = null;
let tmpDir = '';
let serverLog = '';

function baseUrl() {
  return 'http://127.0.0.1:' + port;
}

function getDriver() {
  if (!driver) {
    throw new Error('Browser is not started');
  }

  return driver;
}

function setDriver(next) {
  driver = next;
}

function waitForHealth(timeoutMs) {
  const url = baseUrl() + '/api/health';
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();

          return;
        }
        retry();
      });
      req.on('error', retry);
    };

    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(
          'VirtuSP test server did not become ready at ' + url + '\n' + serverLog.slice(-2000)
        ));

        return;
      }
      setTimeout(tick, 200);
    }

    tick();
  });
}

async function startServer() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-e2e-'));
  const dbPath = path.join(tmpDir, 'virtusp.sqlite');
  serverLog = '';
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      PORT: port,
      VIRTUSP_SHARDS: '1',
      VIRTUSP_DB: dbPath
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  await waitForHealth(20000);
}

async function stopServer() {
  if (server && !server.killed) {
    server.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  server = null;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
}

module.exports = {
  root,
  baseUrl,
  getDriver,
  setDriver,
  startServer,
  stopServer
};
