const { asList } = require('./db');
const { loadIllnesses } = require('./nih-ingest');
const { ALIASES, PATTERNS, RED_FLAGS, SAFETY_QUESTIONS } = require('./clinical-patterns');

const ACUITY_RANK = { routine: 1, soon: 2, urgent: 3, emergent: 4 };
const ACUITY_LABEL = {
  routine: 'Routine',
  soon: 'Soon',
  urgent: 'Urgent',
  emergent: 'Emergent'
};
const DISPOSITION = {
  emergent: 'Emergency care now. If this is a real person, call emergency services. Do not wait on this teaching result.',
  urgent: 'Same-day clinician or urgent care. Emergency care if breathing, alertness, pain, or bleeding gets worse.',
  soon: 'A clinician visit in the next few days is reasonable if the person is stable. Sooner if a red-flag symptom appears.',
  routine: 'A routine visit is reasonable when the person is stable and no red-flag symptom is present.'
};
const OPENING = {
  emergent: 'I would not send this person to a routine visit. The history has an emergency pattern.',
  urgent: 'I would see this person today. A routine appointment is the wrong speed.',
  soon: 'This can wait for a visit in the next few days if the person stays stable.',
  routine: 'Nothing written here forces emergency or same-day care, as long as the person is stable.'
};
const CHAPTER_LABEL = {
  infectious: 'Infectious disease',
  neoplasms: 'Cancer',
  blood: 'Blood and clotting',
  endocrine: 'Endocrine and metabolic',
  mental: 'Mental health',
  nervous: 'Neurologic',
  eye: 'Eye',
  ear: 'Ear, nose, and throat',
  circulatory: 'Heart and circulation',
  respiratory: 'Lung',
  digestive: 'Digestive',
  skin: 'Skin',
  musculoskeletal: 'Musculoskeletal',
  genitourinary: 'Kidney and genitourinary',
  pregnancy: 'Pregnancy',
  perinatal: 'Newborn',
  congenital: 'Congenital',
  injury: 'Injury and poisoning',
  other: 'General'
};
const BROAD = new Set([
  'depression', 'major depression', 'palpitations', 'diarrhea', 'diarrhoea',
  'constipation', 'insomnia', 'trauma', 'fracture', 'burn', 'high cholesterol',
  'tension headache', 'headache', 'low back pain', 'chronic pain', 'obesity', 'anemia', 'hypertension',
  'high blood pressure', 'low blood pressure', 'irritable bowel', 'heartburn',
  'the flu', 'influenza', 'gerd', 'acid reflux', 'ibs'
]);
const SYMPTOM_NAMES = new Set([
  'headache', 'diarrhea', 'constipation', 'insomnia', 'low back pain', 'chronic pain'
]);
const STOP = new Set([
  'about', 'after', 'again', 'being', 'could', 'every', 'feels', 'feeling',
  'have', 'having', 'history', 'months', 'pain', 'patient', 'since', 'started',
  'their', 'there', 'these', 'thing', 'today', 'weeks', 'worse', 'years'
]);

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokens(value) {
  return [...new Set((norm(value).match(/[a-z][a-z0-9-]{4,}/g) || []))]
    .filter((word) => !STOP.has(word));
}

function escapeRe(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function negated(text, index) {
  const words = text.slice(Math.max(0, index - 48), index).trim().split(/\s+/).slice(-4);

  return words.some((word) => /^(no|not|denies|denied|without|absent|never|negative|n't)$/.test(word.replace(/[^a-z']/g, '')));
}

function findPhrase(text, phrase) {
  const needle = norm(phrase);
  if (!needle) {
    return -1;
  }
  const re = new RegExp('(^|[^a-z0-9])' + escapeRe(needle) + '([^a-z0-9]|$)', 'g');
  let match = re.exec(text);
  while (match) {
    const index = match.index + match[1].length;
    if (!negated(text, index)) {
      return index;
    }
    match = re.exec(text);
  }

  return -1;
}

