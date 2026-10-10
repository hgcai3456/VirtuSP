const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const marker = 'virtusp-integration';
const hook = [
  '#!/bin/sh',
  '# ' + marker + ': the live server, database, and agents must still agree.',
  'root=$(git rev-parse --show-toplevel) || exit 1',
  'cd "$root" || exit 1',
  'npm run test:integration',
  ''
].join('\n');

function hooksDir() {
  const git = path.join(root, '.git');
  if (!fs.existsSync(git)) {
    return '';
  }
  if (fs.statSync(git).isDirectory()) {
    return path.join(git, 'hooks');
  }

  const text = fs.readFileSync(git, 'utf8');
  const match = /^gitdir:\s*(.+)$/m.exec(text);
  if (!match) {
    return '';
  }

  return path.join(path.resolve(root, match[1].trim()), 'hooks');
}

function main() {
  const dir = hooksDir();
  if (!dir) {
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'pre-commit');
  if (fs.existsSync(dest)) {
    const current = fs.readFileSync(dest, 'utf8');
    if (!current.includes(marker)) {
      console.error('Left the existing pre-commit hook in place: ' + dest);
      return;
    }
  }

  fs.writeFileSync(dest, hook);
  try {
    fs.chmodSync(dest, 0o755);
  } catch (err) {
    // Windows may ignore the executable bit. Git still runs the hook.
  }
}

main();
