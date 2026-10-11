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
test('team handoff and plan survive a later server turn',async()=>{
  const b=await browser(); await b.run("launch('denise',1)"); await b.run("ask('What brings you in today?')"); await b.run("encounterAction('plan','Ask about adherence')"); await b.run("encounterAction('handoff','thirst fatigue')"); await b.run("ask('Do you smoke?')"); assert.equal(b.run('enc.plan.length'),1); assert.equal(b.run('enc.ho.tot'),1);
});
test('typing remains available when microphone and speech APIs are absent',async()=>{const b=await browser(); await b.run("launch('denise',1)"); assert.match(b.run('vEnc()'),/id="typeRow"\s*>/); assert.equal(b.run('window.__convo'),false); assert.match(b.run('vEnc()'),/img\/patient.svg/);});
