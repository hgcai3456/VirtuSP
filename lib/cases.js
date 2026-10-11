(function () {
const F = (id, label, k, o) => Object.assign({id, label, k, type: 'reported', src: 'Approved case', role: 'Patient', vis: 'ask', kw: [], ehr: 'hx', gate: 0}, o);
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


if (typeof module !== 'undefined') module.exports = { SEED, templateGeneral };
else window.VirtuSPCases = { SEED, templateGeneral };
}());
