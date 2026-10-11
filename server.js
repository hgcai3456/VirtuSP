const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createApi } = require('./lib/api');
const { createHash } = require('crypto');
const {createCloudStore} = require('./lib/cloud-store');
const cloudSave = createCloudStore({bucket:process.env.PROFILE_S3_BUCKET,directory:process.env.VIRTUSP_DATA_DIR});
const dispatch = createApi(require.main === module ? {storePath: path.join(process.env.VIRTUSP_DATA_DIR || path.join(__dirname, 'data', 'recovery'), 'published-cases.json')} : {});

const root = path.join(__dirname, 'public');
const port = process.env.PORT || 3000;
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

let buildId = 'local-demo';
let gitSha = /^[a-f0-9]{40}$/.test(process.env.VIRTUSP_GIT_SHA || '') ? process.env.VIRTUSP_GIT_SHA : null;
try {
  if (!gitSha) gitSha = execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
  buildId = gitSha.slice(0, 7);
} catch (err) {
  buildId = gitSha ? gitSha.slice(0,7) : 'local-demo';
}
const sourceHash = createHash('sha256');
for (const file of ['server.js','lib/api.js','lib/cloud-store.js','lib/encounter.js','lib/cases.js','lib/virtusp-core.js','public/js/app.js','public/app.html','public/css/app.css','package-lock.json']) sourceHash.update(fs.readFileSync(path.join(__dirname,file)));
buildId += '-' + sourceHash.digest('hex').slice(0, 10);

const buildInject = `
  <script>
    window.__VIRTUSP_BUILD__ = {
      version: '1.0.0',
      gitSha: ${JSON.stringify(gitSha)},
      buildId: ${JSON.stringify(buildId).replace(/</g, '\\u003c')},
      environment: ${JSON.stringify(process.env.NODE_ENV || 'local').replace(/</g, '\\u003c')},
      providerMode: 'local-demo',
      responsePolicy: 'approved-case-only'
    };
  </script>
`;

const server = http.createServer(async (req, res) => {
  const json = (status, value) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { return json(400, {error: 'Malformed URL'}); }
  if (urlPath.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && ['/api/live','/api/ready'].includes(urlPath)) return json(200, {status:'ok',gitSha,buildId,responsePolicy:'approved-case-only'});
      const allowedHosts = (process.env.VIRTUSP_ALLOWED_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '') && !allowedHosts.includes((req.headers.host || '').toLowerCase())) return json(403, {error: 'Host is not configured for this demo'});
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return json(403, {error: 'Cross-origin writes disabled'});
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 256000) return json(413, {error: 'Request body too large'}); }
      let body = {};
      try { if (raw) body = JSON.parse(raw); } catch { return json(400, {error: 'Invalid JSON'}); }
      const result = dispatch(req.method, urlPath, body);
      if (req.method === 'POST' && urlPath === '/api/cases') {
        try { result.storage = await cloudSave(result.profile); }
        catch { return json(503, {error:'Published version saved to recovery storage, but cloud backup failed. Retry cloud backup before continuing.',profile:result.profile}); }
      }
      return json(200, result);
    } catch (error) { return json(error.status || 400, {error: error.status ? error.message : 'Invalid case or encounter payload'}); }
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
  if (urlPath.endsWith('/')) {
    urlPath += 'index.html';
  }

  const sharedCaseScript = urlPath === '/js/cases.js';
  const filePath = sharedCaseScript ? path.join(__dirname, 'lib', 'cases.js') : path.normalize(path.join(root, urlPath));
  if (!sharedCaseScript && filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);

    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);

      return res.end('Not found');
    }

    let body = data;
    if (filePath.endsWith('.html')) {
      const html = data.toString('utf8');
      const injection = buildInject.trim();
      body = Buffer.from(html.replace('</head>', `${injection}\n</head>`));
    }

    const ext = path.extname(filePath);
    const type = types[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
});
if (require.main === module) server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log('VirtuSP running at http://localhost:' + port + ' (build: ' + buildId + ')');
});
module.exports = { server };
