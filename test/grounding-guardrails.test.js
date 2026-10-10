const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, test } = require('node:test');
const { openDb } = require('../lib/db');
const {
  UNKNOWN,
  checkRequest,
  checkResponse,
  gate,
  loadLibrary,
  scoreAgainstLibrary,
  screenRequest,
  matchCase
} = require('../lib/grounding-gate');
const { IngestAgent, extractFacts, includesQuote } = require('../lib/ingest-agent');
const { answer } = require('../lib/patient-service');

const QUOTE = 'Missed doses of oral hypoglycaemic medication are common in type 2 diabetes.';
const SPIROMETRY = 'Spirometry values fell after the smoking cessation attempt failed badly.';

function paper(overrides) {
  return Object.assign({
    id: 1,
    journal_id: 1,
    pmid: '11942998',
    journal_title: 'Diabetic Medicine',
    claim: '',
    quote: '',
    topic: '',
    keywords: '',
    abstract: ''
  }, overrides);
}

function withDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-guard-'));
  const db = openDb(path.join(dir, 't.sqlite'));

  try {
    return fn(db, dir);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function seedFact(db, fields) {
  const journal = db.prepare(`
    INSERT INTO journals (
      pmid, doi, title, authors, journal_name, year, volume, issue, pages,
      abstract, url, source_type, source_path, ingested_at
    ) VALUES (
      @pmid, @doi, @title, @authors, @journal_name, @year, NULL, NULL, NULL,
      @abstract, NULL, 'test', NULL, '2020-01-01T00:00:00.000Z'
    )
  `).run({
    pmid: fields.pmid || null,
    doi: fields.doi || null,
    title: fields.title || 'Test paper',
    authors: fields.authors || null,
    journal_name: fields.journal_name || 'Test Journal',
    year: fields.year == null ? null : fields.year,
    abstract: fields.abstract === undefined ? null : fields.abstract
  });
  const journalId = Number(journal.lastInsertRowid);

  if (fields.claim || fields.quote) {
    db.prepare(`
      INSERT INTO medical_data (
        journal_id, claim, quote, topic, section, population, intervention,
        outcome, evidence_level, keywords, ingested_at
      ) VALUES (
        @journal_id, @claim, @quote, @topic, 'abstract', NULL, NULL,
        NULL, 'source_sentence', @keywords, '2020-01-01T00:00:00.000Z'
      )
    `).run({
      journal_id: journalId,
      claim: fields.claim || fields.quote,
      quote: fields.quote || fields.claim,
      topic: fields.topic || '',
      keywords: fields.keywords || ''
    });
  }

  return journalId;
}

function scriptedDb(journals, facts, counts) {
  return {
    prepare(sql) {
      const text = String(sql);

      return {
        all() {
          if (text.includes('SELECT j.*')) {
            return journals;
          }
          if (text.includes('FROM medical_data m')) {
            return facts;
          }
          throw new Error('Unexpected SQL: ' + text);
        },
        get() {
          if (text.includes('FROM journals')) {
            return { n: counts.journals };
          }
          if (text.includes('FROM medical_data')) {
            return { n: counts.medical_data };
          }
          if (text.includes('FROM conversations')) {
            return { n: counts.conversations || 0 };
          }
          if (text.includes('FROM conversation_turns')) {
            return { n: counts.conversation_turns || 0 };
          }
          throw new Error('Unexpected SQL: ' + text);
        }
      };
    }
  };
}

describe('scoreAgainstLibrary', () => {
  test('ignores stop words, short tokens, and rows with no real overlap', () => {
    const hits = scoreAgainstLibrary('that this with from ???', [
      paper({ claim: 'that this with from' }),
      paper({ id: 2, claim: undefined, quote: undefined, topic: undefined, keywords: undefined, journal_title: undefined, abstract: undefined })
    ]);

    assert.deepEqual(hits, []);
  });

  test('treats a 19-character excerpt as overlap only and a 20-character excerpt as contained', () => {
    const shortText = 'adherence metformin';
    const exactText = 'adherence metformins';
    assert.equal(shortText.length, 19);
    assert.equal(exactText.length, 20);

    const shortHits = scoreAgainstLibrary(shortText, [
      paper({ claim: 'xx adherence metformin yy', quote: 'unrelated quote text' })
    ]);
    const exactHits = scoreAgainstLibrary(exactText, [
      paper({ claim: 'xx adherence metformins yy', quote: 'unrelated quote text' })
    ]);

    assert.equal(shortHits.length, 1);
    assert.equal(shortHits[0].strong, false);
    assert.equal(shortHits[0].score, 4);
    assert.equal(exactHits[0].strong, true);
    assert.equal(exactHits[0].score, 10);
  });

  test('matches a quote that contains the text when the claim does not', () => {
    const text = 'missed evening tablets';
    assert.ok(text.length >= 20);
    const hits = scoreAgainstLibrary(text, [
      paper({
        claim: 'a claim about something else entirely',
        quote: 'Patients missed evening tablets last month.'
      })
    ]);

    assert.equal(hits[0].strong, true);
    assert.ok(hits[0].score >= 6);
  });

  test('matches when the text contains the first 80 characters of a longer quote', () => {
    const prefix = 'Missed doses of oral hypoglycaemic medication remain common in diabetes clinics.';
    assert.equal(prefix.length, 80);
    const quote = prefix + ' The rest of this quote is not copied.';
    const text = prefix + ' different trailing words about the weather outside';
    const hits = scoreAgainstLibrary(text, [
      paper({ claim: 'unrelated claim that does not contain the request', quote })
    ]);

    assert.equal(hits[0].strong, true);
    assert.ok(hits[0].score >= 6);
  });

  test('does not treat a long quote as contained when the text misses its prefix', () => {
    const hits = scoreAgainstLibrary('alpha bravo but otherwise a completely different sentence', [
      paper({
        claim: 'nothing shared beyond the two opening words here',
        quote: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet'
      })
    ]);

    assert.equal(hits.length, 1);
    assert.equal(hits[0].strong, false);
    assert.equal(hits[0].score, 2);
  });

  test('does not use the quote-prefix rule when the quote is under 40 characters', () => {
    const quote = 'missed evening metformin tablets daily.';
    assert.equal(quote.length, 39);
    const hits = scoreAgainstLibrary(quote + ' extra words that make this longer', [
      paper({ claim: 'nothing relevant appears in this claim', quote })
    ]);

    assert.equal(hits[0].contained, false);
    assert.equal(hits[0].strong, true);
    assert.equal(hits[0].score, 6);
  });

  test('is strong from three shared words without a containment bonus', () => {
    const hits = scoreAgainstLibrary('alpha bravo charlie something', [
      paper({ claim: 'alpha bravo charlie zebra', quote: 'short' })
    ]);

    assert.equal(hits[0].strong, true);
    assert.equal(hits[0].score, 3);
  });

  test('is strong from topic substrings when whole tokens do not overlap', () => {
    const text = 'prediabetes microdose stomachache inhaleruse smokingextra';
    const hits = scoreAgainstLibrary(text, [
      paper({
        claim: 'diabetes dose stomach inhaler smoking',
        quote: 'diabetes dose stomach inhaler smoking'
      })
    ]);

    assert.equal(hits.length, 1);
    assert.equal(hits[0].strong, true);
    assert.equal(hits[0].score, 5);
    assert.deepEqual(hits[0].shared, ['diabetes', 'stomach', 'inhaler', 'smoking', 'dose']);
  });

  test('keeps a topic hit once when it is also a token', () => {
    const hits = scoreAgainstLibrary('diabetes diabetes care', [
      paper({ claim: 'diabetes follow-up visit', quote: 'diabetes follow-up visit' })
    ]);

    assert.deepEqual(hits[0].shared, ['diabetes']);
  });

  test('keeps hyphenated tokens such as follow-up', () => {
    const hits = scoreAgainstLibrary('ask about the follow-up visit tomorrow', [
      paper({ claim: 'follow-up visit notes', quote: 'follow-up visit notes for clinic' })
    ]);

    assert.ok(hits[0].shared.includes('follow-up'));
  });

  test('returns at most five rows and drops the weakest', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'hotel'];
    const text = words.join(' ') + ' extraunique';
    const rows = words.map((word, index) => {
      const kept = words.slice(0, index + 1);

      return paper({
        id: index + 1,
        claim: kept.join(' ') + (index === words.length - 1 ? ' suffixword' : ''),
        quote: 'short'
      });
    });
    const hits = scoreAgainstLibrary(text, rows);

    assert.equal(hits.length, 5);
    assert.deepEqual(hits.map((hit) => hit.row.id), [7, 6, 5, 4, 3]);
    assert.deepEqual(hits.map((hit) => hit.score), [7, 6, 5, 4, 3]);
  });
});

