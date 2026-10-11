#!/usr/bin/env node
const path = require('path');
const { ChatTracker } = require('../lib/chat-tracker');

const root = path.join(__dirname, '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || process.argv[index + 1] == null) {
    return fallback;
  }

  return process.argv[index + 1];
}

function has(name) {
  return process.argv.includes(name);
}

function main() {
  if (has('--help')) {
    console.log('VirtuSP chat tracker — every typed visit question and the patient reply');
    console.log('');
    console.log('  node agents/chat-tracker.js');
    console.log('  node agents/chat-tracker.js --status');
    console.log('  node agents/chat-tracker.js --tail 20');
    console.log('');
    console.log('The server appends each encounter turn to data/chat-tracker.csv.');
    return;
  }

  const file = path.resolve(root, arg('--path', path.join('data', 'chat-tracker.csv')));
  const tracker = new ChatTracker(file);
  const rows = tracker.exchanges();
  if (has('--status')) {
    console.log(JSON.stringify({
      file,
      exchanges: rows.length,
      patients: [...new Set(rows.map((row) => row.patient).filter(Boolean))]
    }, null, 2));
    return;
  }

  const tail = Math.max(0, Number(arg('--tail', String(rows.length))) || 0);
  const shown = rows.slice(Math.max(0, rows.length - tail));
  if (!shown.length) {
    console.log('No chat exchanges in ' + file);
    return;
  }
  shown.forEach((row) => {
    console.log(row.recorded_at + '  ' + (row.patient || 'patient') + '  ' + row.encounter_id);
    console.log('  request: ' + row.request);
    console.log('  response: ' + row.response);
    if (row.provider || row.latency_ms) {
      console.log('  ' + [row.provider, row.latency_ms && (row.latency_ms + ' ms')].filter(Boolean).join(' · '));
    }
    console.log('');
  });
  console.log(shown.length + ' of ' + rows.length + ' exchanges in ' + path.relative(root, file).split(path.sep).join('/'));
}

main();