function patternMatched(pattern, text) {
  const anyList = pattern.any || [];
  const allList = pattern.all || [];
  if (allList.length && !allList.every((phrase) => findPhrase(text, phrase) >= 0)) {
    return null;
  }
  if (anyList.length) {
    const hit = anyList.find((phrase) => findPhrase(text, phrase) >= 0);
    if (!hit) {
      return null;
    }

    return allList.length ? allList.concat(hit).join(' + ') : hit;
  }
  if (allList.length) {
    return allList.join(' + ');
  }

  return null;
}

function numberOrNull(value) {
  if (value === '' || value == null) {
    return null;
  }
  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function inferContext(text, input) {
  const ageFromText = text.match(/\b(\d{1,3})\s*(?:years?\s*old|yo\b|y\/o|year-old)/);
  const sexFromText = text.match(/\b(woman|female|girl|man|male|boy)\b/);
  const age = numberOrNull(input.age);
  let sex = norm(input.sex);
  if (!sex && sexFromText) {
    sex = /woman|female|girl/.test(sexFromText[1]) ? 'female' : 'male';
  }
  if (sex.startsWith('f')) {
    sex = 'female';
  } else if (sex.startsWith('m')) {
    sex = 'male';
  } else if (sex) {
    sex = '';
  }

  return {
    age: age == null && ageFromText ? Number(ageFromText[1]) : age,
    sex,
    pregnant: Boolean(input.pregnant) || findPhrase(text, 'pregnant') >= 0 || findPhrase(text, 'pregnancy') >= 0
  };
}

function vitalsOf(input) {
  const source = input.vitals || input;

  return {
    sbp: numberOrNull(source.sbp),
    dbp: numberOrNull(source.dbp),
    hr: numberOrNull(source.hr),
    rr: numberOrNull(source.rr),
    temp: numberOrNull(source.temp),
    spo2: numberOrNull(source.spo2),
    glucose: numberOrNull(source.glucose)
  };
}

function vitalFlags(vitals, text) {
  const reasons = [];
  let level = null;
  function raise(next, reason) {
    if (!level || ACUITY_RANK[next] > ACUITY_RANK[level]) {
      level = next;
    }
    reasons.push(reason);
  }
  if (vitals.spo2 != null && vitals.spo2 < 90) {
    raise('emergent', 'Oxygen saturation is under 90%.');
  } else if (vitals.spo2 != null && vitals.spo2 < 94) {
    raise('urgent', 'Oxygen saturation is under 94%.');
  }
  if (vitals.rr != null && (vitals.rr >= 30 || vitals.rr <= 8)) {
    raise('emergent', 'Respiratory rate is in a danger range.');
  } else if (vitals.rr != null && vitals.rr >= 24) {
    raise('urgent', 'Respiratory rate is high.');
  }
  if (vitals.hr != null && (vitals.hr >= 150 || vitals.hr <= 40)) {
    raise('emergent', 'Heart rate is in a danger range.');
  } else if (vitals.hr != null && (vitals.hr >= 130 || vitals.hr <= 50)) {
    raise('urgent', 'Heart rate is markedly abnormal.');
  }
  if (vitals.sbp != null && vitals.sbp < 90) {
    raise('emergent', 'Systolic blood pressure is under 90.');
  }
  if (vitals.sbp != null && vitals.sbp >= 180 && /chest|breath|speech|weak|headache|pregnant|confus/.test(text)) {
    raise('emergent', 'Blood pressure is 180 or higher together with symptoms that can mean acute organ stress.');
  } else if (vitals.sbp != null && vitals.sbp >= 180) {
    raise('urgent', 'Blood pressure is 180 or higher.');
  }
  if (vitals.temp != null && (vitals.temp >= 40 || vitals.temp <= 35)) {
    raise('urgent', 'Temperature is markedly abnormal.');
  }
  if (vitals.glucose != null && vitals.glucose <= 50) {
    raise('emergent', 'Glucose is very low.');
  } else if (vitals.glucose != null && vitals.glucose <= 70) {
    raise('urgent', 'Glucose is low.');
  } else if (vitals.glucose != null && vitals.glucose >= 400) {
    raise('urgent', 'Glucose is very high.');
  }

  return { level, reasons };
}

function catalog() {
  const rows = loadIllnesses();
  const byName = new Map();
  rows.forEach((row) => {
    if (!byName.has(row.name)) {
      byName.set(row.name, row);
    }
  });

  return { rows, byName };
}

function emptyScore(illness) {
  return {
    name: illness.name,
    chapter: illness.chapter,
    chapter_label: CHAPTER_LABEL[illness.chapter] || illness.chapter,
    hits: [],
    acuity: null,
    alias: false,
    score: 0,
    matched: [],
    papers: []
  };
}

function addHit(bucket, illness, hit) {
  if (!bucket.has(illness.name)) {
    bucket.set(illness.name, emptyScore(illness));
  }
  const row = bucket.get(illness.name);
  row.hits.push(hit);
  if (hit.alias) {
    row.alias = true;
  }
  if (hit.weight >= 5 && hit.acuity && (!row.acuity || ACUITY_RANK[hit.acuity] > ACUITY_RANK[row.acuity])) {
    row.acuity = hit.acuity;
  }
}

function aliasWeight(term) {
  if (BROAD.has(norm(term))) {
    return 6;
  }
  if (term.length <= 3) {
    return 7;
  }

  return 11;
}

function finishScore(row, context) {
  const specific = row.hits.filter((hit) => hit.weight >= 5);
  const support = row.hits.filter((hit) => hit.weight < 5);
  if (!specific.length) {
    row.score = 0;
    row.matched = [];

    return row;
  }
  const weights = specific.map((hit) => hit.weight).sort((a, b) => b - a);
  let score = weights[0] + Math.min(2, weights.length - 1);
  if (support.length) {
    score += 1;
  }
  if (context.pregnant && row.chapter === 'pregnancy') {
    score += 3;
  }
  row.score = score;
  row.matched = [...new Set(specific.map((hit) => hit.phrase))];

  return row;
}

function scoreIllnesses(text, book, context, vitals) {
  const bucket = new Map();
  PATTERNS.forEach((pattern) => {
    const illness = book.byName.get(pattern.illness);
    if (!illness) {
      return;
    }
    const matched = patternMatched(pattern, text);
    if (!matched) {
      return;
    }
    addHit(bucket, illness, {
      phrase: matched,
      weight: pattern.weight,
      acuity: pattern.acuity,
      alias: false
    });
  });

  const names = [...book.byName.keys()].sort((a, b) => b.length - a.length);
  const consumed = [];
  names.forEach((name) => {
    if (findPhrase(text, name) < 0) {
      return;
    }
    if (consumed.some((longer) => longer.includes(name) && longer !== name)) {
      return;
    }
    consumed.push(name);
    addHit(bucket, book.byName.get(name), {
      phrase: name,
      weight: SYMPTOM_NAMES.has(norm(name)) ? 6 : 11,
      acuity: null,
      alias: true
    });
  });

  book.byName.forEach((illness) => {
    (ALIASES[illness.name] || []).forEach((alias) => {
      if (findPhrase(text, alias) < 0) {
        return;
      }
      addHit(bucket, illness, {
        phrase: alias,
        weight: aliasWeight(alias),
        acuity: null,
        alias: true
      });
    });
  });

  if (vitals.glucose != null && vitals.glucose <= 70) {
    const illness = book.byName.get('hypoglycemia');
    if (illness) {
      addHit(bucket, illness, {
        phrase: 'glucose ' + vitals.glucose,
        weight: 8,
        acuity: vitals.glucose <= 50 ? 'emergent' : 'urgent',
        alias: false
      });
    }
  }
  if (vitals.glucose != null && vitals.glucose >= 300 && /vomit|abdominal|breath/.test(text)) {
    const illness = book.byName.get('diabetic ketoacidosis');
    if (illness) {
      addHit(bucket, illness, {
        phrase: 'glucose ' + vitals.glucose,
        weight: 8,
        acuity: 'emergent',
        alias: false
      });
    }
  }

  return [...bucket.values()]
    .map((row) => finishScore(row, context))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function searchTerms(name) {
  const aliases = (ALIASES[name] || []).filter((alias) => alias.length >= 5 && !BROAD.has(norm(alias)));
  aliases.sort((a, b) => b.length - a.length);
  const terms = [];
  [aliases[0], name].forEach((term) => {
    const value = norm(term);
    if (value.length >= 4 && !terms.includes(value)) {
      terms.push(value);
    }
  });

  return terms;
}

function mentions(hay, terms) {
  return terms.some((term) => hay.includes(term));
}

function clip(text, needles, max) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) {
    return '';
  }
  const lower = src.toLowerCase();
  let at = -1;
  needles.forEach((needle) => {
    const found = lower.indexOf(String(needle || '').toLowerCase());
    if (found >= 0 && (at < 0 || found < at)) {
      at = found;
    }
  });
  if (at < 0) {
    at = 0;
  }
  const dot = src.lastIndexOf('. ', at);
  const start = dot >= 0 ? dot + 2 : Math.max(0, at - 60);
  let slice = src.slice(start, start + max).trim();
  if (start + max < src.length) {
    slice = slice.replace(/\s+\S*$/, '').trim() + '…';
  }

  return slice;
}

