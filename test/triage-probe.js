const { triage } = require('../lib/triage');
const db = { prepare() { return { all() { return []; }, get() { return { n: 0 }; } }; } };
const samples = [
  'anaphylaxis',
  'throat closing',
  'tearing chest pain',
  'worst headache of my life',
  'overdose',
  'heat stroke',
  'cant urinate and back pain',
  'stiff neck with fever and headache',
  'vomiting blood',
  'collapsed lung',
  'fever cough and shortness of breath',
  'orthopnea and headache',
  'orthopnea and thunderclap headache',
  'crushing chest pain',
  'gestational diabetes',
  'iron-deficiency anemia'
];
samples.forEach((complaint) => {
  const out = triage(db, { complaint, age: '45', sex: 'F', pregnant: complaint.includes('gestational') });
  console.log(
    complaint,
    out.confidence,
    out.acuity.level,
    out.differential.slice(0, 3).map((row) => row.name + ':' + row.score + ':' + row.acuity).join(' | '),
    'q=' + out.questions.length,
    out.assessment.includes('stays on the list') ? 'STAYS' : '',
    out.assessment.includes('988') ? 'CRISIS' : ''
  );
});
