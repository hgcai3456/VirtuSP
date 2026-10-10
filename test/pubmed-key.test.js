const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NCBI_API_KEY = 'unit-key';
process.env.NCBI_EMAIL = 'unit@example.com';

const { searchPubmedPage, pace } = require('../lib/pubmed');

test('eutils sends the NCBI API key when it is configured', async () => {
  pace.wait = async () => {};
  let seen = '';
  global.fetch = async (url) => {
    seen = String(url);

    return {
      ok: true,
      status: 200,
      json: async () => ({ esearchresult: { idlist: [], count: '0' } }),
      text: async () => ''
    };
  };
  await searchPubmedPage('metformin');
  assert.match(seen, /api_key=unit-key/);
  assert.match(seen, /unit%40example\.com|unit@example\.com/);
  delete global.fetch;
});
