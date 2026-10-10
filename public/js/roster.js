(function () {
  const F = (id, label, k, o) => Object.assign({
    id, label, k, type: 'reported', src: 'Approved case', role: 'Patient', vis: 'ask', kw: [], ehr: 'hx', gate: 0
  }, o);

  window.ROSTER = [{
    id: 'nisha',
    name: 'Nisha Patel',
    age: 29,
    photo: 'img/nisha.jpg',
    photoPos: 'center 18%',
    video: 'video/nisha.mp4',
    voice: 'female',
    intro: "Hi, I'm Nisha.",
    personality: 'Anxious, wants to seem like she follows the plan',
    emotion: 'Worried about the hospital stay and about money',
    style: 'Arms crossed, short answers until someone is kind',
    complaint: 'Could not catch her breath overnight',
    history: 'Asthma since college, works rotating clinic shifts',
    diagnosis: 'Asthma exacerbation',
    medications: 'Fluticasone inhaler daily, albuterol as needed',
    allergies: 'Penicillin, rash',
    labs: 'Peak flow | 210 | L/min | >400\nSpO2 | 93 | % | 95-100',
    patientSays: 'I use my purple inhaler every day, like I\'m supposed to.',
    chartSays: 'Pharmacy: no fluticasone fill for 4 months',
    objText: 'Elicit why the controller inhaler lapsed\nReview peak flow and oxygen\nReconcile the fill-history discrepancy',
    hints: [
      'What brings you in today?',
      'Tell me about your purple inhaler.',
      'I am sorry this has been hard. What gets in the way of paying?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "I couldn't catch my breath last night. They admitted me for my asthma." },
      { w: 'Student', t: 'Tell me about your purple inhaler.' },
      { w: 'Patient', t: "I use my purple inhaler every day, like I'm supposed to." },
      { w: 'Chart', t: 'Pharmacy: no fluticasone fill for 4 months. Peak flow 210.' },
      { w: 'Student', t: 'I am sorry this has been hard. What gets in the way of paying?' },
      { w: 'Patient', t: 'I use it. Like I said.' },
      { w: 'Student', t: 'Thank you for saying that. What gets in the way of paying?' },
      { w: 'Patient', t: "...Okay. I haven't picked it up in months. It makes me cough, and I can't afford it until payday." }
    ],
    facts: [
      F('np1', 'Chief complaint: breathless overnight, admitted for asthma', 'breathless', { kw: ['bring', 'asthma', 'admitted'], say: "I couldn't catch my breath last night. They admitted me for my asthma." }),
      F('np2', 'Controller inhaler: patient says she uses the purple inhaler daily', 'inhaler', { kw: ['inhaler', 'purple', 'fluticasone'], ehr: 'meds', say: "I use my purple inhaler every day, like I'm supposed to." }),
      F('np3', 'Has not filled fluticasone in months (cough, cost until payday)', 'payday', { kw: ['paying', 'payday', 'afford'], ehr: 'meds', gate: 1, deflect: 'I use it. Like I said.', say: "...Okay. I haven't picked it up in months. It makes me cough, and I can't afford it until payday." }),
      F('np4', 'Allergy: penicillin (rash)', 'penicillin', { kw: ['penicillin', 'allerg'], allergyDrug: 'penicillin', say: 'Penicillin gave me a rash as a teenager.' }),
      F('np5', 'Peak flow 210 L/min (ref >400), arrival', 'peak', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Respiratory therapy', src: 'RT-1008', ehr: 'labs', lab: true, unit: 'L/min', ref: '>400', kw: ['peak', 'flow', 'lab'] }),
      F('np6', 'SpO2 93% on room air at arrival (ref 95-100)', 'spo2', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-1008', ehr: 'labs', lab: true, unit: '%', ref: '95-100', kw: ['oxygen', 'saturation', 'lab'] }),
      F('np7', 'Pharmacy: no fluticasone fill for 4 months', 'fill', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Pharmacist', src: 'Fill HX-1008', ehr: 'notes', kw: ['pharmacy', 'fill', 'chart'] }),
      F('np8', 'Chart list: fluticasone 110 mcg 2 puffs BID, albuterol PRN', '110', { vis: 'chart', sec: 'meds', type: 'documented', role: 'Hospitalist', src: 'Med list ML-N', ehr: 'meds' })
    ],
    artifacts: [
      { id: 'np-lab', kind: 'lab', title: 'Respiratory check RT-1008', date: '2026-10-08', src: 'RT-1008', sec: 'labs', unlock: ['lab', 'peak', 'flow', 'oxygen', 'saturation'], facts: ['np5', 'np6'], rows: [{ name: 'Peak flow', value: '210', unit: 'L/min', ref: '>400', flag: 'low' }, { name: 'SpO2', value: '93', unit: '%', ref: '95-100', flag: 'low' }] }
    ],
    obj: [
      { id: 'no1', t: 'Elicit the inhaler barrier (critical)', w: 30, ty: 'fact', f: ['np3'], tip: 'Ask kindly what gets in the way of paying for the inhaler.' },
      { id: 'no2', t: 'Review peak flow and oxygen', w: 20, ty: 'review', s: ['labs'], tip: 'Open the respiratory check before you conclude.' },
      { id: 'no3', t: 'Reconcile daily use versus the fill gap', w: 30, ty: 'mm', tip: 'Compare what she says with the pharmacy note, then document it.' },
      { id: 'no4', t: 'Empathic, open-ended communication', w: 20, ty: 'emp', tip: 'Acknowledge how hard the stay has been.' }
    ],
    mm: { a: 'np2', b: 'np7', fu: 'np3', kw: ['fill', 'gap', 'month', 'inhaler', 'not using', 'discrep', 'adherence'] }
  }, {
    id: 'yvette',
    name: 'Yvette Armstrong',
    age: 74,
    photo: 'img/yvette.jpg',
    photoPos: 'center 28%',
    video: 'video/yvette.mp4',
    voice: 'female',
    rate: -1,
    intro: "Hello, I'm Yvette.",
    personality: 'Polite, does not want to be a burden',
    emotion: 'Embarrassed about the swelling and about living alone',
    style: 'Soft voice, agrees first, then tells the truth',
    complaint: 'Swollen ankles and getting winded on the way to the mailbox',
    history: 'Heart failure, lives alone, limited trips to the store',
    diagnosis: 'Heart failure, volume overload',
    medications: 'Furosemide 40 mg every morning',
    allergies: 'No known drug allergies',
    labs: 'BNP | 640 | pg/mL | <100\nWeight | 182 | lb | prior 174',
    patientSays: 'I take my water pill every morning.',
    chartSays: 'Five-week gap in furosemide fills. Weight up 8 lb.',
    objText: 'Elicit why the water pill is skipped\nReview weight and BNP\nReconcile the refill discrepancy',
    hints: [
      'What brings you in today?',
      'How do you take your water pill?',
      'I am sorry the swelling has been hard. What gets in the way of the bathroom?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: 'My ankles are swollen and I get winded walking to the mailbox.' },
      { w: 'Student', t: 'How do you take your water pill?' },
      { w: 'Patient', t: 'I take my water pill every morning.' },
      { w: 'Chart', t: 'Five-week gap in furosemide. Weight up 8 pounds. BNP 640.' },
      { w: 'Student', t: 'I am sorry the swelling has been hard. What gets in the way of the bathroom?' },
      { w: 'Patient', t: 'I take it every morning. Like I said.' },
      { w: 'Student', t: 'Thank you for telling me. What gets in the way of the bathroom?' },
      { w: 'Patient', t: 'I skip it when I have to leave the house. It sends me to the bathroom, and I live alone.' }
    ],
    facts: [
      F('ya1', 'Chief complaint: swollen ankles and winded at the mailbox', 'mailbox', { kw: ['bring', 'mailbox', 'swollen', 'ankles'], say: 'My ankles are swollen and I get winded walking to the mailbox.' }),
      F('ya2', 'Furosemide: patient says she takes the water pill every morning', 'furosemide', { kw: ['water', 'furosemide', 'lasix'], ehr: 'meds', say: 'I take my water pill every morning.' }),
      F('ya3', 'Skips furosemide when she must leave the house (bathroom, lives alone)', 'bathroom', { kw: ['bathroom', 'alone'], ehr: 'meds', gate: 1, deflect: 'I take it every morning. Like I said.', say: 'I skip it when I have to leave the house. It sends me to the bathroom, and I live alone.' }),
      F('ya4', 'Meals: mostly frozen dinners, grocery trips are difficult', 'frozen', { kw: ['frozen', 'grocery', 'salty'], ehr: 'soc', say: 'I eat frozen dinners. The grocery store is a long way for me.' }),
      F('ya5', 'BNP 640 pg/mL (ref <100), 2026-10-02', 'bnp', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Lab', src: 'Lab LB-1002', ehr: 'labs', lab: true, unit: 'pg/mL', ref: '<100', kw: ['bnp', 'lab', 'result'] }),
      F('ya6', 'Weight 182 lb, prior 174 lb eight weeks ago', 'weight', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-1002', ehr: 'labs', lab: true, unit: 'lb', ref: 'prior 174', kw: ['weight', 'pounds', 'lab'] }),
      F('ya7', 'Pharmacy: 5-week gap in furosemide fills', 'gap', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Pharmacist', src: 'Fill HX-1002', ehr: 'notes', kw: ['pharmacy', 'fill', 'chart'] }),
      F('ya8', 'Chart list: furosemide 40 mg PO every morning', '40mg', { vis: 'chart', sec: 'meds', type: 'documented', role: 'Cardiologist', src: 'Med list ML-Y', ehr: 'meds' })
    ],
    artifacts: [
      { id: 'ya-lab', kind: 'lab', title: 'Heart failure panel LB-1002', date: '2026-10-02', src: 'Lab LB-1002', sec: 'labs', unlock: ['lab', 'bnp', 'weight', 'result', 'pounds'], facts: ['ya5', 'ya6'], rows: [{ name: 'BNP', value: '640', unit: 'pg/mL', ref: '<100', flag: 'high' }, { name: 'Weight', value: '182', unit: 'lb', ref: 'prior 174', flag: 'high' }] }
    ],
    obj: [
      { id: 'yo1', t: 'Elicit why the water pill is skipped (critical)', w: 30, ty: 'fact', f: ['ya3'], tip: 'Ask what gets in the way, including the bathroom and leaving the house.' },
      { id: 'yo2', t: 'Review weight and BNP', w: 25, ty: 'review', s: ['labs'], tip: 'Open the lab panel before you conclude.' },
      { id: 'yo3', t: 'Reconcile morning use versus the fill gap', w: 25, ty: 'mm', tip: 'Compare her report with the pharmacy note and document it.' },
      { id: 'yo4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Acknowledge the swelling and that she lives alone.' }
    ],
    mm: { a: 'ya2', b: 'ya7', fu: 'ya3', kw: ['fill', 'gap', 'skip', 'water', 'discrep', 'not taking', 'adherence'] }
  }, {
    id: 'mramirez',
    name: 'Marcus Ramirez',
    age: 48,
    photo: 'img/mramirez.jpg',
    photoPos: 'center 24%',
    video: 'video/mramirez.mp4',
    voice: 'male',
    intro: "Hey. I'm Marcus.",
    personality: 'Tired, minimizes symptoms, proud of showing up for shifts',
    emotion: 'Guarded about missed pills and double shifts',
    style: 'Plain speech, then more direct once he is not judged',
    complaint: 'Headaches and a high blood pressure reading',
    history: 'Hypertension, warehouse night shifts',
    diagnosis: 'Hypertension, poorly controlled',
    medications: 'Lisinopril 20 mg daily',
    allergies: 'No known drug allergies',
    labs: 'BP | 162/98 | mmHg | <120/80',
    patientSays: 'I take my lisinopril every day.',
    chartSays: 'Blood pressure 162/98. Forty-day gap in lisinopril fills.',
    objText: 'Elicit the night-shift barrier\nReview the blood pressure\nReconcile daily use versus the refill gap',
    hints: [
      'What brings you in today?',
      'Tell me about your lisinopril.',
      'I am sorry this has been hard. What gets in the way of doubles?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "I've had headaches, and they said my blood pressure is up." },
      { w: 'Student', t: 'Tell me about your lisinopril.' },
      { w: 'Patient', t: 'I take my lisinopril every day.' },
      { w: 'Chart', t: 'Blood pressure 162 over 98. Forty-day lisinopril fill gap.' },
      { w: 'Student', t: 'I am sorry this has been hard. What gets in the way of doubles?' },
      { w: 'Patient', t: 'I take it every day. Like I said.' },
      { w: 'Student', t: 'Thank you for saying that. What gets in the way of doubles?' },
      { w: 'Patient', t: 'I work doubles on the night shift. I fall asleep and miss it, then I wait to refill.' }
    ],
    facts: [
      F('mr1', 'Chief complaint: headaches and high blood pressure', 'headaches', { kw: ['bring', 'headaches'], say: "I've had headaches, and they said my blood pressure is up." }),
      F('mr2', 'Lisinopril: patient says he takes it every day', 'lisinopril', { kw: ['lisinopril'], ehr: 'meds', say: 'I take my lisinopril every day.' }),
      F('mr3', 'Misses lisinopril on double night shifts, then delays the refill', 'doubles', { kw: ['doubles', 'nightshift'], ehr: 'meds', gate: 1, deflect: 'I take it every day. Like I said.', say: 'I work doubles on the night shift. I fall asleep and miss it, then I wait to refill.' }),
      F('mr4', 'BP 162/98 mmHg (ref <120/80), 2026-10-06', 'bp162', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-1006', ehr: 'labs', lab: true, unit: 'mmHg', ref: '<120/80', kw: ['reading', 'vital', 'lab'] }),
      F('mr5', 'Pharmacy: 40-day gap in lisinopril fills', 'gap40', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Pharmacist', src: 'Fill HX-1006', ehr: 'notes', kw: ['pharmacy', 'fill', 'chart'] }),
      F('mr6', 'Chart list: lisinopril 20 mg PO daily', '20mg', { vis: 'chart', sec: 'meds', type: 'documented', role: 'Primary care physician', src: 'Med list ML-R', ehr: 'meds' })
    ],
    artifacts: [
      { id: 'mr-lab', kind: 'lab', title: 'Vitals V-1006', date: '2026-10-06', src: 'Vitals V-1006', sec: 'labs', unlock: ['lab', 'reading', 'vital', 'result'], facts: ['mr4'], rows: [{ name: 'Blood pressure', value: '162/98', unit: 'mmHg', ref: '<120/80', flag: 'high' }] }
    ],
    obj: [
      { id: 'ro1', t: 'Elicit the double-shift barrier (critical)', w: 35, ty: 'fact', f: ['mr3'], tip: 'Ask about doubles and the night shift without blaming him.' },
      { id: 'ro2', t: 'Review the blood pressure', w: 25, ty: 'review', s: ['labs'], tip: 'Open vitals before you conclude.' },
      { id: 'ro3', t: 'Reconcile daily use versus the fill gap', w: 25, ty: 'mm', tip: 'Compare his report with the pharmacy note and document it.' },
      { id: 'ro4', t: 'Empathic communication', w: 15, ty: 'emp', tip: 'Acknowledge the headaches and the work hours.' }
    ],
    mm: { a: 'mr2', b: 'mr5', fu: 'mr3', kw: ['fill', 'gap', 'miss', 'lisinopril', 'discrep', 'not taking', 'adherence'] }
  }, {
    id: 'wyatt',
    name: 'Wyatt Nelson',
    age: 23,
    photo: 'img/wyatt.jpg',
    photoPos: 'center 20%',
    video: 'video/wyatt.mp4',
    voice: 'male',
    rate: 1,
    intro: "I'm Wyatt.",
    personality: 'Flat, embarrassed, plays symptoms down',
    emotion: 'Self-conscious about snoring and about a breathing machine',
    style: 'Few words until the question is specific and kind',
    complaint: 'Sleepy all day',
    history: 'Daytime sleepiness, roommate has noticed snoring',
    diagnosis: 'Obstructive sleep apnea',
    medications: 'None. CPAP discussed, not started.',
    allergies: 'No known drug allergies',
    labs: 'AHI | 32 | events/hour | <5',
    patientSays: "I rest fine. I don't snore.",
    chartSays: 'Sleep study AHI 32. Partner questionnaire: loud snoring and breathing pauses.',
    objText: 'Uncover the snoring and the pauses\nReview the sleep study\nReconcile his account with the study',
    hints: [
      'What brings you in today?',
      'Tell me about snoring.',
      'I am sorry this feels awkward. What gets in the way of a machine?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "I'm sleepy all day. I guess I just need more rest." },
      { w: 'Student', t: 'Tell me about snoring.' },
      { w: 'Patient', t: "I rest fine. I don't snore." },
      { w: 'Chart', t: 'Sleep study AHI 32. Roommate reports snoring and pauses.' },
      { w: 'Student', t: 'I am sorry this feels awkward. What gets in the way of a machine?' },
      { w: 'Patient', t: "I don't snore. I'm fine." },
      { w: 'Student', t: 'Thank you for sticking with this. What gets in the way of a machine?' },
      { w: 'Patient', t: "...My roommate says I snore and stop breathing. I didn't want a machine." }
    ],
    facts: [
      F('wn1', 'Chief complaint: sleepy all day', 'sleepy', { kw: ['bring', 'sleepy'], say: "I'm sleepy all day. I guess I just need more rest." }),
      F('wn2', 'Snoring: patient denies snoring', 'snoring', { kw: ['snoring', 'snore'], ehr: 'soc', say: "I rest fine. I don't snore." }),
      F('wn3', 'Roommate reports snoring and pauses; he does not want CPAP', 'machine', { kw: ['machine', 'cpap'], ehr: 'soc', gate: 1, deflect: "I don't snore. I'm fine.", say: "...My roommate says I snore and stop breathing. I didn't want a machine." }),
      F('wn4', 'AHI 32 events/hour (ref <5), study 2026-09-18', 'ahi', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Sleep lab', src: 'PSG-0918', ehr: 'labs', lab: true, unit: 'events/hour', ref: '<5', kw: ['ahi', 'study', 'lab'] }),
      F('wn5', 'Partner questionnaire: loud snoring and witnessed pauses', 'pauses', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Sleep physician', src: 'Note N-0918', ehr: 'notes', kw: ['note', 'chart', 'roommate'] })
    ],
    artifacts: [
      { id: 'wn-lab', kind: 'lab', title: 'Sleep study PSG-0918', date: '2026-09-18', src: 'PSG-0918', sec: 'labs', unlock: ['lab', 'ahi', 'study', 'result'], facts: ['wn4'], rows: [{ name: 'AHI', value: '32', unit: 'events/hour', ref: '<5', flag: 'high' }] }
    ],
    obj: [
      { id: 'wo1', t: 'Uncover snoring, pauses, and the CPAP worry (critical)', w: 35, ty: 'fact', f: ['wn3'], tip: 'Ask about a breathing machine without teasing him.' },
      { id: 'wo2', t: 'Review the sleep study', w: 25, ty: 'review', s: ['labs'], tip: 'Open the study before you conclude.' },
      { id: 'wo3', t: 'Reconcile "I don\'t snore" with the study', w: 25, ty: 'mm', tip: 'Compare his words with the note and document it.' },
      { id: 'wo4', t: 'Empathic communication', w: 15, ty: 'emp', tip: 'Acknowledge that this feels awkward.' }
    ],
    mm: { a: 'wn2', b: 'wn5', fu: 'wn3', kw: ['snore', 'study', 'pause', 'machine', 'discrep'] }
  }, {
    id: 'dominic',
    name: 'Dominic Rivera',
    age: 27,
    photo: 'img/dominic.jpg',
    photoPos: 'center 16%',
    video: 'video/dominic.mp4',
    voice: 'male',
    intro: "I'm Dominic.",
    personality: 'Guarded, stoic, expects not to be believed',
    emotion: 'In pain and wary of being dismissed',
    style: 'Few words, minimizes until pain is taken seriously',
    complaint: 'Chest and leg pain from a sickle cell crisis',
    history: 'Sickle cell disease, several admissions this year',
    diagnosis: 'Sickle cell pain crisis',
    medications: 'Hydroxyurea, not filled for 3 months',
    allergies: 'Morphine, itching',
    labs: 'Pain score | 9 | /10 | arrival\nHemoglobin | 8.1 | g/dL | 13.5-17.5',
    patientSays: "It's not that bad. This almost never happens.",
    chartSays: 'Arrival pain 9/10. Fifth admission this year. Hydroxyurea unfilled for 3 months.',
    objText: 'Believe the pain and elicit the hydroxyurea barrier\nReview the arrival pain score and hemoglobin\nReconcile "this never happens" with the admission history',
    hints: [
      'What brings you in today?',
      'Is the pain mild?',
      'I am sorry you are hurting. What gets in the way of hydroxyurea?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "My chest and legs hurt. It's a sickle cell pain crisis." },
      { w: 'Student', t: 'Is the pain mild?' },
      { w: 'Patient', t: "It's not that bad. This almost never happens." },
      { w: 'Chart', t: 'Arrival pain 9 out of 10. Fifth admission this year.' },
      { w: 'Student', t: 'I am sorry you are hurting. What gets in the way of hydroxyurea?' },
      { w: 'Patient', t: "It's not that bad." },
      { w: 'Student', t: 'I believe you are in pain. What gets in the way of hydroxyurea?' },
      { w: 'Patient', t: '...It is severe. I stopped the hydroxyurea. It upset my stomach, and the copay piled up.' }
    ],
    facts: [
      F('dr1', 'Chief complaint: chest and leg pain, sickle cell crisis', 'sickle', { kw: ['bring', 'sickle', 'crisis'], say: "My chest and legs hurt. It's a sickle cell pain crisis." }),
      F('dr2', 'Pain: patient says it is not that bad and almost never happens', 'mild', { kw: ['mild'], ehr: 'hx', say: "It's not that bad. This almost never happens." }),
      F('dr3', 'Stopped hydroxyurea (stomach upset and copay); pain is severe', 'hydroxyurea', { kw: ['hydroxyurea', 'copay'], ehr: 'meds', gate: 1, deflect: "It's not that bad.", say: '...It is severe. I stopped the hydroxyurea. It upset my stomach, and the copay piled up.' }),
      F('dr4', 'Allergy: morphine (itching)', 'morphine', { kw: ['morphine', 'itching', 'allerg'], allergyDrug: 'morphine', say: 'Morphine makes me itch all over.' }),
      F('dr5', 'Arrival pain score 9/10', 'pain9', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Triage T-1009', ehr: 'labs', lab: true, unit: '/10', ref: '0-10 scale', kw: ['score', 'triage', 'lab'] }),
      F('dr6', 'Hemoglobin 8.1 g/dL (ref 13.5-17.5), 2026-10-09', 'hgb', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Lab', src: 'Lab LB-1009', ehr: 'labs', lab: true, unit: 'g/dL', ref: '13.5-17.5', kw: ['hemoglobin', 'lab', 'result'] }),
      F('dr7', 'Fifth admission this year. Hydroxyurea unfilled for 3 months.', 'fifth', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Hospitalist', src: 'Note N-1009', ehr: 'notes', kw: ['admission', 'chart', 'note'] })
    ],
    artifacts: [
      { id: 'dr-lab', kind: 'lab', title: 'Admission labs LB-1009', date: '2026-10-09', src: 'Lab LB-1009', sec: 'labs', unlock: ['lab', 'hemoglobin', 'score', 'triage', 'result'], facts: ['dr5', 'dr6'], rows: [{ name: 'Pain score', value: '9', unit: '/10', ref: '0-10 scale', flag: 'high' }, { name: 'Hemoglobin', value: '8.1', unit: 'g/dL', ref: '13.5-17.5', flag: 'low' }] }
    ],
    obj: [
      { id: 'do1', t: 'Elicit the hydroxyurea barrier and the severe pain (critical)', w: 35, ty: 'fact', f: ['dr3'], tip: 'Believe the pain, then ask what gets in the way of hydroxyurea.' },
      { id: 'do2', t: 'Review pain score and hemoglobin', w: 20, ty: 'review', s: ['labs'], tip: 'Open the admission labs before you conclude.' },
      { id: 'do3', t: 'Reconcile "this never happens" with the admission note', w: 25, ty: 'mm', tip: 'Compare his words with the note and document it.' },
      { id: 'do4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Say that you believe he is in pain.' }
    ],
    mm: { a: 'dr2', b: 'dr7', fu: 'dr3', kw: ['admission', 'never', 'severe', 'hydroxyurea', 'discrep'] }
  }, {
    id: 'walter',
    name: 'Walter Greene',
    age: 79,
    photo: 'img/walter.jpg',
    photoPos: 'center 22%',
    video: 'video/walter.mp4',
    voice: 'male',
    rate: -2,
    intro: "Morning. Walter Greene.",
    personality: 'Warm, proud of staying independent',
    emotion: 'Dislikes looking frail',
    style: 'Smiles, jokes, then admits the stumbles if asked directly',
    complaint: 'Recovering after a hip fracture',
    history: 'Hip fracture repair, rehab, two near-falls this week',
    diagnosis: 'Hip fracture, fall risk',
    medications: 'Acetaminophen for pain, home blood pressure pill',
    allergies: 'No known drug allergies',
    labs: 'Orthostatic systolic drop | 22 | mmHg | <20 concerning',
    patientSays: "I walk to the bathroom by myself. I don't need that walker.",
    chartSays: 'Physical therapy: two near-falls this week. Walker recommended at all times.',
    objText: 'Elicit the near-falls and the wish not to look frail\nReview the orthostatic blood pressure\nReconcile "I walk fine" with the therapy note',
    hints: [
      'What brings you in today?',
      'How do you get to the bathroom?',
      'I am sorry this has been hard. What gets in the way after you stumbled?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "I broke my hip. I'm doing fine now, though." },
      { w: 'Student', t: 'How do you get to the bathroom?' },
      { w: 'Patient', t: "I walk to the bathroom by myself. I don't need that walker." },
      { w: 'Chart', t: 'Therapy note: two near-falls this week. Walker at all times.' },
      { w: 'Student', t: 'I am sorry this has been hard. What gets in the way after you stumbled?' },
      { w: 'Patient', t: "I don't need that walker." },
      { w: 'Student', t: 'Thank you for telling me. What gets in the way after you stumbled?' },
      { w: 'Patient', t: "Alright... I did stumble twice. I just don't like looking frail." }
    ],
    facts: [
      F('wg1', 'Chief complaint: hip fracture, says he is doing fine', 'hip', { kw: ['bring', 'hip'], say: "I broke my hip. I'm doing fine now, though." }),
      F('wg2', 'Mobility: walks to the bathroom alone and declines the walker', 'bathroom', { kw: ['bathroom', 'walker'], ehr: 'hx', say: "I walk to the bathroom by myself. I don't need that walker." }),
      F('wg3', 'Two stumbles this week; does not want to look frail', 'stumbled', { kw: ['stumbled', 'frail'], ehr: 'hx', gate: 1, deflect: "I don't need that walker.", say: "Alright... I did stumble twice. I just don't like looking frail." }),
      F('wg4', 'Orthostatic systolic drop 22 mmHg (concerning if ≥20), 2026-10-07', 'ortho', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-1007', ehr: 'labs', lab: true, unit: 'mmHg', ref: '<20', kw: ['orthostatic', 'lab', 'vital'] }),
      F('wg5', 'PT note: two near-falls this week, walker at all times', 'therapy', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Physical therapy', src: 'PT-1007', ehr: 'notes', kw: ['therapy', 'chart', 'note'] })
    ],
    artifacts: [
      { id: 'wg-lab', kind: 'lab', title: 'Orthostatic vitals V-1007', date: '2026-10-07', src: 'Vitals V-1007', sec: 'labs', unlock: ['lab', 'orthostatic', 'vital', 'result'], facts: ['wg4'], rows: [{ name: 'Systolic drop on standing', value: '22', unit: 'mmHg', ref: '<20', flag: 'high' }] }
    ],
    obj: [
      { id: 'go1', t: 'Elicit the stumbles and the fear of looking frail (critical)', w: 35, ty: 'fact', f: ['wg3'], tip: 'Ask about the stumble without talking down to him.' },
      { id: 'go2', t: 'Review orthostatic vitals', w: 20, ty: 'review', s: ['labs'], tip: 'Open vitals before you conclude.' },
      { id: 'go3', t: 'Reconcile independent walking with the therapy note', w: 25, ty: 'mm', tip: 'Compare his report with the therapy note and document it.' },
      { id: 'go4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Acknowledge the hip and his wish to stay independent.' }
    ],
    mm: { a: 'wg2', b: 'wg5', fu: 'wg3', kw: ['walker', 'stumble', 'fall', 'therapy', 'discrep'] }
  }, {
    id: 'vadko',
    name: 'Vadko Bareche',
    age: 31,
    photo: 'img/vadko.jpg',
    photoPos: 'center 26%',
    video: 'video/vadko.mp4',
    voice: 'male',
    intro: "Hi, I'm Vadko.",
    personality: 'Easygoing, calls the headaches stress',
    emotion: 'Unconcerned on the surface, worn down by daily pain',
    style: 'Light tone, understates medicine use until asked for a count',
    complaint: 'Headaches he attributes to stress',
    history: 'Daily headaches for six weeks, one emergency visit',
    diagnosis: 'Medication-overuse headache',
    medications: 'Ibuprofen most days. Sumatriptan prescribed, never filled.',
    allergies: 'No known drug allergies',
    labs: 'Headache days | 26 | days/month | <15',
    patientSays: 'I barely take anything. Maybe an ibuprofen now and then.',
    chartSays: 'Three bottles of ibuprofen 800 mg in six weeks. Sumatriptan never filled.',
    objText: 'Elicit near-daily ibuprofen use\nReview the headache-day count\nReconcile "now and then" with the pharmacy record',
    hints: [
      'What brings you in today?',
      'Do you take ibuprofen?',
      'I am sorry the pain has been hard. What gets in the way on most days?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "Headaches. It's just stress from work." },
      { w: 'Student', t: 'Do you take ibuprofen?' },
      { w: 'Patient', t: 'I barely take anything. Maybe an ibuprofen now and then.' },
      { w: 'Chart', t: 'Three bottles of ibuprofen 800 mg in six weeks.' },
      { w: 'Student', t: 'I am sorry the pain has been hard. What gets in the way on most days?' },
      { w: 'Patient', t: 'Now and then. That is all.' },
      { w: 'Student', t: 'Thank you for sticking with this. What gets in the way on most days?' },
      { w: 'Patient', t: '...Most days, honestly. If I skip it the headache comes right back.' }
    ],
    facts: [
      F('vb1', 'Chief complaint: headaches he calls stress', 'stress', { kw: ['bring', 'stress'], say: "Headaches. It's just stress from work." }),
      F('vb2', 'Ibuprofen: patient says he takes it now and then', 'ibuprofen', { kw: ['ibuprofen'], ehr: 'meds', say: 'I barely take anything. Maybe an ibuprofen now and then.' }),
      F('vb3', 'Takes ibuprofen most days or the headache returns', 'mostdays', { kw: ['most days'], ehr: 'meds', gate: 1, deflect: 'Now and then. That is all.', say: '...Most days, honestly. If I skip it the headache comes right back.' }),
      F('vb4', 'Headache days 26 in the last month (ref <15)', 'headdays', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Neurology', src: 'Note N-0928', ehr: 'labs', lab: true, unit: 'days/month', ref: '<15', kw: ['diary', 'lab', 'result'] }),
      F('vb5', 'Pharmacy: 3 bottles of ibuprofen 800 mg in 6 weeks. Sumatriptan never filled.', 'bottles', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Pharmacist', src: 'Fill HX-0928', ehr: 'notes', kw: ['pharmacy', 'fill', 'chart'] })
    ],
    artifacts: [
      { id: 'vb-lab', kind: 'lab', title: 'Headache diary summary', date: '2026-09-28', src: 'Note N-0928', sec: 'labs', unlock: ['lab', 'diary', 'result'], facts: ['vb4'], rows: [{ name: 'Headache days', value: '26', unit: 'days/month', ref: '<15', flag: 'high' }] }
    ],
    obj: [
      { id: 'vo1', t: 'Elicit near-daily ibuprofen use (critical)', w: 35, ty: 'fact', f: ['vb3'], tip: 'Ask what happens on most days, without scolding.' },
      { id: 'vo2', t: 'Review the headache-day count', w: 20, ty: 'review', s: ['labs'], tip: 'Open the diary summary before you conclude.' },
      { id: 'vo3', t: 'Reconcile "now and then" with the pharmacy record', w: 25, ty: 'mm', tip: 'Compare his report with the fill note and document it.' },
      { id: 'vo4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Acknowledge how hard daily pain is.' }
    ],
    mm: { a: 'vb2', b: 'vb5', fu: 'vb3', kw: ['ibuprofen', 'bottle', 'most', 'discrep', 'fill'] }
  }, {
    id: 'omar',
    name: 'Omar Sinclair',
    age: 54,
    photo: 'img/omar.jpg',
    photoPos: 'center 18%',
    video: 'video/omar.mp4',
    voice: 'male',
    rate: -1,
    intro: "Omar Sinclair.",
    personality: 'Serious, protects his job, minimizes heart symptoms',
    emotion: 'Afraid a heart problem will go on his work record',
    style: 'Direct, then quieter once the job fear is named',
    complaint: 'Fatigue he calls stress from the night shift',
    history: 'Hypertension, exertional chest pressure at the plant',
    diagnosis: 'Exertional chest pressure, hypertension',
    medications: 'Lisinopril 10 mg daily, fills delayed',
    allergies: 'No known drug allergies',
    labs: 'BP | 168/96 | mmHg | <120/80',
    patientSays: "I don't get chest pain. I get winded because I'm out of shape.",
    chartSays: 'Cardiology note: chest pressure climbing one flight, eased by rest. BP 168/96.',
    objText: 'Elicit the exertional pressure and the job fear\nReview the blood pressure\nReconcile "no chest pain" with the cardiology note',
    hints: [
      'What brings you in today?',
      'Any chest pain when you climb stairs?',
      'I am sorry this has been hard on your record. What gets in the way of the record?'
    ],
    preview: [
      { w: 'Student', t: 'What brings you in today?' },
      { w: 'Patient', t: "I'm just worn out from the night shift. It's stress, not my heart." },
      { w: 'Student', t: 'Any chest pain when you climb stairs?' },
      { w: 'Patient', t: "I don't get chest pain. I get winded because I'm out of shape." },
      { w: 'Chart', t: 'Pressure climbing one flight, eased by rest. Blood pressure 168 over 96.' },
      { w: 'Student', t: 'I am sorry this has been hard on your record. What gets in the way of the record?' },
      { w: 'Patient', t: "I don't get chest pain." },
      { w: 'Student', t: 'Thank you for telling me. What gets in the way of the record?' },
      { w: 'Patient', t: "...There's a pressure when I climb the stairs at the plant. I sit and it eases. I didn't want this on my record." }
    ],
    facts: [
      F('os1', 'Chief complaint: worn out from the night shift, calls it stress', 'shift', { kw: ['bring', 'worn'], say: "I'm just worn out from the night shift. It's stress, not my heart." }),
      F('os2', 'Chest pain: patient denies it and says he is out of shape', 'stairs', { kw: ['stairs', 'winded'], ehr: 'hx', say: "I don't get chest pain. I get winded because I'm out of shape." }),
      F('os3', 'Exertional pressure at the plant, eased by rest; fears his work record', 'record', { kw: ['record', 'plant'], ehr: 'hx', gate: 1, deflect: "I don't get chest pain.", say: "...There's a pressure when I climb the stairs at the plant. I sit and it eases. I didn't want this on my record." }),
      F('os4', 'Lisinopril: patient says he takes it every day', 'lisinopril', { kw: ['lisinopril'], ehr: 'meds', say: 'I take my lisinopril every day.' }),
      F('os5', 'BP 168/96 mmHg (ref <120/80), 2026-10-05', 'bp168', { vis: 'chart', sec: 'labs', type: 'confirmed', role: 'Nurse', src: 'Vitals V-1005', ehr: 'labs', lab: true, unit: 'mmHg', ref: '<120/80', kw: ['reading', 'vital', 'lab'] }),
      F('os6', 'Cardiology note: pressure climbing one flight, relieved by rest', 'flight', { vis: 'chart', sec: 'notes', type: 'documented', role: 'Cardiologist', src: 'Note N-1005', ehr: 'notes', kw: ['cardiology', 'chart', 'note'] }),
      F('os7', 'ECG 10-05: sinus rhythm, nonspecific ST-T changes', 'ecg', { vis: 'chart', sec: 'img', type: 'confirmed', role: 'Cardiology', src: 'ECG-1005', ehr: 'img', artifact: 'ecg', kw: ['ecg', 'ekg', 'tracing'] })
    ],
    artifacts: [
      { id: 'os-lab', kind: 'lab', title: 'Vitals V-1005', date: '2026-10-05', src: 'Vitals V-1005', sec: 'labs', unlock: ['lab', 'reading', 'vital', 'result'], facts: ['os5'], rows: [{ name: 'Blood pressure', value: '168/96', unit: 'mmHg', ref: '<120/80', flag: 'high' }] }
    ],
    obj: [
      { id: 'oo1', t: 'Elicit exertional pressure and the work-record fear (critical)', w: 35, ty: 'fact', f: ['os3'], tip: 'Ask what he did not want on his record.' },
      { id: 'oo2', t: 'Review the blood pressure', w: 20, ty: 'review', s: ['labs'], tip: 'Open vitals before you conclude.' },
      { id: 'oo3', t: 'Reconcile "no chest pain" with the cardiology note', w: 25, ty: 'mm', tip: 'Compare his words with the note and document it.' },
      { id: 'oo4', t: 'Empathic communication', w: 20, ty: 'emp', tip: 'Acknowledge the worry about work.' }
    ],
    mm: { a: 'os2', b: 'os6', fu: 'os3', kw: ['chest', 'pressure', 'stairs', 'note', 'discrep'] }
  }];
})();
