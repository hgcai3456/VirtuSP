const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCloudStore}=require('../lib/cloud-store');
test('cloud publications use scoped keys, encryption and exact case payload', async()=>{
  let sent;
  const save=createCloudStore({bucket:'synthetic-test',client:{send:async command=>{sent=command.input;}}});
  const profile={id:'verification',version:2,facts:[{say:'Approved wording.'}]};
  const result=await save(profile);
  assert.equal(result.cloud,true);
  assert.equal(sent.Key,'virtusp/cleanup/published/verification/2.json');
  assert.equal(sent.ServerSideEncryption,'AES256');
  assert.deepEqual(JSON.parse(sent.Body),profile);
});
test('cloud failure is surfaced instead of reporting a successful save', async()=>{
  const save=createCloudStore({bucket:'synthetic-test',client:{send:async()=>{throw Error('AccessDenied');}}});
  await assert.rejects(save({id:'verification',version:1}),/AccessDenied/);
});
