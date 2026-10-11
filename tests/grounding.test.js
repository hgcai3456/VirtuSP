const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesKeyword } = require('../lib/virtusp-core.js');

test('grounding rules avoid false-positive chart matches', () => {
  assert.equal(matchesKeyword('I get thirsty and tired for months', 'thirst'), true);
  assert.equal(matchesKeyword('The medicine costs a lot and I wait for payday', 'cost'), true);
  assert.equal(matchesKeyword('My daughter has a rash from sulfa', 'sulfa'), true);
  assert.equal(matchesKeyword('The note says I skip the evening dose', 'evening'), true);
  assert.equal(matchesKeyword('I was retired from the unit', 'tired'), false);
  assert.equal(matchesKeyword('I feel okay and not sick', 'lab'), false);
});
