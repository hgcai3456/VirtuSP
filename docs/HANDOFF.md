# Root application handoff

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

Start with README, ARCHITECTURE_CURRENT, DEMO, SECURITY and PREFLIGHT_REPORT. Run npm test and npm start. Verify the header build identity, publish/check a synthetic case, then follow the documented typed sequence.

Published versions live in data/recovery/published-cases.json; keep this ignored recovery file backed up locally if authored cases matter. A corrupt recovery file produces an actionable startup failure rather than silently replacing published truth. Active attempts/replay ledgers are process-local. Keep the server running during judging; restart means starting a fresh attempt. Browser draft/cache data is not clinical authority.

The supported presentation claim is “Faculty-reviewed cases define patient responses; the same engine supports different cases.” The root demo does not currently use a model provider. Do not claim live AI, an animated avatar, clinical validation, autonomous competence assessment, zero hallucinations, replacement of standardized patients, or a tested production cloud architecture.

Submission follow-up: pre-existing staged local certificates and generated Terraform/deployment artifacts were inspected and excluded from Git without deleting local files. The verified root cleanup was committed separately from unrelated staged contributor changes; the final chat response records its SHA. The separate nested checkout was preserved. No push or cloud deployment was performed.
