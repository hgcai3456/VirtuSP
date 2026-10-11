const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/virtusp-core');
const fs = require('node:fs');
test('short abbreviations require exact tokens', () => {for(const word of ['doctor','correct','contact','activity','ctscan']) assert.equal(core.matchesKeyword(word,'ct'),false); assert.equal(core.matchesKeyword('CT scan','ct'),true);});
test('browser helper is exactly the tested server helper', () => {assert.equal(fs.readFileSync('public/js/virtusp-core.js','utf8'),fs.readFileSync('lib/virtusp-core.js','utf8'));});
