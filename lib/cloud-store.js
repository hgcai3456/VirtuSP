const fs = require('node:fs');
const path = require('node:path');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
function createCloudStore({bucket, directory, client = new S3Client({})} = {}) {
  return async function save(profile, kind = 'published') {
    if (!bucket) return {cloud:false};
    const key = `virtusp/cleanup/${kind}/${profile.id}/${profile.version || 'draft'}.json`;
    const body = JSON.stringify(profile);
    if (directory) {
      fs.mkdirSync(directory,{recursive:true});
      const target = path.join(directory,`${profile.id}-${profile.version || 'draft'}.json`);
      fs.writeFileSync(target+'.tmp',body); fs.renameSync(target+'.tmp',target);
    }
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/json',ServerSideEncryption:'AES256'}));
    return {cloud:true,key};
  };
}
module.exports = {createCloudStore};
