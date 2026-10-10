const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { Pace, sleep, defaultDelay } = require('../lib/pace');

describe('pace', { concurrency: false }, () => {
  const previous = process.env.NCBI_API_KEY;

  afterEach(() => {
    if (previous == null) delete process.env.NCBI_API_KEY;
    else process.env.NCBI_API_KEY = previous;
    mock.timers.reset();
  });

  test('default delay follows the API key', () => {
    delete process.env.NCBI_API_KEY;
    assert.equal(defaultDelay(), 400);
    process.env.NCBI_API_KEY = 'secret';
    assert.equal(defaultDelay(), 120);
  });

  test('constructor and setDelay clamp the gap', () => {
    delete process.env.NCBI_API_KEY;
    assert.equal(new Pace().delayMs, 400);
    assert.equal(new Pace(0).delayMs, 400);
    assert.equal(new Pace(50).delayMs, 100);
    assert.equal(new Pace(250).delayMs, 250);

    const pace = new Pace(250);
    pace.setDelay(50);
    assert.equal(pace.delayMs, 100);
    pace.setDelay('later');
    assert.equal(pace.delayMs, 100);
    pace.setDelay(0);
    assert.equal(pace.delayMs, 100);
    pace.setDelay(180);
    assert.equal(pace.delayMs, 180);
  });

  test('wait and backoff honor the clock', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const pendingSleep = sleep(25);
    mock.timers.tick(25);
    await pendingSleep;

    const pace = new Pace(100);
    await pace.wait();
    const waiting = pace.wait();
    mock.timers.tick(100);
    await waiting;

    const long = pace.backoff(20);
    mock.timers.tick(60000);
    await long;
    const short = pace.backoff(0);
    mock.timers.tick(4000);
    await short;
  });
});
