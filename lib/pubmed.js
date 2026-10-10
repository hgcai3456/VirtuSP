const { Pace, sleep, defaultDelay } = require('./pace');

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'VirtuSP';
const EMAIL = process.env.NCBI_EMAIL || 'virtusp@localhost';
const API_KEY = process.env.NCBI_API_KEY || '';
const pace = new Pace(defaultDelay());

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function first(xml, tag) {
  const match = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));

  return match ? stripTags(match[1]) : '';
}

function all(xml, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi');
  let match;
  while ((match = re.exec(xml))) {
    out.push(match[0]);
  }

  return out;
}

function attr(xml, name) {
  const match = xml.match(new RegExp(name + '="([^"]+)"', 'i'));

  return match ? match[1] : '';
}

function parseArticle(xml) {
  const authors = all(xml, 'Author').map((block) => {
    const last = first(block, 'LastName');
    const fore = first(block, 'ForeName') || first(block, 'Initials');

    return [last, fore].filter(Boolean).join(' ');
  }).filter(Boolean);

  const abstracts = all(xml, 'AbstractText').map((block) => {
    const label = attr(block, 'Label');
    const text = stripTags(block);

    return label && text ? label + ': ' + text : text;
  }).filter(Boolean);

  const year = Number(first(xml, 'Year')) || null;
  const pmid = first(xml, 'PMID');
  const doi = first(xml, 'ELocationID') || '';

  return {
    pmid,
    doi,
    title: first(xml, 'ArticleTitle'),
    authors: authors.join(', '),
    journal_name: first(xml, 'Title') || first(xml, 'ISOAbbreviation'),
    year,
    volume: first(xml, 'Volume'),
    issue: first(xml, 'Issue'),
    pages: first(xml, 'MedlinePgn'),
    abstract: abstracts.join(' '),
    url: pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/' : '',
    source_type: 'pubmed'
  };
}

async function eutils(path, params) {
  const url = new URL(EUTILS + '/' + path);
  url.searchParams.set('tool', TOOL);
  url.searchParams.set('email', EMAIL);
  if (API_KEY) {
    url.searchParams.set('api_key', API_KEY);
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pace.wait();
    const res = await fetch(url, {
      headers: { 'User-Agent': TOOL + '/1.0 (' + EMAIL + ')' }
    });
    if (res.ok) {
      return res;
    }
    lastErr = new Error('PubMed ' + path + ' failed: ' + res.status);
    if (res.status !== 429 && res.status < 500) {
      throw lastErr;
    }
    await pace.backoff(attempt);
  }
  throw lastErr;
}

async function searchPubmedPage(query, options = {}) {
  const retmax = Math.min(Number(options.retmax) || 20, 200);
  const retstart = Number(options.retstart) || 0;
  const res = await eutils('esearch.fcgi', {
    db: 'pubmed',
    retmode: 'json',
    retmax,
    retstart,
    term: query,
    sort: options.sort || 'relevance'
  });
  const json = await res.json();
  const result = (json || {}).esearchresult || {};

  return {
    ids: (result.idlist || []).map(String),
    count: Number(result.count) || 0,
    retstart,
    retmax
  };
}

async function searchPubmed(query, limit = 5) {
  const page = await searchPubmedPage(query, { retmax: Math.min(Number(limit) || 5, 200) });

  return page.ids;
}

async function fetchPubmed(pmids) {
  const ids = [].concat(pmids).map(String).filter(Boolean);
  if (!ids.length) {
    return [];
  }

  const res = await eutils('efetch.fcgi', {
    db: 'pubmed',
    retmode: 'xml',
    id: ids.join(',')
  });
  const xml = await res.text();

  return all(xml, 'PubmedArticle').map(parseArticle).filter((row) => row.title);
}

module.exports = {
  searchPubmed,
  searchPubmedPage,
  fetchPubmed,
  pace,
  sleep
};
