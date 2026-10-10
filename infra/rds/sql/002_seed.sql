-- DML for data/seed/publications.json.
-- Idempotent: a row is inserted only when that PMID or quote is not already present.
-- keywords follow lib/ingest-agent.js TOPIC_WORDS matching.

INSERT INTO journals (
  pmid, doi, title, authors, journal_name, year, volume, issue, pages,
  abstract, url, source_type, source_path, ingested_at
)
SELECT
  '11942998',
  '10.1046/j.1464-5491.2002.00692.x',
  'Adherence to prescribed oral hypoglycaemic medication in a population of patients with Type 2 diabetes: a retrospective cohort study',
  'Donnan PT, MacDonald TM, Morris AD',
  'Diabetic Medicine',
  2002,
  '19',
  '4',
  '279-284',
  $abs$Faculty synopsis citing Donnan et al., Diabetic Medicine, 2002 (PMID 11942998): This retrospective cohort study examined adherence to prescribed oral hypoglycaemic medication in people with type 2 diabetes. The paper is used in VirtuSP as ground truth that missed doses and incomplete refill histories are clinically documented problems, not inventions of the dialogue model.$abs$,
  'https://pubmed.ncbi.nlm.nih.gov/11942998/',
  'seed',
  NULL,
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM journals WHERE pmid = '11942998');

INSERT INTO medical_data (
  journal_id, claim, quote, topic, section, population, intervention,
  outcome, evidence_level, keywords, ingested_at
)
SELECT
  j.id,
  'Adherence to prescribed oral hypoglycaemic medication in type 2 diabetes has been studied in a population cohort and is a documented clinical problem.',
  'This retrospective cohort study examined adherence to prescribed oral hypoglycaemic medication in people with type 2 diabetes.',
  'diabetes;adherence;oral hypoglycaemic',
  'synopsis',
  'people with type 2 diabetes',
  'oral hypoglycaemic medication',
  'medication adherence',
  'cohort study',
  'diabetes;adherence;hypoglycaemic',
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM journals j
WHERE j.pmid = '11942998'
  AND NOT EXISTS (
    SELECT 1 FROM medical_data m
    WHERE m.journal_id = j.id
      AND m.quote = 'This retrospective cohort study examined adherence to prescribed oral hypoglycaemic medication in people with type 2 diabetes.'
  );

INSERT INTO journals (
  pmid, doi, title, authors, journal_name, year, volume, issue, pages,
  abstract, url, source_type, source_path, ingested_at
)
SELECT
  '27987248',
  '10.1111/dom.12854',
  'Understanding and overcoming metformin gastrointestinal intolerance',
  'Bonnet F, Scheen A',
  'Diabetes, Obesity and Metabolism',
  2017,
  '19',
  '4',
  '473-481',
  $abs$Faculty synopsis citing Bonnet and Scheen, Diabetes Obesity and Metabolism, 2017 (PMID 27987248): This review discusses gastrointestinal intolerance as a common reason patients stop or skip metformin. VirtuSP uses it as ground truth for Denise's evening-dose stomach upset, which must come from an approved source rather than a generated symptom.$abs$,
  'https://pubmed.ncbi.nlm.nih.gov/27987248/',
  'seed',
  NULL,
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM journals WHERE pmid = '27987248');

INSERT INTO medical_data (
  journal_id, claim, quote, topic, section, population, intervention,
  outcome, evidence_level, keywords, ingested_at
)
SELECT
  j.id,
  'Gastrointestinal intolerance is a documented reason patients discontinue or skip metformin.',
  'This review discusses gastrointestinal intolerance as a common reason patients stop or skip metformin.',
  'diabetes;metformin;gastrointestinal',
  'synopsis',
  'patients taking metformin',
  'metformin',
  'gastrointestinal intolerance and missed doses',
  'review',
  'metformin;gastrointestinal',
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM journals j
WHERE j.pmid = '27987248'
  AND NOT EXISTS (
    SELECT 1 FROM medical_data m
    WHERE m.journal_id = j.id
      AND m.quote = 'This review discusses gastrointestinal intolerance as a common reason patients stop or skip metformin.'
  );

