const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('./db');
const { writerStatus } = require('./write-orchestrator');

const CONFLICT_RE = /locked|busy|SQLITE_BUSY|EADDRINUSE|address already in use|EBUSY|writer lock timed out|database is not open/i;

function isConflict(text) {
  return CONFLICT_RE.test(String(text || ''));
}

function conflictDetail(text) {
  const line = String(text || '').split(/\r?\n/).find((row) => CONFLICT_RE.test(row));

  return (line || 'resource conflict').trim().slice(0, 200);
}

function discoverTests(root) {
  const dir = path.join(root, 'test');

  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join('test', name));
}

function spawnTest({ file, cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      '--experimental-test-module-mocks',
      '--test',
      '--test-isolation=process',
      '--test-concurrency=1',
      file
    ], {
      cwd,
      env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: stderr + (err.message || String(err)),
        pid: child.pid || null
      });
    });
    child.on('close', (code) => {
      resolve({
        code: code == null ? 1 : code,
        stdout,
        stderr,
        pid: child.pid || null
      });
    });
  });
}

class OrchestratorAgent {
  constructor(options = {}) {
    this.root = options.root || path.join(__dirname, '..');
    this.shardDir = options.shardDir || path.join(this.root, 'data', 'orchestrator');
    this.maxWorkers = Math.max(1, Number(options.maxWorkers) || os.cpus().length);
    this.maxRetries = options.maxRetries == null ? 2 : Number(options.maxRetries);
    this.maxShardSkips = Math.max(1, Number(options.maxShardSkips) || 8);
    this.basePort = Number(options.basePort) || 4100;
    this.nextShard = Number(options.shardStart) || 0;
    this.spawnImpl = options.spawnImpl || spawnTest;
    this.probeShard = options.probeShard || this.defaultProbe.bind(this);
    this.resources = [];
    this.events = [];
  }

  pathFor(index) {
    fs.mkdirSync(this.shardDir, { recursive: true });
    const name = index ? 'virtusp-' + (index + 1) + '.sqlite' : 'virtusp.sqlite';

    return path.join(this.shardDir, name);
  }

  defaultProbe(dbPath) {
    const status = writerStatus(dbPath);
    if (status.busy) {
      return false;
    }

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('PRAGMA busy_timeout = 200');
      db.exec('BEGIN IMMEDIATE');
      db.exec('ROLLBACK');
    } catch (err) {
      if (isConflict(err.message)) {
        return false;
      }
      throw err;
    } finally {
      try {
        db.close();
      } catch (err) {
        // The probe only needed the write lock.
      }
    }

    const ready = openDb(dbPath);
    ready.close();

    return true;
  }

  provisionShard(reason) {
    const skipped = [];
    for (let n = 0; n < this.maxShardSkips; n += 1) {
      const index = this.nextShard;
      this.nextShard += 1;
      const dbPath = this.pathFor(index);
      if (this.probeShard(dbPath)) {
        return { index, dbPath, reason, skipped };
      }
      skipped.push(dbPath);
      this.events.push({ type: 'skip-shard', dbPath, shard: index, reason: 'conflict' });
    }

    throw new Error('No writable database shard after ' + this.maxShardSkips + ' attempts');
  }

  provisionCompute(reason) {
    const shard = this.provisionShard(reason);
    const resource = {
      id: 'compute-' + (this.resources.length + 1),
      shard: shard.index,
      dbPath: shard.dbPath,
      port: this.basePort + this.resources.length,
      status: 'idle',
      reason,
      pid: null,
      skippedShards: shard.skipped
    };
    this.resources.push(resource);
    this.events.push({
      type: 'provision',
      resourceId: resource.id,
      shard: resource.shard,
      dbPath: resource.dbPath,
      port: resource.port,
      reason
    });

    return resource;
  }

  claimIdle(preferReason) {
    const idle = this.resources.filter((resource) => resource.status === 'idle');
    if (!idle.length) {
      return null;
    }
    if (preferReason) {
      const preferred = idle.filter((resource) => resource.reason === preferReason);
      if (preferred.length) {
        return preferred[preferred.length - 1];
      }
    }

    return idle[0];
  }

  envFor(resource) {
    return Object.assign({}, process.env, {
      VIRTUSP_DB: resource.dbPath,
      VIRTUSP_SHARDS: '1',
      PORT: String(resource.port)
    });
  }

  async runJob(job) {
    const resource = this.claimIdle(job.attempt > 0 ? 'conflict' : null)
      || this.provisionCompute(job.attempt > 0 ? 'conflict' : 'capacity');
    resource.status = 'running';
    const started = Date.now();
    const outcome = await this.spawnImpl({
      file: job.file,
      cwd: this.root,
      env: this.envFor(resource),
      resource
    });
    const text = (outcome.stdout || '') + '\n' + (outcome.stderr || '');
    const conflict = outcome.code !== 0 && isConflict(text);
    resource.pid = outcome.pid || null;

    if (conflict) {
      resource.status = 'retired';
      this.events.push({
        type: 'conflict',
        resourceId: resource.id,
        shard: resource.shard,
        file: job.file,
        detail: conflictDetail(text)
      });
      if (job.attempt < this.maxRetries) {
        this.provisionCompute('conflict');

        return { retry: { file: job.file, attempt: job.attempt + 1 } };
      }
    } else {
      resource.status = 'idle';
    }

    const result = {
      file: job.file,
      code: outcome.code == null ? 1 : outcome.code,
      attempt: job.attempt,
      resourceId: resource.id,
      shard: resource.shard,
      dbPath: resource.dbPath,
      conflict,
      ms: Date.now() - started
    };
    if (result.code !== 0) {
      result.stderr = outcome.stderr || '';
      result.stdout = outcome.stdout || '';
    }
    this.events.push({
      type: 'finish',
      file: result.file,
      code: result.code,
      attempt: result.attempt,
      resourceId: result.resourceId,
      shard: result.shard
    });

    return { result };
  }

  async worker(queue, results) {
    for (;;) {
      const job = queue.shift();
      if (!job) {
        return;
      }
      const outcome = await this.runJob(job);
      if (outcome.retry) {
        queue.push(outcome.retry);
      } else {
        results.push(outcome.result);
      }
    }
  }

  async runTests(files) {
    const queue = files.slice().map((file) => ({ file, attempt: 0 }));
    const results = [];
    if (!queue.length) {
      return this.report(results);
    }

    const limit = Math.min(this.maxWorkers, queue.length);
    while (this.resources.filter((resource) => resource.status === 'idle').length < limit) {
      this.provisionCompute('initial');
    }

    await Promise.all(Array.from({ length: limit }, () => this.worker(queue, results)));

    return this.report(results);
  }

  report(results) {
    return {
      ok: results.every((result) => result.code === 0),
      results,
      resources: this.resources.map((resource) => ({
        id: resource.id,
        shard: resource.shard,
        dbPath: resource.dbPath,
        port: resource.port,
        status: resource.status,
        reason: resource.reason,
        pid: resource.pid
      })),
      events: this.events.slice()
    };
  }
}

module.exports = {
  CONFLICT_RE,
  OrchestratorAgent,
  conflictDetail,
  discoverTests,
  isConflict,
  spawnTest
};