function attachPapers(ranked, papers, complaint) {
  const complaintTokens = tokens(complaint);
  ranked.slice(0, 4).forEach((row) => {
    const terms = searchTerms(row.name);
    const seen = new Set();
    const matched = papers.filter((paper) => {
      const hay = ((paper.title || '') + ' ' + (paper.abstract || '')).toLowerCase();

      return mentions(hay, terms);
    }).sort((a, b) => {
      const aTitle = mentions((a.title || '').toLowerCase(), terms) ? 1 : 0;
      const bTitle = mentions((b.title || '').toLowerCase(), terms) ? 1 : 0;

      return bTitle - aTitle || (b.year || 0) - (a.year || 0);
    });
    row.papers = [];
    matched.forEach((paper) => {
      const key = paper.pmid || paper.title;
      if (seen.has(key) || row.papers.length >= 3) {
        return;
      }
      const fact = (paper.facts || []).map((item) => {
        const hay = [item.quote, item.claim, item.topic].join(' ').toLowerCase();
        const shared = tokens(hay).filter((word) => complaintTokens.includes(word)).length + (mentions(hay, terms) ? 2 : 0);

        return { item, shared };
      }).sort((a, b) => b.shared - a.shared)[0];
      const quote = fact && fact.item.quote ? fact.item.quote : '';
      const excerpt = quote
        ? clip(quote, terms.concat(complaintTokens), 360)
        : clip(paper.abstract, terms.concat(complaintTokens), 360);
      if (!excerpt) {
        return;
      }
      seen.add(key);
      row.papers.push({
        pmid: paper.pmid || '',
        title: paper.title || '',
        authors: paper.authors || '',
        journal_name: paper.journal_name || '',
        year: paper.year || null,
        url: paper.url || (paper.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + paper.pmid + '/' : ''),
        excerpt,
        excerpt_from: quote ? 'medical_data' : 'abstract'
      });
    });
  });
  ranked.sort((a, b) => b.score - a.score || ((b.papers || []).length - (a.papers || []).length) || a.name.localeCompare(b.name));
}

