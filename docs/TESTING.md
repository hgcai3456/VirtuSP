# Testing scope and current verification

Audit date: **2026-10-11, America/New_York**. Application HEAD: `662c6d154c19de4276548a28ccabd6c498ac0117`; pre-existing uncommitted application changes were present, so HEAD alone does not identify all tested bytes. Runtime: Node **v24.15.0**; package requires **>=22.17.0**. Commands were checked against `package.json`. Results are engineering verification, not clinical validation, educator agreement or proven learner outcomes.

## This audit's runs

| Command | Result | Evidence / limitation |
| --- | --- | --- |
| `npm test` in sandbox | 196 passed, 45 failed, 0 skipped, 241 total | Initial run had temporary-file rename permission errors; not treated as a passing run |
| `npm test` outside sandbox | **241 passed, 0 failed, 0 skipped**, 26.288 seconds | Log completed **07:55:45 EDT**; `reports/documentation-audit-test-unrestricted.log`; coverage 75.46% lines, 79.11% branches, 79.47% functions |
| `npm run test:integration` in sandbox | Failed loopback connection checks | `EACCES` on local test server connections |
| `npm run test:integration` outside sandbox | **5 passed, 0 failed, 0 skipped**, 2.404 seconds | Log completed **08:01:12 EDT**; AI/storage/voice settings disabled; `reports/documentation-audit-integration-unrestricted.log` |
| `npm run test:pact` outside sandbox | **3 passed, 0 failed, 0 skipped**, 10.761 seconds | Log completed **08:01:21 EDT**; sandbox loopback/consumer failure retried successfully; broker URL/token cleared; `reports/documentation-audit-pact-unrestricted.log` |
| `node agents/test-report.js` | Exit 0 | Produces the existing suite report from `reports/last-suite.json`; not another test run |

Logs/report artifacts are ignored local evidence and may not exist in a fresh clone. This checked-in summary preserves the result and its scope. No application source code was changed by this audit. Permission errors were retried outside the sandbox rather than hidden or counted as success.

## Suite map

| Area | Actual command / files | What it verifies and what it does not |
| --- | --- | --- |
| Unit and regression | `npm test`: `tests/*.test.js` | Engine, profiles, assessments, disclosure, safety, state and integration adapters; includes mocks, HTTP and jsdom checks, excludes nested Pact/Cucumber/integration and legacy `test/` |
| Grounding/safety | Included: `release-boundary`, `engine`, `profiles`, `safety`, `appointment-regression` tests | Strict approved lines, unknowns, injection examples, gates and immutable versions; not universal semantic assurance for natural mode |
| Browser/DOM | Included: `frontend`, `encounter-call-ui`, `avatar-view`, `generation-ui`, catalog/workflow tests | DOM controls and mocked workflow behavior; does not establish visual quality, real media or browser accessibility |
| Feedback | Included: `feedback`, `rubric`, `release-boundary` tests | Evidence references, applicability, separate objectives and unavailable-domain handling; no educator grading-accuracy study |
| Bias analysis | Included: `bias`, `group-access`, `insights` tests | Context ownership, citation checks, comparison constraints and heuristic performance gaps; no validated bias detector or causal demographic study |
| Voice/avatar | Included: `speech`, `avatar`, `avatar-view`, `encounter-media`, `talking-call` tests | Saved-turn routing, mocked providers, media lifecycle and fallbacks; live audio/lip synchronization unverified |
| Observability | Included: `observability`, `aws-cost` tests; standalone `npm run obs:test` | Sanitization, instrumentation and cost transformations; no newly verified CloudWatch deployment |
| Local stack integration | `npm run test:integration` | Five loopback API/database/report/conversation checks, not a public AWS test |
| Pact contracts | `npm run test:pact`: `tests/pact/*.test.js` | Consumer/provider interactions; credential-dependent import POST is excluded from replay; does not prove every possible API request is covered |
| Selenium/Cucumber regression | `npm run test:e2e`, `npm run test:regression -- --only e2e` | Separate browser scenarios require Chrome/driver; not run in this documentation audit |
| Appointment replay | `npm run test:appointment` | Separate runner for the synthetic visit; underlying appointment regression test passed inside `npm test`, runner not separately repeated |
| Legacy library tests | `node --test test/*.test.js` | Separate `test/` tree exists; not included in `npm test` and not run in this audit |
| Local evaluation | `npm run evaluate:local` | Separate fixture evaluation, not run here; older numbers remain historical |
| Live providers/cloud | Cloud evaluation, `test:live`, avatar `--live`, AWS deploy/verification | Not run; require credentials and may incur cost or mutate cloud/demo state |

`Jenkinsfile` defines unit, observability, appointment, integration, performance and browser stages; configured stages do not prove a current successful pipeline. `npm run test:live` contacts public hosting and must not be described as offline. `npm run perf:ci` uses JMeter/local plans; maximum thread configuration is not achieved production concurrency.

## Reproduce

Install dependencies with `npm ci --ignore-scripts`, then run `npm test` and the desired suite commands. Use synthetic, isolated data and disable model/storage integrations for offline work. For Pact leave `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN` empty to avoid publishing. For judging pin `DIALOGUE_MODE=strict`. Before a live demonstration, record exact commit plus dirty diff, profile/version, provider/model/mode, fallback counts, manual reviewer and rehearsal results.

Qualified faculty case/feedback review, an untouched held-out clinical/adversarial suite, real browser/media rehearsal, accessibility review and multi-task persistence validation remain required before stronger educational or deployment claims.
