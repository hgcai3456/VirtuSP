#!/usr/bin/env node
const path = require('path');
const { openDb, counts, shardPath } = require('../lib/db');
const { IngestAgent } = require('../lib/ingest-agent');
const { ingestNih, ingestStatusAll, loadIllnesses } = require('../lib/nih-ingest');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) {
    return fallback;
  }

  return process.argv[i + 1];
}

function has(name) {
  return process.argv.includes(name);
}

async function main() {
  const shard = Number(arg('--shard') || 0);
  const shards = Number(arg('--shards') || 1);
  const db = openDb(shardPath(shard));
  const agent = new IngestAgent(db);
  let results = [];

  if (has('--nih') || has('--all-illnesses')) {
    const perIllness = has('--all') ? 0 : Number(arg('--per-illness') || 200);
    const delay = Number(arg('--delay') || (shards > 1 ? 800 : 400));
    const assigned = Math.ceil(loadIllnesses().length / shards);
    const state = await ingestNih(agent, {
      resume: has('--resume'),
      perIllness,
      chunk: Number(arg('--chunk') || 20),
      delay,
      shard,
      shards,
      onProgress: (progress, illness, page) => {
        console.log(
          'shard ' + shard + '/' + shards
          + ' [' + (progress.illness_index + 1) + '/' + assigned + '] '
          + illness.name
          + ' +' + page.ids.length
          + ' papers (illness ' + progress.retstart + '/' + (progress.per_illness || page.count)
          + ', pubmed ' + page.count + ')'
          + ' journals=' + (progress.library && progress.library.journals)
        );
      }
    });
    console.log('');
    console.log('NIH ingest ' + state.status + ' · papers=' + state.papers + ' facts=' + state.facts + ' errors=' + state.errors);
    const n = counts(db);
    console.log('journals=' + n.journals + ' medical_data=' + n.medical_data);
    db.close();
    return;
  }

  if (has('--status')) {
    console.log(JSON.stringify(ingestStatusAll(shards > 1 ? shards : 2), null, 2));
    db.close();
    return;
  }

  if (has('--seed')) {
    results = agent.ingestSeed();
  } else if (has('--file')) {
    results = agent.ingestFile(arg('--file'));
  } else if (has('--pubmed')) {
    results = await agent.ingestPubmedIds([arg('--pubmed')]);
  } else if (has('--query')) {
    results = await agent.ingestPubmedQuery(arg('--query'), arg('--limit') || 5);
  } else {
    console.log('VirtuSP ingest agent — store only facts grounded in source text');
    console.log('');
    console.log('  node agents/ingest.js --seed');
    console.log('  node agents/ingest.js --file data/seed/publications.json');
    console.log('  node agents/ingest.js --pubmed 11942998');
    console.log('  node agents/ingest.js --query "metformin adherence" --limit 5');
    console.log('  node agents/ingest.js --nih --shards 2 --shard 0 --chunk 20 --delay 800 --per-illness 200');
    console.log('  node agents/ingest.js --nih --shards 2 --shard 1 --chunk 20 --delay 800 --per-illness 200');
    console.log('  node agents/ingest.js --nih --all --resume --shards 2 --shard 0');
    console.log('  node agents/ingest.js --status');
    db.close();
    process.exit(0);
  }

  results.forEach((row) => {
    console.log(
      (row.facts_added ? 'added ' + row.facts_added : 'no new facts')
      + ' · ' + row.title
      + (row.pmid ? ' (PMID ' + row.pmid + ')' : '')
    );
    (row.skipped || []).forEach((reason) => console.log('  skipped: ' + reason));
  });

  const n = counts(db);
  console.log('');
  console.log('journals=' + n.journals + ' medical_data=' + n.medical_data);
  console.log('db ' + path.resolve(process.env.VIRTUSP_DB || require('../lib/db').defaultDbPath));
  db.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
