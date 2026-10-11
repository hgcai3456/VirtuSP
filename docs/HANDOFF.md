# Engineering handoff

Reviewed October 11, 2026. Scope: the root application started by `npm start`. The separate `VirtuSP-upstream/` checkout has its own implementation and documentation; its features and reports are not evidence for this runtime.

## Start here

Read [README](../README.md), [status](STATUS.md), [architecture](ARCHITECTURE_CURRENT.md), [setup](SETUP.md), [testing](TESTING.md), and [operations](OPERATIONS.md). Use Node 24; run `npm ci`, `npm test`, then `npm start`. Open `/app.html`. The application does not load `.env` files.

Verify header revision/fingerprint and select the intended local/hosted build. The observed hosted revision in [status](STATUS.md) differs from the local baseline. Local tests do not prove deployment.

## Invariants to preserve

- Server publications and frozen versions govern responses; client facts are not clinical authority.
- Missing facts stay unknown; patient/chart sources remain distinct.
- Release, opening, and review remain separate; review is acknowledgment, not comprehension.
- Turn IDs deduplicate canonical questions and reject changed questions; general actions/publication are not equally retry-safe.
- Browser assessment is heuristic and not a trusted grade.
- New cases reuse the engine; helper parity remains tested.

## Data and incident handoff

Published versions live in configured recovery storage; attempts/replay live in memory. Restart/deploy requires fresh visits. Browser cache cannot restore an authoritative attempt. Follow [operations](OPERATIONS.md) for backup, corrupt recovery data, and partial publication.

S3 failure can return 503 after publication. Inspect `/api/cases` and returned profile before retrying; no backup-only endpoint exists. Do not reset recovery files or overwrite EFS data to make a demo clean.

## Release and ownership

[Deployment](DEPLOYMENT.md) covers GitHub-main automation, source checks, logs, and rollback. A push to main can deploy; review documentation before that step. This documentation review performs no push/deployment.

Historical cleanup records describe exclusion of 14 certificate/generated infrastructure artifacts with local files preserved. This is not a current full secret audit. Preserve contributor changes/staging and inspect intended release contents. Exclude secrets, private records, Terraform state, and generated environments.

Owners must designate a maintainer, private reporting channel, distribution/asset rights, and operational accountability. Immediate priorities: access control, durable attempts, backup retry/recovery, browser/accessibility verification, and a faculty-led validation pilot.

## Presentation claims

Supported: reviewed cases define responses; different cases share one engine; unknown preservation; deterministic chart release; event-linked formative feedback; optional S3 copies and a deployment pipeline with bounded verification.

Unsupported: live generative dialogue, animated avatar playback, validated competence, zero hallucinations, measured learning gains, HIPAA compliance, distributed correctness, or replacement of educators/human standardized patients.