INSERT INTO journals (
  pmid, doi, title, authors, journal_name, year, volume, issue, pages,
  abstract, url, source_type, source_path, ingested_at
)
SELECT
  '27060726',
  '10.1016/j.chest.2016.03.041',
  'Systematic Review of Errors in Inhaler Use: Has Patient Technique Improved Over Time?',
  'Sanchis J, Gich I, Pedersen S',
  'Chest',
  2016,
  '150',
  '2',
  '394-406',
  $abs$Faculty synopsis citing Sanchis, Gich, and Pedersen, Chest, 2016 (PMID 27060726): This systematic review found that errors in inhaler technique are common and affect drug delivery. VirtuSP uses it as ground truth for Marcus's shallow puff and unused spacer, which are teaching facts drawn from published evidence rather than model improvisation.$abs$,
  'https://pubmed.ncbi.nlm.nih.gov/27060726/',
  'seed',
  NULL,
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM journals WHERE pmid = '27060726');

INSERT INTO medical_data (
  journal_id, claim, quote, topic, section, population, intervention,
  outcome, evidence_level, keywords, ingested_at
)
SELECT
  j.id,
  'Errors in inhaler technique are common and have consequences for drug delivery.',
  'This systematic review found that errors in inhaler technique are common and affect drug delivery.',
  'COPD;inhaler technique;drug delivery',
  'synopsis',
  'patients using inhalers',
  'inhaled therapy technique',
  'errors affecting drug delivery',
  'systematic review',
  'inhaler;technique',
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM journals j
WHERE j.pmid = '27060726'
  AND NOT EXISTS (
    SELECT 1 FROM medical_data m
    WHERE m.journal_id = j.id
      AND m.quote = 'This systematic review found that errors in inhaler technique are common and affect drug delivery.'
  );

INSERT INTO journals (
  pmid, doi, title, authors, journal_name, year, volume, issue, pages,
  abstract, url, source_type, source_path, ingested_at
)
SELECT
  '15710956',
  '10.7326/0003-4819-142-4-200502150-00005',
  'The effects of a smoking cessation intervention on 14.5-year mortality: a randomized clinical trial',
  'Anthonisen NR, Skeans MA, Wise RA, Manfreda J, Kanner RE, Connett JE',
  'Annals of Internal Medicine',
  2005,
  '142',
  '4',
  '233-239',
  $abs$Faculty synopsis citing Anthonisen et al., Annals of Internal Medicine, 2005 (PMID 15710956): This randomized trial followed a smoking cessation intervention and reported mortality outcomes. VirtuSP uses the citation as ground truth that continued smoking is a clinically important, evidence-linked topic when a COPD case conceals current use.$abs$,
  'https://pubmed.ncbi.nlm.nih.gov/15710956/',
  'seed',
  NULL,
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM journals WHERE pmid = '15710956');

INSERT INTO medical_data (
  journal_id, claim, quote, topic, section, population, intervention,
  outcome, evidence_level, keywords, ingested_at
)
SELECT
  j.id,
  'Smoking cessation in people with airway disease is an evidence-linked clinical intervention with published mortality outcomes.',
  'This randomized trial followed a smoking cessation intervention and reported mortality outcomes.',
  'COPD;smoking cessation;mortality',
  'synopsis',
  'people who smoke, including those with airway disease',
  'smoking cessation intervention',
  'mortality',
  'randomized clinical trial',
  'smoking;cessation;mortality',
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM journals j
WHERE j.pmid = '15710956'
  AND NOT EXISTS (
    SELECT 1 FROM medical_data m
    WHERE m.journal_id = j.id
      AND m.quote = 'This randomized trial followed a smoking cessation intervention and reported mortality outcomes.'
  );
