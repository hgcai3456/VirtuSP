const fs = require('fs');
const path = require('path');

const held = new Map();
const openLocks = new Set();
const inTx = new WeakSet();

function databasePath(dbOrPath) {
  if (typeof dbOrPath === 'string' && dbOrPath) {
    return path.resolve(dbOrPath);
  }
  if (Array.isArray(dbOrPath)) {
    return databasePath(dbOrPath[0]);
  }
  if (dbOrPath && dbOrPath.file) {
    return path.resolve(dbOrPath.file);
  }

  return '';
}

function lockFile(dbPath) {
  return databasePath(dbPath) + '.writer.lock';
}

function sleepSync(ms) {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);

    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readLock(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function owns(dbPath) {
  for (const lock of openLocks) {
    if (!lock.released && lock.dbPath === dbPath) {
      return true;
    }
  }

  return false;
}

function isStale(file) {
  const payload = readLock(file);
  if (!payload) {
    try {
      return Date.now() - fs.statSync(file).mtimeMs > 5000;
    } catch (err) {
      return true;
    }
  }

  const pid = Number(payload.pid) || 0;
  const dbPath = payload.db ? path.resolve(payload.db) : '';
  if (pid === process.pid) {
    return !owns(dbPath);
  }

  return !pidAlive(pid);
}

function releaseLock(lock) {
  if (!lock || lock.released) {
    return;
  }
  lock.released = true;
  openLocks.delete(lock);
  try {
    fs.closeSync(lock.fd);
  } catch (err) {
    // already closed
  }
  try {
    const current = readLock(lock.file);
    if (current && Number(current.pid) === process.pid) {
      fs.unlinkSync(lock.file);
    }
  } catch (err) {
    // another writer already removed it
  }
}

function acquire(dbPath, options = {}) {
  const resolved = databasePath(dbPath);
  const file = lockFile(resolved);
  const timeout = options.timeoutMs == null ? 30000 : Number(options.timeoutMs);
  const retryMs = options.retryMs == null ? 40 : Number(options.retryMs);
  const started = Date.now();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({
        pid: process.pid,
        db: resolved,
        at: new Date().toISOString()
      }));
      const lock = {
        fd,
        file,
        dbPath: resolved,
        released: false,
        release() {
          releaseLock(lock);
        }
      };
      openLocks.add(lock);

      return lock;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
      if (isStale(file)) {
        try {
          fs.unlinkSync(file);
        } catch (unlinkErr) {
          // the owner removed it, or another waiter did
        }
        continue;
      }
      if (Date.now() - started >= timeout) {
        const owner = readLock(file);
        const who = owner && owner.pid ? ' pid ' + owner.pid : '';
        throw new Error('writer lock timed out for ' + resolved + who);
      }
      sleepSync(retryMs);
    }
  }
}

function withWrite(dbOrPath, fn, options) {
  const dbPath = databasePath(dbOrPath);
  if (!dbPath) {
    return fn();
  }

  const depth = held.get(dbPath) || 0;
  if (depth > 0) {
    held.set(dbPath, depth + 1);
    try {
      return fn();
    } finally {
      held.set(dbPath, depth);
    }
  }

  const lock = acquire(dbPath, options);
  held.set(dbPath, 1);
  try {
    return fn();
  } finally {
    held.delete(dbPath);
    lock.release();
  }
}

function databaseHandle(dbOrShards) {
  const db = Array.isArray(dbOrShards) ? dbOrShards[0] : dbOrShards;
  if (!db || typeof db.exec !== 'function' || !db.file) {
    return null;
  }

  return db;
}

function writeTransaction(dbOrShards, fn) {
  const db = databaseHandle(dbOrShards);
  if (!db) {
    return fn();
  }

  return withWrite(db, () => {
    if (inTx.has(db)) {
      return fn();
    }

    inTx.add(db);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');

      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackErr) {
        // the connection is already idle
      }
      throw err;
    } finally {
      inTx.delete(db);
    }
  });
}

function planLanes(jobs) {
  const order = [];
  const byPath = new Map();
  (jobs || []).forEach((job) => {
    const key = databasePath(job && job.dbPath);
    if (!key) {
      return;
    }
    if (!byPath.has(key)) {
      byPath.set(key, []);
      order.push(key);
    }
    byPath.get(key).push(job);
  });

  return order.map((key) => byPath.get(key));
}

async function runLanes(lanes, runJob) {
  const groups = await Promise.all((lanes || []).map(async (lane) => {
    const out = [];
    for (const job of lane) {
      out.push(await runJob(job));
    }

    return out;
  }));

  return groups.flat();
}

function writerStatus(dbPath) {
  const resolved = databasePath(dbPath);
  const file = lockFile(resolved);
  if (!resolved || !fs.existsSync(file)) {
    return { db: resolved, busy: false, pid: 0 };
  }

  const payload = readLock(file);
  const pid = payload && Number(payload.pid) ? Number(payload.pid) : 0;
  const busy = pid === process.pid ? owns(resolved) : pidAlive(pid);

  return { db: resolved, busy, pid, stale: !busy };
}

process.on('exit', () => {
  for (const lock of openLocks) {
    releaseLock(lock);
  }
});

module.exports = {
  databasePath,
  lockFile,
  acquire,
  withWrite,
  writeTransaction,
  planLanes,
  runLanes,
  writerStatus
};
