const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const F = (id, label, k, o) => Object.assign({
  id, label, k, type: 'reported', src: 'Approved case', role: 'Patient', vis: 'ask', kw: [], ehr: 'hx', gate: 0
}, o);

const SERVICES = { dialogue: 'local', voice: 'browser', avatar: 'photo' };
const KEY = 'virtusp-v1';
const LEGACY_KEY = 'ptl-v1';
const THEME_KEY = 'virtusp-theme';
const ROLES = ['Primary care physician', 'Nephrologist/Specialist', 'Dietitian', 'Nurse', 'Pharmacist'];
const SEC = [
  ['ov', 'Overview'],
  ['hx', 'History'],
  ['meds', 'Medications'],
  ['labs', 'Labs'],
  ['img', 'Imaging'],
  ['notes', 'Notes'],
  ['soc', 'Social']
];
const EHR_HINTS = {
  hx: 'Ask why they came in, about symptoms, or about their diagnosis.',
  meds: 'Ask how they take their medications, then compare with the chart list.',
  labs: 'Ask about labs or kidney numbers, or open this tab to release the report.',
  img: 'Ask about an ECG, CT, or scan to unlock imaging artifacts.',
  notes: 'Open this section to release prior clinician notes.',
  soc: 'Ask about diet, cost, smoking, or daily routine.'
};