describe('matchCase', () => {
  test('returns null for an empty line and a case with no text', () => {
    assert.equal(matchCase('', { facts: [{ id: 'a', say: 'Hello there friend' }] }), null);
    assert.equal(matchCase('   ', null), null);
    assert.equal(matchCase('Hello there friend', { facts: [{ id: 'blank' }] }), null);
    assert.equal(matchCase('hello there friend', { facts: [{ say: 'Hi' }] }), null);
  });

  test('matches a reply that contains the approved say or the approved deflect', () => {
    const bySay = matchCase('note The patient drinks sweet tea daily please', {
      facts: [{
        id: 's',
        say: 'The patient drinks sweet tea daily',
        deflect: 'Ask about something else entirely please',
        label: 'Diet'
      }]
    });
    const byDeflect = matchCase('I would rather not discuss money today', {
      facts: [{
        id: 'd',
        say: 'The long approved sentence is about thirst and fatigue.',
        deflect: 'I would rather not discuss money'
      }]
    });

    assert.equal(bySay.id, 's');
    assert.equal(byDeflect.id, 'd');
  });
});

describe('checkRequest', () => {
  test('blocks empty and whitespace requests', () => {
    for (const value of ['', '   ', null, undefined]) {
      const result = checkRequest(value, []);
      assert.equal(result.allow, false);
      assert.equal(result.reason, 'Empty request was not sent.');
      assert.deepEqual(result.matches, []);
    }
  });

  test('blocks unsupported generation and claim asks', () => {
    const asks = [
      ['What dose of metformin should I prescribe?', 'generation'],
      ['What is the recommended dose?', 'generation'],
      ['Should I start her on insulin?', 'generation'],
      ['Is it safe to give this drug?', 'generation'],
      ['Start them on insulin tonight', 'generation'],
      ['Treat with metformin', 'generation'],
      ['Treat using insulin', 'generation'],
      ['This is first-line therapy', 'generation'],
      ['This is first line therapy', 'generation'],
      ['Give insulin units now', 'generation'],
      ['Use 2 mg/kg tonight', 'generation'],
      ['Read me the guideline', 'generation'],
      ['Please prescribe metformin now', 'generation'],
      ['Should I prescribe metformin?', 'generation'],
      ['Is this contraindicated?', 'generation'],
      ['You should take double', 'claim'],
      ['You should stop the pills', 'claim'],
      ['You should start insulin', 'claim'],
      ['You should increase the dose', 'claim'],
      ['The correct dose is 500', 'claim'],
      ['This cures diabetes', 'claim'],
      ['This will cure the cough', 'claim'],
      ['This will fix the cough', 'claim'],
      ['This will reverse the disease', 'claim'],
      ['It is guaranteed', 'claim'],
      ['You must take this', 'claim'],
      ['Metformin always works', 'claim'],
      ['It never fails', 'claim'],
      ['Proven to help the pain', 'claim'],
      ['Sugar causes fatigue', 'claim']
    ];

    for (const [ask, kind] of asks) {
      const result = checkRequest(ask, []);
      assert.equal(result.allow, false, ask);
      assert.equal(result.kind, kind, ask);
      assert.equal(result.reason, 'Request blocked: no journal or medical_data row supports this clinical ask. It was not sent.');
    }
  });

  test('labels a blocked ask as generation when it is also a claim', () => {
    const result = checkRequest('What dose should I prescribe? You should take double.', []);

    assert.equal(result.allow, false);
    assert.equal(result.kind, 'generation');
  });

  test('allows interview turns that mention a condition without making a clinical ask', () => {
    const turns = [
      'Hello there',
      'What brings you in today?',
      'Tell me how you take your metformin.',
      'The patient was nevertheless tired.',
      'I recommended rest'
    ];

    for (const turn of turns) {
      const result = checkRequest(turn, []);
      assert.equal(result.allow, true, turn);
      assert.equal(result.kind, 'interview', turn);
      assert.equal(result.reason, 'Request allowed as an interview turn (no unsupported clinical claim).');
      assert.deepEqual(result.matches, []);
    }
  });

  test('blocks a generation ask that only weakly overlaps the library and still returns the weak matches', () => {
    const result = checkRequest('What dose of metformin should I prescribe?', [
      paper({ claim: 'metformin tablet', quote: 'metformin tablet', topic: 'metformin' })
    ]);

    assert.equal(result.allow, false);
    assert.equal(result.kind, 'generation');
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].source, 'medical_data');
    assert.equal(result.matches[0].pmid, '11942998');
    assert.equal(result.matches[0].title, 'Diabetic Medicine');
  });

  test('allows a generation ask and a claim when a library row strongly supports them', () => {
    const library = [paper({ claim: QUOTE, quote: QUOTE, topic: 'diabetes;adherence', abstract: QUOTE })];
    const generation = checkRequest(QUOTE + ' What dose should I prescribe?', library);
    const claim = checkRequest('You should take ' + QUOTE, library);

    assert.equal(generation.allow, true);
    assert.equal(generation.kind, 'generation');
    assert.equal(generation.reason, 'Request allowed against the publication library.');
    assert.equal(claim.allow, true);
    assert.equal(claim.kind, 'claim');
    assert.ok(claim.matches[0].shared.includes('diabetes'));
  });

  test('cites an interview turn when the library overlaps and the ask is not clinical', () => {
    const result = checkRequest('Tell me about missed doses of metformin.', [
      paper({
        pmid: '',
        journal_title: '',
        claim: 'Missed doses of metformin were recorded.',
        quote: 'Missed doses of metformin were recorded.'
      })
    ]);

    assert.equal(result.allow, true);
    assert.equal(result.kind, 'interview');
    assert.equal(result.reason, 'Request allowed against the publication library.');
    assert.equal(result.matches[0].pmid, '');
    assert.equal(result.matches[0].title, '');
  });
});

