const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createApi } = require('./lib/api');
const { createHash } = require('crypto');
const dispatch = createApi(require.main === module ? {storePath: path.join(__dirname, 'data', 'recovery', 'published-cases.json')} : {});

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
let gitSha = null;
try {
  gitSha = execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
  buildId = gitSha.slice(0, 7);
} catch (err) {
  buildId = 'local-demo';
}
const sourceHash = createHash('sha256');
for (const file of ['server.js','lib/api.js','lib/encounter.js','lib/cases.js','lib/virtusp-core.js','public/js/app.js','public/app.html','public/css/app.css']) sourceHash.update(fs.readFileSync(path.join(__dirname,file)));
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
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return json(403, {error: 'Local demo requires a localhost host header'});
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return json(403, {error: 'Cross-origin writes disabled'});
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 256000) return json(413, {error: 'Request body too large'}); }
      let body = {};
      try { if (raw) body = JSON.parse(raw); } catch { return json(400, {error: 'Invalid JSON'}); }
      return json(200, dispatch(req.method, urlPath, body));
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
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(body);
  });
});
if (require.main === module) server.listen(port, '127.0.0.1', () => {
  console.log('VirtuSP running at http://localhost:' + port + ' (build: ' + buildId + ')');
});
module.exports = { server };