function queryPapers(shard, terms) {
  if (!terms.length) {
    return [];
  }
  const params = { lim: 24 };
  const parts = terms.map((term, index) => {
    params['t' + index] = '%' + term.replace(/[%_]/g, '') + '%';

    return `IFNULL(j.title,'') LIKE @t${index} OR IFNULL(j.abstract,'') LIKE @t${index}`;
  });
  const rows = shard.prepare(`
    SELECT j.id, j.pmid, j.title, j.authors, j.journal_name, j.year, j.url, j.abstract
    FROM journals j
    WHERE ${parts.join(' OR ')}
    LIMIT @lim
  `).all(params);
  if (!rows.length) {
    return rows;
  }
  const marks = rows.map(() => '?').join(',');
  const facts = shard.prepare(`
    SELECT journal_id, claim, quote, topic
    FROM medical_data
    WHERE journal_id IN (${marks})
  `).all(...rows.map((row) => row.id));
  const byJournal = new Map();
  facts.forEach((fact) => {
    if (!byJournal.has(fact.journal_id)) {
      byJournal.set(fact.journal_id, []);
    }
    byJournal.get(fact.journal_id).push(fact);
  });

  return rows.map((row) => Object.assign({ facts: byJournal.get(row.id) || [] }, row));
}

function searchLibrary(db, ranked, complaint) {
  const shards = asList(db);
  const terms = [];
  ranked.slice(0, 4).forEach((row) => {
    searchTerms(row.name).forEach((term) => {
      if (!terms.includes(term)) {
        terms.push(term);
      }
    });
  });
  const papers = [];
  let journals = 0;
  let error = '';
  shards.forEach((shard) => {
    try {
      journals += shard.prepare('SELECT COUNT(*) AS n FROM journals').get().n;
      papers.push(...queryPapers(shard, terms));
    } catch (err) {
      error = err.message || String(err);
    }
  });
  attachPapers(ranked, papers, complaint);

  return {
    journals,
    error,
    cited: ranked.reduce((sum, row) => sum + (row.papers ? row.papers.length : 0), 0)
  };
}

