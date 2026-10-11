const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const F = (id, label, k, o) => Object.assign({
  id, label, k, type: 'reported', src: 'Approved case', role: 'Patient', vis: 'ask', kw: [], ehr: 'hx', gate: 0
}, o);

const CORE = window.VirtuSPCore;
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

const { SEED, templateGeneral } = window.VirtuSPCases;

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
    reviewedSections: [...(value.reviewedSections || new Set())],
    reviewedArtifacts: [...(value.reviewedArtifacts || new Set())],
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
    reviewedSections: new Set(value.reviewedSections || []),
    reviewedArtifacts: new Set(value.reviewedArtifacts || []),
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
    ensure('cc', p.complaint, 'cc', { say: p.complaint, kw: ['bring', 'why', 'here', 'concern', 'problem', 'symptom'] });
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

async function publish(id) {
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

  if (window.__publishing) return;
  window.__publishing = true;
  try { p = (await api('/api/cases', {profile: p})).profile; }
  catch (error) { msg = error.message; render(); return; }
  finally { window.__publishing = false; }
  rel.push({ p, at: now() });
  msg = `Published ${p.name} v${p.version} (immutable). Ready to launch.`;
  save();
  render();
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
  msg = `Copied a synthetic ${kind} template (includes example facts) for ${name}, ${age}. Review every fact against your description, then publish.`;
  save();
}

async function launch(pid, version) {
  if (window.__sending || window.__publishing) return;
  try {
    enc = loadEnc((await api('/api/encounters', {caseId: pid, version})).state);
    pendingRequest = null; tab = 'enc'; rt = 'ov'; window.__convo = false; window.__type = true;
    save(); render(); speak(enc.p.intro, 'neutral');
  } catch (error) { msg = error.message; render(); }
}

function log(type, text) {
  enc.ev.push({ n: enc.ev.length + 1, t: now(), role: enc.role, type, text });
}

