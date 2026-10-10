const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { handlePatient } = require('../lib/patient-controller');
const { tempDb, mockRes } = require('./helpers');

describe('patient controller', () => {
  let box;

  before(() => {
    box = tempDb();
  });

  after(() => box.cleanup());

  function call(method, body) {
    const res = mockRes();
    const sent = [];
    const deps = {
      async readBody() {
        return body;
      },
      send(response, status, payload) {
        sent.push({ response, status, payload });

        return status;
      }
    };

    return handlePatient({ method }, res, box.db, deps).then(() => sent[0]);
  }

  test('rejects anything except POST', async () => {
    const sent = await call('GET', { request: 'hello' });
    assert.equal(sent.status, 405);
    assert.equal(sent.payload.error, 'Use POST.');
  });

  test('requires request text', async () => {
    assert.equal((await call('POST', null)).status, 400);
    assert.equal((await call('POST', {})).status, 400);
    assert.equal((await call('POST', { request: '   ' })).status, 400);
  });

  test('returns the reviewed answer', async () => {
    const sent = await call('POST', {
      request: 'Hello there',
      trust: 0,
      case_facts: { facts: [] }
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.payload.send, true);
    assert.equal(sent.payload.certainty, 0);
    assert.match(sent.payload.reply, /not sure/i);
  });

  test('lets a body error reject the handler', async () => {
    await assert.rejects(
      handlePatient({ method: 'POST' }, mockRes(), box.db, {
        readBody: async () => {
          throw new Error('Invalid JSON body');
        },
        send() {}
      }),
      /Invalid JSON body/
    );
  });
});