describe('checkResponse', () => {
  test('replaces an empty reply with the unknown line and does not send it', () => {
    for (const value of ['', '   ', null, undefined]) {
      const result = checkResponse(value, [], {});
      assert.equal(result.allow, false);
      assert.equal(result.text, UNKNOWN);
      assert.equal(result.reason, 'Empty response was not sent.');
    }
  });

  test('allows the unknown fallback in any case and with collapsed whitespace', () => {
    const spaced = "I'm not sure about that.  Could you ask me another way?";
    const result = checkResponse('  ' + UNKNOWN.toUpperCase() + '  ', [], {});
    const collapsed = checkResponse(spaced, [], {});

    assert.equal(result.allow, true);
    assert.equal(result.reason, 'Unknown fallback is allowed.');
    assert.equal(result.text, UNKNOWN.toUpperCase());
    assert.deepEqual(result.matches, []);
    assert.equal(collapsed.allow, true);
    assert.equal(collapsed.reason, 'Unknown fallback is allowed.');
  });

  test('allows an approved case line and cites the case before any library row', () => {
    const say = "I've been really thirsty and tired for a few months.";
    const result = checkResponse(say, [
      paper({ claim: QUOTE, quote: QUOTE })
    ], {
      intro: "Hi, I'm Denise.",
      facts: [{ id: 'd1', say, label: 'Chief complaint' }]
    });

    assert.equal(result.allow, true);
    assert.equal(result.reason, 'Response grounded on an approved case fact.');
    assert.equal(result.text, say);
    assert.equal(result.matches[0].source, 'case');
    assert.equal(result.matches[0].id, 'd1');
    assert.equal(result.matches[0].title, 'Approved case fact');
  });

  test('grounds a reply on the opening line and on a fact that has no id', () => {
    const intro = checkResponse("Hi, I'm Denise.", [], { intro: "Hi, I'm Denise." });
    const unlabeled = checkResponse('alpha bravo charlie delta zebra', [], {
      facts: [{ say: 'alpha bravo charlie delta echo' }]
    });

    assert.equal(intro.allow, true);
    assert.equal(intro.matches[0].id, 'intro');
    assert.equal(unlabeled.allow, true);
    assert.equal(unlabeled.matches[0].id, '');
    assert.equal(unlabeled.reason, 'Response grounded on an approved case fact.');
  });

  test('matches a fact when the reply contains it, when the fact contains the reply, and when neither contains the other', () => {
    const contained = checkResponse('thirsty and tired lately', [], {
      facts: [{ id: 'a', say: 'I have been thirsty and tired lately' }]
    });
    const container = checkResponse('note thirsty and tired lately please', [], {
      facts: [{ id: 'b', say: 'thirsty and tired lately' }]
    });
    const overlap = checkResponse('alpha bravo charlie delta zebra', [], {
      facts: [
        { id: 'empty' },
        { id: 'c', say: 'alpha bravo charlie delta echo', deflect: '', label: '' }
      ]
    });
    const miss = checkResponse('alpha bravo charlie zebra yacht', [], {
      facts: [{ id: 'd', say: 'alpha bravo charlie delta echo' }]
    });

    assert.equal(contained.matches[0].id, 'a');
    assert.equal(container.matches[0].id, 'b');
    assert.equal(overlap.matches[0].id, 'c');
    assert.equal(miss.allow, true);
    assert.equal(miss.reason, 'Response grounded on the publication library.');
    assert.deepEqual(miss.matches, []);
  });

  test('allows ordinary chat and a verbatim library quote', () => {
    const chat = checkResponse('Hello there. I walked the dog!', [], null);
    const quoted = checkResponse(QUOTE, [paper({ claim: QUOTE, quote: QUOTE, pmid: '11942998' })], {});

    assert.equal(chat.allow, true);
    assert.equal(chat.matches.length, 0);
    assert.equal(quoted.allow, true);
    assert.equal(quoted.reason, 'Response grounded on the publication library.');
    assert.equal(quoted.text, QUOTE);
    assert.equal(quoted.matches[0].pmid, '11942998');
  });

  test('blocks an invented medical line and does not return that line', () => {
    const invented = 'Diabetes always causes organ failure.';
    const result = checkResponse('I walked the dog. ' + invented, [], { facts: [] });

    assert.equal(result.allow, false);
    assert.equal(result.text, UNKNOWN);
    assert.equal(result.reason, 'Response blocked: a medical line is not in journals, medical_data, or an approved case fact.');
    assert.deepEqual(result.unsupported, [invented]);
  });

  test('blocks a reply that adds an invented medical sentence after an approved fact', () => {
    const say = "I've been really thirsty and tired for a few months.";
    const invented = 'This cures diabetes.';
    const result = checkResponse(say + ' ' + invented, [], {
      facts: [{ id: 'd1', say, deflect: 'Ask me something else entirely please.', label: 'Chief complaint' }]
    });

    assert.equal(result.allow, false);
    assert.equal(result.text, UNKNOWN);
    assert.deepEqual(result.unsupported, [invented]);
    assert.equal(result.matches[0].source, 'case');
  });

  test('blocks a medical line that only weakly matches the library', () => {
    const line = 'Diabetes always causes organ failure in adults.';
    const result = checkResponse(line, [
      paper({ claim: 'diabetes care notes', quote: 'diabetes care notes' })
    ], {});

    assert.equal(result.allow, false);
    assert.deepEqual(result.unsupported, [line]);
  });

  test('keeps a grounded sentence and blocks only the unsupported one', () => {
    const grounded = 'Missed doses of oral hypoglycaemic medication are common in diabetes.';
    const invented = 'Coffee always causes this.';
    const result = checkResponse(grounded + ' ' + invented, [
      paper({ claim: grounded, quote: grounded })
    ], {});

    assert.equal(result.allow, false);
    assert.deepEqual(result.unsupported, [invented]);
  });

  test('blocks a claim that is only partly an approved fact and is not a case hit on its own', () => {
    const result = checkResponse('You should take the tablet. Weather balloons float over the harbor.', [], {
      facts: [{
        id: 'f1',
        say: 'Hi.',
        label: 'You should take the tablet.'
      }]
    });

    assert.equal(result.allow, false);
    assert.equal(result.text, UNKNOWN);
    assert.equal(result.reason, 'Response blocked: ungrounded clinical content.');
  });

  test('blocks a generation line that is only partly an approved fact', () => {
    const result = checkResponse('Start her on insulin. Weather balloons float over the harbor.', [], {
      facts: [{
        id: 'f2',
        say: 'Hi.',
        label: 'Start her on insulin.'
      }]
    });

    assert.equal(result.allow, false);
    assert.equal(result.reason, 'Response blocked: ungrounded clinical content.');
  });

  test('allows a claim that is itself the approved library quote', () => {
    const quote = 'You should take the evening metformin tablet with food every night.';
    const result = checkResponse(quote, [paper({ claim: quote, quote })], {});

    assert.equal(result.allow, true);
    assert.equal(result.reason, 'Response grounded on the publication library.');
  });

  test('does not treat the unknown fallback as a case hit', () => {
    const result = checkResponse(UNKNOWN, [], {
      facts: [{ id: 'u', say: UNKNOWN }]
    });

    assert.equal(result.allow, true);
    assert.equal(result.reason, 'Unknown fallback is allowed.');
    assert.deepEqual(result.matches, []);
  });
});