function confidenceOf(ranked) {
  if (!ranked.length) {
    return 'insufficient';
  }
  const [first, second] = ranked;
  const ratio = second ? first.score / second.score : 2;
  const named = first.alias && first.hits.some((hit) => hit.alias && hit.weight >= 7);
  if (named && first.score >= 7 && ratio >= 1.25) {
    return 'high';
  }
  if (first.score >= 9 && ratio >= 1.35) {
    return 'high';
  }
  if (first.score >= 7 && (!second || first.score >= second.score + 2)) {
    return 'moderate';
  }

  return 'low';
}

function questionsFor(text, ranked) {
  const top = ranked.slice(0, 3).map((row) => row.name);
  const asks = [];
  PATTERNS.forEach((pattern) => {
    if (!top.includes(pattern.illness) || !pattern.ask || pattern.weight < 5) {
      return;
    }
    if (patternMatched(pattern, text)) {
      return;
    }
    asks.push(pattern.ask);
  });
  SAFETY_QUESTIONS.forEach((item) => {
    const triggered = (item.ifAny || []).some((phrase) => findPhrase(text, phrase) >= 0);
    const blocked = (item.unless || []).some((phrase) => findPhrase(text, phrase) >= 0);
    if (triggered && !blocked) {
      asks.push(item.ask);
    }
  });

  return [...new Set(asks)].slice(0, 5);
}

function publicIllness(row, rank) {
  return {
    rank,
    name: row.name,
    chapter: row.chapter,
    chapter_label: row.chapter_label,
    score: row.score,
    acuity: row.acuity,
    matched: row.matched,
    named_in_history: row.alias,
    papers: row.papers || []
  };
}

function compose(ranked, confidence, acuity, libraryNote) {
  const sentences = [];
  const crisis = (acuity.reasons || []).find((reason) => reason.includes('988'));
  if (crisis) {
    sentences.push(crisis);
  }
  sentences.push(OPENING[acuity.level] || acuity.summary);
  if (!ranked.length) {
    sentences.push('I would not name a problem from this description. I need where it is, when it started, how bad it is, and what comes with it.');

    return sentences.join(' ');
  }
  const first = ranked[0];
  const matched = first.matched.slice(0, 4).join(', ');
  if (confidence === 'high') {
    sentences.push('The leading problem in this catalog is ' + first.name + '. I am matching ' + matched + '.');
  } else if (confidence === 'moderate') {
    sentences.push('The leading problem is ' + first.name + ', and I would not close the case on that alone. I am matching ' + matched + '.');
  } else {
    sentences.push('These symptoms do not separate one problem yet. I would keep ' + ranked.slice(0, 3).map((row) => row.name).join(', ') + ' open.');
  }
  ranked.slice(1, 4).forEach((row) => {
    if (row.acuity === 'emergent' && row.score >= 6) {
      sentences.push(row.name + ' stays on the list. The history alone does not exclude it.');
    }
  });
  sentences.push(libraryNote);

  return sentences.join(' ');
}

