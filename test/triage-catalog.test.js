const { mock, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'illnesses.json'), 'utf8'));
const rows = real
  .filter((row) => !['hypoglycemia', 'diabetic ketoacidosis', 'acute coronary syndrome'].includes(row.name))
  .map((row) => (row.name === 'asthma' ? Object.assign({}, row, { chapter: 'unlisted' }) : row));

mock.module('../lib/nih-ingest.js', {
  exports: {
    loadIllnesses() {
      return rows;
    }
  }
});

const { triage } = require('../lib/triage');

function db() {
  return { prepare() { throw new Error('closed'); } };
}

test('missing catalog rows and unknown chapters stay out of the differential', () => {
  const wheeze = triage(db(), { complaint: 'wheeze' });
  const asthma = wheeze.differential.find((row) => row.name === 'asthma');
  assert.equal(asthma.chapter, 'unlisted');
  assert.equal(asthma.chapter_label, 'unlisted');

  const low = triage(db(), { complaint: 'sweaty and shaky', glucose: 40 });
  assert.equal(low.acuity.level, 'emergent');
  assert.ok(!low.differential.some((row) => row.name === 'hypoglycemia'));

  const high = triage(db(), { complaint: 'vomiting and abdominal pain', glucose: 360 });
  assert.ok(!high.differential.some((row) => row.name === 'diabetic ketoacidosis'));

  const chest = triage(db(), { complaint: 'crushing chest pain' });
  assert.ok(!chest.differential.some((row) => row.name === 'acute coronary syndrome'));
  assert.match(chest.library.warning, /closed/);
});
