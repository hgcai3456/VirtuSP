#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const trackerPath = path.join(root, 'data', 'prompts-tested.csv');
const source = 'agents/regression.js';
const header = [
  'tested_on', 'suite', 'case', 'prompt', 'trust', 'setup',
  'expected', 'observed', 'status', 'reply', 'latency_ms', 'source'
];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1];
}

function rel(file) {
  if (!file) {
    return '';
  }
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);

  return path.relative(root, absolute).split(path.sep).join('/');
}

function walk(dir, match, found) {
  if (!fs.existsSync(dir)) {
    return found;
  }
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'reports') {
      return;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, match, found);

      return;
    }
    if (entry.isFile() && match(entry.name)) {
      found.push(full);
    }
  });

  return found;
}

function run(args, extraEnv) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: Object.assign({}, process.env, {
      TZ: 'UTC',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      E2E_LOCALE: 'en-US',
      E2E_TIMEZONE: 'UTC'
    }, extraEnv || {}),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
}

function yamlValue(yaml, key) {
  const lines = String(yaml || '').split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp('^\\s*' + key + ':').test(line));
  if (start === -1) {
    return '';
  }
  const inline = lines[start].replace(new RegExp('^\\s*' + key + ':\\s*'), '');
  if (inline && inline !== '|-' && inline !== '|') {
    return inline.replace(/^['"]|['"]$/g, '').replace(/\\n/g, ' ').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*[A-Za-z_][\w]*:/.test(lines[i]) || /^\s*\.\.\.$/.test(lines[i])) {
      break;
    }
    body.push(lines[i].trim());
  }

  return body.join(' ').replace(/\s+/g, ' ').trim();
}

function parseTap(text) {
  const results = [];
  const stack = [];
  const lines = String(text || '').split(/\r?\n/);
  let block = null;

  function close(yamlLines) {
    const yaml = yamlLines.join('\n');
    const type = yamlValue(yaml, 'type');
    if (type === 'test') {
      const parents = stack.slice(0, -1).map((item) => item.name);
      const error = yamlValue(yaml, 'error');
      const expected = yamlValue(yaml, 'expected');
      const actual = yamlValue(yaml, 'actual');
      const location = yamlValue(yaml, 'location');
      results.push({
        suite: parents.join(' / ') || 'unit',
        case: block.name,
        prompt: block.name,
        file: location ? location.replace(/:\d+:\d+$/, '').replace(/\\/g, '/') : '',
        expected: 'Pass with no error.',
        observed: block.status === 'pass'
          ? 'Passed.'
          : [error, expected && ('expected ' + expected), actual && ('actual ' + actual)].filter(Boolean).join(' '),
        status: block.status,
        reply: block.status === 'pass' ? '' : actual,
        latency_ms: Math.round(Number(yamlValue(yaml, 'duration_ms')) || 0)
      });
    }
    block = null;
  }

  lines.forEach((line) => {
    if (block) {
      if (/^\s*\.\.\.$/.test(line)) {
        close(block.yaml);

        return;
      }
      block.yaml.push(line);

      return;
    }
    const announced = /^( *)# Subtest: (.*)$/.exec(line);
    if (announced) {
      const indent = announced[1].length;
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      stack.push({ indent, name: announced[2] });

      return;
    }
    const result = /^( *)(ok|not ok) \d+ - (.*)$/.exec(line);
    if (result) {
      block = {
        status: result[2] === 'ok' ? 'pass' : 'fail',
        name: result[3],
        yaml: []
      };
    }
  });

  return results;
}

function stepMs(result) {
  const duration = result && result.duration;
  if (duration == null) {
    return 0;
  }
  if (typeof duration === 'number') {
    return duration / 1e6;
  }

  return ((duration.seconds || 0) * 1000) + ((duration.nanos || 0) / 1e6);
}

function parseCucumber(file) {
  const features = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = [];
  features.forEach((feature) => {
    (feature.elements || []).forEach((element) => {
      if (element.type && element.type !== 'scenario') {
        return;
      }
      const steps = (element.steps || []).filter((step) => !step.hidden);
      const actions = [];
      const expectations = [];
      let asserting = false;
      let failed = null;
      let latency = 0;
      steps.forEach((step) => {
        const keyword = String(step.keyword || '').trim();
        const result = step.result || {};
        const status = String(result.status || 'unknown').toLowerCase();
        latency += stepMs(result);
        if (keyword === 'Then') {
          asserting = true;
        } else if (keyword === 'Given' || keyword === 'When') {
          asserting = false;
        }
        if (asserting) {
          expectations.push(step.name || keyword);
        } else {
          actions.push((keyword + ' ' + (step.name || '')).trim());
        }
        if (!failed && status !== 'passed') {
          failed = (step.name || keyword) + ': ' + (result.error_message || status);
        }
      });
      rows.push({
        suite: 'e2e / ' + (feature.name || rel(feature.uri || 'feature')),
        case: element.name || 'scenario',
        prompt: actions.join(' | '),
        file: feature.uri || '',
        expected: expectations.join(' | ') || 'The scenario passes.',
        observed: failed ? failed.replace(/\s+/g, ' ').slice(0, 800) : 'Every step passed.',
        status: failed ? 'fail' : 'pass',
        reply: '',
        latency_ms: Math.round(latency)
      });
    });
  });

  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cell) => cell !== ''));
}

