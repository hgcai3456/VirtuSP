const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const {
  KINDS,
  MAX_BYTES,
  listReports,
  saveReport,
  deleteReport,
  deleteAllReports,
  reportFile,
  handleReports
} = require('../lib/reports');
const { tempDb, mockRes } = require('./helpers');

const reportsDir = path.join(__dirname, '..', 'data', 'reports');

function pdf(extra) {
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(extra || 'tiny')]);
}

function multipart(fields, file, options = {}) {
  const boundary = options.boundary || '----virtuBoundary';
  const nl = options.nl || '\r\n';
  const chunks = [];
  if (options.preamble) {
    chunks.push(Buffer.from('preamble'));
  }
  Object.entries(fields).forEach(([name, value]) => {
    const quoted = options.bare ? name : '"' + name + '"';
    chunks.push(Buffer.from(
      '--' + boundary + nl
      + 'Content-Disposition: form-data; name=' + quoted + nl + nl
      + value + nl
    ));
  });
  if (file) {
    const fname = options.bare ? file.filename : '"' + file.filename + '"';
    const type = file.type == null ? 'Content-Type: application/pdf' + nl : (file.type ? 'Content-Type: ' + file.type + nl : '');
    chunks.push(Buffer.from('--' + boundary + nl + 'Content-Disposition: form-data; name="file"; filename=' + fname + nl + type + nl));
    chunks.push(file.body);
    chunks.push(Buffer.from(options.tailNl == null ? nl : options.tailNl));
  }
  if (options.orphan) {
    chunks.push(Buffer.from('--' + boundary + nl + 'not a header'));
  }
  if (!options.open) {
    chunks.push(Buffer.from('--' + boundary + '--' + nl));
  }
  const header = options.quoteBoundary
    ? 'multipart/form-data; boundary="' + boundary + '"'
    : 'multipart/form-data; boundary=' + boundary;

  return { type: header, body: Buffer.concat(chunks) };
}

