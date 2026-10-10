const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  UNKNOWN,
  gate,
  checkRequest,
  checkResponse,
  screenRequest,
  loadLibrary,
  scoreAgainstLibrary
} = require('../lib/grounding-gate');
const { tempDb, insertJournal, insertFact } = require('./helpers');

function row(partial) {
  return Object.assign({
    id: 1,
    journal_id: 1,
    pmid: '',
    claim: '',
    quote: '',
    topic: '',
    keywords: '',
    journal_title: '',
    abstract: '',
    shard: 0
  }, partial);
}

const LONG_QUOTE = 'Metformin adherence in type two diabetes cohort patients improved when gastrointestinal intolerance was addressed in clinic visits today.';

describe('grounding gate', () => {
  let box;
  let other;

  before(() => {
    box = tempDb();
    other = tempDb();
    const journalId = insertJournal(box.db, {
      abstract: 'Stored abstract about metformin adherence and diabetes mortality.',
      pmid: '555'
    });
    insertFact(box.db, journalId, {
      claim: LONG_QUOTE,
      quote: LONG_QUOTE
    });
    insertJournal(other.db, { title: 'Other shard journal', pmid: '888' });
  });

  after(() => {
    box.cleanup();
    other.cleanup();
  });

  test('scores containment, overlap, topics, and the top five', () => {
    const library = [
      row({ id: 1, claim: 'short', quote: 'short quote only' }),
      row({ id: 2, claim: LONG_QUOTE, quote: 'unrelated short' }),
      row({ id: 3, claim: 'other claim text here now', quote: LONG_QUOTE }),
      row({
        id: 4,
        claim: 'nope',
        quote: 'zzzz ' + LONG_QUOTE,
        topic: 'diabetes',
        keywords: 'metformin adherence cohort trial mortality'
      }),
      row({
        id: 5,
        claim: 'alpha beta gamma',
        quote: 'alpha beta gamma delta epsilon zeta eta theta',
        topic: 'diabetes metformin stomach kidney diet',
        keywords: ''
      }),
      row({
        id: 6,
        claim: 'cohort trial adherence',
        quote: 'cohort trial adherence medication diabetes',
        topic: '',
        keywords: 'mortality'
      }),
      row({ id: 7, claim: 'one', quote: 'two', topic: 'zzz', keywords: 'yyy' }),
      row({ id: 8, claim: LONG_QUOTE + ' extra', quote: LONG_QUOTE + ' extra' })
    ];

    const contained = scoreAgainstLibrary(LONG_QUOTE, [library[1]]);
    assert.equal(contained[0].strong, true);

    const byQuote = scoreAgainstLibrary(LONG_QUOTE, [library[2]]);
    assert.equal(byQuote[0].row.id, 3);

    const byPrefix = scoreAgainstLibrary(LONG_QUOTE.slice(0, 80) + ' extra words that are not in the quote', [row({
      id: 9,
      claim: 'different claim that is certainly long enough today',
      quote: LONG_QUOTE
    })]);
    assert.equal(byPrefix[0].strong, true);

    const weakQuote = scoreAgainstLibrary('this sentence is long enough now', [row({
      id: 10,
      claim: 'unrelated claim without those words here',
      quote: 'tiny'
    })]);
    assert.equal(weakQuote.length, 0);

    const topical = scoreAgainstLibrary('diabetes metformin stomach kidney diet', [library[4]]);
    assert.ok(topical[0].score >= 5);
    assert.equal(topical[0].strong, true);

    const shared = scoreAgainstLibrary('cohort trial adherence medication', [library[5]]);
    assert.ok(shared[0].shared.length >= 3);

    const modest = scoreAgainstLibrary('cohort trial', [row({
      id: 11,
      claim: 'cohort trial',
      quote: 'nothing else',
      topic: '',
      keywords: ''
    })]);
    assert.equal(modest.length, 1);
    assert.equal(modest[0].strong, false);

    const ranked = scoreAgainstLibrary(LONG_QUOTE, library);
    assert.equal(ranked.length, 5);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.equal(scoreAgainstLibrary('', [library[0]]).length, 0);
  });

  test('checks requests against the library', () => {
    const library = [row({
      id: 4,
      pmid: '9',
      claim: 'Should I prescribe metformin for diabetes adherence in this cohort study of patients?',
      quote: 'Should I prescribe metformin for diabetes adherence in this cohort study of patients?',
      journal_title: 'Diabetes Care',
      topic: 'diabetes',
      keywords: 'metformin adherence'
    })];

    assert.equal(checkRequest('', library).allow, false);
    assert.equal(checkRequest('   ', library).allow, false);

    const blockedDose = checkRequest('What dose should I prescribe for her tomorrow?', []);
    assert.equal(blockedDose.allow, false);
    assert.equal(blockedDose.kind, 'generation');

    const blockedClaim = checkRequest('This medicine always cures the cough.', []);
    assert.equal(blockedClaim.allow, false);
    assert.equal(blockedClaim.kind, 'claim');

    const allowedDose = checkRequest(
      'Should I prescribe metformin for diabetes adherence in this cohort study of patients?',
      library
    );
    assert.equal(allowedDose.allow, true);
    assert.equal(allowedDose.kind, 'generation');
    assert.equal(allowedDose.matches[0].pmid, '9');
    assert.equal(allowedDose.matches[0].title, 'Diabetes Care');

    const allowedClaim = checkRequest('This medicine never cures diabetes by itself in every cohort.', [row({
      id: 12,
      claim: 'This medicine never cures diabetes by itself in every cohort.',
      quote: 'This medicine never cures diabetes by itself in every cohort.',
      topic: 'diabetes'
    })]);
    assert.equal(allowedClaim.allow, true);
    assert.equal(allowedClaim.kind, 'claim');

    const interview = checkRequest('What brings you in today?', library);
    assert.equal(interview.allow, true);
    assert.equal(interview.kind, 'interview');
    assert.match(interview.reason, /interview/);

    const matchedInterview = checkRequest('Tell me about metformin adherence and diabetes in the cohort.', library);
    assert.equal(matchedInterview.allow, true);
    assert.match(matchedInterview.reason, /publication library/);
    assert.ok(matchedInterview.matches.length);
  });

  test('checks responses against case facts and the library', () => {
    const library = [row({
      id: 3,
      claim: LONG_QUOTE,
      quote: LONG_QUOTE,
      topic: 'diabetes;metformin',
      keywords: 'adherence',
      pmid: '42',
      journal_title: 'BMJ'
    })];
    const facts = {
      intro: 'Hello, I am Denise.',
      facts: [
        { id: 'd8', say: 'I drink a lot of sweet tea.', deflect: '', label: 'Diet pattern' },
        { id: '', say: '', label: '' },
        { id: 'blank', say: '', deflect: '', label: '' }
      ]
    };

    assert.equal(checkResponse('', library, facts).allow, false);
    assert.equal(checkResponse('  ', library, facts).text, UNKNOWN);
    const fallback = checkResponse('  ' + UNKNOWN.toUpperCase() + '  ', library, facts);
    assert.equal(fallback.allow, true);
    assert.match(fallback.reason, /Unknown/);

    const exact = checkResponse('I drink a lot of sweet tea.', library, facts);
    assert.equal(exact.allow, true);
    assert.equal(exact.matches[0].source, 'case');
    assert.match(exact.reason, /case fact/);

    const longer = checkResponse('Hello, I am Denise. I drink a lot of sweet tea.', [], {
      intro: 'Hello, I am Denise.'
    });
    assert.equal(longer.allow, true);

    const overlap = checkResponse('alpha bravo charlie delta zebra extra', [], {
      facts: [{ id: 'o', say: 'alpha bravo charlie delta echo', label: 'tokens' }]
    });
    assert.equal(overlap.allow, true);
    assert.equal(overlap.matches[0].id, 'o');

    const miss = checkResponse('alpha bravo charlie only', [], {
      facts: [{ id: 'o', say: 'alpha bravo charlie delta echo', label: 'tokens' }]
    });
    assert.equal(miss.allow, true);
    assert.match(miss.reason, /publication library/);

    assert.equal(checkResponse('Hello there', [], null).allow, true);
    assert.equal(checkResponse('Hello there', [], {}).reason.includes('publication'), true);

    const blocked = checkResponse('Metformin always cures diabetes in every patient.', [], {});
    assert.equal(blocked.allow, false);
    assert.equal(blocked.text, UNKNOWN);
    assert.ok(blocked.unsupported.length);

    const mixed = checkResponse(
      'I drink a lot of sweet tea. Metformin always cures diabetes in every patient.',
      [],
      facts
    );
    assert.equal(mixed.allow, false);
    assert.ok(mixed.matches[0].source === 'case');

    const grounded = checkResponse(LONG_QUOTE, library, {});
    assert.equal(grounded.allow, true);
    assert.match(grounded.reason, /publication library/);
    assert.equal(grounded.matches[0].pmid, '42');

    const both = checkResponse('I drink a lot of sweet tea. ' + LONG_QUOTE, library, facts);
    assert.equal(both.allow, true);
    assert.equal(both.matches[0].source, 'case');
    assert.ok(both.matches.some((match) => match.source === 'medical_data'));
  });

  test('screenRequest loads the library only for a clinical ask', () => {
    let calls = 0;
    const interview = screenRequest('Hello there', () => {
      calls += 1;

      return [];
    });
    assert.equal(interview.allow, true);
    assert.equal(calls, 0);

    const blocked = screenRequest('What dose should I prescribe?', () => {
      calls += 1;

      return [];
    });
    assert.equal(blocked.allow, false);
    assert.equal(calls, 1);

    const notAFunction = screenRequest('This always cures diabetes.', 'library');
    assert.equal(notAFunction.allow, false);
    assert.equal(screenRequest('', () => []).allow, false);
  });

  test('gate and loadLibrary read the open databases', () => {
    const library = loadLibrary([box.db, other.db]);
    assert.ok(library.length >= 1);
    assert.match(library.find((item) => item.pmid === '555').abstract, /metformin/);

    const detached = loadLibrary({
      prepare(sql) {
        if (/FROM medical_data m/.test(sql)) {
          return {
            all: () => [{
              id: 1,
              journal_id: 5,
              claim: 'c',
              quote: 'q',
              topic: '',
              keywords: '',
              ingested_at: '',
              journal_title: '',
              authors: '',
              journal_name: '',
              year: null,
              pmid: '',
              doi: '',
              url: ''
            }]
          };
        }

        return { all: () => [] };
      }
    });
    assert.equal(detached[0].abstract, '');

    const blocked = gate(box.db, { request: 'What dose should I prescribe?' });
    assert.equal(blocked.allow, false);
    assert.equal(blocked.response, null);
    assert.equal(blocked.library.journals, 1);

    const allowed = gate(box.db, {
      request: 'What brings you in today?',
      response: '   '
    });
    assert.equal(allowed.allow, true);
    assert.equal(allowed.response, null);

    const answered = gate(box.db, {
      request: 'What brings you in today?',
      response: LONG_QUOTE,
      case_facts: {}
    });
    assert.equal(answered.response.allow, true);
    assert.equal(answered.allow, true);

    const refused = gate(box.db, {
      request: 'Hello',
      response: 'Metformin always cures diabetes.'
    });
    assert.equal(refused.allow, false);
    assert.equal(refused.response.allow, false);
  });
});