function maxLevel(levels) {
  return levels.reduce((best, level) => {
    if (!level) {
      return best;
    }
    if (!best || ACUITY_RANK[level] > ACUITY_RANK[best]) {
      return level;
    }

    return best;
  }, null);
}

function triage(db, input) {
  const body = input || {};
  const complaint = String(body.complaint || body.text || body.symptoms || '').replace(/\s+/g, ' ').trim();
  if (!complaint) {
    const err = new Error('Describe the symptoms or the problem the patient came in with.');
    err.status = 400;
    throw err;
  }
  if (complaint.length > 8000) {
    const err = new Error('Shorten the history to 8000 characters.');
    err.status = 400;
    throw err;
  }

  const text = norm(complaint);
  const book = catalog();
  const context = inferContext(text, body);
  const vitals = vitalsOf(body);
  const ranked = scoreIllnesses(text, book, context, vitals);
  const library = searchLibrary(db, ranked, complaint);
  const confidence = confidenceOf(ranked);
  const vital = vitalFlags(vitals, text);
  const flagReasons = [];
  let flagLevel = null;
  RED_FLAGS.forEach((flag) => {
    if (!patternMatched(flag, text)) {
      return;
    }
    flagReasons.push(flag.reason);
    if (!flagLevel || ACUITY_RANK[flag.acuity] > ACUITY_RANK[flagLevel]) {
      flagLevel = flag.acuity;
    }
  });
  const level = maxLevel([
    flagLevel,
    vital.level,
    ranked[0] && ranked[0].acuity,
    ranked.length ? 'routine' : null
  ]) || 'soon';
  const reasons = [...new Set(flagReasons.concat(vital.reasons))];
  if (!reasons.length && ranked.length) {
    reasons.push('No red-flag pattern is in the history as written.');
  }
  if (!ranked.length && !reasons.length) {
    reasons.push('The description is too thin to set a faster path than a clinician visit.');
  }
  const acuity = {
    level,
    label: ACUITY_LABEL[level],
    disposition: DISPOSITION[level],
    reasons: reasons.slice(0, 6),
    summary: OPENING[level]
  };
  const differential = ranked.slice(0, 5).map((row, index) => publicIllness(row, index + 1));
  const identified = confidence === 'high' || confidence === 'moderate';
  const leading = identified ? differential[0] : null;
  const focus = differential[0];
  const libraryNote = focus && focus.papers.length
    ? 'The local library has stored text on ' + focus.name + '. I am quoting that text and not adding claims it does not contain.'
    : (ranked.length
      ? 'No ingested paper in the local library mentions ' + ranked[0].name + ' yet, so this is catalog pattern recognition only.'
      : 'I did not use a publication to name a problem.');

  return {
    disclaimer: 'Educational triage for VirtuSP. This matches the written symptoms to the illness catalog and to quotes already stored from publications. It is not a diagnosis, a prescription, or care for a real person. If this is a real person with severe or worsening symptoms, trouble breathing, chest pain, one-sided weakness, confusion, or bleeding, seek emergency care.',
    complaint,
    context,
    vitals,
    acuity,
    confidence,
    identified,
    leading,
    differential,
    cant_miss: ranked.filter((row) => row.acuity === 'emergent').slice(0, 4).map((row) => row.name),
    questions: questionsFor(text, ranked),
    assessment: compose(ranked, confidence, acuity, libraryNote),
    library: {
      illnesses: book.byName.size,
      journals: library.journals,
      papers_cited: library.cited,
      warning: library.error || ''
    }
  };
}

module.exports = {
  triage,
  findPhrase,
  patternMatched
};
