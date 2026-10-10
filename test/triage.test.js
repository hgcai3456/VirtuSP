const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { triage, findPhrase, patternMatched } = require('../lib/triage');
const { tempDb, insertJournal, insertFact } = require('./helpers');

function quietDb() {
  return {
    prepare() {
      return { all: () => [], get: () => ({ n: 0 }) };
    }
  };
}

describe('triage', () => {
  let box;

  before(() => {
    box = tempDb();
  });

  after(() => box.cleanup());

  test('phrase and pattern matching honor negation', () => {
    assert.equal(findPhrase('chest pain', ''), -1);
    assert.equal(findPhrase('chest pain today', 'chest pain'), 0);
    assert.equal(findPhrase('no chest pain today', 'chest pain'), -1);
    assert.equal(findPhrase('patient denies chest pain', 'chest pain'), -1);
    assert.equal(findPhrase('denied chest pain earlier', 'chest pain'), -1);
    assert.equal(findPhrase('without chest pain', 'chest pain'), -1);
    assert.equal(findPhrase('absent chest pain', 'chest pain'), -1);
    assert.equal(findPhrase('never chest pain', 'chest pain'), -1);
    assert.equal(findPhrase('negative chest pain', 'chest pain'), -1);
    assert.equal(findPhrase("n't chest pain", 'chest pain'), -1);
    assert.equal(findPhrase('not really having chest pain but chest pain later', 'chest pain') > 0, true);
    assert.ok(findPhrase('started c. diff treatment', 'c. diff') >= 0);

    assert.equal(patternMatched({ all: ['fever', 'cough'] }, 'fever only'), null);
    assert.equal(patternMatched({ any: ['zebra'] }, 'nope'), null);
    assert.equal(patternMatched({ any: ['fever'] }, 'fever today'), 'fever');
    assert.equal(
      patternMatched({ all: ['fever', 'cough'], any: ['night'] }, 'fever and cough at night'),
      'fever + cough + night'
    );
    assert.equal(patternMatched({ all: ['fever', 'cough'] }, 'fever and cough'), 'fever + cough');
    assert.equal(patternMatched({}, 'fever'), null);
    assert.equal(patternMatched({ all: ['fever'], any: ['zebra'] }, 'fever only'), null);
  });

  test('requires a usable history', () => {
    assert.throws(() => triage(quietDb(), {}), (err) => err.status === 400 && /symptoms/.test(err.message));
    try {
      triage(quietDb(), { complaint: '   ' });
      assert.fail('expected a throw');
    } catch (err) {
      assert.equal(err.status, 400);
    }
    assert.throws(() => triage(quietDb(), { text: 'x'.repeat(8001) }), /8000/);
    const edge = triage(quietDb(), { symptoms: 'y'.repeat(8000) });
    assert.equal(edge.complaint.length, 8000);
  });

  test('names problems, red flags, and questions from the catalog', () => {
    const crisis = triage(quietDb(), { complaint: 'I want to die and I have crushing chest pain' });
    assert.equal(crisis.acuity.level, 'emergent');
    assert.match(crisis.assessment, /988/);
    assert.match(crisis.assessment, /would not name a problem|leading|chest|acute/i);
    assert.ok(crisis.acuity.reasons.length <= 6);

    const named = triage(quietDb(), { complaint: 'type 2 diabetes with thirst' });
    assert.equal(named.confidence, 'high');
    assert.equal(named.identified, true);
    assert.equal(named.leading.name, 'diabetes mellitus, type 2');
    assert.match(named.assessment, /leading problem/i);

    const scored = triage(quietDb(), { complaint: 'tearing chest pain' });
    assert.equal(scored.confidence, 'high');
    assert.equal(scored.leading.name, 'aortic aneurysm');

    const moderate = triage(quietDb(), { complaint: 'crushing chest pain' });
    assert.equal(moderate.confidence, 'moderate');
    assert.match(moderate.assessment, /would not close the case/);
    assert.match(moderate.assessment, /stays on the list/);
    assert.ok(moderate.cant_miss.includes('acute coronary syndrome'));
    assert.ok(moderate.questions.length >= 1);

    const low = triage(quietDb(), { complaint: 'chest pain and shortness of breath' });
    assert.equal(low.confidence, 'low');
    assert.equal(low.identified, false);
    assert.equal(low.leading, null);
    assert.match(low.assessment, /do not separate/);

    const thin = triage(quietDb(), { text: 'Hello there' });
    assert.equal(thin.confidence, 'insufficient');
    assert.match(thin.assessment, /would not name a problem/);
    assert.match(thin.library.warning, /^$/);
    assert.match(thin.assessment, /did not use a publication/);

    const hf = triage(quietDb(), { complaint: 'orthopnea and headache' });
    assert.equal(hf.confidence, 'low');
    assert.ok(hf.questions.some((q) => /wake at night|headache/i.test(q)));
    const blocked = triage(quietDb(), { complaint: 'orthopnea and thunderclap headache' });
    assert.ok(blocked.questions.every((q) => !/worst headache of your life/i.test(q)));

    const pregnant = triage(quietDb(), {
      complaint: 'gestational diabetes',
      pregnant: true,
      age: '32',
      sex: 'female'
    });
    assert.equal(pregnant.context.pregnant, true);
    assert.equal(pregnant.context.age, 32);
    assert.equal(pregnant.context.sex, 'female');
    assert.equal(pregnant.leading.name, 'gestational diabetes');

    const fromText = triage(quietDb(), { complaint: '12 year-old boy with a wheeze' });
    assert.equal(fromText.context.age, 12);
    assert.equal(fromText.context.sex, 'male');
    const woman = triage(quietDb(), { complaint: 'a woman with orthopnea', sex: '' });
    assert.equal(woman.context.sex, 'female');
    const unknown = triage(quietDb(), { complaint: 'orthopnea', sex: 'other', age: 'nope' });
    assert.equal(unknown.context.sex, '');
    assert.equal(unknown.context.age, null);
    const male = triage(quietDb(), { complaint: 'orthopnea', sex: 'M' });
    assert.equal(male.context.sex, 'male');

    const bleed = triage(quietDb(), { complaint: 'pregnant and bleeding' });
    assert.equal(bleed.acuity.level, 'emergent');
    assert.match(bleed.acuity.reasons.join(' '), /pregnancy/);

    const pressure = triage(quietDb(), { complaint: 'high blood pressure and a blood pressure pill' });
    assert.equal(pressure.leading.name, 'hypertension');
    const sickle = triage(quietDb(), { complaint: 'sickle cell anemia' });
    assert.equal(sickle.confidence, 'high');
    const dka = triage(quietDb(), { complaint: 'the patient has dka' });
    assert.equal(dka.leading.name, 'diabetic ketoacidosis');
    assert.equal(triage(quietDb(), { complaint: 'missed doses' }).leading.name, 'medication adherence');
  });

  test('vitals raise and keep the faster level', () => {
    const danger = triage(quietDb(), {
      complaint: 'tired today',
      sbp: 80,
      hr: 160,
      rr: 30,
      spo2: 85,
      temp: 41,
      glucose: 40
    });
    assert.equal(danger.acuity.level, 'emergent');
    assert.match(danger.acuity.reasons.join(' '), /Oxygen|Heart rate|Respiratory|Systolic|Glucose/);

    const urgent = triage(quietDb(), {
      complaint: 'tired today',
      vitals: { spo2: 92, rr: 24, hr: 45, sbp: 190, temp: 34, glucose: 60 }
    });
    assert.equal(urgent.acuity.level, 'urgent');
    assert.match(urgent.acuity.reasons.join(' '), /94%|Respiratory rate is high|Heart rate is markedly|180 or higher|Temperature|Glucose is low/);

    const pressure = triage(quietDb(), { complaint: 'chest pain and headache', sbp: 190, hr: 50, rr: 8, glucose: 450 });
    assert.equal(pressure.acuity.level, 'emergent');
    assert.match(pressure.acuity.reasons.join(' '), /organ stress/);

    const plainHigh = triage(quietDb(), { complaint: 'feeling fine today', sbp: 190, spo2: 99, temp: 'hot' });
    assert.match(plainHigh.acuity.reasons.join(' '), /180 or higher/);
    assert.equal(plainHigh.vitals.temp, null);

    const dka = triage(quietDb(), { complaint: 'vomiting and abdominal pain', glucose: 320 });
    assert.ok(dka.differential.some((row) => row.name === 'diabetic ketoacidosis'));
    const lowSugar = triage(quietDb(), { complaint: 'sweaty', glucose: 55 });
    assert.ok(lowSugar.differential.some((row) => row.name === 'hypoglycemia'));
  });

  test('quotes stored papers and reports a library failure', () => {
    const intro = 'Intro sentence. ';
    const quote = intro + ('heart failure and orthopnea '.repeat(30));
    const id = insertJournal(box.db, {
      title: 'heart failure review',
      pmid: '11',
      year: 2001,
      authors: 'Ann',
      url: 'https://example.test/hf',
      abstract: 'heart failure is described.'
    });
    insertFact(box.db, id, { quote, claim: quote, topic: 'heart failure' });
    insertJournal(box.db, {
      title: 'unrelated note',
      pmid: '22',
      year: 2010,
      url: '',
      authors: null,
      abstract: 'A short heart failure abstract for the excerpt.'
    });
    insertFact(box.db, box.db.prepare('SELECT id FROM journals WHERE pmid = ?').get('22').id, {
      quote: '',
      claim: 'empty quote still stored'
    });
    insertJournal(box.db, {
      title: 'same blank',
      pmid: '',
      year: 2000,
      url: '',
      abstract: 'heart failure appears in this abstract too.'
    });
    insertJournal(box.db, {
      title: 'same blank',
      pmid: '',
      year: 1999,
      url: '',
      abstract: 'heart failure appears again.'
    });
    insertJournal(box.db, {
      title: 'heart failure empty body',
      pmid: '33',
      year: 1990,
      abstract: '',
      url: ''
    });
    insertFact(box.db, box.db.prepare('SELECT id FROM journals WHERE pmid = ?').get('33').id, {
      quote: '   ',
      claim: 'blank'
    });
    insertJournal(box.db, {
      title: 'no term here',
      pmid: '44',
      year: 2022,
      abstract: 'completely unrelated wording without the search tokens.',
      url: ''
    });
    const extra = insertJournal(box.db, {
      title: 'heart failure extra',
      pmid: '55',
      year: 2022,
      abstract: 'heart failure extra paper',
      url: ''
    });
    insertFact(box.db, extra, {
      quote: 'completely unrelated wording without those search tokens at all today.',
      claim: 'unrelated'
    });
    insertJournal(box.db, {
      title: 'heart failure newest',
      pmid: '66',
      year: 2023,
      abstract: 'heart failure newest abstract',
      url: ''
    });

    const out = triage(box.db, { complaint: 'orthopnea' });
    assert.equal(out.leading.name, 'heart failure');
    assert.ok(out.leading.papers.length >= 1);
    assert.ok(out.leading.papers.length <= 3);
    assert.match(out.assessment, /local library has stored text/);
    assert.ok(out.library.papers_cited >= 1);
    assert.ok(out.leading.papers.some((paper) => paper.excerpt_from === 'medical_data' || paper.excerpt_from === 'abstract'));

    const failed = triage({
      prepare() {
        throw new Error('db down');
      }
    }, { complaint: 'orthopnea' });
    assert.match(failed.library.warning, /db down/);
    assert.match(failed.assessment, /No ingested paper/);

    const stringError = triage({
      prepare() {
        throw 'offline';
      }
    }, { complaint: 'orthopnea' });
    assert.equal(stringError.library.warning, 'offline');
  });
});
