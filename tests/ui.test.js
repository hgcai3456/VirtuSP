const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {createApi} = require('../lib/api');
async function browser() {
  const nodes = new Map(); const values = new Map(); const dispatch = createApi();
  const context = {crypto,console, Map,Set, setTimeout:()=>0,clearInterval:()=>{}, localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},document:{documentElement:{removeAttribute(){},setAttribute(){}},querySelector(selector){if (!nodes.has(selector)) nodes.set(selector,{innerHTML:'',textContent:'',value:'',classList:{toggle(){}},disabled:false}); return nodes.get(selector);}},fetch:async(path, options)=>{try{return {ok:true,json:async()=>dispatch(options.method,path,options.body ? JSON.parse(options.body):undefined)};}catch(e){return {ok:false,json:async()=>({error:e.message})};}}};
  context.window=context; vm.createContext(context);
  for(const file of ['lib/virtusp-core.js','lib/cases.js','public/js/app.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  await new Promise(setImmediate);
  return {run:code=>vm.runInContext(code,context),nodes,context};
}
test('faculty edits exact wording, publishes it to server, and launches frozen version', async()=>{
  const b=await browser(); b.run("setFact(0,'say','I have been thirsty for two weeks.');"); await b.run("publish('denise')"); assert.match(b.run('msg'),/Published Denise Carter v2/);
  await b.run("launch('denise',2)"); await b.run("ask('What brings you in today?')"); assert.equal(b.run('enc.tr.at(-1).t'),'I have been thirsty for two weeks.');
  b.run("setFact(0,'say','A later draft.');"); await b.run("ask('What brings you in today?')"); assert.equal(b.run('enc.tr.at(-1).t'),'I have been thirsty for two weeks.');
});
test('newly authored chief complaint answers the suggested opening question', async()=>{
  const b=await browser();
  b.run("newPatient(); setStudio('name','Synthetic opening regression'); setStudio('complaint','Mild headache for two days'); runValidate(); setFact(0,'say','I have had a mild headache for two days.');");
  await b.run('publish(sel)');
  await b.run('launch(sel,1)');
  await b.run("ask('What brings you in today?')");
  assert.equal(b.run('enc.tr.at(-1).t'),'I have had a mild headache for two days.');
  await b.run("encounterAction('handoff','Mild headache for two days');");
  assert.equal(b.run('enc.ho.inc'),1);
});
test('authored objectives credit their own evidence independent of order', async()=>{
  const b=await browser();
  b.run("newPatient(); setStudio('complaint','Synthetic headache'); setStudio('labs','Training marker | 7 | units | 4-10'); setStudio('patientSays','I take a training tablet once daily.'); setStudio('chartSays','Training tablet twice daily.'); setStudio('objText','Look for a chart discrepancy\\nGather the chief complaint\\nReview available labs'); runValidate();");
  assert.equal(b.run('currentProfile().obj[0].ty'),'mm');
  await b.run('publish(sel)'); await b.run('launch(sel,1)');
  await b.run("ask('What brings you in today?')");
  assert.equal(b.run('grade(enc.p.obj[1]).c'),1);
  assert.equal(b.run('grade(enc.p.obj[0]).c'),null);
  assert.equal(b.run('objectiveEvents(enc.p.obj[0]).length'),0);
  assert.equal(b.run('grade(enc.p.obj[2]).c'),0);
  await b.run("openSec('labs')");
  assert.equal(b.run('grade(enc.p.obj[2]).c'),0);
  await b.run("recordSectionReview('labs')");
  assert.equal(b.run('grade(enc.p.obj[2]).c'),1);
  await b.run("ask('What medications do you take?')"); await b.run("openSec('notes')");
  assert.equal(b.run('grade(enc.p.obj[0]).c'),0.5);
  assert.equal(b.run('objectiveEvents(enc.p.obj[0])[0].type'),'mismatch');
  await b.run("reconcile('Clarify the discrepancy between patient and chart.')");
  assert.equal(b.run('grade(enc.p.obj[0]).c'),1);
});
test('custom and unavailable objectives stay unassessed until faculty maps evidence', async()=>{
  const b=await browser();
  b.run("newPatient(); setStudio('complaint','Synthetic headache'); setStudio('objText','Review available labs\\nDiscuss training safety\\nGather the chief complaint'); runValidate();");
  assert.equal(b.run('currentProfile().obj[0].ty'),'manual');
  assert.equal(b.run('currentProfile().obj[1].ty'),'manual');
  await b.run('publish(sel)'); await b.run('launch(sel,1)'); await b.run("ask('What brings you in today?')");
  assert.equal(b.run('grade(enc.p.obj[0]).c'),null);
  assert.equal(b.run('grade(enc.p.obj[1]).c'),null);
  assert.equal(b.run('grade(enc.p.obj[2]).c'),1);
  await b.run("ask('That sounds difficult, I understand your concern.')");
  assert.equal(b.run('objectiveEvents(enc.p.obj[1]).length'),0);
  assert.match(b.run('vRep()'),/No faculty evidence mapping/);
});
test('feedback requires review and links to recorded evidence events', async()=>{
  const b=await browser(); await b.run("launch('denise',1)"); await b.run("openSec('labs')"); assert.equal(b.run('grade(enc.p.obj[2]).c'),0);
  await b.run("recordSectionReview('labs')"); assert.equal(b.run('grade(enc.p.obj[2]).c'),1);
  assert.match(b.run('vRep()'),/href="#event-\d+"/); assert.match(b.run('vRep()'),/does not measure clinical competence/); assert.equal(b.run('enc.reviewedArtifacts.size'),0);
});
test('failed question remains typed and its retry keeps the request ID', async()=>{
  const b=await browser(); await b.run("launch('denise',1)"); b.run("$('#q'); $('#sendBtn');"); const saved=b.context.fetch; b.context.fetch=async()=>{throw new Error('offline');}; b.nodes.get('#q').value='What brings you in today?';
  await b.run('sendQuestion()'); assert.equal(b.nodes.get('#q').value,'What brings you in today?'); const id=b.run('pendingRequest.id'); assert.equal(b.nodes.get('#sendBtn').disabled,false);
  b.context.fetch=saved; await b.run('sendQuestion()'); assert.equal(b.nodes.get('#q').value,''); assert.equal(b.run('enc.turns'),1); assert.ok(id);
});
test('HTML service outages preserve publication drafts and explain safe recovery', async()=>{
  const b=await browser(); b.run("newPatient(); setStudio('name','Synthetic outage regression'); setStudio('complaint','Synthetic headache'); runValidate();");
  const saved=b.context.fetch;
  b.context.fetch=async()=>({ok:false,status:503,json:async()=>{throw new SyntaxError('Unexpected token <');}});
  await b.run('publish(sel)');
  assert.match(b.run('msg'),/HTTP 503/);
  assert.match(b.run('msg'),/check for a saved version before retrying/);
  assert.doesNotMatch(b.run('msg'),/Unexpected token/);
  assert.equal(b.run('rel.some(r => r.p.id === sel)'),false);
  assert.match(b.run('drafts[sel]'),/Synthetic headache/);
  assert.equal(b.run('window.__publishing'),false);
  b.context.fetch=saved; await b.run('publish(sel)');
  assert.match(b.run('msg'),/Published Synthetic outage regression v1/);
});
test('team handoff and plan survive a later server turn',async()=>{
  const b=await browser(); await b.run("launch('denise',1)"); await b.run("ask('What brings you in today?')"); await b.run("encounterAction('plan','Ask about adherence')"); await b.run("encounterAction('handoff','thirst fatigue. R: Clarify adherence with faculty.')"); await b.run("ask('Do you smoke?')"); assert.equal(b.run('enc.plan.length'),1); assert.equal(b.run('enc.ho.tot'),1);
  assert.equal(b.run('enc.ho.text'),'thirst fatigue. R: Clarify adherence with faculty.');
  assert.match(b.run('vTeam()'),/R: Clarify adherence with faculty\./);
});
test('typing remains available when microphone and speech APIs are absent',async()=>{const b=await browser(); await b.run("launch('denise',1)"); assert.match(b.run('vEnc()'),/id="typeRow"\s*>/); assert.equal(b.run('window.__convo'),false); assert.match(b.run('vEnc()'),/img\/patient.svg/);});
