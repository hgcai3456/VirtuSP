const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { nowIso, writeDb } = require('./db');

const reportsDir = path.join(__dirname, '..', 'data', 'reports');
const MAX_BYTES = 12 * 1024 * 1024;
const KINDS = ['bloodwork', 'exam', 'test'];
const UPLOADERS = ['patient', 'doctor'];

function dbOf(dbOrShards) {
  return writeDb(dbOrShards);
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicReport(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    patient_id: row.patient_id,
    encounter_id: row.encounter_id || '',
    kind: row.kind,
    title: row.title,
    filename: row.filename,
    uploaded_by: row.uploaded_by,
    uploader_role: row.uploader_role || '',
    size_bytes: row.size_bytes,
    uploaded_at: row.uploaded_at
  };
}

function storedPath(storedName) {
  const base = path.basename(String(storedName || ''));
  if (!/^[a-f0-9]{32}\.pdf$/.test(base)) {
    return '';
  }

  const full = path.resolve(reportsDir, base);
  if (!full.startsWith(path.resolve(reportsDir) + path.sep)) {
    return '';
  }

  return full;
}

function listReports(dbOrShards, patientId) {
  const id = cleanText(patientId, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return [];
  }

  return dbOf(dbOrShards).prepare(`
    SELECT id, patient_id, encounter_id, kind, title, filename,
      uploaded_by, uploader_role, size_bytes, uploaded_at
    FROM reports
    WHERE patient_id = ?
    ORDER BY uploaded_at DESC, id DESC
  `).all(id).map(publicReport);
}

function getReport(dbOrShards, id) {
  const row = dbOf(dbOrShards).prepare(`
    SELECT id, patient_id, encounter_id, kind, title, filename, stored_name,
      uploaded_by, uploader_role, size_bytes, uploaded_at
    FROM reports
    WHERE id = ?
  `).get(Number(id));

  return row || null;
}

function saveReport(dbOrShards, fields, file) {
  const patientId = cleanText(fields.patient_id, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(patientId)) {
    throw new Error('Choose a patient before uploading.');
  }

  const kind = cleanText(fields.kind, 20).toLowerCase();
  if (!KINDS.includes(kind)) {
    throw new Error('Choose bloodwork, an exam, or a test.');
  }

  const uploadedBy = cleanText(fields.uploaded_by, 20).toLowerCase();
  if (!UPLOADERS.includes(uploadedBy)) {
    throw new Error('Say whether the patient or the doctor is uploading.');
  }

  const bytes = file && file.body;
  if (!bytes || bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Only PDF files can be uploaded.');
  }
  if (bytes.length > MAX_BYTES) {
    throw new Error('PDF must be 12 MB or smaller.');
  }

  const rawName = path.basename(cleanText(file.filename, 180)) || 'report.pdf';
  const filename = /\.pdf$/i.test(rawName) ? rawName : rawName + '.pdf';
  let title = cleanText(fields.title, 200);
  if (!title) {
    title = filename.replace(/\.pdf$/i, '') || 'Untitled report';
  }

  const encounterId = cleanText(fields.encounter_id, 40);
  const safeEncounter = /^[A-Za-z0-9_-]{1,40}$/.test(encounterId) ? encounterId : '';
  const uploaderRole = cleanText(
    fields.uploader_role,
    80
  ) || (uploadedBy === 'doctor' ? 'Doctor' : 'Patient');
  const storedName = crypto.randomBytes(16).toString('hex') + '.pdf';
  fs.mkdirSync(reportsDir, { recursive: true });
  const dest = path.join(reportsDir, storedName);
  fs.writeFileSync(dest, bytes);

  try {
    const info = dbOf(dbOrShards).prepare(`
      INSERT INTO reports (
        patient_id, encounter_id, kind, title, filename, stored_name,
        uploaded_by, uploader_role, size_bytes, uploaded_at
      ) VALUES (
        @patient_id, @encounter_id, @kind, @title, @filename, @stored_name,
        @uploaded_by, @uploader_role, @size_bytes, @uploaded_at
      )
    `).run({
      patient_id: patientId,
      encounter_id: safeEncounter,
      kind,
      title,
      filename,
      stored_name: storedName,
      uploaded_by: uploadedBy,
      uploader_role: uploaderRole,
      size_bytes: bytes.length,
      uploaded_at: nowIso()
    });

    return publicReport(getReport(dbOrShards, info.lastInsertRowid));
  } catch (err) {
    fs.unlinkSync(dest);
    throw err;
  }
}

function removeFile(storedName) {
  const full = storedPath(storedName);
  if (!full) {
    return;
  }
  try {
    fs.unlinkSync(full);
  } catch (err) {
    if (!/ENOENT/.test(err.code || '')) {
      throw err;
    }
  }
}

function deleteReport(dbOrShards, id) {
  const row = getReport(dbOrShards, id);
  if (!row) {
    return false;
  }

  dbOf(dbOrShards).prepare('DELETE FROM reports WHERE id = ?').run(row.id);
  removeFile(row.stored_name);

  return true;
}

function deleteAllReports(dbOrShards) {
  const rows = dbOf(dbOrShards).prepare('SELECT stored_name FROM reports').all();
  dbOf(dbOrShards).prepare('DELETE FROM reports').run();
  rows.forEach((row) => removeFile(row.stored_name));

  return rows.length;
}