const SEED = [{
  id: 'denise',
  name: 'Denise Carter',
  age: 58,
  intro: "Hi, I'm Denise.",
  hints: [
    'What brings you in today?',
    'Tell me how you take your metformin.',
    'I am sorry this has been hard. What gets in the way of every dose?',
    'How are cost and meals affecting your routine?',
    'What do you usually eat and drink?'
  ],
  facts: [
    F('d1', 'Chief complaint: thirst and fatigue for months', 'thirst', { kw: ['bring', 'here', 'concern', 'problem', 'symptom', 'tired', 'thirst', 'why'], say: "I've been really thirsty and tired for a few months. My doctor says it's diabetes." }),
    F('d2', 'Understanding of diagnosis: partial, confused about diet', 'understand', { kw: ['understand', 'diabetes mean', 'know about', 'diagnos'], say: "They said my sugar is high. I think it means no sweets? Honestly I'm confused about the rest." }),
    F('d3', 'Metformin: patient says she takes it every day', 'metformin', { kw: ['medication', 'medicine', 'pills', 'taking', 'metformin', 'prescri'], ehr: 'meds', say: 'I take my metformin every day, like I\'m supposed to.' }),
    F('d4', 'Skips evening metformin dose (GI upset, runs out early)', 'evening', { kw: ['forget', 'miss', 'skip', 'adher', 'trouble', 'difficult', 'consistent', 'every dose', 'ever'], ehr: 'meds', gate: 1, deflect: 'I take it. Like I said.', say: '...Okay, honestly I skip the evening one a lot. It upsets my stomach and I run out before the refill.' }),
    F('d5', 'Cost barrier: delays refills until payday', 'cost', { kw: ['cost', 'afford', 'insurance', 'pay', 'money'], ehr: 'soc', gate: 1, deflect: "I'd rather not talk about money.", say: 'Money is tight. Sometimes I wait to refill until payday.' }),
    F('d6', 'Allergy: sulfa drugs (rash)', 'sulfa', { kw: ['allerg', 'reaction'], allergyDrug: 'sulfonamide', say: 'Sulfa drugs gave me a rash.' }),
    F('d7', 'Recall of labs: does not remember values (unknown)', 'recall', { type: 'unknown', kw: ['kidney', 'lab', 'result', 'a1c', 'number'], say: "Someone mentioned my kidneys, but I don't remember any numbers." }),
    F('d8', 'Diet: sweet tea, frequent takeout (shift work)', 'tea', { kw: ['eat', 'diet', 'food', 'drink', 'soda', 'meal'], ehr: 'soc', say: 'I drink a lot of sweet tea and eat out a lot because of my work hours.' }),
    F('c1', 'eGFR 58 mL/min/1.73m² (ref ≥90), 2026-09-14', 'egfr', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Lab', src: 'Report LR-0914', ehr: 'labs', lab: true, unit: 'mL/min/1.73m²', ref: '≥90', kw: ['lab', 'kidney', 'egfr', 'result', 'number'] }),
    F('c2', 'HbA1c 8.4 % (ref <5.7), 2026-09-14', 'a1c', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Lab', src: 'Report LR-0914', ehr: 'labs', lab: true, unit: '%', ref: '<5.7', kw: ['a1c', 'sugar', 'glucose', 'lab', 'result'] }),
    F('c3', 'PCP note 09-21: pharmacy fill history shows 45-day gap in metformin refills', 'refill', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Primary care physician', src: 'Note N-0921', ehr: 'notes', kw: ['refill', 'pharmacy', 'chart', 'note'] }),
    F('c4', 'Chart list: metformin 500 mg PO BID', '500', { vis: 'chart', sec: 'meds', type: 'documented', role: 'Primary care physician', src: 'Med list ML-1', ehr: 'meds' }),
    F('c5', 'ECG 09-14: sinus rhythm, nonspecific T-wave changes', 'ecg', { vis: 'chart', sec: 'img', type: 'confirmed', role: 'Cardiology', src: 'ECG-0914', ehr: 'img', artifact: 'ecg', kw: ['ecg', 'ekg', 'heart', 'chest'] }),
    F('c6', 'Abdominal CT 09-14: no acute renal obstruction', 'ct', { vis: 'chart', sec: 'img', type: 'confirmed', role: 'Radiology', src: 'CT-0914', ehr: 'img', artifact: 'ct', kw: ['ct', 'scan', 'imaging', 'kidney'] })
  ],
  artifacts: [
    { id: 'den-lab', kind: 'lab', title: 'Laboratory report LR-0914', date: '2026-09-14', src: 'Report LR-0914', sec: 'labs', unlock: ['lab', 'kidney', 'a1c', 'result', 'number', 'egfr', 'glucose', 'sugar', 'blood work'], facts: ['c1', 'c2'], rows: [{ name: 'eGFR', value: '58', unit: 'mL/min/1.73m²', ref: '≥90', flag: 'low' }, { name: 'HbA1c', value: '8.4', unit: '%', ref: '<5.7', flag: 'high' }] },
    { id: 'den-ecg', kind: 'ecg', title: '12-lead ECG', date: '2026-09-14', src: 'ECG-0914', sec: 'img', unlock: ['ecg', 'ekg', 'heart', 'chest pain', 'palpit'], facts: ['c5'], img: 'img/denise-ecg.jpg' },
    { id: 'den-ct', kind: 'ct', title: 'Abdominal CT', date: '2026-09-14', src: 'CT-0914', sec: 'img', unlock: ['ct', 'scan', 'imaging', 'kidney scan', 'abdomen'], facts: ['c6'], img: 'img/denise-ct.jpg' }
  ],
  obj: [
    { id: 'o1', t: 'Elicit adherence barrier (critical)', w: 25, ty: 'fact', f: ['d4'], tip: 'Ask open, nonjudgmental questions about missed doses.' },
    { id: 'o2', t: 'Explore cost and diet barriers', w: 15, ty: 'fact', f: ['d5', 'd8'], tip: 'Ask how cost and daily routine affect the regimen.' },
    { id: 'o3', t: 'Review eGFR and HbA1c', w: 20, ty: 'review', s: ['labs'], tip: 'Open the lab report before drawing conclusions.' },
    { id: 'o4', t: 'Recognize and reconcile adherence discrepancy', w: 25, ty: 'mm', tip: 'Compare the patient report with the refill history, ask follow-ups, document the reconciliation.' },
    { id: 'o5', t: 'Empathic, open-ended communication', w: 10, ty: 'emp', tip: 'Acknowledge feelings and use open questions.' },
    { id: 'o6', t: 'Structured SBAR handoff', w: 5, ty: 'ho', tip: 'Include the barrier, the discrepancy and labs.' }
  ],
  mm: { a: 'd3', b: 'c3', fu: 'd4', kw: ['refill', 'gap', 'miss', 'skip', 'discrep', 'not taking', 'nonadher', 'adherence'] },
  personality: 'Wants to be seen as a good patient',
  emotion: 'Embarrassed about cost and missed doses',
  style: 'Short answers until trust is earned',
  complaint: 'Thirst and fatigue for months',
  history: 'Newly diagnosed type 2 diabetes',
  diagnosis: 'Type 2 diabetes',
  medications: 'Metformin 500 mg twice a day',
  allergies: 'Sulfa drugs, rash',
  labs: 'eGFR | 58 | mL/min/1.73m² | ≥90\nHbA1c | 8.4 | % | <5.7',
  patientSays: 'I take my metformin every day, like I\'m supposed to.',
  chartSays: 'Pharmacy fill history shows a 45-day gap in metformin refills',
  objText: 'Elicit adherence barrier\nReview eGFR and HbA1c\nReconcile the refill discrepancy'
}, {
  id: 'marcus',
  name: 'Marcus Lee',
  age: 67,
  intro: "Morning, doc. I'm Marcus.",
  hints: [
    'What brings you in today?',
    'Tell me about your inhaler.',
    'That sounds worrying. How do you use it?',
    'Can you tell me about smoking?'
  ],
  facts: [
    F('m1', 'Chief complaint: breathless on stairs', 'stairs', { kw: ['bring', 'here', 'concern', 'problem', 'symptom', 'breath', 'why'], say: "I get winded climbing one flight of stairs. It's worse than last winter." }),
    F('m2', 'Rescue inhaler used about 4x/week', 'inhaler', { kw: ['inhaler', 'medication', 'medicine', 'taking', 'puff'], ehr: 'meds', say: 'I use my blue inhaler maybe four times a week.' }),
    F('m3', 'Inhaler technique: does not use spacer, shallow breath', 'spacer', { kw: ['technique', 'show', 'how do you use', 'spacer', 'trouble', 'difficult'], ehr: 'meds', gate: 1, deflect: 'I use it fine.', say: "Truth is, nobody showed me. I just puff and breathe in quick." }),
    F('m4', 'Smoking: half pack/day (patient says he quit)', 'smok', { kw: ['smok', 'cigar', 'tobacco', 'quit'], ehr: 'soc', gate: 1, deflect: 'I quit a while back.', say: "Okay... I still have about half a pack a day. I didn't want to say." }),
    F('m5', 'Smoking status claimed: quit', 'quit', { kw: ['habit', 'lifestyle', 'social'], ehr: 'soc', say: 'I quit smoking years ago.' }),
    F('x1', 'FEV1 52 % predicted (ref ≥80), 2026-08-30', 'fev1', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Lab', src: 'Spirometry SP-0830', ehr: 'labs', lab: true, unit: '% predicted', ref: '≥80', kw: ['lab', 'fev', 'spirom', 'result', 'lung'] }),
    F('x2', 'Note 08-30: current smoker, 0.5 ppd, pack-years 30', 'ppd', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Pulmonologist', src: 'Note N-0830', ehr: 'notes', kw: ['note', 'chart', 'pack'] }),
    F('x3', 'ECG 08-30: sinus rhythm, possible right atrial strain', 'ecg', { vis: 'chart', sec: 'img', type: 'confirmed', role: 'Cardiology', src: 'ECG-0830', ehr: 'img', artifact: 'ecg', kw: ['ecg', 'ekg', 'heart'] }),
    F('x4', 'Chest CT 08-30: hyperinflation, no mass', 'ct', { vis: 'chart', sec: 'img', type: 'confirmed', role: 'Radiology', src: 'CT-0830', ehr: 'img', artifact: 'ct', kw: ['ct', 'scan', 'imaging', 'chest', 'xray'] })
  ],
  artifacts: [
    { id: 'mar-lab', kind: 'lab', title: 'Spirometry SP-0830', date: '2026-08-30', src: 'Spirometry SP-0830', sec: 'labs', unlock: ['lab', 'fev', 'spirom', 'result', 'lung', 'breath test'], facts: ['x1'], rows: [{ name: 'FEV1', value: '52', unit: '% predicted', ref: '≥80', flag: 'low' }] },
    { id: 'mar-ecg', kind: 'ecg', title: '12-lead ECG', date: '2026-08-30', src: 'ECG-0830', sec: 'img', unlock: ['ecg', 'ekg', 'heart'], facts: ['x3'], img: 'img/marcus-ecg.jpg' },
    { id: 'mar-ct', kind: 'ct', title: 'Chest CT', date: '2026-08-30', src: 'CT-0830', sec: 'img', unlock: ['ct', 'scan', 'imaging', 'chest', 'xray'], facts: ['x4'], img: 'img/marcus-ct.jpg' }
  ],
  obj: [
    { id: 'p1', t: 'Uncover true smoking status (critical)', w: 30, ty: 'fact', f: ['m4'], tip: 'Build rapport, then ask directly and kindly.' },
    { id: 'p2', t: 'Assess inhaler technique', w: 20, ty: 'fact', f: ['m3'], tip: 'Ask the patient to describe how they use it.' },
    { id: 'p3', t: 'Review spirometry', w: 20, ty: 'review', s: ['labs'], tip: 'Open labs before concluding.' },
    { id: 'p4', t: 'Reconcile smoking status discrepancy', w: 20, ty: 'mm', tip: 'Compare statement vs note and document.' },
    { id: 'p5', t: 'Empathic communication', w: 10, ty: 'emp', tip: 'Acknowledge feelings.' }
  ],
  mm: { a: 'm5', b: 'x2', fu: 'm4', kw: ['smok', 'current', 'quit', 'discrep', 'cigar'] },
  personality: 'Proud, minimizes illness',
  emotion: 'Guarded about smoking',
  style: 'Casual, then more honest once rapport is there',
  complaint: 'Breathless climbing stairs',
  history: 'COPD, long smoking history',
  diagnosis: 'COPD',
  medications: 'Rescue inhaler about four times a week',
  allergies: 'None known',
  labs: 'FEV1 | 52 | % predicted | ≥80',
  patientSays: 'I quit smoking years ago.',
  chartSays: 'Current smoker, 0.5 packs per day, 30 pack-years',
  objText: 'Uncover true smoking status\nAssess inhaler technique\nReconcile smoking discrepancy'
}];

function templateGeneral() {
  return {
    id: 'general',
    name: 'New Patient',
    age: 55,
    intro: 'Hello.',
    hints: [
      'What brings you in today?',
      'Tell me how you take your medications.',
      'I am sorry this has been hard. What gets in the way of every dose?',
      'How are daily routines affecting your health?'
    ],
    facts: [
      F('g1', 'Chief complaint: morning headaches for 3 weeks', 'head', { kw: ['bring', 'here', 'concern', 'problem', 'symptom', 'head', 'why', 'pain'], say: "I've been waking up with headaches for about three weeks." }),
      F('g2', 'Lisinopril: patient says they take it every day', 'lisin', { kw: ['medication', 'medicine', 'pills', 'taking', 'lisinopril', 'prescri', 'blood pressure'], ehr: 'meds', say: 'I take my blood pressure pill every day.' }),
      F('g3', 'Misses evening lisinopril when working late', 'evening', { kw: ['forget', 'miss', 'skip', 'adher', 'trouble', 'difficult', 'consistent', 'every dose'], ehr: 'meds', gate: 1, deflect: 'I take it. Like I said.', say: 'Okay... I miss the evening one when I work late.' }),
      F('g4', 'Allergy: penicillin (rash)', 'pen', { kw: ['allerg', 'reaction'], allergyDrug: 'penicillin', say: 'Penicillin gave me a rash years ago.' }),
      F('c1', 'BP 158/94 mmHg (ref <120/80), 2026-09-10', 'bp', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-0910', ehr: 'labs', lab: true, unit: 'mmHg', ref: '<120/80' }),
      F('c2', 'PCP note 09-12: fill history shows missed lisinopril refill', 'refill', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Primary care physician', src: 'Note N-0912', ehr: 'notes' }),
      F('c3', 'Chart list: lisinopril 10 mg PO daily', '10mg', { vis: 'chart', sec: 'meds', type: 'documented', role: 'Primary care physician', src: 'Med list ML-2', ehr: 'meds' })
    ],
    obj: [
      { id: 'q1', t: 'Elicit missed evening doses', w: 30, ty: 'fact', f: ['g3'], tip: 'Ask open questions about how they take the medicine.' },
      { id: 'q2', t: 'Review blood pressure', w: 25, ty: 'review', s: ['labs'], tip: 'Open labs before concluding.' },
      { id: 'q3', t: 'Reconcile adherence discrepancy', w: 25, ty: 'mm', tip: 'Compare the patient report with the refill note.' },
      { id: 'q4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Acknowledge feelings and use open questions.' }
    ],
    mm: { a: 'g2', b: 'c2', fu: 'g3', kw: ['refill', 'gap', 'miss', 'skip', 'discrep', 'not taking', 'adherence'] }
  };
}

let drafts = {};
let rel = [];
let enc = null;
let tab = 'studio';
let rt = 'ov';
let issues = [];
let sel = 'denise';
let msg = '';

SEED.forEach((p) => {
  drafts[p.id] = JSON.stringify(p, null, 2);
});

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (err) {
    return null;
  }
}

function dumpEnc(value) {
  if (!value) {
    return null;
  }

  return {
    id: value.id,
    p: value.p,
    trust: value.trust,
    disc: [...value.disc.entries()],
    opened: [...value.opened],
    ev: value.ev,
    tr: value.tr,
    prov: value.prov,
    role: value.role,
    emp: value.emp,
    open: value.open,
    turns: value.turns,
    ho: value.ho,
    plan: value.plan,
    notes: value.notes,
    rec: value.rec,
    blocked: value.blocked,
    mmS: value.mmS || 0,
    prof: value.prof || 0,
    judg: value.judg || 0,
    arts: [...(value.arts || new Map()).entries()],
    lastArt: value.lastArt || null
  };
}

function loadEnc(value) {
  if (!value || !value.p) {
    return null;
  }

  return Object.assign({}, value, {
    disc: new Map(value.disc || []),
    opened: new Set(value.opened || ['ov']),
    arts: new Map(value.arts || [])
  });
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      drafts,
      rel,
      sel,
      tab,
      enc: dumpEnc(enc)
    }));
  } catch (err) {
    console.error('VirtuSP could not save local data', err);
  }
}

function bootStorage() {
  let stored = readJson(KEY);
  if (!stored) {
    stored = readJson(LEGACY_KEY);
  }
  if (!stored) {
    SEED.forEach((p) => {
      rel.push({ p: Object.assign(JSON.parse(JSON.stringify(p)), { version: 1 }), at: now() });
    });

    return;
  }

  drafts = stored.drafts || drafts;
  rel = stored.rel || [];
  if (stored.sel && drafts[stored.sel]) {
    sel = stored.sel;
  }
  if (stored.tab) {
    tab = stored.tab;
  }
  if (stored.enc) {
    enc = loadEnc(stored.enc);
  }
}

function currentProfile() {
  try {
    return JSON.parse(drafts[sel]);
  } catch (err) {
    return null;
  }
}

function writeProfile(p) {
  drafts[sel] = JSON.stringify(p, null, 2);
  save();
}

function setStudio(field, value) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p[field] = field === 'age' ? (Number(value) || 0) : value;
  writeProfile(p);
}

function hydrate(p) {
  p.facts = p.facts || [];
  p.obj = p.obj || [];
  const isNewCase = p.facts.length < 3;

  const ensure = (id, label, k, o) => {
    if (!isNewCase || p.facts.some((f) => f.id === id)) {
      return;
    }
    p.facts.push(F(id, label, k, o));
  };

  if (p.complaint) {
    ensure('cc', p.complaint, 'cc', { say: p.complaint, kw: ['why', 'here', 'concern', 'problem', 'symptom'] });
  }
  if (p.history) {
    ensure('hx1', 'History: ' + p.history, 'hist', { say: p.history, kw: ['history', 'before', 'past'] });
  }
  if (p.diagnosis) {
    ensure('dx', 'Diagnosis: ' + p.diagnosis, 'dx', { say: 'They told me I have ' + p.diagnosis + '.', kw: ['diagnos', 'mean', 'know about'] });
  }
  if (p.medications) {
    ensure('med', 'Medications: ' + p.medications, 'med', {
      ehr: 'meds',
      say: p.patientSays || ('I take ' + p.medications + '.'),
      kw: ['medication', 'medicine', 'pills', 'taking']
    });
  }
  if (p.allergies) {
    ensure('alg', 'Allergy: ' + p.allergies, 'alg', { say: p.allergies, kw: ['allerg', 'reaction'] });
  }
  String(p.labs || '').split('\n').map((line) => line.trim()).filter(Boolean).forEach((line, i) => {
    const parts = line.split('|').map((s) => s.trim());
    const name = parts[0] || 'Lab';
    const value = parts[1] || '';
    const unit = parts[2] || '';
    const ref = parts[3] || '—';
    ensure('lab' + i, name + ' ' + value + ' ' + unit + ' (ref ' + ref + ')', 'lab', {
      vis: 'chart',
      sec: 'labs',
      type: 'confirmed',
      role: 'Lab',
      src: 'Approved case',
      ehr: 'labs',
      lab: true,
      unit,
      ref,
      kw: ['lab', 'result', name.toLowerCase()]
    });
  });
  if (p.patientSays && p.chartSays) {
    ensure('say', p.patientSays, 'say', { ehr: 'meds', say: p.patientSays, kw: ['medication', 'taking', 'every day'] });
    ensure('chr', p.chartSays, 'chr', {
      vis: 'chart',
      sec: 'notes',
      type: 'documented',
      role: 'Primary care physician',
      src: 'Approved case',
      ehr: 'notes'
    });
    if (!p.mm || !p.mm.a) {
      p.mm = { a: 'say', b: 'chr', fu: 'say', kw: ['discrep', 'not taking', 'miss', 'gap'] };
    }
  }
  if (p.objText && !p.obj.length) {
    const lines = String(p.objText).split('\n').map((s) => s.trim()).filter(Boolean);
    const w = Math.floor(100 / Math.max(lines.length, 1));
    p.obj = lines.map((t, i) => ({
      id: 'o' + i,
      t,
      w: i === 0 ? 100 - w * (lines.length - 1) : w,
      ty: i === 1 ? 'review' : 'fact',
      f: p.facts[0] ? [p.facts[0].id] : [],
      s: i === 1 ? ['labs'] : undefined,
      tip: 'Ask about this directly and review the chart.'
    }));
  }
  if (!p.obj.length) {
    p.obj = [{ id: 'o0', t: 'Gather the chief complaint', w: 100, ty: 'fact', f: p.facts[0] ? [p.facts[0].id] : ['cc'], tip: 'Start with why they came in.' }];
  }
  if (!p.intro) {
    p.intro = "Hi, I'm " + String(p.name || 'the patient').split(' ')[0] + '.';
  }
  if (!p.src) {
    p.facts.forEach((f) => {
      if (!f.src) {
        f.src = 'Approved case';
      }
    });
  }

  return p;
}

function newPatient() {
  const id = 'pt' + Date.now().toString(36);
  const p = {
    id,
    name: 'New Patient',
    age: 50,
    intro: 'Hello.',
    personality: '',
    emotion: '',
    style: '',
    complaint: '',
    history: '',
    diagnosis: '',
    medications: '',
    allergies: '',
    labs: '',
    patientSays: '',
    chartSays: '',
    objText: 'Gather the chief complaint\nReview available labs\nLook for a chart discrepancy',
    facts: [],
    obj: [],
    hints: ['What brings you in today?']
  };
  drafts[id] = JSON.stringify(p, null, 2);
  sel = id;
  issues = [];
  msg = 'Fill in the case fields, then Check and Publish.';
  save();
  render();
}

function validate(p) {
  const found = [];
  const err = (m, r) => found.push({ s: 'error', m, r });
  const warn = (m, r) => found.push({ s: 'warning', m, r });
  const ids = new Set();

  (p.facts || []).forEach((f) => {
    if (ids.has(f.id)) {
      err('Duplicate fact id', f.id);
    }
    ids.add(f.id);
    if (!f.src) {
      err('Missing source', f.id);
    } else if (/unverified/i.test(f.src)) {
      warn('Unverified source: faculty must confirm', f.id);
    }
    if (f.vis === 'ask' && !f.say) {
      err('Disclosable fact has no approved patient wording (model could not ground it)', f.id);
    }
    if (f.lab && (!f.unit || !f.ref)) {
      err('Lab missing unit or reference range', f.id);
    }
    if (f.vis === 'chart' && !f.sec) {
      err('Chart fact has no release section', f.id);
    }
  });

  (p.facts || []).filter((f) => f.allergyDrug).forEach((a) => {
    (p.facts || []).filter((f) => f.drug === a.allergyDrug).forEach((m) => {
      err('Allergy conflicts with medication', a.id + '/' + m.id);
    });
  });

  if (!(p.obj || []).length) {
    err('No learning objectives', 'obj');
  }
  (p.obj || []).forEach((o) => {
    (o.f || []).forEach((i) => {
      if (!ids.has(i)) {
        err('Objective references unknown fact ' + i, o.id);
      }
    });
  });

  const total = (p.obj || []).reduce((a, o) => a + Number(o.w || 0), 0);
  if (total !== 100) {
    warn('Objective weights sum to ' + total + ', not 100', 'obj');
  }
  if (p.mm && (!ids.has(p.mm.a) || !ids.has(p.mm.b))) {
    err('Mismatch references unknown facts', 'mm');
  }

  return found;
}

function runValidate() {
  const p = currentProfile();
  if (!p) {
    msg = 'Could not read this patient. Create a new one.';
    issues = [];
    render();

    return;
  }

  hydrate(p);
  writeProfile(p);
  issues = validate(p);
  msg = issues.some((i) => i.s === 'error') ? 'Validation found errors.' : 'Case looks ready to publish.';
  render();
}

function publish(id) {
  let p;
  try {
    p = JSON.parse(drafts[id]);
  } catch (err) {
    msg = 'Could not read this patient. Create a new one.';
    render();

    return;
  }

  hydrate(p);
  drafts[id] = JSON.stringify(p, null, 2);
  issues = validate(p);
  if (issues.some((i) => i.s === 'error')) {
    msg = 'Publish blocked: fix errors and rerun validation.';
    render();

    return;
  }

  p.version = rel.filter((r) => r.p.id === p.id).length + 1;
  rel.push({ p: JSON.parse(JSON.stringify(p)), at: now() });
  msg = `Published ${p.name} v${p.version} (immutable). Ready to launch.`;
  save();
}

function cloneCase(base, meta) {
  const p = JSON.parse(JSON.stringify(base));
  p.id = meta.id;
  p.name = meta.name;
  p.age = meta.age;
  p.intro = "Hi, I'm " + meta.name.split(' ')[0] + '.';

  return p;
}

function nlDraft(txt) {
  const ageMatch = String(txt || '').match(/(\d+)\s*-?\s*year/);
  const age = ageMatch ? Number(ageMatch[1]) : 55;
  const nameMatch = String(txt || '').match(/\b(?:named|called|patient)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const name = nameMatch ? nameMatch[1] : 'New Patient';
  const id = 'pt' + Date.now().toString(36);
  const lower = String(txt || '').toLowerCase();
  let kind = 'general';
  let base = templateGeneral();

  if (/diabet|metformin|a1c|glucose|sugar/.test(lower)) {
    kind = 'diabetes';
    base = SEED.find((p) => p.id === 'denise');
  } else if (/copd|smok|inhaler|breath|asthma|spirom/.test(lower)) {
    kind = 'respiratory';
    base = SEED.find((p) => p.id === 'marcus');
  }

  const p = cloneCase(base, { id, name, age });
  drafts[id] = JSON.stringify(p, null, 2);
  sel = id;
  issues = validate(p);
  msg = `Created a publishable ${kind} case for ${name}, ${age}. Review every fact against your description, then publish.`;
  save();
}

function launch(pid, version) {
  let release;
  if (version != null) {
    release = rel.find((item) => item.p.id === pid && Number(item.p.version) === Number(version));
  }
  if (!release) {
    release = [...rel].reverse().find((item) => item.p.id === pid);
  }
  if (!release) {
    return;
  }

  enc = {
    id: 'ENC-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    p: attachCaseExtras(release.p),
    trust: 0,
    disc: new Map(),
    opened: new Set(['ov']),
    ev: [],
    tr: [{ w: 'Patient', t: release.p.intro }],
    prov: [],
    role: ROLES[0],
    emp: 0,
    open: 0,
    turns: 0,
    ho: null,
    plan: [],
    notes: [],
    rec: false,
    blocked: 0,
    prof: 0,
    judg: 0,
    arts: new Map(),
    lastArt: null
  };
  log('start', `Launched ${release.p.name} profile v${release.p.version}`);
  tab = 'enc';
  rt = 'ov';
  window.__convo = true;
  window.__type = false;
  window.__busy = true;
  save();
  render();
  speak(release.p.intro, 'neutral');
}

function log(type, text) {
  enc.ev.push({ n: enc.ev.length + 1, t: now(), role: enc.role, type, text });
}

function attachCaseExtras(p) {
  const copy = JSON.parse(JSON.stringify(p));
  const seed = SEED.find((s) => s.id === copy.id);
  if (!seed) {
    return copy;
  }
  if (!(copy.artifacts || []).length && seed.artifacts) {
    copy.artifacts = JSON.parse(JSON.stringify(seed.artifacts));
  }
  const have = new Set((copy.facts || []).map((f) => f.id));
  (seed.facts || []).forEach((f) => {
    if (!have.has(f.id) && (f.ehr === 'img' || f.artifact)) {
      copy.facts.push(JSON.parse(JSON.stringify(f)));
    }
  });

  return copy;
}

function releaseArtifact(art, via) {
  if (!art || enc.arts.has(art.id)) {
    return;
  }

  enc.arts.set(art.id, { via, t: now() });
  enc.lastArt = art.id;
  (art.facts || []).forEach((id) => {
    const fact = enc.p.facts.find((f) => f.id === id);
    if (fact) {
      disclose(fact, via);
    }
  });
  if (art.sec) {
    enc.opened.add(art.sec);
    rt = art.sec;
  }
  log('artifact', art.title + ' released via ' + via);
}

function releaseByQuestion(q) {
  const lower = String(q).toLowerCase();
  (enc.p.artifacts || []).forEach((art) => {
    if ((art.unlock || []).some((k) => lower.includes(k))) {
      releaseArtifact(art, q);
    }
  });
  enc.p.facts.filter((f) => f.vis === 'chart').forEach((f) => {
    if ((f.kw || []).some((k) => lower.includes(k))) {
      disclose(f, q);
    }
  });
}

function disclose(f, q) {
  if (enc.disc.has(f.id)) {
    return;
  }

  enc.disc.set(f.id, { q });
  enc.prov.push({
    f,
    who: f.vis === 'chart' ? f.role : 'Patient',
    rec: enc.role,
    t: now(),
    st: f.type
  });
  log('disclose', `${f.id} released (${f.type}) via ${q}`);
}

const UNKNOWN = "I'm not sure about that. Could you ask me another way?";

function caseFactsForService() {
  const profile = enc && enc.p;
  if (!profile) {
    return { intro: '', facts: [] };
  }

  return {
    intro: profile.intro || '',
    facts: (profile.facts || []).map((f) => ({
      id: f.id,
      say: f.say || '',
      deflect: f.deflect || '',
      label: f.label || '',
      kw: f.kw || [],
      vis: f.vis || 'ask',
      gate: f.gate || 0
    }))
  };
}

function documentsForService() {
  const profile = enc && enc.p;
  if (!profile) {
    return [];
  }

  const docs = [];
  (profile.artifacts || []).forEach((art) => {
    const rows = (art.rows || []).map((row) => [row.name, row.value, row.unit, row.ref, row.flag]
      .filter((part) => part != null && part !== '')
      .join(' '));
    docs.push({
      id: art.id,
      source: 'faculty',
      title: art.title || art.src || 'Faculty document',
      date: art.date || '',
      text: [art.title, art.date, art.src, art.kind].concat(rows).filter(Boolean).join('\n')
    });
  });
  (profile.facts || []).filter((fact) => fact.vis === 'chart').forEach((fact) => {
    docs.push({
      id: fact.id,
      source: /patient/i.test(fact.role || '') ? 'patient' : 'faculty',
      title: fact.src || fact.label || 'Chart document',
      date: '',
      text: [fact.label, fact.say, fact.src, fact.role].filter(Boolean).join('\n')
    });
  });

  return docs;
}

function citeLabel(side) {
  if (!side || !side.allow) {
    return 'blocked';
  }
  const first = (side.matches || [])[0];
  if (!first) {
    return side.kind === 'interview' ? 'interview' : 'allowed';
  }
  if (first.source === 'case') {
    return first.id ? 'case:' + first.id : 'case';
  }

  return first.pmid ? 'PMID ' + first.pmid : ('data:' + first.id);
}

function scoreStudent(lower) {
  if (/(understand|sorry|must be|sounds|thank you for|worr|concern about|appreciate|no judg|i hear|that must)/.test(lower)) {
    enc.emp += 1;
    enc.prof += 1;
    enc.trust = Math.min(3, enc.trust + 1);
    log('empathy', 'Empathic acknowledgment');
  }
  if (/please|appreciate your time/.test(lower)) {
    enc.prof += 1;
  }
  if (/(noncompliant|you need to|why didn't you|should have taken|that's stupid)/.test(lower)) {
    enc.judg += 1;
    log('professionalism', 'Judgmental wording logged');
  }
  if (/^(how|what|tell|can you|could you|walk me)/.test(lower)) {
    enc.open += 1;
  }
}

function logReview(verdict) {
  const stages = (verdict && verdict.stages) || {};
  const identified = stages.identify || {};
  const searched = stages.search || {};
  const wide = stages.exhaustive || {};
  const review = stages.review || {};
  log('identify', identified.unique ? 'Problem: ' + identified.problem : 'No single problem identified');
  log('search', searched.confirmed ? 'Search confirmed ' + searched.fact_id : 'Search did not confirm one problem');
  log('exhaustive', wide.unique ? 'Exhaustive search kept ' + wide.fact_id : 'Exhaustive search was not conclusive');
  log('review', review.reason || 'Review finished');
  const guard = stages.interceptor || {};
  log('interceptor', guard.reason || 'Reply reviewed before send');
}

async function consultPatient(request) {
  const res = await fetch('/api/patient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request,
      trust: enc.trust,
      patient_id: enc.p && enc.p.id,
      disclosed: [...enc.disc.keys()],
      case_facts: caseFactsForService(),
      documents: documentsForService()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Patient review is unavailable');
  }

  return data;
}

async function ask(q) {
  if (!enc || !String(q).trim() || window.__gating) {
    return;
  }

  const text = String(q).trim();
  window.__gating = true;
  window.__busy = true;
  stopListen();
  av('checking', 'neutral');
  const status = $('#mst');
  if (status) {
    status.textContent = 'Reviewing the reply for relevance, timing, and the patient and faculty sources…';
  }

  try {
    const verdict = await consultPatient(text);
    logReview(verdict);
    if (!verdict.send || !verdict.request || !verdict.request.allow) {
      enc.tr.push({ w: 'Student', t: text, g: 'blocked' });
      enc.tr.push({
        w: 'Gate',
        t: (verdict.request && verdict.request.reason) || 'Request blocked: not grounded on the publication library.',
        g: 'blocked'
      });
      log('gate', 'Request not sent: ' + ((verdict.request && verdict.request.reason) || 'blocked'));
      enc.blocked += 1;
      save();
      render(true);
    } else {
      scoreStudent(text.toLowerCase());
      enc.turns += 1;
      enc.tr.push({ w: 'Student', t: text, g: citeLabel(verdict.request) });
      log('student', text);
      log('gate', verdict.request.reason);

      const reply = verdict.certain ? verdict.reply : (verdict.reply || UNKNOWN);
      const grounded = verdict.certain ? verdict.grounded : 'fallback';
      const emotion = verdict.certain ? (verdict.emotion || 'neutral') : 'neutral';
      const fact = (enc.p.facts || []).find((item) => item.id === verdict.fact_id);
      if (verdict.certain && verdict.trust_hold) {
        enc.blocked += 1;
        log('gate', `${verdict.fact_id} withheld (trust ${enc.trust})`);
      } else if (verdict.certain && fact) {
        disclose(fact, text);
      }

      enc.tr.push({ w: 'Patient', t: reply, g: grounded });
      releaseByQuestion(text);
      surfaceMM();
      save();
      render(true);
      speak(reply, emotion);

      return;
    }
  } catch (err) {
    enc.tr.push({ w: 'Student', t: text, g: 'blocked' });
    enc.tr.push({
      w: 'Gate',
      t: 'Request was not sent. ' + (err.message || 'Grounding gate failed.'),
      g: 'blocked'
    });
    log('gate', 'Request not sent: ' + (err.message || 'gate failed'));
    enc.blocked += 1;
    save();
    render(true);
  } finally {
    window.__gating = false;
  }
  window.__busy = false;
  av('listening', 'neutral');
  if (window.__convo !== false) {
    startListen();
  }
}

function askHint(i) {
  const hints = (enc && enc.p && enc.p.hints) || [];
  if (hints[i]) {
    ask(hints[i]);
  }
}

function surfaceMM() {
  const mismatch = enc.p.mm;
  if (mismatch && enc.disc.has(mismatch.a) && enc.disc.has(mismatch.b) && !enc.mmS) {
    enc.mmS = 1;
    log('mismatch', 'Patient report and chart now both visible (discrepancy surfaced)');
  }
}

function openSec(s) {
  if (!enc.opened.has(s)) {
    enc.opened.add(s);
    log('open', 'Opened ' + s);
    enc.p.facts.filter((f) => f.sec === s).forEach((f) => disclose(f, 'section ' + s));
    (enc.p.artifacts || []).filter((a) => a.sec === s).forEach((a) => releaseArtifact(a, 'opened ' + s));
    surfaceMM();
    save();
  }
  rt = s;
  renderEhr();
}

function reconcile(t) {
  if (!String(t).trim()) {
    return;
  }

  const ok = enc.p.mm && enc.mmS && enc.p.mm.kw.some((k) => t.toLowerCase().includes(k));
  enc.notes.push({ t, who: enc.role, at: now(), ok });
  if (ok) {
    enc.rec = true;
  }
  log('reconcile', `Clinician claim documented${ok ? ' (addresses discrepancy)' : ''}: ${t}`);
  save();
  renderEhr();
}

let mouthTimer;
let recActive = null;

function photoSet(p) {
  const known = { denise: true, marcus: true };
  const base = p && known[p.id] ? p.id : 'patient';

  return { still: 'img/' + base + '.jpg', talk: 'img/' + base + '-talk.jpg' };
}

function avatarHtml(p) {
  const pics = photoSet(p);

  return `<div class="av-frame" id="avf">
    <img class="av-still" src="${pics.still}" alt="${esc(p.name)}">
  </div>`;
}

function setMicLabel() {
  const btn = $('#micBtn');
  if (!btn) {
    return;
  }
  btn.textContent = window.__busy ? 'Speaking…' : (recActive ? 'Listening…' : 'Tap to talk');
}

function av(state, em) {
  const status = $('#avs');
  if (status) {
    const label = state === 'speaking' ? 'Speaking' : state === 'listening' ? 'Listening' : state === 'checking' ? 'Checking ground truth' : state;
    status.textContent = label + (em && em !== 'neutral' ? ' · ' + em : '');
  }

  const frame = $('#avf');
  if (frame) {
    frame.classList.toggle('is-listening', state === 'listening');
  }

  clearInterval(mouthTimer);
  setMicLabel();
}

function speak(t, em) {
  window.__busy = true;
  stopListen();
  av('speaking', em);
  const status = $('#mst');
  if (status) {
    status.textContent = 'The patient is talking…';
  }
  const done = () => {
    window.__busy = false;
    av('listening', 'neutral');
    if (window.__convo !== false) {
      startListen();
    }
  };

  if (SERVICES.voice === 'browser' && 'speechSynthesis' in window && !window.__mute) {
    try {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(t);
      utter.onend = done;
      utter.onerror = done;
      speechSynthesis.speak(utter);

      return;
    } catch (err) {
      console.error('VirtuSP speech synthesis fallback', err);
    }
  }
  setTimeout(done, Math.min(5000, String(t).length * 45));
}

function stopListen() {
  if (!recActive) {
    return;
  }

  try {
    recActive.onend = null;
    recActive.onerror = null;
    recActive.stop();
  } catch (err) {}
  recActive = null;
}

function startListen() {
  if (window.__busy || window.__convo === false) {
    return;
  }

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = $('#mst');
  if (!Rec) {
    if (status) {
      status.textContent = 'Voice is not available here. Use Type instead.';
    }

    return;
  }

  stopListen();
  const rec = new Rec();
  recActive = rec;
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    const text = last[0].transcript;
    if (status) {
      status.textContent = last.isFinal ? 'Listening…' : text;
    }
    if (last.isFinal && text.trim()) {
      stopListen();
      ask(text.trim());
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') {
      return;
    }
    if (status) {
      status.textContent = 'Mic issue. Tap the button to talk, or type.';
    }
  };
  rec.onend = () => {
    recActive = null;
    if (!window.__busy && window.__convo !== false) {
      startListen();
    }
    setMicLabel();
  };
  if (status) {
    status.textContent = 'Listening… speak whenever you are ready.';
  }
  av('listening', 'neutral');
  try {
    rec.start();
  } catch (err) {}
  setMicLabel();
}

function mic() {
  window.__convo = true;
  if (window.__busy) {
    stopSpeech();
  }
  startListen();
}

function endConvo() {
  window.__convo = false;
  stopListen();
  stopSpeech();
  av('listening', 'neutral');
  const status = $('#mst');
  if (status) {
    status.textContent = 'Conversation paused.';
  }
  setMicLabel();
}

function stopSpeech() {
  window.__busy = false;
  try {
    speechSynthesis.cancel();
  } catch (err) {}
  av('listening', 'neutral');
}

function toggleType() {
  window.__type = !window.__type;
  const typeRow = $('#typeRow');
  if (typeRow) {
    typeRow.hidden = !window.__type;
  }
}

function grade(o) {
  const disclosed = enc.disc;
  const evidence = [];
  let credit = null;

  if (o.ty === 'fact') {
    const got = o.f.filter((i) => disclosed.has(i));
    credit = got.length / o.f.length;
    got.forEach((i) => evidence.push(`${i}: "${disclosed.get(i).q}"`));
  } else if (o.ty === 'review') {
    const got = o.s.filter((s) => enc.opened.has(s));
    credit = got.length / o.s.length;
    got.forEach((s) => evidence.push('Opened ' + s));
  } else if (o.ty === 'mm') {
    const mismatch = enc.p.mm;
    if (!enc.mmS) {
      return { c: null, E: ['Discrepancy never surfaced (open the chart sources)'] };
    }
    credit = 0;
    if (disclosed.has(mismatch.fu)) {
      credit += 0.5;
      evidence.push('Follow-up elicited: ' + mismatch.fu);
    }
    if (enc.rec) {
      credit += 0.5;
      evidence.push('Reconciliation documented');
    }
  } else if (o.ty === 'emp') {
    if (!enc.turns) {
      return { c: null, E: ['No turns'] };
    }
    credit = (enc.emp > 0) * 0.5 + (enc.open >= 2) * 0.5;
    evidence.push(`${enc.emp} empathic statement(s), ${enc.open} open question(s)`);
  } else if (o.ty === 'ho') {
    if (!enc.ho) {
      return { c: null, E: ['No handoff submitted'] };
    }
    credit = enc.ho.inc / enc.ho.tot;
    evidence.push(`${enc.ho.inc}/${enc.ho.tot} documented facts included`);
  }

  return { c: credit, E: evidence };
}

function interviewSequence() {
  const notes = [];
  const students = enc.tr.filter((m) => m.w === 'Student').map((m) => m.t.toLowerCase());
  if (!students.length) {
    return { c: null, notes: ['No interview yet'] };
  }

  let score = 0;
  let parts = 0;
  parts += 1;
  if (/why|bring|here|concern|going on|what.*today/.test(students[0] || '')) {
    score += 1;
    notes.push('Opened with the reason for the visit.');
  } else {
    notes.push('Next attempt: start with why the patient is here before medications or conclusions.');
  }

  parts += 1;
  const firstSensitive = enc.ev.find((e) => e.type === 'disclose' && /d4|d5|m3|m4|g3/.test(e.text));
  const firstEmp = enc.ev.find((e) => e.type === 'empathy');
  if (firstEmp && firstSensitive && firstEmp.n < firstSensitive.n) {
    score += 1;
    notes.push('Built rapport before asking the harder question.');
  } else if (firstSensitive) {
    notes.push('Next attempt: acknowledge feelings before pressing on adherence or smoking.');
  } else {
    notes.push('Sensitive findings were not reached yet.');
  }

  parts += 1;
  const reviewed = enc.ev.some((e) => e.type === 'open' || e.type === 'artifact');
  if (reviewed) {
    score += 1;
    notes.push('Reviewed chart evidence during the visit.');
  } else {
    notes.push('Next attempt: open labs or imaging before deciding what is true.');
  }

  return { c: score / parts, notes };
}

function professionalism() {
  if (!enc.turns) {
    return { c: null, notes: ['No turns'] };
  }

  let score = 0;
  const notes = [];
  if (enc.emp > 0) {
    score += 0.4;
    notes.push('Empathic language used.');
  } else {
    notes.push('Next attempt: name the feeling before asking a harder question.');
  }
  if (enc.open >= 2) {
    score += 0.3;
    notes.push('Used open questions.');
  } else {
    notes.push('Next attempt: ask how / what / tell me instead of closed questions.');
  }
  if (!(enc.judg)) {
    score += 0.3;
    notes.push('No judgmental wording logged.');
  } else {
    notes.push('Avoid language like noncompliant or you should have.');
  }

  return { c: score, notes };
}

function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || 'auto';
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function themeLabel() {
  const theme = localStorage.getItem(THEME_KEY) || 'auto';
  if (theme === 'light') {
    return 'Theme: Light';
  }
  if (theme === 'dark') {
    return 'Theme: Dark';
  }

  return 'Theme: Auto';
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'auto';
  const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  const btn = $('#themeBtn');
  if (btn) {
    btn.textContent = themeLabel();
  }
}

function goTab(next) {
  tab = next;
  save();
  render();
  if (next === 'truth') {
    loadTruth();
  }
}

function setIdent(field, value) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p[field] = field === 'age' ? (Number(value) || 0) : value;
  writeProfile(p);
}

