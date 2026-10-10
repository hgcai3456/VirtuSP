#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const defaultUrl = process.env.VIRTUSP_URL || 'https://d18g7r2mfy8mll.cloudfront.net';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || process.argv[index + 1] == null) {
    return fallback;
  }

  return process.argv[index + 1];
}

function runSuite(url) {
  const cucumber = path.join(root, 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
  const args = [
    cucumber,
    '--config',
    'tests/e2e/cucumber.js',
    '--tags',
    '@live and not @local-only'
  ];
  if (process.env.CI === 'true') {
    const report = path.join(root, 'reports', 'junit', 'live-regression.xml');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    args.push('--format', 'junit:' + report);
  }

  return spawnSync(process.execPath, args, {
    cwd: root,
    env: Object.assign({}, process.env, {
      E2E_BASE_URL: url,
      E2E_REPLY_TIMEOUT_MS: process.env.E2E_REPLY_TIMEOUT_MS || '30000',
      TZ: 'UTC',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      E2E_LOCALE: 'en-US',
      E2E_TIMEZONE: 'UTC'
    }),
    stdio: 'inherit'
  });
}

function main() {
  const url = String(arg('--url', defaultUrl)).replace(/\/+$/, '');
  const attempts = Math.max(1, Number(arg('--attempts', '3')) || 3);
  console.log('Live regression target: ' + url);
  console.log('Tag filter: @live and not @local-only');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log('');
    console.log('Attempt ' + attempt + ' of ' + attempts);
    const result = runSuite(url);
    if (result.error) {
      console.error(result.error.message || result.error);
    }
    if (result.status === 0) {
      console.log('Live regression passed on attempt ' + attempt + '.');
      process.exit(0);
    }
    console.log('Attempt ' + attempt + ' exited ' + result.status + '.');
  }

  console.error('Live regression failed after ' + attempts + ' attempts.');
  process.exit(1);
}

main();
