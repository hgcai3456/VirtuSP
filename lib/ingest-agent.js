const fs = require('fs');
const path = require('path');
const { nowIso } = require('./db');
const { writeTransaction } = require('./write-orchestrator');
const { searchPubmed, fetchPubmed } = require('./pubmed');

const CLAIM_HINTS = /\b(associated|increased|decreased|reduced|improved|significant|adherence|efficacy|compared|versus|found|showed|demonstrated|recommend|intolerance|errors?|risk|hazard|odds|mortality|cohort|trial|review|patients?|medication|inhaler|smoking|metformin|diabetes|copd)\b/i;
const TOPIC_WORDS = [
  'diabetes', 'metformin', 'adherence', 'hypoglycaemic', 'hypoglycemic',
  'gastrointestinal', 'copd', 'inhaler', 'smoking', 'cessation',
  'mortality', 'hba1c', 'egfr', 'kidney', 'technique'
];

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

function keywordsFrom(text) {
  const lower = String(text || '').toLowerCase();

  return TOPIC_WORDS.filter((word) => lower.includes(word)).join(';');
}

function extractFacts(sourceText, section) {
  return sentences(sourceText)
    .filter((line) => CLAIM_HINTS.test(line))
    .map((quote) => ({
      claim: quote,
      quote,
      topic: keywordsFrom(quote),
      section: section || 'abstract',
      evidence_level: 'source_sentence'
    }));
}

function includesQuote(source, quote) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const hay = norm(source);
  const needle = norm(quote);

  return needle.length >= 20 && hay.includes(needle);
}

function asText(value) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function normalizePublication(raw, extras = {}) {
  const pub = raw || {};
  const title = asText(pub.title);
  if (!title) {
    throw new Error('Publication is missing a title');
  }

  return {
    pmid: asText(pub.pmid) || null,
    doi: asText(pub.doi) || null,
    title,
    authors: asText(pub.authors) || null,
    journal_name: asText(pub.journal_name || pub.journal) || null,
    year: pub.year ? Number(pub.year) : null,
    volume: asText(pub.volume) || null,
    issue: asText(pub.issue) || null,
    pages: asText(pub.pages) || null,
    abstract: asText(pub.abstract || pub.synopsis) || null,
    url: asText(pub.url) || (pub.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + pub.pmid + '/' : null),
    source_type: asText(pub.source_type) || extras.source_type || 'file',
    source_path: asText(pub.source_path) || extras.source_path || null,
    facts: Array.isArray(pub.facts) ? pub.facts : []
  };
}

class IngestAgent {
  constructor(db) {
    this.db = db;
    this.findByPmid = db.prepare('SELECT id FROM journals WHERE pmid = ?');
    this.findByDoi = db.prepare('SELECT id FROM journals WHERE doi = ?');
    this.findByTitle = db.prepare('SELECT id FROM journals WHERE title = ? AND ifnull(year, 0) = ifnull(?, 0)');
    this.insertJournal = db.prepare(`
      INSERT INTO journals (
        pmid, doi, title, authors, journal_name, year, volume, issue, pages,
        abstract, url, source_type, source_path, ingested_at
      ) VALUES (
        @pmid, @doi, @title, @authors, @journal_name, @year, @volume, @issue, @pages,
        @abstract, @url, @source_type, @source_path, @ingested_at
      )
    `);
    this.updateJournal = db.prepare(`
      UPDATE journals SET
        pmid = COALESCE(@pmid, pmid),
        doi = COALESCE(@doi, doi),
        title = @title,
        authors = COALESCE(@authors, authors),
        journal_name = COALESCE(@journal_name, journal_name),
        year = COALESCE(@year, year),
        volume = COALESCE(@volume, volume),
        issue = COALESCE(@issue, issue),
        pages = COALESCE(@pages, pages),
        abstract = COALESCE(@abstract, abstract),
        url = COALESCE(@url, url),
        source_type = @source_type,
        source_path = COALESCE(@source_path, source_path)
      WHERE id = @id
    `);
    this.hasQuote = db.prepare('SELECT id FROM medical_data WHERE journal_id = ? AND quote = ?');
    this.insertFact = db.prepare(`
      INSERT INTO medical_data (
        journal_id, claim, quote, topic, section, population, intervention,
        outcome, evidence_level, keywords, ingested_at
      ) VALUES (
        @journal_id, @claim, @quote, @topic, @section, @population, @intervention,
        @outcome, @evidence_level, @keywords, @ingested_at
      )
    `);
  }

