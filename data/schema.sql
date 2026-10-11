-- Parallel ingest uses a second SQLite file (data/virtusp-2.sqlite)
-- with the same journals and medical_data tables. One writer per file.
-- agents/orchestrator.js keeps jobs that share a file in one lane.

CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pmid TEXT,
  doi TEXT,
  title TEXT NOT NULL,
  authors TEXT,
  journal_name TEXT,
  year INTEGER,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  abstract TEXT,
  url TEXT,
  source_type TEXT NOT NULL DEFAULT 'file',
  source_path TEXT,
  ingested_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_pmid
  ON journals(pmid) WHERE pmid IS NOT NULL AND pmid != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_doi
  ON journals(doi) WHERE doi IS NOT NULL AND doi != '';

CREATE TABLE IF NOT EXISTS medical_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL,
  claim TEXT NOT NULL,
  quote TEXT NOT NULL,
  topic TEXT,
  section TEXT,
  population TEXT,
  intervention TEXT,
  outcome TEXT,
  evidence_level TEXT,
  keywords TEXT,
  ingested_at TEXT NOT NULL,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medical_data_quote
  ON medical_data(journal_id, quote);

CREATE INDEX IF NOT EXISTS idx_medical_data_journal ON medical_data(journal_id);
CREATE INDEX IF NOT EXISTS idx_medical_data_topic ON medical_data(topic);
CREATE INDEX IF NOT EXISTS idx_journals_year ON journals(year);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  encounter_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploader_role TEXT,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  extracted_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_patient ON reports(patient_id, uploaded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_stored ON reports(stored_name);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT,
  setting TEXT,
  source_type TEXT NOT NULL DEFAULT 'corpus',
  source_path TEXT,
  ingested_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_source_key
  ON conversations(source_key);

CREATE INDEX IF NOT EXISTS idx_conversations_topic ON conversations(topic);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  move TEXT,
  ingested_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_turns_order
  ON conversation_turns(conversation_id, turn_index);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_speaker
  ON conversation_turns(speaker, move);

-- Profile documents and artifact bytes are also copied to S3 by
-- agents/profile-archive.js. These rows are the relational copy.
CREATE TABLE IF NOT EXISTS patient_profiles (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  version INTEGER,
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  s3_key TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_profiles_stage
  ON patient_profiles(profile_id, stage);

CREATE TABLE IF NOT EXISTS patient_profile_artifacts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  file_id TEXT,
  name TEXT,
  media_type TEXT,
  size_bytes INTEGER,
  s3_key TEXT,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_profile_artifacts_stage
  ON patient_profile_artifacts(profile_id, stage, artifact_id);
