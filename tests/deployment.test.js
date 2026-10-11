const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const sha = 'a'.repeat(40);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = value => value.replace(/\\/g, '/').replace(/^([A-Z]):/i, (_, drive) => '/' + drive.toLowerCase());
const fakeAws = `#!/usr/bin/env node
const fs=require('fs'),{spawnSync}=require('child_process');
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const region=value('--region');
if(!['us-east-1','us-west-2'].includes(region))process.exit(9);
const state=fs.existsSync(process.env.MOCK_STATE)?JSON.parse(fs.readFileSync(process.env.MOCK_STATE)):{};
const previous='arn:aws:ecs:'+region+':123:task-definition/app:1';
const next='arn:aws:ecs:'+region+':123:task-definition/app:2';
const record={args};let result;
if(args[0]==='ecr')result=process.env.MOCK_FAILURE==='digest'?'None':'sha256:'+'b'.repeat(64);
else if(args[1]==='describe-services')result=state[region]&&process.env.MOCK_FAILURE!=='rollback'?next:previous;
else if(args[1]==='describe-task-definition')result=JSON.stringify({family:'app',taskDefinitionArn:previous,revision:1,status:'ACTIVE',taskRoleArn:'task-role',executionRoleArn:'execution-role',volumes:[{name:'data',efsVolumeConfiguration:{fileSystemId:region}}],containerDefinitions:[{name:'virtusp',image:'old',environment:[{name:'PROFILE_S3_BUCKET',value:region},{name:'VIRTUSP_GIT_SHA',value:'old'}],mountPoints:[{sourceVolume:'data',containerPath:'/app/data'}]}]});
else if(args[1]==='register-task-definition'){
let file=value('--cli-input-json').slice(7);
if(process.platform==='win32'&&file.startsWith('/'))file=spawnSync('cygpath',['-w',file],{encoding:'utf8'}).stdout.trim();
record.task=JSON.parse(fs.readFileSync(file,'utf8'));result=next;
}else if(args[1]==='update-service'){state[region]=true;fs.writeFileSync(process.env.MOCK_STATE,JSON.stringify(state));result=next;}
else if(args[1]==='wait'){if(process.env.MOCK_FAILURE==='wait')process.exit(3);result='';}
else process.exit(8);
fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify(record)+'\\n');
console.log(result);
`;
const fakeCurl = `#!/usr/bin/env node
const fs=require('fs'),url=process.argv.at(-1);
fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify({url})+'\\n');
console.log(JSON.stringify({gitSha:process.env.MOCK_FAILURE==='verify'?'wrong':process.env.SOURCE_SHA}));
`;

function release(failure = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-deploy-test-'));
  try {
    for (const [name, content] of [['aws',fakeAws],['curl',fakeCurl],['sleep','#!/usr/bin/env bash\nexit 0\n']]) {
      fs.writeFileSync(path.join(directory, name), content);
      fs.chmodSync(path.join(directory, name), 0o755);
    }
    const log = path.join(directory, 'calls.jsonl');
    const result = spawnSync(bash, ['-c', 'export PATH="$1:$PATH"; exec bash "$2"', 'test', shellPath(directory), shellPath(path.resolve('scripts/deploy-ecs.sh'))], {
      encoding: 'utf8', timeout: 60000,
      env: {...process.env, SOURCE_SHA: sha, AWS_ACCOUNT_ID:'123', MOCK_FAILURE:failure, MOCK_LOG:log, MOCK_STATE:path.join(directory,'state.json')}
    });
    if (result.error) throw result.error;
    return {...result, calls:fs.existsSync(log) ? fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)) : []};
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, {recursive:true, force:true});
  }
}

test('deployment updates and verifies both regional services while preserving their storage and roles', () => {
  const result = release();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const tasks = result.calls.filter(c=>c.args?.[1]==='register-task-definition');
  assert.equal(tasks.length,2);
  for (const [i, region] of ['us-east-1','us-west-2'].entries()) {
    const task=tasks[i].task, container=task.containerDefinitions[0];
    assert.equal(task.taskRoleArn,'task-role');
    assert.equal(task.executionRoleArn,'execution-role');
    assert.equal(task.volumes[0].efsVolumeConfiguration.fileSystemId,region);
    assert.equal(container.environment.find(e=>e.name==='PROFILE_S3_BUCKET').value,region);
    assert.deepEqual(container.environment.filter(e=>e.name==='VIRTUSP_GIT_SHA'),[{name:'VIRTUSP_GIT_SHA',value:sha}]);
    assert.match(container.image,new RegExp(region));
    assert.ok(container.image.endsWith('@sha256:'+'b'.repeat(64)));
    assert.equal(task.taskDefinitionArn,undefined);
    assert.equal(task.revision,undefined);
  }
  assert.equal(result.calls.filter(c=>c.url?.includes('/api/live')).length,2);
  assert.equal(result.calls.filter(c=>c.url?.includes('/api/ready')).length,2);
  const updates=result.calls.filter(c=>c.args?.[1]==='update-service');
  assert.equal(updates.length,2);
  assert.ok(updates.every(c=>!c.args.includes('--desired-count')));
});

for (const failure of ['digest','wait','rollback','verify']) {
  test('deployment fails safely on '+failure+' instead of reporting both regions deployed', () => {
    const result=release(failure);
    assert.notEqual(result.status,0,result.stdout);
    assert.ok(!result.calls.some(c=>c.args?.includes('us-west-2')),result.stdout);
    if(failure==='digest')assert.ok(!result.calls.some(c=>c.args?.[1]==='update-service'));
  });
}