  journalRow(pub) {
    return {
      pmid: pub.pmid,
      doi: pub.doi,
      title: pub.title,
      authors: pub.authors,
      journal_name: pub.journal_name,
      year: pub.year,
      volume: pub.volume,
      issue: pub.issue,
      pages: pub.pages,
      abstract: pub.abstract,
      url: pub.url,
      source_type: pub.source_type,
      source_path: pub.source_path,
      ingested_at: nowIso()
    };
  }

  upsertJournal(pub) {
    const existing = (pub.pmid && this.findByPmid.get(pub.pmid))
      || (pub.doi && this.findByDoi.get(pub.doi))
      || this.findByTitle.get(pub.title, pub.year);
    const row = this.journalRow(pub);

    if (existing) {
      this.updateJournal.run({
        id: existing.id,
        pmid: row.pmid,
        doi: row.doi,
        title: row.title,
        authors: row.authors,
        journal_name: row.journal_name,
        year: row.year,
        volume: row.volume,
        issue: row.issue,
        pages: row.pages,
        abstract: row.abstract,
        url: row.url,
        source_type: row.source_type,
        source_path: row.source_path
      });

      return existing.id;
    }

    return Number(this.insertJournal.run(row).lastInsertRowid);
  }

  storeFacts(journalId, pub) {
    const source = [pub.abstract, pub.title].filter(Boolean).join('\n');
    const incoming = pub.facts.length ? pub.facts : extractFacts(source, 'abstract');
    let added = 0;
    const skipped = [];

    incoming.forEach((fact) => {
      const quote = asText(fact.quote || fact.claim);
      const claim = asText(fact.claim || fact.quote);
      if (!quote || !claim) {
        skipped.push('empty claim');

        return;
      }
      if (!includesQuote(source, quote)) {
        skipped.push('ungrounded: quote is not in the source text');

        return;
      }
      if (this.hasQuote.get(journalId, quote)) {
        return;
      }

      this.insertFact.run({
        journal_id: journalId,
        claim,
        quote,
        topic: [pub.topicHint, asText(fact.topic) || keywordsFrom(claim)].filter(Boolean).join(';'),
        section: asText(fact.section) || 'abstract',
        population: asText(fact.population) || null,
        intervention: asText(fact.intervention) || null,
        outcome: asText(fact.outcome) || null,
        evidence_level: asText(fact.evidence_level) || 'source_sentence',
        keywords: asText(fact.keywords) || keywordsFrom(claim + ' ' + quote),
        ingested_at: nowIso()
      });
      added += 1;
    });

    return { added, skipped };
  }

  ingestPublication(raw, extras = {}) {
    const pub = normalizePublication(raw, extras);
    pub.topicHint = asText(extras.topic);

    return writeTransaction(this.db, () => {
      const journalId = this.upsertJournal(pub);
      const facts = this.storeFacts(journalId, pub);

      return {
        journal_id: journalId,
        title: pub.title,
        pmid: pub.pmid,
        facts_added: facts.added,
        skipped: facts.skipped
      };
    });
  }

  ingestFile(filePath) {
    const abs = path.resolve(filePath);
    const text = fs.readFileSync(abs, 'utf8');
    const ext = path.extname(abs).toLowerCase();
    let records;

    if (ext === '.json') {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      const title = path.basename(abs, ext);
      records = [{
        title,
        abstract: text,
        source_type: 'file',
        facts: extractFacts(text, 'file')
      }];
    }

    return records.map((record) => this.ingestPublication(record, {
      source_type: 'file',
      source_path: abs
    }));
  }

  async ingestPubmedIds(pmids) {
    const articles = await fetchPubmed(pmids);

    return articles.map((article) => this.ingestPublication(article, { source_type: 'pubmed' }));
  }

  async ingestPubmedQuery(query, limit = 5) {
    const ids = await searchPubmed(query, limit);
    if (!ids.length) {
      return [];
    }

    return this.ingestPubmedIds(ids);
  }

  ingestSeed(seedPath) {
    const file = seedPath || path.join(__dirname, '..', 'data', 'seed', 'publications.json');

    return this.ingestFile(file);
  }
}

module.exports = {
  IngestAgent,
  extractFacts,
  includesQuote
};