describe('reports', { concurrency: false }, () => {
  let box;
  const created = [];

  before(() => {
    box = tempDb();
    fs.mkdirSync(reportsDir, { recursive: true });
  });

  after(() => {
    deleteAllReports(box.db);
    box.cleanup();
    created.forEach((file) => fs.rmSync(file, { force: true }));
  });

  beforeEach(() => {
    deleteAllReports(box.db);
  });

  test('saves, lists, opens, and deletes a PDF', () => {
    assert.deepEqual(KINDS, ['bloodwork', 'exam', 'test']);
    assert.deepEqual(listReports(box.db, '../etc'), []);
    assert.deepEqual(listReports(box.db, ''), []);

    const report = saveReport(box.db, {
      patient_id: '  patient-1 ',
      encounter_id: 'enc_1',
      kind: ' Bloodwork ',
      title: '  CBC\u0001 result ',
      uploaded_by: ' Doctor ',
      uploader_role: ' Attending '
    }, { filename: 'labs\\cbc.PDF', body: pdf('cbc') });

    assert.equal(report.patient_id, 'patient-1');
    assert.equal(report.kind, 'bloodwork');
    assert.equal(report.title, 'CBC result');
    assert.equal(report.uploader_role, 'Attending');
    assert.equal(report.encounter_id, 'enc_1');
    assert.match(report.filename, /cbc\.PDF$/);
    assert.equal(listReports(box.db, 'patient-1').length, 1);
    assert.equal(listReports([box.db], 'missing').length, 0);

    const opened = reportFile(box.db, report.id);
    assert.equal(opened.filename, report.filename);
    assert.equal(fs.existsSync(opened.path), true);
    assert.equal(reportFile(box.db, 999), null);

    fs.rmSync(opened.path);
    assert.equal(reportFile(box.db, report.id), null);
    assert.equal(deleteReport(box.db, report.id), true);
    assert.equal(deleteReport(box.db, report.id), false);
    assert.equal(deleteReport(box.db, 'nope'), false);
  });

  test('fills titles, roles, and encounter defaults', () => {
    const patient = saveReport(box.db, {
      patient_id: 'p2',
      encounter_id: 'bad id',
      kind: 'exam',
      title: '',
      uploaded_by: 'patient'
    }, { filename: 'note', body: pdf() });
    assert.equal(patient.filename, 'note.pdf');
    assert.equal(patient.title, 'note');
    assert.equal(patient.uploader_role, 'Patient');
    assert.equal(patient.encounter_id, '');

    const untitled = saveReport(box.db, {
      patient_id: 'p2',
      kind: 'test',
      uploaded_by: 'doctor',
      title: '   '
    }, { filename: '.pdf', body: pdf('x') });
    assert.equal(untitled.title, 'Untitled report');
    assert.equal(untitled.uploader_role, 'Doctor');

    const named = saveReport(box.db, {
      patient_id: 'p2',
      kind: 'test',
      uploaded_by: 'doctor',
      filename: 'ignored'
    }, { filename: '', body: pdf('y') });
    assert.match(named.filename, /report\.pdf$/);
    assert.deepEqual(
      listReports(box.db, 'p2').map((row) => row.id),
      listReports(box.db, 'p2').map((row) => row.id)
    );
    assert.equal(deleteAllReports(box.db), 3);
    assert.equal(deleteAllReports(box.db), 0);
  });

  test('rejects invalid uploads and removes the file when the insert fails', () => {
    assert.throws(() => saveReport(box.db, { patient_id: 'bad id', kind: 'exam', uploaded_by: 'patient' }, { body: pdf() }), /patient/);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'xray', uploaded_by: 'patient' }, { body: pdf() }), /bloodwork/);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'exam', uploaded_by: 'nurse' }, { body: pdf() }), /doctor/);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'exam', uploaded_by: 'patient' }, null), /PDF/);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'exam', uploaded_by: 'patient' }, { body: Buffer.from('hello') }), /PDF/);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'exam', uploaded_by: 'patient' }, { body: Buffer.from('%PDF') }), /PDF/);
    const huge = Buffer.alloc(MAX_BYTES + 1, 0);
    huge.set(Buffer.from('%PDF-'), 0);
    assert.throws(() => saveReport(box.db, { patient_id: 'p', kind: 'exam', uploaded_by: 'patient' }, { filename: 'big.pdf', body: huge }), /12 MB/);

    const writes = [];
    const original = fs.writeFileSync;
    fs.writeFileSync = (file, data) => {
      writes.push(file);
      return original(file, data);
    };
    const failing = {
      prepare(sql) {
        if (/INSERT/.test(sql)) {
          return { run() { throw new Error('insert failed'); } };
        }

        return { get() { return null; }, all() { return []; }, run() {} };
      }
    };
    try {
      assert.throws(() => saveReport(failing, {
        patient_id: 'p',
        kind: 'exam',
        uploaded_by: 'patient'
      }, { filename: 'ok.pdf', body: pdf('z') }), /insert failed/);
      assert.equal(fs.existsSync(writes.at(-1)), false);
    } finally {
      fs.writeFileSync = original;
    }

    const missingRow = {
      prepare(sql) {
        if (/INSERT/.test(sql)) {
          return { run() { return { lastInsertRowid: 1 }; } };
        }

        return { get() { return null; }, all() { return []; }, run() {} };
      }
    };
    fs.writeFileSync = (file, data) => {
      writes.push(file);
      created.push(file);
      return original(file, data);
    };
    try {
      assert.equal(saveReport(missingRow, {
        patient_id: 'p',
        kind: 'exam',
        uploaded_by: 'patient',
        title: 'Kept'
      }, { filename: 'kept.pdf', body: pdf('k') }), null);
    } finally {
      fs.writeFileSync = original;
    }
  });

  test('removeFile ignores a missing file, rejects other errors, and blocks a path escape', () => {
    const report = saveReport(box.db, {
      patient_id: 'p',
      kind: 'exam',
      uploaded_by: 'patient',
      title: 'gone'
    }, { filename: 'gone.pdf', body: pdf('g') });
    const stored = box.db.prepare('SELECT stored_name FROM reports WHERE id = ?').get(report.id).stored_name;
    const full = path.join(reportsDir, stored);
    fs.rmSync(full);
    assert.equal(deleteReport(box.db, report.id), true);

    const kept = saveReport(box.db, {
      patient_id: 'p',
      kind: 'test',
      uploaded_by: 'doctor'
    }, { filename: 'kept.pdf', body: pdf('k') });
    const originalUnlink = fs.unlinkSync;
    fs.unlinkSync = () => {
      const err = new Error('busy');
      err.code = 'EPERM';
      throw err;
    };
    try {
      assert.throws(() => deleteReport(box.db, kept.id), /busy/);
    } finally {
      fs.unlinkSync = originalUnlink;
    }
    const missingFile = saveReport(box.db, {
      patient_id: 'p',
      kind: 'exam',
      uploaded_by: 'patient',
      title: 'already gone'
    }, { filename: 'gone-again.pdf', body: pdf('g2') });
    fs.unlinkSync = () => {
      const err = new Error('missing');
      err.code = 'ENOENT';
      throw err;
    };
    try {
      assert.equal(deleteReport(box.db, missingFile.id), true);
    } finally {
      fs.unlinkSync = originalUnlink;
    }

    box.db.prepare(`
      INSERT INTO reports (
        patient_id, encounter_id, kind, title, filename, stored_name,
        uploaded_by, uploader_role, size_bytes, uploaded_at
      ) VALUES ('p', '', 'exam', 'bad', 'bad.pdf', 'not-a-hash.pdf', 'patient', 'Patient', 1, '2020-01-01')
    `).run();
    const originalResolve = path.resolve;
    let escape = false;
    path.resolve = (...args) => {
      if (escape && args.length === 2 && String(args[1]).endsWith('.pdf')) {
        return path.join('C:\\outside', 'file.pdf');
      }

      return originalResolve.apply(path, args);
    };
    const hashed = 'a'.repeat(32) + '.pdf';
    box.db.prepare(`
      INSERT INTO reports (
        patient_id, encounter_id, kind, title, filename, stored_name,
        uploaded_by, uploader_role, size_bytes, uploaded_at
      ) VALUES ('p', '', 'exam', 'esc', 'esc.pdf', ?, 'patient', 'Patient', 1, '2020-01-02')
    `).run(hashed);
    try {
      escape = true;
      assert.equal(deleteAllReports(box.db) >= 1, true);
    } finally {
      escape = false;
      path.resolve = originalResolve;
    }
  });

  function deps(url, pathName) {
    return { url: new URL(url, 'http://localhost'), pathName, send(res, status, body) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    } };
  }

  function request(method, url, extra) {
    const pathName = new URL(url, 'http://localhost').pathname;
    const res = mockRes();
    const req = new EventEmitter();
    req.method = method;
    req.headers = extra && extra.headers || {};
    req.destroy = () => {
      req.destroyed = true;
    };
    const pending = handleReports(req, res, box.db, deps(url, pathName));
    process.nextTick(() => {
      if (extra && extra.error) {
        req.emit('error', extra.error);

        return;
      }
      (extra && extra.chunks || []).forEach((chunk) => req.emit('data', chunk));
      if (!req.destroyed) {
        req.emit('end');
      }
    });

    return pending.then(() => res);
  }

  test('HTTP routes list, upload, download, and delete', async () => {
    const badList = await request('GET', '/api/reports');
    assert.equal(badList.statusCode, 400);

    const saved = saveReport(box.db, {
      patient_id: 'pat',
      kind: 'exam',
      uploaded_by: 'patient',
      title: 'Panel'
    }, { filename: 'panel (1).pdf', body: pdf('% more') });

    const listed = await request('GET', '/api/reports?patient_id=pat');
    assert.equal(listed.statusCode, 200);
    assert.equal(JSON.parse(listed.body).reports.length, 1);

    const one = await request('GET', '/api/reports/' + saved.id);
    assert.equal(one.statusCode, 200);
    assert.equal(JSON.parse(one.body).report.title, 'Panel');
    const missing = await request('GET', '/api/reports/99999');
    assert.equal(missing.statusCode, 404);

    const file = await request('GET', '/api/reports/' + saved.id + '/file');
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers['Content-Type'], 'application/pdf');
    assert.match(file.headers['Content-Disposition'], /panel 1\.pdf/);
    assert.equal(Buffer.from(file.body).subarray(0, 5).toString('latin1'), '%PDF-');
    const missingFile = await request('GET', '/api/reports/99999/file');
    assert.equal(missingFile.statusCode, 404);

    const notForm = await request('POST', '/api/reports', { headers: { 'content-type': 'text/plain' } });
    assert.equal(notForm.statusCode, 400);

    const form = multipart({
      patient_id: 'pat',
      encounter_id: 'enc-9',
      kind: 'test',
      title: 'Uploaded',
      uploaded_by: 'doctor',
      uploader_role: 'Nurse'
    }, { filename: 'up.pdf', body: pdf('up') }, { quoteBoundary: true, preamble: true });
    const uploaded = await request('POST', '/api/reports', {
      headers: { 'content-type': form.type },
      chunks: [form.body.subarray(0, 20), form.body.subarray(20)]
    });
    assert.equal(uploaded.statusCode, 200);
    assert.equal(JSON.parse(uploaded.body).report.title, 'Uploaded');

    const lf = multipart({
      patient_id: 'pat',
      kind: 'exam',
      uploaded_by: 'patient'
    }, { filename: 'lf.pdf', body: pdf('lf'), type: '' }, { nl: '\n', bare: true, tailNl: '\n' });
    const lfRes = await request('POST', '/api/reports', {
      headers: { 'content-type': lf.type },
      chunks: [lf.body]
    });
    assert.equal(lfRes.statusCode, 200);

    const noFile = multipart({ patient_id: 'pat', kind: 'exam', uploaded_by: 'patient' }, null);
    const noFileRes = await request('POST', '/api/reports', {
      headers: { 'content-type': noFile.type },
      chunks: [noFile.body]
    });
    assert.equal(noFileRes.statusCode, 400);

    const emptyName = multipart({}, { filename: '', body: pdf('e') });
    const emptyNameRes = await request('POST', '/api/reports', {
      headers: { 'content-type': emptyName.type },
      chunks: [emptyName.body]
    });
    assert.equal(emptyNameRes.statusCode, 400);

    await assert.rejects(
      request('POST', '/api/reports', { headers: { 'content-type': 'multipart/form-data' }, chunks: [Buffer.from('nope')] }),
      /report form/
    );
    await assert.rejects(
      request('POST', '/api/reports', {
        headers: { 'content-type': 'multipart/form-data; boundary=missing' },
        chunks: [Buffer.from('no boundary here')]
      }),
      /Could not read/
    );

    const orphan = multipart({
      patient_id: 'pat',
      kind: 'exam',
      uploaded_by: 'patient'
    }, { filename: 'o.pdf', body: pdf('o') }, { orphan: true });
    const orphanRes = await request('POST', '/api/reports', {
      headers: { 'content-type': orphan.type },
      chunks: [orphan.body]
    });
    assert.equal(orphanRes.statusCode, 200);

    const openEnded = multipart({
      patient_id: 'pat',
      kind: 'exam',
      uploaded_by: 'patient'
    }, { filename: 'open.pdf', body: pdf('o') }, { open: true });
    const openRes = await request('POST', '/api/reports', {
      headers: { 'content-type': openEnded.type },
      chunks: [openEnded.body]
    });
    assert.equal(openRes.statusCode, 400);

    const cleared = await request('DELETE', '/api/reports?all=0');
    assert.equal(cleared.statusCode, 400);
    const all = await request('DELETE', '/api/reports?all=1');
    assert.equal(all.statusCode, 200);
    assert.equal(JSON.parse(all.body).ok, true);

    const gone = await request('DELETE', '/api/reports/' + saved.id);
    assert.equal(gone.statusCode, 404);
    const again = saveReport(box.db, {
      patient_id: 'pat',
      kind: 'exam',
      uploaded_by: 'patient'
    }, { filename: 'last.pdf', body: pdf('l') });
    const removed = await request('DELETE', '/api/reports/' + again.id);
    assert.equal(removed.statusCode, 200);
    const nope = await request('PUT', '/api/reports');
    assert.equal(nope.statusCode, 405);

    await assert.rejects(request('POST', '/api/reports', {
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      error: new Error('socket')
    }), /socket/);

    const big = Buffer.alloc(MAX_BYTES + 65537, 1);
    await assert.rejects(request('POST', '/api/reports', {
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      chunks: [big]
    }), /12 MB/);
  });

  test('save errors propagate from the upload route', async () => {
    const form = multipart({
      patient_id: 'bad id',
      kind: 'exam',
      uploaded_by: 'patient'
    }, { filename: 'x.pdf', body: pdf('x') });
    await assert.rejects(request('POST', '/api/reports', {
      headers: { 'content-type': form.type },
      chunks: [form.body]
    }), /patient/);
  });

  afterEach(() => {
    deleteAllReports(box.db);
  });
});
