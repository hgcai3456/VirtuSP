const { mock, test } = require('node:test');
const assert = require('node:assert/strict');

mock.module('../lib/pace.js', {
  exports: {
    Pace: class {
      constructor() {
        this.ok = 9;
      }
    },
    sleep: async () => {},
    defaultDelay: () => 7
  }
});

test('module mock replaces pace', () => {
  const pace = require('../lib/pace');
  assert.equal(pace.defaultDelay(), 7);
  assert.equal(new pace.Pace().ok, 9);
});
