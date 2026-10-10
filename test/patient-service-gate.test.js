const { mock, test } = require('node:test');
const assert = require('node:assert/strict');

global.__patientGate = { mode: 'mismatch', kind: undefined, matches: undefined };

mock.module('../lib/grounding-gate.js', {
  exports: {
    UNKNOWN: "I'm not sure about that. Could you ask me another way?",
    checkResponse(text) {
      if (global.__patientGate.mode === 'mismatch') {
        return { allow: true, text: 'rewritten line', reason: '', matches: [] };
      }
      if (global.__patientGate.mode === 'deny') {
        return { allow: false, reason: 'nope', text: 'x', matches: [] };
      }

      return { allow: true, text, reason: 'ok' };
    },
    screenRequest() {
      return {
        allow: true,
        reason: 'ok',
        kind: global.__patientGate.kind,
        matches: global.__patientGate.matches
      };
    },
    loadLibrary() {
      return [];
    }
  }
});

const { answer } = require('../lib/patient-service');

function body() {
  return {
    request: 'zephyr please',
    trust: 0,
    case_facts: {
      facts: [{
        id: 'z1',
        label: 'zephyr fact',
        kw: ['zephyr'],
        vis: 'ask',
        gate: 0,
        say: 'The zephyr line is approved.',
        deflect: ''
      }]
    }
  };
}

test('a rewritten or ungrounded line stays unsent as a certain fact', () => {
  global.__patientGate.mode = 'mismatch';
  const rewritten = answer({ prepare() { return { all() { return []; } }; } }, body());
  assert.equal(rewritten.certainty, 0);
  assert.match(rewritten.stages.review.reason, /not grounded/);

  global.__patientGate.mode = 'deny';
  const denied = answer({ prepare() { return { all() { return []; } }; } }, body());
  assert.equal(denied.certainty, 0);
  assert.match(denied.stages.review.reason, /nope/);
});

test('public review fields tolerate missing kind, pmid, and title', () => {
  global.__patientGate.mode = 'passthrough';
  global.__patientGate.kind = '';
  global.__patientGate.matches = [
    { source: 'medical_data', id: 1, pmid: '5', title: 'T' },
    { source: 'medical_data', id: 2 },
    { source: 'medical_data', id: 3, pmid: '', title: '' },
    { source: 'medical_data', id: 4, pmid: '6', title: 'U' },
    { source: 'medical_data', id: 5, pmid: '7', title: 'V' },
    { source: 'medical_data', id: 6, pmid: '8', title: 'W' }
  ];
  const out = answer({ prepare() { return { all() { return []; } }; } }, body());
  assert.equal(out.certain, true);
  assert.equal(out.request.kind, '');
  assert.equal(out.request.matches.length, 5);
  assert.equal(out.request.matches[1].pmid, '');
  assert.equal(out.request.matches[1].title, '');
  assert.equal(out.response.matches.length, 0);
});