describe('screenRequest', () => {
  test('does not load the library for empty text or an interview turn', () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return [];
    };

    assert.equal(screenRequest('', load).allow, false);
    assert.equal(screenRequest('Hello there', load).allow, true);
    assert.equal(calls, 0);
  });

  test('loads the library only for a clinical ask and accepts a non-function loader', () => {
    let calls = 0;
    const supported = screenRequest('What dose should I prescribe? ' + QUOTE, () => {
      calls += 1;
      return [paper({ claim: QUOTE, quote: QUOTE })];
    });
    const blocked = screenRequest('You should take double the dose', null);
    const missing = screenRequest('You should take double the dose');

    assert.equal(calls, 1);
    assert.equal(supported.allow, true);
    assert.equal(supported.kind, 'generation');
    assert.equal(blocked.allow, false);
    assert.equal(blocked.kind, 'claim');
    assert.equal(missing.allow, false);
  });
});

describe('gate and loadLibrary', () => {
  test('loads abstracts from every shard and cites a verbatim quote', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-guard-'));
    const first = openDb(path.join(dir, 'a.sqlite'));
    const second = openDb(path.join(dir, 'b.sqlite'));

    try {
      seedFact(first, {
        pmid: '111',
        title: 'With abstract',
        abstract: SPIROMETRY,
        claim: 'Unrelated short note.',
        quote: 'Unrelated short note.'
      });
      seedFact(second, {
        title: 'Null abstract',
        abstract: null,
        claim: QUOTE,
        quote: QUOTE,
        topic: 'diabetes'
      });

      const library = loadLibrary([first, second]);
      assert.equal(library.length, 2);
      assert.deepEqual(library.map((row) => row.shard), [0, 1]);
      assert.equal(library[0].abstract, SPIROMETRY);
      assert.equal(library[1].abstract, '');

      const grounded = gate([first, second], { request: 'How did the test go?', response: SPIROMETRY });
      const ungrounded = gate([second], { request: 'How did the test go?', response: SPIROMETRY });

      assert.equal(grounded.allow, true);
      assert.equal(grounded.send, true);
      assert.equal(grounded.response.allow, true);
      assert.equal(grounded.library.journals, 2);
      assert.equal(grounded.library.medical_data, 2);
      assert.equal(ungrounded.allow, false);
      assert.equal(ungrounded.response.text, UNKNOWN);
    } finally {
      first.close();
      second.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uses an empty library when the database is missing', () => {
    const result = gate(null, { request: 'Hello there' });

    assert.equal(result.allow, true);
    assert.equal(result.send, true);
    assert.equal(result.response, null);
    assert.deepEqual(result.library, {
      journals: 0,
      medical_data: 0,
      conversations: 0,
      conversation_turns: 0
    });
  });

  test('does not score a reply when the request is blocked', () => {
    const result = gate(null, {
      request: 'What dose should I prescribe?',
      response: QUOTE
    });

    assert.equal(result.allow, false);
    assert.equal(result.send, false);
    assert.equal(result.response, null);
  });

  test('ignores a blank reply and blocks a clinical reply that is not grounded', () => {
    const blank = gate(null, { request: 'Hello there', response: '   ' });
    const blocked = gate(null, {
      request: 'Hello there',
      response: 'This cures diabetes.',
      case_facts: { facts: [] }
    });

    assert.equal(blank.response, null);
    assert.equal(blank.allow, true);
    assert.equal(blocked.allow, false);
    assert.equal(blocked.send, true);
    assert.equal(blocked.response.text, UNKNOWN);
  });

  test('grounds a reply on case facts passed to the gate', () => {
    const say = 'I drink a lot of sweet tea and eat out a lot.';
    const result = gate(null, {
      request: 'What do you usually eat and drink?',
      response: say,
      case_facts: { facts: [{ id: 'd8', say }] }
    });

    assert.equal(result.allow, true);
    assert.equal(result.response.reason, 'Response grounded on an approved case fact.');
    assert.equal(result.response.matches[0].id, 'd8');
  });

  test('fills a missing journal abstract when the fact and journal rows diverge', () => {
    const db = scriptedDb(
      [
        { id: 1, abstract: null },
        { id: 2, abstract: SPIROMETRY }
      ],
      [
        {
          id: 7,
          journal_id: 99,
          claim: 'Missed doses are common',
          quote: 'Missed doses are common',
          topic: 'adherence',
          keywords: '',
          pmid: null,
          journal_title: null
        },
        {
          id: 8,
          journal_id: 1,
          claim: 'Local note',
          quote: 'Local note',
          topic: '',
          keywords: '',
          pmid: '',
          journal_title: 'Kept'
        },
        {
          id: 9,
          journal_id: 2,
          claim: SPIROMETRY,
          quote: SPIROMETRY,
          topic: 'smoking',
          keywords: '',
          pmid: '27060726',
          journal_title: 'Chest'
        }
      ],
      { journals: 2, medical_data: 3 }
    );
    const library = loadLibrary(db);
    const result = gate(db, { request: 'Missed doses are common today' });

    assert.equal(library[0].abstract, '');
    assert.equal(library[1].abstract, '');
    assert.equal(library[2].abstract, SPIROMETRY);
    assert.equal(result.library.journals, 2);
    assert.equal(result.library.medical_data, 3);
    assert.equal(result.allow, true);
    assert.equal(result.request.matches[0].pmid, '');
    assert.equal(result.request.matches[0].title, '');
  });
});