function csvField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function writeTracker(rows) {
  const testedOn = new Date().toISOString().slice(0, 10);
  const setupBase = 'TZ=UTC; locale=en-US; platform=' + process.platform + '; node=' + process.version;
  const previous = fs.existsSync(trackerPath) ? parseCsv(fs.readFileSync(trackerPath, 'utf8')) : [header];
  const kept = previous.filter((row, index) => index === 0 || row[row.length - 1] !== source);
  const fresh = rows.map((row) => [
    testedOn,
    row.suite,
    row.case,
    row.prompt,
    '',
    setupBase + (row.file ? '; file=' + rel(row.file) : ''),
    row.expected,
    row.observed,
    row.status,
    row.reply || '',
    String(row.latency_ms || 0),
    source
  ]);
  const lines = kept.concat(fresh).map((row) => row.map(csvField).join(','));
  fs.writeFileSync(trackerPath, lines.join('\n') + '\n');
}

function harnessFailure(suite, observed) {
  return [{
    suite,
    case: 'runner',
    prompt: 'Run the suite',
    file: '',
    expected: 'The suite finishes and every case passes.',
    observed: String(observed || 'The runner failed before reporting a case.').replace(/\s+/g, ' ').slice(0, 800),
    status: 'fail',
    reply: '',
    latency_ms: 0
  }];
}

function unitRows(files) {
  console.log('Unit regression: ' + files.length + ' files');
  const result = run([
    '--experimental-test-module-mocks',
    '--test',
    '--test-isolation=process',
    '--test-concurrency=1',
    '--test-reporter=tap',
    '--experimental-test-coverage',
    '--test-coverage-include=lib/grounding-gate.js',
    '--test-coverage-include=lib/response-interceptor.js',
    '--test-coverage-lines=100',
    '--test-coverage-branches=100',
    '--test-coverage-functions=100'
  ].concat(files));
  const rows = parseTap(result.stdout);
  if (!rows.length) {
    return harnessFailure('unit', result.stderr || result.stdout);
  }
  if (result.status !== 0 && rows.every((row) => row.status === 'pass')) {
    rows.push({
      suite: 'unit',
      case: 'coverage',
      prompt: 'Keep grounding-gate.js and response-interceptor.js fully covered',
      file: 'lib/response-interceptor.js',
      expected: 'Line, branch, and function coverage stay at 100%.',
      observed: String(result.stdout || result.stderr).replace(/\s+/g, ' ').slice(-800),
      status: 'fail',
      reply: '',
      latency_ms: 0
    });
  }

  return rows;
}

function e2eRows() {
  const report = path.join(root, 'tests', 'e2e', 'reports', 'cucumber.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  if (fs.existsSync(report)) {
    fs.rmSync(report);
  }
  console.log('End-to-end regression');
  const cucumber = path.join(root, 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
  const result = run([
    cucumber,
    '--config',
    'tests/e2e/cucumber.js',
    '--format',
    'json:' + report
  ]);
  if (!fs.existsSync(report)) {
    return harnessFailure('e2e', result.stderr || result.stdout);
  }
  const rows = parseCucumber(report);
  if (!rows.length) {
    return harnessFailure('e2e', result.stderr || result.stdout || 'Cucumber reported no scenarios.');
  }

  return rows;
}

function main() {
  const only = arg('--only', 'all');
  const unitFiles = walk(path.join(root, 'test'), (name) => name.endsWith('.test.js'), []);
  const features = walk(path.join(root, 'tests'), (name) => name.endsWith('.feature'), []);
  if (!unitFiles.length || !features.length) {
    console.error('Regression discovery failed. unit=' + unitFiles.length + ' features=' + features.length);
    process.exit(1);
  }
  console.log('Discovered ' + unitFiles.length + ' unit files and ' + features.length + ' features.');
  features.forEach((file) => console.log('  ' + rel(file)));

  let rows = [];
  if (only !== 'e2e') {
    rows = rows.concat(unitRows(unitFiles.map(rel)));
  }
  if (only !== 'unit') {
    rows = rows.concat(e2eRows());
  }
  writeTracker(rows);
  const failed = rows.filter((row) => row.status !== 'pass');
  console.log('');
  console.log('Recorded ' + rows.length + ' cases in data/prompts-tested.csv');
  console.log('Passed ' + (rows.length - failed.length) + ', failed ' + failed.length);
  failed.slice(0, 20).forEach((row) => {
    console.log('FAIL ' + row.suite + ' / ' + row.case);
    console.log('  ' + row.observed);
  });
  process.exit(failed.length ? 1 : 0);
}

main();
