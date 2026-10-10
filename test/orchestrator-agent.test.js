const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('../lib/db');
const {
  OrchestratorAgent,
  conflictDetail,
  discoverTests,
  isConflict
} = require('../lib/orchestrator-agent');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-orch-'));
}

describe('orchestrator agent', { concurrency: false }, () => {
  const dirs = [];

  afterEach(() => {
    while (dirs.length) {
      fs.rmSync(dirs.pop(), { recursive: true, force: true });
    }
  });

  test('recognizes lock and port conflicts', () => {
    assert.equal(isConflict('database is locked'), true);
    assert.equal(isConflict('database is busy'), true);
    assert.equal(isConflict('listen EADDRINUSE: address already in use'), true);
    assert.equal(isConflict('writer lock timed out for data/virtusp.sqlite'), true);
    assert.equal(isConflict('database is not open'), true);
    assert.equal(isConflict('Expected values to be strictly equal'), false);
    assert.match(conflictDetail('noise\ndatabase is locked\nmore'), /locked/);
  });

  test('discovers the suite test files', () => {
    const files = discoverTests(path.join(__dirname, '..'));
    assert.ok(files.includes(path.join('test', 'db.test.js')));
    assert.equal(files.some((file) => file.endsWith('helpers.js')), false);
  });

  test('each parallel run gets its own compute resource and shard', async () => {
    const dir = tempDir();
    dirs.push(dir);
    let active = 0;
    let maxActive = 0;
    const assigned = [];
    const agent = new OrchestratorAgent({
      shardDir: dir,
      maxWorkers: 2,
      spawnImpl: ({ env }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        assigned.push({ db: env.VIRTUSP_DB, port: env.PORT, shards: env.VIRTUSP_SHARDS });

        return new Promise((resolve) => {
          setTimeout(() => {
            active -= 1;
            resolve({ code: 0, stdout: 'ok', stderr: '', pid: 11 });
          }, 40);
        });
      }
    });

    const report = await agent.runTests(['test/a.test.js', 'test/b.test.js']);

    assert.equal(report.ok, true);
    assert.equal(maxActive, 2);
    assert.equal(new Set(assigned.map((row) => row.db)).size, 2);
    assert.equal(new Set(assigned.map((row) => row.port)).size, 2);
    assert.deepEqual(assigned.map((row) => row.shards), ['1', '1']);
    assert.equal(report.resources.filter((resource) => resource.reason === 'initial').length, 2);
    assigned.forEach((row) => {
      assert.equal(fs.existsSync(row.db), true);
    });
  });

  test('a lock conflict retires the resource and retries on a new shard', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const seen = [];
    const agent = new OrchestratorAgent({
      shardDir: dir,
      maxWorkers: 1,
      spawnImpl: ({ env }) => {
        seen.push(env.VIRTUSP_DB);
        if (seen.length === 1) {
          return Promise.resolve({ code: 1, stdout: '', stderr: 'database is locked', pid: 4 });
        }

        return Promise.resolve({ code: 0, stdout: 'ok', stderr: '', pid: 5 });
      }
    });

    const report = await agent.runTests(['test/db.test.js']);

    assert.equal(report.ok, true);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].attempt, 1);
    assert.equal(report.results[0].code, 0);
    assert.notEqual(seen[0], seen[1]);
    assert.equal(report.resources.filter((resource) => resource.status === 'retired').length, 1);
    assert.equal(report.resources.filter((resource) => resource.reason === 'conflict').length, 1);
    assert.equal(report.events.some((event) => event.type === 'conflict'), true);
  });

  test('an assertion failure does not open another shard', async () => {
    const dir = tempDir();
    dirs.push(dir);
    let calls = 0;
    const agent = new OrchestratorAgent({
      shardDir: dir,
      maxWorkers: 2,
      spawnImpl: () => {
        calls += 1;

        return Promise.resolve({ code: 1, stdout: '', stderr: 'assertion failed', pid: 9 });
      }
    });

    const report = await agent.runTests(['test/pace.test.js']);

    assert.equal(report.ok, false);
    assert.equal(calls, 1);
    assert.equal(report.results[0].conflict, false);
    assert.equal(report.resources.filter((resource) => resource.reason === 'conflict').length, 0);
  });

  test('a writer lock opens the next shard', () => {
    const dir = tempDir();
    dirs.push(dir);
    const agent = new OrchestratorAgent({ shardDir: dir, maxWorkers: 1 });
    const { acquire } = require('../lib/write-orchestrator');
    const held = acquire(agent.pathFor(0));

    const resource = agent.provisionCompute('initial');

    assert.ok(resource.shard > 0);
    assert.equal(agent.events.some((event) => event.type === 'skip-shard'), true);
    held.release();
  });

  test('a shard that is already locked is skipped', () => {
    const dir = tempDir();
    dirs.push(dir);
    const agent = new OrchestratorAgent({ shardDir: dir, maxWorkers: 1 });
    const held = openDb(agent.pathFor(0));
    held.exec('BEGIN IMMEDIATE');

    const resource = agent.provisionCompute('initial');

    assert.ok(resource.shard > 0);
    assert.notEqual(resource.dbPath, agent.pathFor(0));
    assert.equal(agent.events.some((event) => event.type === 'skip-shard'), true);
    held.exec('ROLLBACK');
    held.close();
  });

  test('repeated conflicts stop after the retry budget', async () => {
    const dir = tempDir();
    dirs.push(dir);
    let calls = 0;
    const agent = new OrchestratorAgent({
      shardDir: dir,
      maxWorkers: 1,
      maxRetries: 2,
      spawnImpl: () => {
        calls += 1;

        return Promise.resolve({ code: 1, stdout: '', stderr: 'SQLITE_BUSY', pid: 3 });
      }
    });

    const report = await agent.runTests(['test/reports.test.js']);

    assert.equal(calls, 3);
    assert.equal(report.results[0].attempt, 2);
    assert.equal(report.results[0].conflict, true);
    assert.equal(report.ok, false);
  });
});
