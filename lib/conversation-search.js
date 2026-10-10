const fs = require('fs');
const path = require('path');

const defaultCorpus = path.join(__dirname, '..', 'data', 'seed', 'conversations.json');

function loadCorpus(file = defaultCorpus) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));

  return Array.isArray(parsed) ? parsed : [];
}

function topicsOf(corpus) {
  const seen = [];
  (corpus || []).forEach((row) => {
    const topic = row && row.topic ? String(row.topic) : '';
    if (topic && !seen.includes(topic)) {
      seen.push(topic);
    }
  });

  return seen;
}

function searchConversationsPage(topic, options = {}) {
  const corpus = options.corpus || loadCorpus(options.file);
  const name = String(topic || '');
  const matches = corpus.filter((row) => row && row.topic === name);
  const retstart = Math.max(0, Number(options.retstart) || 0);
  const requested = Number(options.retmax);
  const retmax = Math.min(50, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : 20));

  return {
    count: matches.length,
    items: matches.slice(retstart, retstart + retmax)
  };
}

module.exports = {
  defaultCorpus,
  loadCorpus,
  topicsOf,
  searchConversationsPage
};
