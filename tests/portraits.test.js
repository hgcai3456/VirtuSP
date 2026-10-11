"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs/promises"), os=require("node:os"), path=require("node:path");
const {createApp}=require("../lib/http");
const {cookieClient}=require("./http-client");
const {portraitFile}=require("../lib/portraits");
test("Authored portraits are distinct and unknown identities get a neutral avatar",async()=>{
  assert.equal(portraitFile({id:"fd184616-e709-41bb-bc90-bb1a36bca50e"}),"marlene.jpg");
  const faces=["jordan","daniel","meera","roberto"].map(n=>portraitFile({id:`lipids-${n}-demo`,presentationKey:"shared"}));
  assert.equal(new Set(faces).size,4);
  for(const f of faces)assert.ok((await fs.stat(path.join("public/img",f))).size>0);
  assert.equal(portraitFile({id:"unknown",name:"Yvette Armstrong",gender:"female",age:58}),"patient-avatar.svg");
});
test("Assigned and active encounters retain pinned portraits after draft edits and restrict image access",async()=>{
  process.env.AI_ENABLED="false";delete process.env.S3_BUCKET;delete process.env.ELEVENLABS_API_KEY;process.env.AWS_IMAGES_ENABLED="false";
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"virtusp-portraits-"));const app=await createApp({dataDir:dir});await new Promise(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${app.server.address().port}`;
  const faculty=cookieClient(base),student=cookieClient(base),other=cookieClient(base);
  const call=async(c,url,method="GET",body)=>{const r=await c(url,{method,headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    await call(faculty,"/api/session","POST",{role:"faculty"});const students=(await call(faculty,"/api/students")).students;
    await call(student,"/api/session","POST",{role:"student",studentId:students[0].id});await call(other,"/api/session","POST",{role:"student",studentId:students[1].id});
    const p=app.store.state.drafts.yvette;
    const old=await fs.readFile("corpus/patient-photos/yvette.png"), replacement=await fs.readFile("public/img/omar.jpg");
    const assignment=(await call(faculty,"/api/assignments","POST",{profileId:p.id,studentId:students[0].id})).assignment;
    // Simulate an uploaded new portrait on a newer publication, without changing old releases.
    const fileId="new-yvette-portrait";await fs.writeFile(path.join(dir,"files",fileId),replacement);app.store.state.files[fileId]={id:fileId,type:"image/jpeg"};p.portraitFileId=fileId;
    await call(faculty,`/api/profiles/${p.id}/publish`,"POST",{acknowledge:true});
    const attempt=(await call(student,`/api/assignments/${assignment.id}/start`,"POST",{})).attempt;
    const encounter=(await call(student,`/api/attempts/${attempt.id}/next`,"POST",{})).encounter;
    assert.equal(encounter.imageUrl,`/api/encounters/${encounter.id}/image`);
    assert.deepEqual(Buffer.from(await(await student(encounter.imageUrl)).arrayBuffer()),old);
    assert.deepEqual(Buffer.from(await(await student(`/api/profiles/${p.id}/image`)).arrayBuffer()),replacement);
    assert.equal((await other(encounter.imageUrl)).status,403);
    assert.deepEqual(Buffer.from(await(await faculty(`/api/profiles/${p.id}/image?version=1`)).arrayBuffer()),old);
    assert.equal((await faculty(`/api/profiles/${p.id}/image?version=999`)).status,404);
    assert.equal((await call(student,`/api/encounters/${encounter.id}`)).encounter.videoUrl,"/video/yvette.mp4");
    const newVisit=(await call(student,"/api/encounters","POST",{profileId:p.id})).encounter;
    assert.equal(newVisit.videoUrl,"","An uploaded portrait must not play the old identity's video");
    assert.deepEqual(Buffer.from(await(await student(newVisit.imageUrl)).arrayBuffer()),replacement);
  }finally{await app.store.flush();await new Promise(r=>app.server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
