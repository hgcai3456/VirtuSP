const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesKeyword, canonicalQuestion, isGreetingQuestion } = require('../lib/virtusp-core.js');

test('keyword matching accepts direct and root matches without substring collisions', () => {
  assert.equal(matchesKeyword('I am not tired at all today', 'tired'), true);
  assert.equal(matchesKeyword('I retired after a long career', 'tired'), false);
  assert.equal(matchesKeyword('I am smoking half a pack a day', 'smok'), true);
  assert.equal(matchesKeyword('The scale is low and I feel fine', 'smok'), false);
  assert.equal(matchesKeyword('I have chest pain and trouble breathing', 'chest pain'), true);
  assert.equal(matchesKeyword('I am not taking the morning dose', 'evening'), false);
});

test('question normalization stays stable for matching and greetings', () => {
  assert.equal(canonicalQuestion('  Hello   Denise!  '), 'hello denise');
  assert.equal(isGreetingQuestion('Hi Denise'), true);
  assert.equal(isGreetingQuestion('Tell me about your inhaler'), false);
});
