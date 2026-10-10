const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..', '..', '..');

let driver = null;
let server = null;
let tmpDir = '';
let serverLog = '';
let boundPort = '';

function remoteBase() {
  return String(process.env.E2E_BASE_URL || '').replace(/\/+$/, '');
}

function baseUrl() {
  return remoteBase() || ('http://127.0.0.1:' + boundPort);
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      fetch(url, { signal: controller.signal })
        .then((res) => {
          clearTimeout(timer);
          if (res.body && typeof res.body.cancel === 'function') res.body.cancel();
          if (res.status === 200) {
            resolve();

            return;
          }
          retry();
        })
        .catch(() => {
          clearTimeout(timer);
          retry();
        });
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
  if (remoteBase()) {
    await waitForHealth(30000);

    return;
  }
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
  if (remoteBase()) {
    return;
  }
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