let pendingRequest = null;
async function api(url, body) {
  const response = await fetch(url, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
async function ask(q, requestId) {
  if (!enc || !String(q).trim() || window.__sending) return;
  window.__sending = true;
  const payload = String(q).trim().replace(/\s+/g, ' ');
  const id = requestId || (pendingRequest && pendingRequest.payload === payload ? pendingRequest.id : crypto.randomUUID());
  pendingRequest = {id, payload};
  const send = $('#sendBtn');
  if (send) send.disabled = true;
  try {
    const result = await api('/api/encounters/' + enc.id + '/turns', {question: q, requestId: id});
    enc = loadEnc(result.state);
    pendingRequest = null;
    save(); render(true);
    if (!result.replayed) speak(result.reply, result.emotion);
    return true;
  } catch (error) { $('#mst').textContent = error.message + '. Retry the same question, or start a new visit if the server restarted.'; }
  finally { window.__sending = false; if (send) send.disabled = false; }
}

async function sendQuestion() {
  const input = $('#q');
  if (!input || window.__sending) return;
  const question = input.value;
  if (await ask(question)) { if (input.value === question) input.value = ''; }
}

function askHint(i) {
  const hints = (enc && enc.p && enc.p.hints) || [];
  if (hints[i]) {
    ask(hints[i]);
  }
}

async function encounterAction(action, value) {
  if (!enc || window.__sending) return;
  window.__sending = true;
  try { enc = loadEnc((await api('/api/encounters/' + enc.id + '/actions', {action, value})).state); save(); renderEhr(); }
  catch (error) { $('#mst').textContent = error.message; }
  finally { window.__sending = false; }
}
async function openSec(s) { rt = s; await encounterAction('open', s); }
async function recordSectionReview(s) { await encounterAction('reviewSection', s); }
async function reviewArtifact(id) { await encounterAction('reviewArtifact', id); }
async function reconcile(t) { await encounterAction('reconcile', t); }

let mouthTimer;
let recActive = null;
let speechSequence = 0;

function photoSet(p) {
  return { still: 'img/patient.svg' };
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
    const label = state === 'speaking' ? 'Speech requested · text ready' : state === 'listening' ? (recActive ? 'Microphone listening' : 'Ready for typed input') : state;
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
  const sequence = ++speechSequence;
  window.__busy = true;
  stopListen();
  av('speaking', em);
  const status = $('#mst');
  if (status) {
    status.textContent = 'The patient is talking…';
  }
  let finished = false;
  const done = () => {
    if(finished || sequence !== speechSequence) return; finished = true;
    window.__busy = false;
    if ($('#mst')) $('#mst').textContent = 'Response delivered as text. Browser speech is optional.';
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
      setTimeout(done, 15000);

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
    window.__convo = false;
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
  window.__type = true;
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
    const got = (o.f || []).filter((i) => disclosed.has(i));
    credit = got.length / Math.max((o.f || []).length, 1);
    got.forEach((i) => evidence.push(`${i}: "${disclosed.get(i).q}"`));
  } else if (o.ty === 'review') {
    const got = (o.s || []).filter((s) => enc.reviewedSections && enc.reviewedSections.has(s));
    credit = got.length / Math.max((o.s || []).length, 1);
    got.forEach((s) => evidence.push('Reviewed ' + s));
    if (!got.length) {
      evidence.push('No explicit section review recorded for the required evidence.');
    }
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
    credit = enc.ho.tot ? enc.ho.inc / enc.ho.tot : 0;
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
  const reviewed = enc.ev.some((e) => e.type === 'review') || (enc.reviewedSections && enc.reviewedSections.size > 0);
  if (reviewed) {
    score += 1;
    notes.push('Recorded an explicit review of chart evidence before drawing conclusions.');
  } else {
    notes.push('Next attempt: review a section explicitly before concluding what the chart says.');
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
  if (!confirm('Reset browser drafts and leave this visit? Server published versions remain saved.')) {
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
  return `<div class="card-edit">
    <h3>${esc(f.vis === 'ask' ? 'Patient report' : 'Chart evidence')} · ${esc(f.id)}</h3>
    <label>Finding / chart evidence</label><input value="${esc(f.label)}" oninput="setFact(${i},'label',this.value)">
    ${f.vis === 'ask' ? `<div class="stack"><label>Exact approved patient wording</label><textarea rows="2" oninput="setFact(${i},'say',this.value)">${esc(f.say || '')}</textarea></div>` : ''}
    <details><summary>Disclosure rules and source</summary>
      <div class="stack"><label>Keywords, comma separated</label><input value="${esc((f.kw || []).join(', '))}" oninput="setFact(${i},'kw',this.value)"></div>
      <div class="fields">
        <div><label>Visibility</label><select onchange="setFact(${i},'vis',this.value);render()"><option value="ask" ${f.vis === 'ask' ? 'selected' : ''}>Interview</option><option value="chart" ${f.vis === 'chart' ? 'selected' : ''}>Chart</option></select></div>
        <div><label>Source</label><input value="${esc(f.src || '')}" oninput="setFact(${i},'src',this.value)"></div>
        <div><label>Chart section</label><select onchange="setFact(${i},'sec',this.value);setFact(${i},'ehr',this.value)">${SEC.map(([s,name]) => `<option value="${s}" ${(f.sec || f.ehr) === s ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
        <div><label>Trust gate</label><input type="number" min="0" max="3" value="${esc(f.gate || 0)}" oninput="setFact(${i},'gate',this.value)"></div>
      </div>
      <div class="stack"><label>Approved deflection</label><input value="${esc(f.deflect || '')}" oninput="setFact(${i},'deflect',this.value)"></div>
      <button class="btn" type="button" onclick="removeFact(${i})">Remove fact</button>
    </details>
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
  if (!drafts[id]) { const published = [...rel].reverse().find(r => r.p.id === id); if (published) drafts[id] = JSON.stringify(published.p); }
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
        <p class="muted">Synthetic cases · edit Draft → Check → Publish a frozen version → Start visit.</p>
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
      ${p.facts.length ? `<details open><summary>Review approved facts and exact patient wording</summary><p class="muted">Draft edits below affect the next published version. Chart records remain separate from patient answers.</p>${p.facts.map(factCard).join('')}<button class="btn" type="button" onclick="addFact()">Add fact</button></details><details><summary>Faculty learning objectives and weights</summary>${p.obj.map(objCard).join('')}<button class="btn" type="button" onclick="addObjective()">Add objective</button></details>` : `      <div class="fields">
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
`}
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
      <div class="panel-kicker">Synthetic simulated patient · practice only</div>
      ${avatarHtml(enc.p)}
      <h2>${esc(enc.p.name)}, ${enc.p.age}</h2>
      <div class="av-status" id="avs">Ready for typed input</div>
      <button class="mic-btn" id="micBtn" type="button" onclick="mic()">Tap to talk</button>
      <div class="chip" id="mst">Speak, or type if you need to. The chart updates as you earn it.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" type="button" onclick="endConvo()">Pause</button>
        <button class="btn" type="button" onclick="toggleType()">Type instead</button>
      </div>
      <div class="row" id="typeRow" ${window.__type ? '' : 'hidden'}>
        <input id="q" aria-label="Ask the patient" placeholder="Type your question…" onkeydown="if(event.key==='Enter')sendQuestion()">
        <button id="sendBtn" class="btn pri" type="button" onclick="sendQuestion()">Send</button>
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
    const who = m.w === 'Student' ? 'student' : 'patient';

    return `<div class="bubble ${who}"><b>${esc(m.w)}${m.g ? ` <span class="chip">${esc(m.g === "fallback" ? "Unspecified — unknown" : m.g.startsWith("blocked:") ? "Authored deflection" : "Reviewed wording")}</span>` : ''}</b><p>${esc(m.t)}</p></div>`;
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
      <div class="chip">Locked · ask the configured question; section ${esc(art.sec || 'the chart')}</div>
    </div>`;
  }

  const meta = enc.arts.get(art.id);
  let body = '';
  if (art.kind === 'lab' && art.rows) {
    body = (art.facts || []).map(id => enc.p.facts.find(f => f.id === id)).filter(Boolean).map(f => `<p>${esc(f.label)}</p>`).join('');
  } else {
    body = '<p class="muted">Synthetic report findings shown below. Image pixels are not included in this demo.</p>';
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
  const sectionArts = (sec) => arts.filter((a) => a.sec === sec).map((art) => {
    const released = enc.arts.has(art.id);
    const reviewed = enc.reviewedArtifacts && enc.reviewedArtifacts.has(art.id);
    return `${artifactCard(art)}${released && !reviewed ? `<div class="row"><button class="btn" type="button" onclick="reviewArtifact('${art.id}')">Record review</button></div>` : ''}`;
  }).join('');
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
      <p class="chip">Locked findings are concealed in this teaching view. This supervised demo does not enforce student access control.</p>`;
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
    if (enc.opened.has(rt) && enc.p.facts.some((f) => f.sec === rt && enc.disc.has(f.id)) && !(enc.reviewedSections && enc.reviewedSections.has(rt))) {
      html += `<div class="row" style="margin-top:12px">
        <button class="btn" type="button" onclick="recordSectionReview('${rt}')">Record review of this section</button>
      </div>`;
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

async function addPlan() { const input = $('#cp'); if(input && input.value.trim()) {await encounterAction('plan',input.value); render();} }
async function changeRole(value) {await encounterAction('role',value); render();}

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

async function submitHO() {const box = $('#sb'); if(box) {await encounterAction('handoff',box.value); render();}}

function objectiveEvents(o) {
  return enc.ev.filter(e => o.ty === 'fact' ? e.type === 'disclose' && (o.f || []).some(id => e.text.startsWith(id + ' released')) : o.ty === 'review' ? e.type === 'review' && (o.s || []).some(s => e.text === 'Recorded review of ' + s) : o.ty === 'mm' ? ['mismatch','reconcile'].includes(e.type) : o.ty === 'ho' ? e.type === 'handoff' : e.type === 'empathy');
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
      <p>${g.E.map(esc).join('<br>') || 'No evidence yet.'}${objectiveEvents(o).map(e => `<a href="#event-${e.n}">Event #${e.n}</a>`).join(' · ')}</p>
      <p class="muted"><b>Next attempt:</b> ${esc(next)}</p>
    </div>`;
  }).join('');

  const pct = assessedWeight ? Math.round(earned / assessedWeight * 100) : 0;
  const askFacts = (enc.p.facts || []).filter((f) => f.vis === 'ask');
  const elicited = askFacts.filter((f) => enc.disc.has(f.id));
  const missed = askFacts.filter((f) => !enc.disc.has(f.id));
  const arts = enc.p.artifacts || [];
  const seenArts = arts.filter((a) => enc.reviewedArtifacts.has(a.id));
  const missedArts = arts.filter((a) => !enc.arts.has(a.id));
  const seq = interviewSequence();
  const prof = professionalism();

  return `<div class="pn">
    <h2>Explainable feedback</h2>
    <div class="score-hero">
      <div class="score-num">${pct}%</div>
      <div>
        <div>on assessed faculty objectives</div>
        <div class="chip">${assessedWeight} of ${enc.p.obj.reduce((sum, o) => sum + Number(o.w), 0)} weight · profile v${enc.p.version} · ${enc.turns} turns logged</div>
        <p class="muted">Rule-based objective completion for faculty review; this does not measure clinical competence. Review records an explicit learner acknowledgment, not demonstrated understanding.</p>
      </div>
    </div>
    <div class="fb-grid">
      <div class="obj-card">
        <h3>Findings elicited</h3>
        ${elicited.length ? elicited.map((f) => `<p>${esc(f.label)}</p>`).join('') : '<p class="muted">None yet.</p>'}
        <h3>Artifacts reviewed</h3>
        ${seenArts.length ? seenArts.map((a) => `<p>${esc(a.title)}</p>`).join('') : '<p class="muted">No explicit artifact reviews recorded.</p>'}
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
      ${enc.ev.map((e) => `<tr id="event-${e.n}"><td>${e.n}</td><td>${e.t}</td><td>${esc(e.role)}</td><td>${e.type}</td><td>${esc(e.text)}</td></tr>`).join('')}
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
      ['rep', 'Assessment']
    ].map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" type="button" onclick="goTab('${k}')">${v}</button>`).join('');
  }

  const themeBtn = $('#themeBtn');
  if (themeBtn) {
    themeBtn.textContent = themeLabel();
  }

  const mode = $('#mode');
  if (mode) {
    const build = window.__VIRTUSP_BUILD__ || {};
    mode.textContent = `Local reviewed wording · v${build.version || '?'} · ${build.buildId || '?'} · ${build.environment || 'local'}`;
  }

  if (keep && tab === 'enc') {
    renderTr();
    renderEhr();

    return;
  }

  const views = { studio: vStudio, enc: vEnc, team: vTeam, rep: vRep };
  $('#app').innerHTML = views[tab]();
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
enc = null;
tab = 'studio';
api('/api/cases').then(result => { rel = result.profiles.map(p => ({p, at: 'server'})); render(); }).catch(error => {msg = error.message; render();});
render();