function setHints(value) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p.hints = value.split('\n').map((s) => s.trim()).filter(Boolean);
  writeProfile(p);
}

function setFact(i, field, value) {
  const p = currentProfile();
  if (!p || !p.facts[i]) {
    return;
  }
  if (field === 'kw') {
    p.facts[i].kw = value.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (field === 'gate') {
    p.facts[i].gate = Number(value) || 0;
  } else {
    p.facts[i][field] = value;
  }
  writeProfile(p);
}

function setObj(i, field, value) {
  const p = currentProfile();
  if (!p || !p.obj[i]) {
    return;
  }
  if (field === 'f' || field === 's') {
    p.obj[i][field] = value.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (field === 'w') {
    p.obj[i].w = Number(value) || 0;
  } else {
    p.obj[i][field] = value;
  }
  writeProfile(p);
}

function setMm(field, value) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p.mm = p.mm || {};
  if (field === 'kw') {
    p.mm.kw = value.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    p.mm[field] = value;
  }
  writeProfile(p);
}

function addFact() {
  const p = currentProfile();
  if (!p) {
    return;
  }
  const id = 'f' + Math.random().toString(36).slice(2, 6);
  p.facts = p.facts || [];
  p.facts.push(F(id, 'New approved fact', 'new', {
    say: 'The faculty have not finished this wording yet.',
    kw: ['why', 'here', 'concern'],
    src: 'Approved case'
  }));
  writeProfile(p);
  render();
}

function removeFact(i) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p.facts.splice(i, 1);
  writeProfile(p);
  render();
}

