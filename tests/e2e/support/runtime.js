const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..', '..', '..');

let driver = null;
let server = null;
let tmpDir = '';
let serverLog = '';
let boundPort = '';

function baseUrl() {
  return 'http://127.0.0.1:' + boundPort;
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
  const logPath = path.join(root, 'data', 'e2e-server.log');
  serverLog = '';
  boundPort = '';
  fs.writeFileSync(logPath, '');
  const childEnv = Object.assign({}, process.env, {
    PORT: process.env.E2E_PORT || '0',
    HOST: '127.0.0.1',
    TZ: 'UTC',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    VIRTUSP_SHARDS: '1',
    VIRTUSP_DB: dbPath
  });
  delete childEnv.VIRTUSP_CONVERSATION_CHECKPOINT;
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const record = (chunk) => {
    const text = chunk.toString();
    serverLog += text;
    fs.appendFileSync(logPath, text);
  };
  server.stdout.on('data', record);
  server.stderr.on('data', record);
  boundPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('VirtuSP test server did not become ready\n' + serverLog.slice(-2000)));
    }, 20000);
    const ready = () => {
      const match = /VirtuSP running at http:\/\/127\.0\.0\.1:(\d+)/.exec(serverLog);
      if (!match) {
        return;
      }
      clearTimeout(timer);
      resolve(match[1]);
    };
    server.stdout.on('data', ready);
    ready();
    server.on('exit', (code, signal) => {
      fs.appendFileSync(logPath, '\n[exit] code=' + code + ' signal=' + signal + '\n');
      clearTimeout(timer);
      reject(new Error(
        'VirtuSP test server exited before it was ready (code ' + code + ')\n' + serverLog.slice(-2000)
      ));
    });
  });
  await waitForHealth(5000);
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
