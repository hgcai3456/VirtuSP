-- Relational copy of every patient profile and its artifacts.
-- agents/profile-archive.js upserts these rows and writes the same
-- documents and file bytes to the private S3 bucket.

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
  ON patient_profiles (profile_id, stage);

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
  ON patient_profile_artifacts (profile_id, stage, artifact_id);