describe('ingest ground truth', () => {
  test('requires a quote of at least 20 characters inside the normalized source', () => {
    const twenty = 'abcdefghijabcdefghij';
    assert.equal(twenty.length, 20);
    assert.equal(includesQuote('xx ' + twenty + ' yy', '  ' + twenty.toUpperCase() + '\n'), true);
    assert.equal(includesQuote('prefix ' + twenty.slice(0, 19), twenty.slice(0, 19)), false);
    assert.equal(includesQuote(null, null), false);
    assert.equal(includesQuote('This trial showed improved adherence.', 'short quote'), false);
  });

  test('extracts only long source sentences that make a claim', () => {
    const hinted = 'This trial showed improved adherence among adults.';
    const tooShort = 'This trial showed improved adherence.';
    const plain = 'The clinic opened its doors early this morning indeed.';
    assert.ok(hinted.length > 40);
    assert.ok(tooShort.length <= 40);
    assert.ok(plain.length > 40);

    const facts = extractFacts([tooShort, plain, hinted, '   '].join('  '), '');
    const custom = extractFacts(hinted + ' Metformin and diabetes were both discussed in the cohort.', 'file');

    assert.equal(facts.length, 1);
    assert.equal(facts[0].quote, hinted);
    assert.equal(facts[0].claim, hinted);
    assert.equal(facts[0].section, 'abstract');
    assert.equal(facts[0].evidence_level, 'source_sentence');
    assert.equal(facts[0].topic, 'adherence');
    assert.equal(custom[0].section, 'file');
    assert.equal(custom[0].topic, 'adherence');
    assert.equal(custom[1].topic, 'diabetes;metformin');
    assert.deepEqual(extractFacts(null), []);
    assert.ok(includesQuote(hinted, facts[0].quote));
  });

  test('rejects an empty or ungrounded quote and stores a verbatim one', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const source = 'This trial showed improved adherence among adults in clinic.';
      const rejected = agent.ingestPublication({
        title: 'Rejected claims',
        abstract: source,
        facts: [
          { claim: '   ', quote: '   ' },
          { claim: 'Patients were cured completely by a method that is not in the source.' },
          { quote: 'too short to count' },
          { quote: source, claim: 'A faculty paraphrase that is not itself in the abstract.' }
        ]
      });
      const stored = db.prepare('SELECT claim, quote, topic, section, population, evidence_level, keywords FROM medical_data').all();

      assert.equal(rejected.facts_added, 1);
      assert.deepEqual(rejected.skipped, [
        'empty claim',
        'ungrounded: quote is not in the source text',
        'ungrounded: quote is not in the source text'
      ]);
      assert.equal(stored.length, 1);
      assert.equal(stored[0].quote, source);
      assert.equal(stored[0].claim, 'A faculty paraphrase that is not itself in the abstract.');
      assert.equal(stored[0].section, 'abstract');
      assert.equal(stored[0].population, null);
      assert.equal(stored[0].evidence_level, 'source_sentence');
    });
  });

  test('does not invent facts when the supplied quotes are ungrounded', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const result = agent.ingestPublication({
        title: 'Has a usable abstract',
        abstract: 'This trial showed improved adherence among adults in clinic.',
        facts: [{ quote: 'This sentence is long enough but it was never written in the source.' }]
      });

      assert.equal(result.facts_added, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM medical_data').get().n, 0);
    });
  });

  test('extracts a source sentence when no facts are supplied and skips a second copy', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const sentence = 'This trial showed improved adherence among adults in clinic.';
      const first = agent.ingestPublication({
        title: 'Auto extract',
        abstract: 'Background.\n\n' + sentence + '\n\nThe clinic opened its doors early this morning indeed.',
        facts: null
      });
      const second = agent.ingestPublication({
        title: 'Auto extract',
        year: 0,
        abstract: sentence,
        facts: [{ quote: sentence }, { quote: sentence }]
      });

      assert.equal(first.facts_added, 1);
      assert.equal(second.facts_added, 0);
      assert.deepEqual(second.skipped, []);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM journals').get().n, 1);
      assert.equal(db.prepare('SELECT year FROM journals').get().year, null);
    });
  });

  test('stores quote metadata and updates an existing paper without wiping fields', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const quote = 'This review showed reduced mortality in the smoking cessation cohort.';
      const created = agent.ingestPublication({
        pmid: '15710956',
        doi: '10.7326/example',
        title: 'Original title',
        authors: 'Ada',
        journal: 'Annals',
        year: '2005',
        volume: 142,
        issue: '4',
        pages: '233-239',
        synopsis: quote,
        facts: [{
          quote,
          topic: 'mortality',
          section: 'synopsis',
          population: 'people who smoke',
          intervention: 'cessation',
          outcome: 'mortality',
          evidence_level: 'randomized clinical trial',
          keywords: 'smoking;mortality'
        }]
      }, { topic: 'copd', source_type: 'pubmed', source_path: 'manual' });
      const row = db.prepare(`
        SELECT j.pmid, j.doi, j.authors, j.journal_name, j.year, j.volume, j.url, j.source_type, j.source_path,
          m.topic, m.keywords, m.population, m.intervention, m.outcome, m.evidence_level, m.section
        FROM medical_data m JOIN journals j ON j.id = m.journal_id
      `).get();

      assert.equal(created.facts_added, 1);
      assert.equal(row.journal_name, 'Annals');
      assert.equal(row.year, 2005);
      assert.equal(row.volume, '142');
      assert.equal(row.url, 'https://pubmed.ncbi.nlm.nih.gov/15710956/');
      assert.equal(row.source_type, 'pubmed');
      assert.equal(row.source_path, 'manual');
      assert.equal(row.topic, 'copd;mortality');
      assert.equal(row.keywords, 'smoking;mortality');
      assert.equal(row.population, 'people who smoke');
      assert.equal(row.evidence_level, 'randomized clinical trial');

      agent.ingestPublication({
        pmid: '15710956',
        title: 'Updated title',
        url: 'https://example.test/paper',
        abstract: quote
      });
      const updated = db.prepare('SELECT title, authors, abstract, url FROM journals').get();
      assert.equal(updated.title, 'Updated title');
      assert.equal(updated.authors, 'Ada');
      assert.equal(updated.abstract, quote);
      assert.equal(updated.url, 'https://example.test/paper');
    });
  });

  test('updates by doi and by title plus year without inserting a duplicate', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const quote = 'This cohort showed improved adherence among adults in clinic.';
      agent.ingestPublication({ doi: '10.1000/doi', title: 'By doi', year: 2017, abstract: quote });
      agent.ingestPublication({ doi: '10.1000/doi', title: 'By doi revised', year: 2017, abstract: quote });
      agent.ingestPublication({ title: 'By title', year: 2016, abstract: quote });
      agent.ingestPublication({ title: 'By title', year: 2016, authors: 'Bea', abstract: quote });

      const rows = db.prepare('SELECT title, year, authors FROM journals ORDER BY id').all();
      assert.equal(rows.length, 2);
      assert.equal(rows[0].title, 'By doi revised');
      assert.equal(rows[1].authors, 'Bea');
    });
  });

  test('matches a quote after whitespace is collapsed, including a quote that lives in the title', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const quote = 'This trial showed improved adherence among adults.';
      const result = agent.ingestPublication({
        title: quote,
        abstract: 'This  trial\nshowed improved   adherence among adults.',
        facts: [{ claim: quote }]
      });
      const stored = db.prepare('SELECT quote FROM medical_data').get();

      assert.equal(result.facts_added, 1);
      assert.equal(stored.quote, quote);
    });
  });

  test('throws when a publication has no title and reads json and text files', () => {
    withDb((db, dir) => {
      const agent = new IngestAgent(db);
      const sentence = 'This trial showed improved adherence among adults in clinic.';
      assert.throws(() => agent.ingestPublication({}), /missing a title/);
      assert.throws(() => agent.ingestPublication(null), /missing a title/);

      fs.writeFileSync(path.join(dir, 'one.json'), JSON.stringify({
        title: 'Single record',
        abstract: sentence
      }));
      fs.writeFileSync(path.join(dir, 'many.json'), JSON.stringify([
        { title: 'First record', abstract: sentence },
        { title: 'Second record', abstract: sentence, facts: [{ quote: 'This sentence is long enough but not in the file.' }] }
      ]));
      fs.writeFileSync(path.join(dir, 'notes.txt'), sentence + '\n\nThe clinic opened its doors early this morning indeed.\n');

      const single = agent.ingestFile(path.join(dir, 'one.json'));
      const many = agent.ingestFile(path.join(dir, 'many.json'));
      const text = agent.ingestFile(path.join(dir, 'notes.txt'));

      assert.equal(single[0].facts_added, 1);
      assert.equal(many[1].facts_added, 0);
      assert.equal(text.length, 1);
      assert.equal(text[0].facts_added, 1);
      assert.equal(text[0].title, 'notes');
      assert.throws(() => agent.ingestFile(path.join(dir, 'missing.json')), /ENOENT/);
      assert.throws(() => agent.ingestFile(path.join(dir, 'one.json') + '.bad'), /ENOENT/);
    });
  });

  test('seeds the faculty library with quotes that occur in the source text', () => {
    withDb((db) => {
      const agent = new IngestAgent(db);
      const first = agent.ingestSeed();
      const again = agent.ingestSeed();
      const rows = db.prepare(`
        SELECT j.title, j.abstract, m.quote, m.claim
        FROM medical_data m JOIN journals j ON j.id = m.journal_id
      `).all();

      assert.equal(first.length, 4);
      assert.ok(first.every((row) => row.facts_added === 1 && row.skipped.length === 0));
      assert.ok(again.every((row) => row.facts_added === 0));
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM journals').get().n, 4);
      for (const row of rows) {
        assert.equal(includesQuote([row.abstract, row.title].join('\n'), row.quote), true, row.quote);
        assert.notEqual(row.claim, row.quote);
      }

      const grounded = gate(db, {
        request: 'Tell me how you take your metformin.',
        response: rows[0].quote
      });
      const paraphrase = gate(db, {
        request: 'Hello there',
        response: 'This cures diabetes always.'
      });
      const prescribe = gate(db, {
        request: 'What dose of metformin should I prescribe?'
      });

      assert.equal(grounded.allow, true);
      assert.equal(grounded.response.text, rows[0].quote);
      assert.equal(paraphrase.allow, false);
      assert.equal(paraphrase.response.text, UNKNOWN);
      assert.equal(prescribe.allow, false);
      assert.equal(prescribe.request.kind, 'generation');
    });
  });
});

