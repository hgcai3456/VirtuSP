const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function discover(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : discover(file);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [file] : [];
  });
}

const files = ['test', 'tests'].flatMap(discover).sort();
if (!files.length) throw new Error('No runnable release tests discovered');
console.log(`Release tests: ${files.length} files discovered in test/ and tests/`);
const result = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
