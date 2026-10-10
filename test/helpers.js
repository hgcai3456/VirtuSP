const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { openDb } = require('../lib/db');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'virtusp-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const db = openDb(dbPath);

  return {
    dir,
    dbPath,
    db,
    cleanup() {
      try {
        db.close();
      } catch (err) {
        // already closed
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function mockRes() {
  const res = {
    statusCode: 0,
    headers: null,
    body: null,
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers || {};
    },
    end(data) {
      res.body = data;
      res.ended = true;
    }
  };

  return res;
}

function parsed(res) {
  return JSON.parse(res.body);
}

function mockReq(options = {}) {
  const req = new EventEmitter();
  req.method = options.method || 'GET';
  req.url = options.url || '/';
  req.headers = options.headers || {};
  req.destroyed = false;
  req.destroy = () => {
    req.destroyed = true;
  };

  const body = options.body;
  const emitError = options.error;
  process.nextTick(() => {
    if (emitError) {
      req.emit('error', emitError);

      return;
    }
    if (body != null) {
      const chunks = Array.isArray(body) ? body : [body];
      chunks.forEach((chunk) => {
        req.emit('data', Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
    }
    if (!req.destroyed) {
      req.emit('end');
    }
  });

  return req;
}

function insertJournal(db, fields = {}) {
  const row = Object.assign({
    pmid: null,
    doi: null,
    title: 'Metformin adherence cohort',
    authors: 'Ada Lovelace',
    journal_name: 'Test Journal',
    year: 2020,
    volume: '1',
    issue: '2',
    pages: '3-4',
    abstract: 'Metformin adherence in diabetes was associated with reduced mortality in this cohort.',
    url: 'https://example.test/paper',
    source_type: 'file',
    source_path: null,
    ingested_at: '2020-01-01T00:00:00.000Z'
  }, fields);
  const info = db.prepare(`
    INSERT INTO journals (
      pmid, doi, title, authors, journal_name, year, volume, issue, pages,
      abstract, url, source_type, source_path, ingested_at
    ) VALUES (
      @pmid, @doi, @title, @authors, @journal_name, @year, @volume, @issue, @pages,
      @abstract, @url, @source_type, @source_path, @ingested_at
    )
  `).run(row);

  return Number(info.lastInsertRowid);
}

function insertFact(db, journalId, fields = {}) {
  const row = Object.assign({
    journal_id: journalId,
    claim: 'Metformin adherence in diabetes was associated with reduced mortality.',
    quote: 'Metformin adherence in diabetes was associated with reduced mortality in this cohort.',
    topic: 'diabetes;metformin;adherence',
    section: 'abstract',
    population: null,
    intervention: null,
    outcome: null,
    evidence_level: 'source_sentence',
    keywords: 'diabetes;metformin',
    ingested_at: '2020-01-02T00:00:00.000Z'
  }, fields);
  const info = db.prepare(`
    INSERT INTO medical_data (
      journal_id, claim, quote, topic, section, population, intervention,
      outcome, evidence_level, keywords, ingested_at
    ) VALUES (
      @journal_id, @claim, @quote, @topic, @section, @population, @intervention,
      @outcome, @evidence_level, @keywords, @ingested_at
    )
  `).run(row);

  return Number(info.lastInsertRowid);
}

module.exports = {
  tempDb,
  mockRes,
  mockReq,
  parsed,
  insertJournal,
  insertFact
};
