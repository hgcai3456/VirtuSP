const http = require('http');
const fs = require('fs');
const path = require('path');
const { openShards } = require('./lib/db');
const { handleApi } = require('./lib/api');

const root = path.join(__dirname, 'public');
const port = process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1';
const db = openShards();
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
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function text(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function resolveStatic(rootDir, rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (err) {
    return { status: 400, body: 'Bad request' };
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    return { status: 400, body: 'Bad request' };
  }

  const trimmed = decoded.replace(/^\/+/, '');
  if (trimmed.split('/').includes('..')) {
    return { status: 403, body: 'Forbidden' };
  }

  const filePath = path.resolve(rootDir, trimmed);
  const rootResolved = path.resolve(rootDir);
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (filePath !== rootResolved && !filePath.startsWith(prefix)) {
    return { status: 403, body: 'Forbidden' };
  }

  return { filePath };
}

function streamFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = types[ext] || 'application/octet-stream';
  const isMedia = ext === '.mp4' || ext === '.webm';
  const headers = {
    'Content-Type': isMedia ? type : type + '; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes'
  };
  const range = isMedia && req.headers.range;

  const fail = (stream) => {
    stream.on('error', () => {
      if (!res.headersSent) {
        text(res, 500, 'Not available');

        return;
      }
      res.destroy();
    });
  };

  if (!range) {
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    fail(stream);
    stream.pipe(res);

    return;
  }

  const parts = /^bytes=(\d*)-(\d*)$/.exec(range) || [];
  const start = parts[1] ? parseInt(parts[1], 10) : 0;
  const end = parts[2] ? parseInt(parts[2], 10) : stat.size - 1;
  if ((!parts[1] && !parts[2]) || Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= stat.size) {
    res.writeHead(416, {
      'Content-Range': 'bytes */' + stat.size,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end();

    return;
  }

  headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
  headers['Content-Length'] = end - start + 1;
  res.writeHead(206, headers);
  const stream = fs.createReadStream(filePath, { start, end });
  fail(stream);
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, db).catch((err) => {
      console.error(err && err.message ? err.message : err);
      if (!res.headersSent) {
        text(res, 500, 'Not available');
      }
    });

    return;
  }

  let requestPath = urlPath;
  if (requestPath.endsWith('/')) {
    requestPath += 'index.html';
  }

  const resolved = resolveStatic(root, requestPath);
  if (!resolved.filePath) {
    text(res, resolved.status, resolved.body);

    return;
  }

  fs.stat(resolved.filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      text(res, 404, 'Not found');

      return;
    }

    streamFile(req, res, resolved.filePath, stat);
  });
});

server.timeout = 120000;
server.headersTimeout = 60000;
server.keepAliveTimeout = 5000;
if ('requestTimeout' in server) {
  server.requestTimeout = 120000;
}

function shutdown() {
  server.close(() => {
    db.forEach((shard) => {
      if (typeof shard.close === 'function') {
        try {
          shard.close();
        } catch (err) {
          console.error(err.message || err);
        }
      }
    });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

server.on('error', (err) => {
  console.error(err.message || err);
  process.exit(1);
});

server.listen(port, host, () => {
  const address = server.address();
  console.log('VirtuSP running at http://' + host + ':' + address.port);
});
