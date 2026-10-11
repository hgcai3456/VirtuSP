# Documentation audit and change report

Date: 2026-10-11 (America/New_York). Requested role: software architecture, healthcare technology and hackathon review. Criteria authority: the user's pasted five judging criteria and Challenge 1 requirements. No independent official challenge PDF was obtained. App repository: `https://github.com/nathans3/VirtuSP`, local checkout `VirtuSP-upstream`, HEAD `662c6d154c19de4276548a28ccabd6c498ac0117` plus pre-existing uncommitted work. Root workspace HEAD `a5faf8d127409619e467b97d6405ab1675549515` is a different lightweight prototype.

## A. Files reviewed

Documentation inventory: app `README.md`, every Markdown document under `docs/` (including the observability runbook), `infra/aws/README.md`, `infra/rds` setup, plus root README and root judge documents. Existing judge material at the root applies to the smaller implementation; it was not copied as evidence of the full application. Documentation inspection used content/claim and Markdown-link scans, with detailed reads of architecture, demo, evaluation, release readiness, observability, authoring, bias, avatar, setup, status, corpus, objective workflow and historical audits.

Code/configuration evidence inspected: `package.json`, `server.js`, `Dockerfile`, `docker-entrypoint.sh`, `Jenkinsfile`; `public/app.html`, `public/js/app.js`; `lib/engine.js`, `profiles.js`, `store.js`, `db.js`, `profile-archive.js`, `cloud.js`, `speech.js`, bias/avatar/assessment/feedback/security modules; Terraform edge, ALB, ECS, security, EFS, RDS, S3, autoscaling and monitoring/cost configuration. Test/agent/script inventory includes `tests/`, legacy `test/`, `agents/` reporters and runners, `scripts/` setup/evaluation/smoke/observability and contract/browser configurations. Inspection was targeted tracing and scans, not a formal exhaustive security review of every source line. Terraform state, private keys, `.env` values and databases were not reproduced in documentation.

## B. Files changed

- App `README.md`: product-first positioning, prominent links/new-patient proof, strict mode, storage/integration roles and limits.
- `docs/ARCHITECTURE.md`: plain-language layers, actual AWS request path, JSON/SQLite/PostgreSQL boundaries, distributed-state caveats and natural-mode exception.
- `docs/DEMO.md`: new-patient four-minute sequence and truthful unavailable-assessment handling.
- `docs/SETUP.md`: optional speech state and stale automatic-listening/three-second claim removed.
- `infra/aws/README.md`: configuration versus current deployment, archive versus authoritative store, strict/natural AI behavior.
- `docs/STATUS.md`, `RELEASE_READINESS.md`, `EVALUATION.md`, `OBSERVABILITY.md`, `BENCHMARKS.md`, `requirements-audit.md`, `judge-demo-checklist.md`: dated evidence and current-scope annotations.
- `docs/AVATAR_SETUP.md`: correct application directory rather than the separate root prototype.
- `docs/BIAS-INTEGRATION.md`: separate longitudinal performance-gap heuristics from rubric analysis and state their inference/confounding limits.
- `docs/HANDOFF.md`: tested documentation checkpoint.
- Root `README.md`: prominent pointer identifying the separate app checkout; root judge-document scope notes identify the prototype.

## C. Files added

- `docs/HACKATHON_SUBMISSION.md`: the requested 25 sections, concise and ordered.
- `docs/REQUIREMENTS_TRACEABILITY.md`: every supplied base capability, evidence/demo step and scoped status.
- `docs/JUDGING_MATRIX.md`: evidence for the five criteria, without self-assigned numeric ratings.
- `docs/TESTING.md`: commands, test scope, current counts, coverage, exclusions and blocked/retried checks.
- This report. Local ignored verification logs and inventory reports support the review; they are not submission assets.

## D–E. Gaps and fixes

| Gap / contradiction | Correction |
| --- | --- |
| Root prototype was mistaken for the fuller application; “AWS/Bedrock absent” conflicted with app code | Explicit checkout scope and pointers; judge docs authored inside app repository |
| Fresh-patient proof buried in technical material | Prominent README statement, submission section 8 and timed demo |
| Universal exact-wording/hidden-fact claims ignored natural dialogue | Strict mode required for judging; generated-prose/guarded-truth exception documented |
| SQLite described as all persistence; RDS confused with encounter truth | JSON manifest, ground-truth SQLite and PostgreSQL/S3 archive roles traced separately |
| Additional Fargate tasks presented without state/session caveats | Process-local state/session and shared-write limits stated; no claimed production concurrency |
| Historical local-only hosting/model/test counts looked current | Historical annotations and one current testing record |
| Demo promised denominator despite unavailable assessment | Conditional score/denominator; local domains unassessed, no invented total |
| Speech setup contradicted incoming-call workflow | Capture after Answer, browser-dependent timing, text fallback and live rehearsal requirement |
| Voice/avatar implementation conflated with observed live quality | ElevenLabs adapter, portrait fallback and mock-only LiveAvatar limits separated |
| No consolidated judge requirement/scoring path in app checkout | Submission, traceability and judging matrix linked from README |
| Healthcare/business claims needed limits | Complementary formative use, no measured gains/savings or clinical validation |
| Canvas/export confusion | Explicit future identity/assignment/grade-return path; no completed integration |
| Cost dashboards could imply exact current operating costs | Daily/24 estimate and service-attribution limits; no unverified dollar figures adopted |

Documentation does not implement missing product requirements. It makes existing behavior demonstrable and distinguishes it from unfinished institutional work.

## F. Remaining limitations

Faculty clinical/assessment validation, verified identity, privacy/retention governance, accessibility/security review, distributed state correctness, live media quality and an independently observed current deployment remain outstanding. OCR/image interpretation, Canvas launch/grade synchronization and validated high-stakes grading are absent. No new physical-browser rehearsal or finished pitch recording was produced. Optional natural dialogue needs separate safety work/evaluation. Original research/pitch drafts remain labeled drafts, not current billing or outcome evidence.

## G. Commands and results

`npm test`: initial sandbox 196/241 passed, 45 failed with permission errors; unrestricted retry **241 passed, 0 failed, 0 skipped**, 26.288 seconds. Coverage: 75.46% lines, 79.11% branches, 79.47% functions. `npm run test:integration`: sandbox loopback EACCES; unrestricted retry **5 passed, 0 failed**, 2.404 seconds. `node agents/test-report.js`: exit 0. Local Pact result and link verification are recorded in the final checkpoint below. Full scope/exclusions: [TESTING.md](TESTING.md).

The GitHub URL was readable via web lookup. CloudFront app/health fetches were inaccessible through that tool; this does not establish the service is down. No cloud apply, provider smoke, broker publication, deployment, commit or push was performed. Current remote content may differ from this dirty checkout.

Final checkpoint: local Pact unrestricted retry **3 passed, 0 failed, 0 skipped**, 10.761 seconds. All **37** application Markdown documents in README/docs/infra were scanned for relative file links: **0 broken targets**. `git diff --check` passed for the modified tracked documentation. The new judge path was re-read for command accuracy, mode boundaries, future labels and unsupported claims; no credential values were added. `reports/documentation-audit-links.json` records the exact documentation inventory. Public URL availability is not guaranteed by a Markdown link check.

## H. Claims intentionally not made

HIPAA compliance; clinical validation; zero hallucinations; elimination of bias; measured learning improvement; validated grading accuracy; production readiness; millions of simultaneous students; completed Canvas integration; verified live lip synchronization; exact current project/per-student costs; all tests in every suite passed; current deployment matches HEAD. Each lacks sufficient evidence.
