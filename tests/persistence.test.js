const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {createApi}=require('../lib/api');
const {SEED}=require('../lib/cases');
test('published versions persist across server restart without changing earlier truth',()=>{
  fs.mkdirSync('tmp',{recursive:true});
  const dir=fs.mkdtempSync(path.resolve('tmp','virtusp-cases-')); const storePath=path.join(dir,'cases.json');
  try {const first=createApi({storePath}); const p=structuredClone(SEED[0]); p.facts[0].say='An updated approved response.';
    assert.equal(first('POST','/api/cases',{profile:p}).profile.version,2);
    const next=createApi({storePath}); const profiles=next('GET','/api/cases').profiles;
    assert.equal(profiles.find(x=>x.id==='denise'&&x.version===1).facts[0].say,SEED[0].facts[0].say);
    assert.equal(profiles.find(x=>x.id==='denise'&&x.version===2).facts[0].say,p.facts[0].say);
  } finally {if(fs.existsSync(storePath))fs.unlinkSync(storePath); fs.rmdirSync(dir);}
});