test('blank case text does not match a fact', () => {
  assert.equal(matchCase('   ', { facts: [{ say: 'I have been thirsty and tired lately' }] }), null);
  assert.equal(matchCase('', null), null);
});

describe('patient reply guardrail', () => {
  function fact(id, kw, say, extra) {
    return Object.assign({
      id,
      kw,
      say,
      label: id,
      vis: 'ask',
      gate: 0,
      deflect: ''
    }, extra);
  }

  test('refuses a prescribing ask and a dose claim before any patient line is chosen', () => {
    for (const request of [
      'What dose of metformin should I prescribe?',
      'You should take double the metformin'
    ]) {
      const result = answer(null, {
        request,
        case_facts: { facts: [fact('d3', ['metformin'], 'I take my metformin every day.')] }
      });

      assert.equal(result.certain, false, request);
      assert.equal(result.send, false, request);
      assert.equal(result.reply, null, request);
      assert.equal(result.grounded, null, request);
      assert.equal(result.request.allow, false, request);
    }
  });

  test('says an approved line for one matching fact and the unknown line when two facts tie', () => {
    const say = 'I take my metformin every day, like I am supposed to.';
    const certain = answer(null, {
      request: 'Tell me about metformin',
      case_facts: { facts: [fact('d3', ['metformin'], say)] }
    });
    const tie = answer(null, {
      request: 'Tell me about metformin',
      case_facts: {
        facts: [
          fact('d3', ['metformin'], say),
          fact('d9', ['metformin'], 'I skip the evening metformin.')
        ]
      }
    });

    assert.equal(certain.certain, true);
    assert.equal(certain.reply, say);
    assert.equal(certain.grounded, 'd3');
    assert.equal(certain.emotion, 'neutral');
    assert.equal(certain.trust_hold, false);
    assert.equal(tie.certain, false);
    assert.equal(tie.send, true);
    assert.equal(tie.reply, UNKNOWN);
    assert.equal(tie.stages.review.reason, 'Second review did not confirm a single approved fact.');
  });

  test('holds a gated fact, releases it when trust or disclosure is enough, and clamps trust', () => {
    const body = {
      request: 'zephyr',
      case_facts: {
        facts: [fact('g', ['zephyr'], 'Opened line.', { gate: 3, deflect: 'Held line.' })]
      }
    };
    const held = answer(null, Object.assign({ trust: -4 }, body));
    const opened = answer(null, Object.assign({ trust: 99 }, body));
    const disclosed = answer(null, Object.assign({ trust: 0, disclosed: ['g', '', null] }, body));

    assert.equal(held.reply, 'Held line.');
    assert.equal(held.trust_hold, true);
    assert.equal(held.emotion, 'embarrassed');
    assert.equal(held.grounded, 'blocked:g');
    assert.equal(opened.reply, 'Opened line.');
    assert.equal(opened.emotion, 'relieved');
    assert.equal(disclosed.reply, 'Opened line.');
    assert.equal(disclosed.trust_hold, false);
    assert.equal(disclosed.emotion, 'relieved');
  });

  test('stays unknown when the winning fact has no line for this trust level', () => {
    const open = answer(null, {
      request: 'zephyr',
      case_facts: { facts: [fact('e', ['zephyr'], '')] }
    });
    const closed = answer(null, {
      request: 'zephyr',
      trust: 0,
      case_facts: { facts: [fact('e', ['zephyr'], 'Secret line.', { gate: 1, deflect: '   ' })] }
    });

    assert.equal(open.reply, UNKNOWN);
    assert.equal(open.stages.review.reason, 'Approved fact has no patient line for this trust level.');
    assert.equal(closed.reply, UNKNOWN);
    assert.equal(closed.stages.review.reason, 'Approved fact has no patient line for this trust level.');
  });

  test('speaks an approved claim and ignores chart facts and regex-like keywords', () => {
    const say = 'You should take the evening metformin.';
    const result = answer(null, {
      request: 'Tell me about dose+ (evening) please',
      case_facts: {
        facts: [
          { id: 'c1', vis: 'chart', kw: ['dose+ (evening)'], say: 'Chart text', label: 'Chart' },
          fact('r', ['dose+ (evening)'], say),
          { label: 'no id', kw: ['dose+ (evening)'], say: 'Dropped' }
        ]
      }
    });
    const chartOnly = answer(null, {
      request: 'zephyr',
      case_facts: { facts: [{ id: 'c1', vis: 'chart', kw: ['zephyr'], say: 'Chart text', label: 'Chart' }] }
    });
    const empty = answer(null, null);

    assert.equal(result.certain, true);
    assert.equal(result.reply, say);
    assert.equal(result.fact_id, 'r');
    assert.equal(chartOnly.reply, UNKNOWN);
    assert.equal(empty.send, false);
    assert.equal(empty.reply, null);
  });

  test('matches a keyword prefix without borrowing a chart line', () => {
    const result = answer(null, {
      request: 'metformin',
      case_facts: { facts: [fact('m', ['met'], 'I take my metformin every day.')] }
    });

    assert.equal(result.certain, true);
    assert.equal(result.reply, 'I take my metformin every day.');
  });
});
