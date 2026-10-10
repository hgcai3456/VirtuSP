const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { openDb, shardPath } = require('../lib/db');
const {
  lockFile,
  acquire,
  withWrite,
  writeTransaction,
  planLanes,
  runLanes,
  writerStatus
} = require('../lib/write-orchestrator');
const { parseArgs, buildJobs } = require('../agents/orchestrator');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-writer-'));
}

describe('write orchestrator', { concurrency: false }, () => {
  const dirs = [];
  const children = [];

  afterEach(() => {
    children.splice(0).forEach((child) => {
      try {
        child.kill();
      } catch (err) {
        // already exited
      }
    });
    dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  test('serializes writers on one file and releases the lock', () => {
    const dir = tempDir();
    dirs.push(dir);
    const dbPath = path.join(dir, 'one.sqlite');
    let depth = 0;
    withWrite(dbPath, () => {
      depth += 1;
      assert.equal(writerStatus(dbPath).busy, true);
      assert.equal(writerStatus(dbPath).pid, process.pid);
      withWrite(dbPath, () => {
        depth += 1;
      });
    });
    assert.equal(depth, 2);
    assert.equal(fs.existsSync(lockFile(dbPath)), false);
    assert.equal(writerStatus(dbPath).busy, false);

    assert.throws(() => withWrite(dbPath, () => {
      throw new Error('boom');
    }), /boom/);
    assert.equal(fs.existsSync(lockFile(dbPath)), false);
  });

  test('steals a lock whose owner is gone and times out while a live owner holds it', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const dbPath = path.join(dir, 'held.sqlite');
    const file = lockFile(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, db: path.resolve(dbPath) }));
    const stolen = acquire(dbPath, { timeoutMs: 500 });
    assert.equal(writerStatus(dbPath).busy, true);
    stolen.release();

    fs.writeFileSync(file, '{');
    const old = new Date(Date.now() - 10000);
    fs.utimesSync(file, old, old);
    const recovered = acquire(dbPath, { timeoutMs: 500 });
    recovered.release();

    const other = path.join(dir, 'other.sqlite');
    const first = acquire(dbPath, { timeoutMs: 500 });
    const second = acquire(other, { timeoutMs: 500 });
    second.release();
    first.release();

    const script = path.join(dir, 'hold.js');
    fs.writeFileSync(script, [
      "const { acquire } = require(" + JSON.stringify(require.resolve('../lib/write-orchestrator')) + ");",
      "const lock = acquire(process.argv[2], { timeoutMs: 2000 });",
      "process.send('held');",
      "process.on('message', (msg) => {",
      "  if (msg === 'release') { lock.release(); process.exit(0); }",
      "});"
    ].join('\n'));
    const child = fork(script, [dbPath], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    children.push(child);
    await new Promise((resolve, reject) => {
      child.once('message', (msg) => (msg === 'held' ? resolve() : reject(new Error(String(msg)))));
      child.once('exit', (code) => reject(new Error('holder exited ' + code)));
    });
    assert.equal(writerStatus(dbPath).busy, true);
    assert.throws(() => acquire(dbPath, { timeoutMs: 200, retryMs: 20 }), /timed out/);
    child.send('release');
    await new Promise((resolve) => child.once('exit', resolve));
    const after = acquire(dbPath, { timeoutMs: 1000 });
    after.release();
  });

  test('rolls a failed write back and keeps a committed one', () => {
    const dir = tempDir();
    dirs.push(dir);
    const db = openDb(path.join(dir, 'tx.sqlite'));
    try {
      assert.throws(() => writeTransaction(db, () => {
        db.prepare(`
          INSERT INTO journals (title, source_type, ingested_at)
          VALUES ('Rollback paper', 'file', '2020-01-01T00:00:00.000Z')
        `).run();
        throw new Error('stop');
      }), /stop/);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM journals').get().n, 0);

      writeTransaction(db, () => {
        db.prepare(`
          INSERT INTO journals (title, source_type, ingested_at)
          VALUES ('Kept paper', 'file', '2020-01-01T00:00:00.000Z')
        `).run();
      });
      assert.equal(db.prepare('SELECT title FROM journals').get().title, 'Kept paper');
      assert.equal(writeTransaction({ prepare() { return { run() {} }; } }, () => 'plain'), 'plain');
    } finally {
      db.close();
    }
  });

  test('runs different database files together and the same file in order', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const one = path.join(dir, 'one.sqlite');
    const two = path.join(dir, 'two.sqlite');
    const lanes = planLanes([
      { name: 'a', dbPath: one },
      { name: 'b', dbPath: two },
      { name: 'skip' },
      { name: 'c', dbPath: one }
    ]);
    assert.equal(lanes.length, 2);
    assert.deepEqual(lanes[0].map((job) => job.name), ['a', 'c']);
    assert.deepEqual(lanes[1].map((job) => job.name), ['b']);

    let aOpen = false;
    let overlapped = false;
    const order = [];
    const names = await runLanes(lanes, async (job) => {
      order.push(job.name);
      if (job.name === 'a') {
        aOpen = true;
      }
      if (job.name === 'b' && aOpen) {
        overlapped = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (job.name === 'a') {
        aOpen = false;
      }

      return job.name;
    });
    assert.equal(overlapped, true);
    assert.ok(order.indexOf('a') < order.indexOf('c'));
    assert.deepEqual(names, ['a', 'c', 'b']);
    assert.deepEqual(await runLanes([], async () => 'x'), []);
  });

  test('plans NIH shards in parallel and conversation ingest behind shard 0', () => {
    const envDb = process.env.VIRTUSP_DB;
    const dir = tempDir();
    dirs.push(dir);
    process.env.VIRTUSP_DB = path.join(dir, 'custom.sqlite');
    try {
      const options = parseArgs(['node', 'orchestrator.js', '--shards', '2', '--per-illness', '5']);
      assert.equal(options.nih, true);
      assert.equal(options.conversations, true);
      assert.equal(options.resume, true);
      assert.equal(options.perIllness, 5);
      const jobs = buildJobs(options);
      const lanes = planLanes(jobs);
      assert.equal(lanes.length, 2);
      assert.deepEqual(lanes[0].map((job) => job.name), ['nih-0', 'conversations']);
      assert.equal(lanes[0][0].dbPath, process.env.VIRTUSP_DB);
      assert.equal(lanes[0][1].dbPath, lanes[0][0].dbPath);
      assert.equal(lanes[1][0].dbPath, shardPath(1));
      assert.ok(lanes[1][0].args.includes('--shard'));
      assert.ok(lanes[0][0].args.includes('--resume'));
      assert.ok(lanes[0][1].args.includes('--resume'));

      const nihOnly = buildJobs(parseArgs(['node', 'orchestrator.js', '--nih', '--all', '--fresh']));
      assert.deepEqual(nihOnly.map((job) => job.name), ['nih-0', 'nih-1']);
      assert.ok(nihOnly[0].args.includes('--all'));
      assert.equal(nihOnly[0].args.includes('--resume'), false);

      const talks = buildJobs(parseArgs(['node', 'orchestrator.js', '--conversations', '--conversation-chunk', '4']));
      assert.deepEqual(talks.map((job) => job.name), ['conversations']);
      assert.ok(talks[0].args.includes('4'));
      assert.equal(parseArgs(['node', 'orchestrator.js', '--shards', 'nope']).shards, 2);

      const tests = parseArgs(['node', 'orchestrator.js', '--tests', '--workers', '3', 'test/db.test.js']);
      assert.equal(tests.tests, true);
      assert.equal(tests.nih, false);
      assert.equal(tests.conversations, false);
      assert.equal(tests.workers, 3);
      assert.deepEqual(tests.files, ['test/db.test.js']);
    } finally {
      if (envDb == null) delete process.env.VIRTUSP_DB;
      else process.env.VIRTUSP_DB = envDb;
    }
  });
});