function addObjective() {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p.obj = p.obj || [];
  p.obj.push({
    id: 'obj' + Math.random().toString(36).slice(2, 5),
    t: 'New learning objective',
    w: 0,
    ty: 'fact',
    f: [],
    tip: 'Describe what the student should do.'
  });
  writeProfile(p);
  render();
}

function removeObjective(i) {
  const p = currentProfile();
  if (!p) {
    return;
  }
  p.obj.splice(i, 1);
  writeProfile(p);
  render();
}

function resetDemo() {
  if (!confirm('Reset all saved patients, releases, and the active encounter?')) {
    return;
  }
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  location.reload();
}

function latestReleases() {
  return rel.filter((r, i, all) => all.findLastIndex((x) => x.p.id === r.p.id) === i);
}

function factCard(f, i) {
  const types = ['reported', 'confirmed', 'documented', 'unknown'];
  const ehrs = ['hx', 'meds', 'labs', 'notes', 'soc'];

  return `<div class="card-edit">
    <h3>${esc(f.id)} <button class="btn" type="button" onclick="removeFact(${i})">Remove</button></h3>
    <div class="fields">
      <div><label>ID</label><input value="${esc(f.id)}" oninput="setFact(${i},'id',this.value)"></div>
      <div><label>Label</label><input value="${esc(f.label)}" oninput="setFact(${i},'label',this.value)"></div>
      <div><label>Visibility</label>
        <select onchange="setFact(${i},'vis',this.value)">
          <option value="ask" ${f.vis === 'ask' ? 'selected' : ''}>Interview</option>
          <option value="chart" ${f.vis === 'chart' ? 'selected' : ''}>Chart</option>
        </select>
      </div>
      <div><label>EHR section</label>
        <select onchange="setFact(${i},'ehr',this.value)">
          ${ehrs.map((s) => `<option ${f.ehr === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div><label>Type</label>
        <select onchange="setFact(${i},'type',this.value)">
          ${types.map((s) => `<option ${f.type === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div><label>Chart release section</label><input value="${esc(f.sec || '')}" oninput="setFact(${i},'sec',this.value)" placeholder="labs / notes / meds"></div>
      <div><label>Source</label><input value="${esc(f.src || '')}" oninput="setFact(${i},'src',this.value)"></div>
      <div><label>Role</label><input value="${esc(f.role || '')}" oninput="setFact(${i},'role',this.value)"></div>
      <div><label>Trust gate</label><input type="number" value="${esc(f.gate || 0)}" oninput="setFact(${i},'gate',this.value)"></div>
      <div><label>Match key</label><input value="${esc(f.k || '')}" oninput="setFact(${i},'k',this.value)"></div>
    </div>
    <div class="stack"><label>Approved patient wording</label><textarea rows="2" oninput="setFact(${i},'say',this.value)">${esc(f.say || '')}</textarea></div>
    <div class="stack"><label>Deflection if trust is too low</label><input value="${esc(f.deflect || '')}" oninput="setFact(${i},'deflect',this.value)"></div>
    <div class="stack"><label>Keywords, comma separated</label><input value="${esc((f.kw || []).join(', '))}" oninput="setFact(${i},'kw',this.value)"></div>
  </div>`;
}

function objCard(o, i) {
  return `<div class="card-edit">
    <h3>${esc(o.id)} <button class="btn" type="button" onclick="removeObjective(${i})">Remove</button></h3>
    <div class="fields">
      <div><label>Title</label><input value="${esc(o.t)}" oninput="setObj(${i},'t',this.value)"></div>
      <div><label>Weight</label><input type="number" value="${esc(o.w)}" oninput="setObj(${i},'w',this.value)"></div>
      <div><label>Type</label>
        <select onchange="setObj(${i},'ty',this.value)">
          ${['fact', 'review', 'mm', 'emp', 'ho'].map((s) => `<option ${o.ty === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div><label>Fact IDs</label><input value="${esc((o.f || []).join(', '))}" oninput="setObj(${i},'f',this.value)"></div>
      <div><label>Review sections</label><input value="${esc((o.s || []).join(', '))}" oninput="setObj(${i},'s',this.value)"></div>
    </div>
    <div class="stack"><label>Coaching tip</label><input value="${esc(o.tip || '')}" oninput="setObj(${i},'tip',this.value)"></div>
  </div>`;
}

function pickPatient(id) {
  sel = id;
  save();
  render();
}

function vStudio() {
  const p = currentProfile();
  const cards = latestReleases().map((r) => {
    const pics = photoSet(r.p);
    const isOn = sel === r.p.id;

    return `<div class="patient-card ${isOn ? 'on' : ''}">
      <button class="patient-pick" type="button" onclick="pickPatient('${r.p.id}')">
        <img src="${pics.still}" alt="">
        <b>${esc(r.p.name)}</b>
        <span class="chip">${r.p.age} · v${r.p.version}</span>
      </button>
      <button class="btn pri" type="button" onclick="launch('${r.p.id}',${r.p.version})">Start visit</button>
    </div>`;
  }).join('');

  if (!p) {
    return `<div class="pn studio">
      <h2>Patient Studio</h2>
      <p>This draft could not be read.</p>
      <button class="btn pri" type="button" onclick="newPatient()">New patient</button>
    </div>`;
  }

  return `<div class="pn studio">
    <div class="studio-head">
      <div>
        <h2>Patient Studio</h2>
        <p class="muted">Pick a patient or create one. No code.</p>
      </div>
      <div class="row">
        <button class="btn" type="button" onclick="newPatient()">New patient</button>
        <button class="btn" type="button" onclick="resetDemo()">Reset</button>
      </div>
    </div>
    <div class="patient-grid">${cards}</div>
    <div class="compact-edit">
      <div class="fields">
        <div><label>Name</label><input value="${esc(p.name || '')}" oninput="setStudio('name', this.value)"></div>
        <div><label>Age</label><input type="number" value="${esc(p.age || '')}" oninput="setStudio('age', this.value)"></div>
        <div><label>Opening line</label><input value="${esc(p.intro || '')}" oninput="setStudio('intro', this.value)"></div>
      </div>
      <div class="fields">
        <div><label>Personality</label><input value="${esc(p.personality || '')}" oninput="setStudio('personality', this.value)"></div>
        <div><label>Emotional state</label><input value="${esc(p.emotion || '')}" oninput="setStudio('emotion', this.value)"></div>
        <div><label>Communication style</label><input value="${esc(p.style || '')}" oninput="setStudio('style', this.value)"></div>
      </div>
      <div class="fields">
        <div><label>Chief complaint / symptoms</label><input value="${esc(p.complaint || '')}" oninput="setStudio('complaint', this.value)"></div>
        <div><label>Medical history</label><input value="${esc(p.history || '')}" oninput="setStudio('history', this.value)"></div>
        <div><label>Diagnosis</label><input value="${esc(p.diagnosis || '')}" oninput="setStudio('diagnosis', this.value)"></div>
      </div>
      <div class="fields">
        <div><label>Medications</label><input value="${esc(p.medications || '')}" oninput="setStudio('medications', this.value)"></div>
        <div><label>Allergies</label><input value="${esc(p.allergies || '')}" oninput="setStudio('allergies', this.value)"></div>
      </div>
      <div class="stack"><label>Labs (one per line: name | value | unit | reference)</label>
        <textarea rows="2" oninput="setStudio('labs', this.value)">${esc(p.labs || '')}</textarea>
      </div>
      <div class="fields">
        <div><label>What the patient says</label><input value="${esc(p.patientSays || '')}" oninput="setStudio('patientSays', this.value)"></div>
        <div><label>What the chart says (intentional conflict)</label><input value="${esc(p.chartSays || '')}" oninput="setStudio('chartSays', this.value)"></div>
      </div>
      <div class="stack"><label>Learning objectives (one per line)</label>
        <textarea rows="3" oninput="setStudio('objText', this.value)">${esc(p.objText || (p.obj || []).map((o) => o.t).join('\n'))}</textarea>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" onclick="runValidate()">Check</button>
        <button class="btn pri" type="button" onclick="publish(sel);render()">Publish</button>
      </div>
      <p>${esc(msg)}</p>
      ${issues.length ? issues.map((i) => `<div class="issue ${i.s === 'error' ? 'err' : ''}"><b>${i.s}</b> ${esc(i.m)}</div>`).join('') : ''}
    </div>
  </div>`;
}

function vEnc() {
  if (!enc) {
    return `<div class="pn">
      <h2>Start a visit</h2>
      <p class="muted">Choose a patient to begin the conversation.</p>
      <div class="patient-grid" style="margin-top:12px">${latestReleases().map((r) => {
        const pics = photoSet(r.p);

        return `<div class="patient-card">
          <button class="patient-pick" type="button" onclick="launch('${r.p.id}',${r.p.version})">
            <img src="${pics.still}" alt="">
            <b>${esc(r.p.name)}</b>
            <span class="chip">${r.p.age} · v${r.p.version}</span>
          </button>
          <button class="btn pri" type="button" onclick="launch('${r.p.id}',${r.p.version})">Start visit</button>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  return `<div class="grid enc-grid">
    <div class="pn enc-talk">
      <div class="panel-kicker">Virtual patient</div>
      ${avatarHtml(enc.p)}
      <h2>${esc(enc.p.name)}, ${enc.p.age}</h2>
      <div class="av-status" id="avs">Listening</div>
      <button class="mic-btn" id="micBtn" type="button" onclick="mic()">Tap to talk</button>
      <div class="chip" id="mst">Every ask is identified, searched, and reviewed before the patient answers.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" type="button" onclick="endConvo()">Pause</button>
        <button class="btn" type="button" onclick="toggleType()">Type instead</button>
      </div>
      <div class="row" id="typeRow" ${window.__type ? '' : 'hidden'}>
        <input id="q" aria-label="Ask the patient" placeholder="Type if you need to…" onkeydown="if(event.key==='Enter'){ask(this.value);this.value=''}">
        <button class="btn pri" type="button" onclick="ask($('#q').value);$('#q').value=''">Send</button>
      </div>
      <div class="tr" id="tr" aria-live="polite"></div>
    </div>
    <div class="pn ehr-panel">
      <div class="ehr-head">
        <div>
          <div class="panel-kicker">Dynamic EHR</div>
          <h2>Chart · ${esc(enc.p.name)}</h2>
        </div>
        <span class="chip">${enc.id} · v${enc.p.version}</span>
      </div>
      <div class="tabs" id="tb"></div>
      <div id="eh"></div>
    </div>
  </div>`;
}

function renderTr() {
  const box = $('#tr');
  if (!box) {
    return;
  }

  box.innerHTML = enc.tr.map((m) => {
    const who = m.w === 'Student' ? 'student' : m.w === 'Gate' ? 'gate' : 'patient';

    return `<div class="bubble ${who}"><b>${esc(m.w)}${m.g ? ` <span class="chip">grounded: ${esc(m.g)}</span>` : ''}</b><p>${esc(m.t)}</p></div>`;
  }).join('');
  box.scrollTop = 1e9;
}

function emptyEhr(section) {
  return `<div class="empty"><b>Nothing released yet.</b><div>${esc(EHR_HINTS[section] || 'Ask a question or open another chart section.')}</div></div>`;
}

function conflictCard() {
  if (!enc.mmS || !enc.p.mm) {
    return '';
  }
  const said = enc.p.facts.find((f) => f.id === enc.p.mm.a);
  const chart = enc.p.facts.find((f) => f.id === enc.p.mm.b);

  return `<div class="warn conflict">
    <b>Authored conflict — both records stay locked as written.</b>
    <div class="conflict-grid">
      <div><span class="chip">Patient said</span><p>${esc((said && (said.say || said.label)) || '')}</p></div>
      <div><span class="chip">EHR record</span><p>${esc((chart && chart.label) || '')}</p></div>
    </div>
    <p>This mismatch is intentional. Investigate, then document what you think is going on.</p>
  </div>`;
}

function artifactCard(art) {
  const released = enc.arts.has(art.id);
  const fresh = enc.lastArt === art.id ? ' just-in' : '';
  if (!released) {
    return `<div class="art locked">
      <b>${esc(art.title)}</b>
      <div class="chip">Locked · ask the right question or open ${esc(art.sec || 'the chart')}</div>
    </div>`;
  }

  const meta = enc.arts.get(art.id);
  let body = '';
  if (art.kind === 'lab' && art.rows) {
    body = `<table class="lab-table"><tr><th>Test</th><th>Result</th><th>Ref</th></tr>${art.rows.map((r) =>
      `<tr class="${r.flag || ''}"><td>${esc(r.name)}</td><td>${esc(r.value)} ${esc(r.unit || '')}</td><td>${esc(r.ref || '')}</td></tr>`
    ).join('')}</table>`;
  } else if (art.img) {
    body = `<img class="art-img" src="${esc(art.img)}" alt="${esc(art.title)}">`;
  }

  return `<div class="art released${fresh}">
    <div class="art-head"><b>${esc(art.title)}</b><span class="st confirmed">released</span></div>
    <div class="chip">${esc(art.src)} · ${esc(art.date || '')} · via ${esc(meta.via)} · ${meta.t} · SYNTHETIC</div>
    ${body}
  </div>`;
}

function renderEhr() {
  const tabs = $('#tb');
  if (!tabs) {
    return;
  }

  tabs.innerHTML = SEC.map(([k, v]) => `<button class="${rt === k ? 'on' : ''}" type="button" onclick="openSec('${k}')">${v}</button>`).join('');

  const rows = (k) => {
    const items = enc.prov.filter((p) => p.f.ehr === k);
    if (!items.length) {
      return emptyEhr(k);
    }

    return items.map((p) => `<div class="fx">
      <b>${esc(p.f.label)}</b><span class="st ${p.st}">${p.st}</span>
      <div class="chip">by ${esc(p.who)} · recorded by ${esc(p.rec)} · ${p.t} · ${esc(p.f.src)}</div>
    </div>`).join('');
  };

  const arts = enc.p.artifacts || [];
  const sectionArts = (sec) => arts.filter((a) => a.sec === sec).map(artifactCard).join('');
  const mismatch = conflictCard();

  let html = '';
  if (rt === 'ov') {
    const unlocked = arts.filter((a) => enc.arts.has(a.id)).length;
    html = `<div class="ehr-banner">
        <h3>${esc(enc.p.name)}, ${enc.p.age}</h3>
        <p class="chip">Released ${enc.disc.size} findings · ${unlocked}/${arts.length || 0} artifacts · sections ${[...enc.opened].join(', ')}</p>
      </div>
      ${mismatch}
      <h3>Clinical artifacts</h3>
      ${arts.length ? arts.map(artifactCard).join('') : '<p class="chip">No artifacts on this profile.</p>'}
      <p class="chip">Hidden faculty keys stay hidden. Locked reports do not exist for the student until earned.</p>`;
  } else {
    html = ((rt === 'meds' || rt === 'notes' || rt === 'labs') ? mismatch : '') + sectionArts(rt) + rows(rt);
    if (rt === 'notes') {
      html += enc.notes.map((n) => `<div class="fx"><b>${esc(n.t)}</b><span class="st claim">clinician claim</span><div class="chip">${esc(n.who)} · ${n.at}</div></div>`).join('');
    }
    if (rt === 'meds') {
      html += `<h3>Document the conflict</h3>
        <textarea id="rn" rows="3" placeholder="Record why the patient story and the chart do not match"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn pri" type="button" onclick="reconcile($('#rn').value)">Save note</button></div>`;
    }
  }
  $('#eh').innerHTML = html;
}

function sbar() {
  const listed = [...enc.disc.keys()].map((i) => enc.p.facts.find((f) => f.id === i)).filter(Boolean);

  return `S: Follow-up for ${enc.p.name}, ${enc.p.age}.
B: ${listed.filter((f) => f.vis === 'ask').map((f) => f.label).join('; ') || '(none elicited)'}.
A: ${listed.filter((f) => f.vis === 'chart').map((f) => f.label).join('; ') || '(no chart review)'}. ${enc.mmS ? 'Patient report conflicts with chart; reconcile.' : ''}
R: `;
}

function addPlan() {
  const input = $('#cp');
  if (!input || !input.value.trim()) {
    return;
  }
  enc.plan.push({ t: input.value, r: enc.role, at: now(), v: enc.plan.length + 1 });
  log('careplan', input.value);
  save();
  render();
}

function changeRole(value) {
  enc.role = value;
  log('role', 'Switched role to ' + value);
  save();
  render();
}

function vTeam() {
  if (!enc) {
    return '<div class="pn"><h2>No active encounter</h2><p class="muted">Launch a patient first.</p></div>';
  }

  return `<div class="grid">
    <div class="pn">
      <h2>Role and SBAR handoff</h2>
      <select id="rl" onchange="changeRole(this.value)">${ROLES.map((r) => `<option ${r === enc.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <textarea id="sb" rows="9" style="margin-top:8px">${esc(sbar())}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn pri" type="button" onclick="submitHO()">Submit handoff</button></div>
      <p>${enc.ho ? `<span class="ok">Submitted: ${enc.ho.inc}/${enc.ho.tot} documented facts included. Omitted: ${esc(enc.ho.om.join('; ') || 'none')}</span>` : ''}</p>
      <h3>Care plan</h3>
      <div class="row">
        <input id="cp" placeholder="Add care plan item">
        <button class="btn" type="button" onclick="addPlan()">Add</button>
      </div>
      ${enc.plan.map((c) => `<div class="fx">${esc(c.t)}<div class="chip">${esc(c.r)} · ${c.at}</div></div>`).join('')}
    </div>
    <div class="pn">
      <h2>Shared team record</h2>
      <div class="sc"><table>
        <tr><th>Fact</th><th>Status</th><th>Said by</th><th>Role recording</th><th>Time</th><th>Encounter</th></tr>
        ${enc.prov.map((p) => `<tr><td>${esc(p.f.label)}</td><td><span class="st ${p.st}">${p.st}</span></td><td>${esc(p.who)}</td><td>${esc(p.rec)}</td><td>${p.t}</td><td>${enc.id}</td></tr>`).join('')}
      </table></div>
      <p class="chip">Patient-reported items stay distinct from confirmed measurements. Contradictions remain visible until reconciled.</p>
    </div>
  </div>`;
}

function submitHO() {
  const box = $('#sb');
  if (!box) {
    return;
  }

  const text = box.value.toLowerCase();
  const facts = [...enc.disc.keys()].map((i) => enc.p.facts.find((f) => f.id === i)).filter(Boolean);
  const included = facts.filter((f) => text.includes(f.k) || text.includes(f.label.toLowerCase().slice(0, 14)));
  enc.ho = {
    inc: included.length,
    tot: facts.length,
    om: facts.filter((f) => !included.includes(f)).map((f) => f.label)
  };
  log('handoff', `SBAR submitted by ${enc.role}`);
  save();
  render();
}

function vRep() {
  if (!enc) {
    return '<div class="pn"><h2>No active encounter</h2><p class="muted">Complete an interview first.</p></div>';
  }

  let assessedWeight = 0;
  let earned = 0;
  const cards = enc.p.obj.map((o) => {
    const g = grade(o);
    if (g.c != null) {
      assessedWeight += o.w;
      earned += o.w * g.c;
    }
    const score = g.c == null ? 'Not assessed' : Math.round(g.c * o.w) + '/' + o.w;
    const next = (g.c != null && g.c < 1) || g.c == null ? o.tip : 'On target';

    return `<div class="obj-card">
      <h3>${esc(o.t)}</h3>
      <div class="chip">Learning objective · weight ${o.w} · ${score}</div>
      <p>${g.E.map(esc).join('<br>') || 'No evidence yet.'}</p>
      <p class="muted"><b>Next attempt:</b> ${esc(next)}</p>
    </div>`;
  }).join('');

  const pct = assessedWeight ? Math.round(earned / assessedWeight * 100) : 0;
  const askFacts = (enc.p.facts || []).filter((f) => f.vis === 'ask');
  const elicited = askFacts.filter((f) => enc.disc.has(f.id));
  const missed = askFacts.filter((f) => !enc.disc.has(f.id));
  const arts = enc.p.artifacts || [];
  const seenArts = arts.filter((a) => enc.arts.has(a.id));
  const missedArts = arts.filter((a) => !enc.arts.has(a.id));
  const seq = interviewSequence();
  const prof = professionalism();

  return `<div class="pn">
    <h2>Explainable feedback</h2>
    <div class="score-hero">
      <div class="score-num">${pct}%</div>
      <div>
        <div>on assessed faculty objectives</div>
        <div class="chip">${assessedWeight} of 100 weight · profile v${enc.p.version} · ${enc.turns} turns logged</div>
        <p class="muted">Every score is tied to a transcript line, an opened record, or a missing action. Nothing is invented.</p>
      </div>
    </div>
    <div class="fb-grid">
      <div class="obj-card">
        <h3>Findings elicited</h3>
        ${elicited.length ? elicited.map((f) => `<p>${esc(f.label)}</p>`).join('') : '<p class="muted">None yet.</p>'}
        <h3>Artifacts reviewed</h3>
        ${seenArts.length ? seenArts.map((a) => `<p>${esc(a.title)}</p>`).join('') : '<p class="muted">No reports opened.</p>'}
      </div>
      <div class="obj-card">
        <h3>Missed opportunities</h3>
        ${missed.length ? missed.map((f) => `<p>${esc(f.label)}</p>`).join('') : '<p class="ok">No interview findings left on the table.</p>'}
        ${missedArts.map((a) => `<p>Did not unlock ${esc(a.title)}</p>`).join('')}
      </div>
    </div>
    <div class="fb-grid">
      <div class="obj-card">
        <h3>Empathy and professionalism</h3>
        <p>${prof.c == null ? 'Not assessed' : Math.round(prof.c * 100) + '%'}</p>
        ${prof.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}
      </div>
      <div class="obj-card">
        <h3>Interview sequence</h3>
        <p>${seq.c == null ? 'Not assessed' : Math.round(seq.c * 100) + '%'}</p>
        ${seq.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}
      </div>
    </div>
    <h3>Mapped to the faculty rubric</h3>
    ${cards}
    <h3>Interaction log</h3>
    <div class="sc"><table>
      <tr><th>#</th><th>Time</th><th>Role</th><th>Type</th><th>Detail</th></tr>
      ${enc.ev.map((e) => `<tr><td>${e.n}</td><td>${e.t}</td><td>${esc(e.role)}</td><td>${e.type}</td><td>${esc(e.text)}</td></tr>`).join('')}
    </table></div>
  </div>`;
}

let truth = {
  journals: [],
  facts: [],
  q: '',
  pmid: '',
  query: '',
  limit: 5,
  json: '',
  status: '',
  busy: false,
  counts: { journals: 0, medical_data: 0 },
  nih: null
};

function cite(row) {
  const bits = [row.authors, row.journal_name, row.year].filter(Boolean);

  return bits.join('. ') + (row.pmid ? ' · PMID ' + row.pmid : '');
}

async function loadTruth(keepStatus) {
  try {
    const q = encodeURIComponent(truth.q || '');
    const [journalsRes, factsRes, healthRes, nihRes] = await Promise.all([
      fetch('/api/journals'),
      fetch('/api/medical-data?q=' + q),
      fetch('/api/health'),
      fetch('/api/ingest/status')
    ]);
    if (!journalsRes.ok || !factsRes.ok) {
      throw new Error('Ground truth API is not running. Restart with node server.js.');
    }
    const journals = await journalsRes.json();
    const facts = await factsRes.json();
    const health = healthRes.ok ? await healthRes.json() : {};
    truth.journals = journals.journals || [];
    truth.facts = facts.medical_data || [];
    const nih = nihRes.ok ? await nihRes.json() : {};
    truth.counts = {
      journals: health.journals || truth.journals.length,
      medical_data: health.medical_data || truth.facts.length
    };
    truth.nih = nih;
    if (!keepStatus) {
      truth.status = '';
    }
  } catch (err) {
    truth.status = err.message || String(err);
  }
  truth.busy = false;
  if (tab === 'truth') {
    render();
  }
}

async function ingestTruth(kind) {
  if (truth.busy) {
    return;
  }

  const body = {};
  try {
    if (kind === 'seed') {
      body.seed = true;
    } else if (kind === 'pmid') {
      if (!truth.pmid.trim()) {
        throw new Error('Enter a PubMed ID.');
      }
      body.pmid = truth.pmid.trim();
    } else if (kind === 'query') {
      if (!truth.query.trim()) {
        throw new Error('Enter a PubMed search.');
      }
      body.query = truth.query.trim();
      body.limit = Number(truth.limit) || 5;
    } else if (kind === 'json') {
      body.publication = JSON.parse(truth.json);
    } else {
      throw new Error('Unknown ingest type.');
    }
  } catch (err) {
    truth.status = err.message || String(err);
    render();

    return;
  }

  truth.busy = true;
  truth.status = 'Ingesting grounded publications…';
  render();
  try {
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ingest failed');
    }
    const added = (data.results || []).reduce((sum, row) => sum + (row.facts_added || 0), 0);
    truth.status = 'Ingested ' + (data.results || []).length + ' publication(s) and added ' + added + ' grounded fact(s). Ungrounded claims were rejected.';
    await loadTruth(true);
  } catch (err) {
    truth.busy = false;
    truth.status = err.message || String(err);
    render();
  }
}

function vTruth() {
  const journalRows = truth.journals.map((j) => `<tr>
    <td>${esc(j.year || '')}</td>
    <td>${esc(j.title)}</td>
    <td>${esc(j.authors || '')}</td>
    <td>${j.pmid ? `<a href="${esc(j.url || ('https://pubmed.ncbi.nlm.nih.gov/' + j.pmid + '/'))}" target="_blank" rel="noreferrer">${esc(j.pmid)}</a>` : ''}</td>
    <td>${j.fact_count || 0}</td>
  </tr>`).join('') || '<tr><td colspan="5">No journals yet. Load the seed set or ingest a PubMed record.</td></tr>';

  const factRows = truth.facts.map((f) => `<tr>
    <td>${esc(f.claim)}</td>
    <td class="quote">${esc(f.quote)}</td>
    <td>${esc(f.topic || '')}</td>
    <td>${esc(cite(f))}</td>
  </tr>`).join('') || '<tr><td colspan="4">No grounded medical_data rows match this search.</td></tr>';

  return `<div class="pn studio">
    <div class="studio-head">
      <div>
        <h2>Ground Truth</h2>
        <p class="muted">The ingest agent writes only claims that quote their source. The model does not invent medical facts.</p>
      </div>
      <div class="row">
        <button class="btn pri" type="button" ${truth.busy ? 'disabled' : ''} onclick="ingestTruth('seed')">Load seed publications</button>
      </div>
    </div>
    <div class="truth-meta">
      <span class="chip mode">${truth.counts.journals} journals</span>
      <span class="chip mode">${truth.counts.medical_data} medical_data rows</span>
      ${(truth.nih && truth.nih.workers || []).map((w) => {
        const c = w.checkpoint;
        if (!c) {
          return `<span class="chip mode">shard ${w.shard} idle · ${esc(w.file)}</span>`;
        }

        return `<span class="chip mode">shard ${w.shard} ${esc(c.status || '')} · ${esc(c.current_illness || 'idle')} · ${esc(String((c.done || []).length))} done</span>`;
      }).join('') || '<span class="chip mode">NIH catalog ready · run npm run ingest:nih</span>'}
    </div>
    ${truth.status ? `<p class="${/fail|error|not running|Enter |Invalid|Unknown/i.test(truth.status) ? 'err' : 'ok'}">${esc(truth.status)}</p>` : ''}
    <div class="fields truth-actions">
      <div><label>PubMed ID</label>
        <div class="row">
          <input value="${esc(truth.pmid)}" placeholder="11942998" oninput="truth.pmid=this.value">
          <button class="btn" type="button" ${truth.busy ? 'disabled' : ''} onclick="ingestTruth('pmid')">Ingest PMID</button>
        </div>
      </div>
      <div><label>PubMed search</label>
        <div class="row">
          <input value="${esc(truth.query)}" placeholder="metformin adherence type 2 diabetes" oninput="truth.query=this.value">
          <input type="number" min="1" max="20" value="${esc(truth.limit)}" style="max-width:90px" oninput="truth.limit=this.value" title="Limit">
          <button class="btn" type="button" ${truth.busy ? 'disabled' : ''} onclick="ingestTruth('query')">Ingest search</button>
        </div>
      </div>
    </div>
    <div class="stack"><label>Paste a publication JSON object</label>
      <textarea rows="4" placeholder='{"title":"...","abstract":"...","facts":[{"claim":"...","quote":"..."}]}' oninput="truth.json=this.value">${esc(truth.json)}</textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn" type="button" ${truth.busy ? 'disabled' : ''} onclick="ingestTruth('json')">Ingest JSON</button>
      </div>
    </div>
    <div class="row" style="margin:16px 0 8px">
      <input value="${esc(truth.q)}" placeholder="Search grounded facts" oninput="truth.q=this.value" onkeydown="if(event.key==='Enter')loadTruth()">
      <button class="btn" type="button" onclick="loadTruth()">Search</button>
    </div>
    <h3>journals</h3>
    <div class="sc"><table>
      <tr><th>Year</th><th>Title</th><th>Authors</th><th>PMID</th><th>Facts</th></tr>
      ${journalRows}
    </table></div>
    <h3>medical_data</h3>
    <div class="sc"><table>
      <tr><th>Claim</th><th>Source quote</th><th>Topic</th><th>Citation</th></tr>
      ${factRows}
    </table></div>
  </div>`;
}

function render(keep) {
  const nav = $('#nav');
  if (nav) {
    nav.innerHTML = [
      ['studio', 'Patient Studio'],
      ['enc', 'Encounter'],
      ['team', 'Team'],
      ['rep', 'Assessment'],
      ['truth', 'Ground Truth']
    ].map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" type="button" onclick="goTab('${k}')">${v}</button>`).join('');
  }

  const themeBtn = $('#themeBtn');
  if (themeBtn) {
    themeBtn.textContent = themeLabel();
  }

  const mode = $('#mode');
  if (mode) {
    mode.textContent = tab === 'enc' ? 'Reviewed reply · approved facts only' : 'Local demo · no API keys';
  }

  if (keep && tab === 'enc') {
    renderTr();
    renderEhr();

    return;
  }

  const views = { studio: vStudio, enc: vEnc, team: vTeam, rep: vRep, truth: vTruth };
  $('#app').innerHTML = (views[tab] || vStudio)();
  if (tab === 'enc' && enc) {
    renderTr();
    renderEhr();
    if (window.__busy) {
      av('speaking', 'neutral');
    } else if (window.__convo !== false) {
      startListen();
    } else {
      av('listening', 'neutral');
    }
  }
}

applyTheme();
bootStorage();
render();
if (tab === 'truth') {
  loadTruth();
}
