#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const { shardPath } = require('../lib/db');
const { OrchestratorAgent, discoverTests } = require('../lib/orchestrator-agent');
const { planLanes, writerStatus } = require('../lib/write-orchestrator');

const root = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = argv || process.argv;

  function has(name) {
    return args.includes(name);
  }

  function num(name, fallback) {
    const i = args.indexOf(name);
    if (i === -1) {
      return fallback;
    }
    const n = Number(args[i + 1]);

    return Number.isFinite(n) ? n : fallback;
  }

  const tests = has('--tests');
  const nihFlag = has('--nih');
  const conversationFlag = has('--conversations');
  const ingestDefault = !tests && !nihFlag && !conversationFlag;

  return {
    help: has('--help'),
    status: has('--status'),
    dryRun: has('--dry-run'),
    tests,
    files: args.filter((arg) => /\.test\.js$/.test(arg)),
    workers: has('--workers') ? Math.max(1, num('--workers', 1)) : 0,
    retries: has('--retries') ? num('--retries', 2) : undefined,
    nih: ingestDefault || nihFlag,
    conversations: ingestDefault || conversationFlag,
    shards: Math.max(1, num('--shards', 2)),
    all: has('--all'),
    resume: !has('--fresh'),
    perIllness: num('--per-illness', 200),
    chunk: num('--chunk', 20),
    delay: num('--delay', 800),
    conversationChunk: num('--conversation-chunk', 10)
  };
}

function nihJob(shard, shards, options) {
  const args = [
    path.join(__dirname, 'ingest.js'),
    '--nih',
    '--shards', String(shards),
    '--shard', String(shard),
    '--chunk', String(options.chunk),
    '--delay', String(options.delay)
  ];
  if (options.resume) {
    args.push('--resume');
  }
  if (options.all) {
    args.push('--all');
  } else {
    args.push('--per-illness', String(options.perIllness));
  }

  return {
    name: 'nih-' + shard,
    dbPath: shardPath(shard),
    args
  };
}

function conversationJob(options) {
  const args = [
    path.join(__dirname, 'conversations.js'),
    '--chunk', String(options.conversationChunk),
    '--delay', String(options.delay)
  ];
  if (options.resume) {
    args.push('--resume');
  }

  return {
    name: 'conversations',
    dbPath: shardPath(0),
    args
  };
}

function buildJobs(options) {
  const shards = Math.max(1, Number(options.shards) || 1);
  const jobs = [];
  if (options.nih) {
    for (let shard = 0; shard < shards; shard += 1) {
      jobs.push(nihJob(shard, shards, options));
    }
  }
  if (options.conversations) {
    jobs.push(conversationJob(options));
  }

  return jobs;
}

function formatCommand(job) {
  const shown = job.args.map((part) => {
    const rel = path.relative(root, part);

    return rel && !rel.startsWith('..') ? rel.split(path.sep).join('/') : part;
  });

  return 'node ' + shown.join(' ');
}

function printPlan(options) {
  const jobs = buildJobs(options);
  const lanes = planLanes(jobs);
  lanes.forEach((lane, index) => {
    console.log('lane ' + (index + 1) + '  ' + lane[0].dbPath);
    lane.forEach((job) => {
      console.log('  ' + job.name);
      console.log('  ' + formatCommand(job));
    });
  });
  if (options.status) {
    const seen = new Set();
    const locks = [];
    jobs.forEach((job) => {
      const key = path.resolve(job.dbPath);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      locks.push(writerStatus(key));
    });
    console.log(JSON.stringify(locks, null, 2));
  }

  return lanes;
}

function runAll(jobs) {
  const children = new Set();

  function runJob(job) {
    return new Promise((resolve, reject) => {
      console.log('writer start ' + job.name + '  ' + job.dbPath);
      const child = spawn(process.execPath, job.args, {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true
      });
      children.add(child);
      child.on('exit', (code, signal) => {
        children.delete(child);
        if (code === 0) {
          console.log('writer done ' + job.name);
          resolve(job.name);

          return;
        }
        reject(new Error(job.name + ' exited ' + (code == null ? signal : code)));
      });
      child.on('error', (err) => {
        children.delete(child);
        reject(err);
      });
    });
  }

  const pending = planLanes(jobs).map(async (lane) => {
    const out = [];
    for (const job of lane) {
      out.push(await runJob(job));
    }

    return out;
  });

  return Promise.all(pending).then((groups) => groups.flat()).catch(async (err) => {
    for (const child of children) {
      child.kill();
    }
    await Promise.allSettled(pending);
    throw err;
  });
}

async function runTests(options) {
  const files = options.files.length ? options.files : discoverTests(root);
  if (!files.length) {
    throw new Error('No test files to run');
  }
  if (options.dryRun) {
    console.log('test files ' + files.length + ' — one database file per writer');
    files.forEach((file) => console.log('  ' + file));

    return { ok: true, results: [], files };
  }

  const agent = new OrchestratorAgent({
    root,
    maxWorkers: options.workers || undefined,
    maxRetries: options.retries
  });
  console.log(
    'Test orchestrator: ' + files.length + ' files, up to '
    + agent.maxWorkers + ' writers, one database file each'
  );
  const report = await agent.runTests(files);
  report.events.forEach((event) => {
    if (event.type === 'conflict') {
      console.log(
        'conflict  ' + event.file + '  ' + event.resourceId
        + '  shard ' + event.shard + '  — ' + event.detail
      );
    } else if (event.type === 'provision' && event.reason === 'conflict') {
      console.log('new compute  ' + event.resourceId + '  shard ' + event.shard + '  ' + event.dbPath);
    } else if (event.type === 'skip-shard') {
      console.log('shard busy  ' + event.dbPath + '  — opening the next shard');
    }
  });
  report.results.forEach((result) => {
    const state = result.code === 0 ? 'pass' : 'fail';
    console.log(state + '  ' + result.file + '  shard ' + result.shard + '  attempt ' + result.attempt);
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      if (detail) {
        console.log(detail);
      }
    }
  });
  const failed = report.results.filter((result) => result.code !== 0).length;
  console.log('Passed ' + (report.results.length - failed) + ', failed ' + failed);

  return report;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('VirtuSP orchestrator — one writer per SQLite file');
    console.log('');
    console.log('  node agents/orchestrator.js --tests');
    console.log('  node agents/orchestrator.js --tests --workers 2 test/db.test.js');
    console.log('  node agents/orchestrator.js --dry-run');
    console.log('  node agents/orchestrator.js --status');
    console.log('  node agents/orchestrator.js --nih');
    console.log('  node agents/orchestrator.js --conversations');
    console.log('');
    console.log('A locked database or a busy port retires that process, opens a new shard, and reruns the file there.');
    return;
  }

  if (options.tests) {
    const report = await runTests(options);
    if (!report.ok) {
      process.exitCode = 1;
    }

    return;
  }

  if (options.status || options.dryRun) {
    printPlan(options);
    return;
  }

  const jobs = buildJobs(options);
  console.log('One writer per database file');
  printPlan(Object.assign({}, options, { status: false, dryRun: true }));
  await runAll(jobs);
}

module.exports = {
  parseArgs,
  buildJobs,
  formatCommand,
  printPlan,
  runAll,
  runTests
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
