const { test } = require('node:test');
const assert = require('node:assert/strict');
const { any, all, ALIASES, PATTERNS, RED_FLAGS, SAFETY_QUESTIONS } = require('../lib/clinical-patterns');

test('pattern builders keep an explicit acuity and clear a missing one', () => {
  assert.deepEqual(any(['wheeze'], 'asthma', 7, 'urgent', 'Is it new?'), {
    any: ['wheeze'],
    illness: 'asthma',
    weight: 7,
    acuity: 'urgent',
    ask: 'Is it new?'
  });
  assert.deepEqual(any(['wheeze'], 'asthma', 7), {
    any: ['wheeze'],
    illness: 'asthma',
    weight: 7,
    acuity: null,
    ask: null
  });
  assert.deepEqual(all(['fever', 'cough'], 'pneumonia', 8, '', ''), {
    all: ['fever', 'cough'],
    illness: 'pneumonia',
    weight: 8,
    acuity: null,
    ask: null
  });
  assert.equal(all(['fever'], 'pneumonia', 5, 'soon', 'How high?').ask, 'How high?');
  assert.ok(PATTERNS.length > 20);
  assert.ok(RED_FLAGS.some((flag) => String(flag.reason).includes('988')));
  assert.ok(SAFETY_QUESTIONS[0].ask);
  assert.ok(ALIASES.hypertension.includes('high blood pressure'));
});