function reportFile(dbOrShards, id) {
  const row = getReport(dbOrShards, id);
  if (!row) {
    return null;
  }

  const full = storedPath(row.stored_name);
  if (!full || !fs.existsSync(full)) {
    return null;
  }

  return { path: full, filename: row.filename, report: publicReport(row) };
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('PDF must be 12 MB or smaller.'));

        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function headerValue(headers, name) {
  const match = new RegExp('(?:^|\\r?\\n)' + name + ':\\s*([^\\r\\n]+)', 'i').exec(headers);

  return match ? match[1].trim() : '';
}

function parseMultipart(buffer, contentType) {
  const found = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ''));
  if (!found) {
    throw new Error('Upload the PDF with the report form.');
  }

  const boundary = Buffer.from('--' + (found[1] || found[2]));
  const parts = [];
  let start = buffer.indexOf(boundary);
  if (start < 0) {
    throw new Error('Could not read the upload.');
  }

  start += boundary.length;
  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) {
      break;
    }
    if (buffer[start] === 13 && buffer[start + 1] === 10) {
      start += 2;
    } else if (buffer[start] === 10) {
      start += 1;
    }

    const next = buffer.indexOf(boundary, start);
    if (next < 0) {
      break;
    }

    let chunk = buffer.subarray(start, next);
    if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
      chunk = chunk.subarray(0, chunk.length - 2);
    } else if (chunk.length >= 1 && chunk[chunk.length - 1] === 10) {
      chunk = chunk.subarray(0, chunk.length - 1);
    }

    const sep = chunk.indexOf(Buffer.from('\r\n\r\n'));
    const nl = chunk.indexOf(Buffer.from('\n\n'));
    const split = sep >= 0 ? sep : nl;
    const sepLen = sep >= 0 ? 4 : 2;
    if (split >= 0) {
      const head = chunk.subarray(0, split).toString('utf8');
      const body = chunk.subarray(split + sepLen);
      const name = /name="([^"]*)"/.exec(head) || /name=([^;\s]+)/.exec(head);
      const filename = /filename="([^"]*)"/.exec(head) || /filename=([^;\s]+)/.exec(head);
      parts.push({
        name: name ? name[1] : '',
        filename: filename ? filename[1] : '',
        type: headerValue(head, 'content-type'),
        body
      });
    }
    start = next + boundary.length;
  }

  return parts;
}

function partText(parts, name) {
  const part = parts.find((item) => item.name === name && !item.filename);

  return part ? part.body.toString('utf8') : '';
}

function dispositionName(filename) {
  const ascii = String(filename || 'report.pdf').replace(/[^\w.\- ]+/g, '') || 'report.pdf';

  return /\.pdf$/i.test(ascii) ? ascii : ascii + '.pdf';
}

async function handleReports(req, res, db, deps) {
  const pathName = deps.pathName;
  const fileMatch = pathName.match(/^\/api\/reports\/(\d+)\/file$/);
  const oneMatch = pathName.match(/^\/api\/reports\/(\d+)$/);

  if (req.method === 'GET' && pathName === '/api/reports') {
    const patientId = deps.url.searchParams.get('patient_id') || '';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(patientId)) {
      return deps.send(res, 400, { error: 'Provide a patient id.' });
    }

    return deps.send(res, 200, { reports: listReports(db, patientId) });
  }

  if (req.method === 'POST' && pathName === '/api/reports') {
    const type = req.headers['content-type'] || '';
    if (!/^multipart\/form-data/i.test(type)) {
      return deps.send(res, 400, { error: 'Upload the PDF with the report form.' });
    }

    const raw = await readRaw(req, MAX_BYTES + 65536);
    const parts = parseMultipart(raw, type);
    const file = parts.find((item) => item.name === 'file' && item.filename !== undefined && item.body.length);
    if (!file || !file.filename) {
      return deps.send(res, 400, { error: 'Choose a PDF file.' });
    }

    const report = saveReport(db, {
      patient_id: partText(parts, 'patient_id'),
      encounter_id: partText(parts, 'encounter_id'),
      kind: partText(parts, 'kind'),
      title: partText(parts, 'title'),
      uploaded_by: partText(parts, 'uploaded_by'),
      uploader_role: partText(parts, 'uploader_role')
    }, file);

    return deps.send(res, 200, { report });
  }

  if (req.method === 'DELETE' && pathName === '/api/reports') {
    if (deps.url.searchParams.get('all') !== '1') {
      return deps.send(res, 400, { error: 'Provide a report id, or all=1 to clear every uploaded PDF.' });
    }

    return deps.send(res, 200, { ok: true, removed: deleteAllReports(db) });
  }

  if (fileMatch && req.method === 'GET') {
    const file = reportFile(db, fileMatch[1]);
    if (!file) {
      return deps.send(res, 404, { error: 'That report is no longer on this computer.' });
    }

    const data = fs.readFileSync(file.path);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': data.length,
      'Content-Disposition': 'inline; filename="' + dispositionName(file.filename) + '"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    });
    res.end(data);

    return;
  }

  if (oneMatch && req.method === 'GET') {
    const row = getReport(db, oneMatch[1]);
    if (!row) {
      return deps.send(res, 404, { error: 'That report is no longer on this computer.' });
    }

    return deps.send(res, 200, { report: publicReport(row) });
  }

  if (oneMatch && req.method === 'DELETE') {
    if (!deleteReport(db, oneMatch[1])) {
      return deps.send(res, 404, { error: 'That report is no longer on this computer.' });
    }

    return deps.send(res, 200, { ok: true });
  }

  deps.send(res, 405, { error: 'That report action is not available.' });
}

module.exports = {
  KINDS,
  MAX_BYTES,
  listReports,
  saveReport,
  deleteReport,
  deleteAllReports,
  reportFile,
  handleReports
};
