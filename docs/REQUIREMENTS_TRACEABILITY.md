# Root requirements and evidence

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

This maps implemented behavior to source and executable evidence, not a certification of the original rubric. [Judging evidence](JUDGING_MATRIX.md) covers recorded categories; [testing](TESTING.md) records actual results.

## Implemented requirements

- **Author/review/publish reusable cases:** [cases](../lib/cases.js), [API](../lib/api.js), [UI](../public/js/app.js). UI tests cover edited and newly authored chief complaints. Validation checks structure, not clinical accuracy.
- **Immutable case versions:** API/encounter snapshots; integration and persistence tests cover draft-change isolation, repeated attempts, and reload of old/new publications.
- **Grounded wording/unknowns:** [engine](../lib/encounter.js), [helpers](../lib/virtusp-core.js); HTTP tests cover four unknown/injection questions, compound greeting, confirmation, negation/numeric roles. No universal semantic/zero-error guarantee.
- **Safe chart disclosure:** helper/disclosure and integration tests cover CT token boundaries, explicit triggers, and Imaging locking. Labs can release on opening.
- **Release/open/review separation:** integration tests and UI assessment test; acknowledgment does not demonstrate comprehension. Invalid review prerequisites currently leave state unchanged.
- **Turn idempotency:** concurrent duplicate/conflict HTTP test; UI retained-input/retry-ID test. General actions/publication lack equivalent guarantees.
- **Optional regional authority:** [fence](../lib/region-fence.js) and [mock tests](../tests/region-fence.test.js) cover disabled mode, consistent reads, wrong/missing/expired authority, and read failure. No live failover/shared state is established.
- **Objective mapping:** UI tests cover objective order independence and custom/unavailable objectives staying unassessed until mapped; `manual` is a validated type.
- **Recorded team state:** API role/plan/handoff and UI persistence-across-turn test. Handoff label matching is implemented; the present UI test does not exhaustively validate every label/keyword scoring case.
- **Evidence-linked feedback:** browser assessment and UI event-link test; editable heuristics require faculty interpretation.
- **Typed fallback:** absent speech/microphone UI harness test. Live permission/audio quality needs manual rehearsal.
- **Optional S3 publication copies:** [adapter](../lib/cloud-store.js), cloud tests for scoped keys/encryption/exact payload and failure propagation. Mocked tests do not prove live S3 or HTTP partial-failure recovery.
- **Basic health/host controls:** server and HTTP probe/configured-host/origin/traversal tests. Probes do not verify dependencies.
- **Hosted pipeline:** [workflow](../.github/workflows/deploy.yml), [buildspec](../buildspec.yml), [deployment script](../scripts/deploy-ecs.sh). Source inspection and dated public probe are distinct from running CI or auditing live AWS; [deployment](DEPLOYMENT.md).

## Unimplemented or unverified requirements

No auth/role enforcement, durable attempts/shared replay, backup-only retry API, real-browser automated suite, LMS integration, live generative dialogue, external TTS, animated avatar, clinical validation, trusted grades, or demonstrated horizontal scale. A pediatric case retains authored objectives; no automatic specialty rubric exists.

## Evidence exclusions

Nested tests/reports and historical e2e HTML/JSON are not root executable verification. [Preflight](PREFLIGHT_REPORT.md) is an earlier snapshot; current results are in [testing](TESTING.md). No fresh secret audit, load benchmark, coverage instrumentation, hosted end-to-end workflow, or microphone test was performed in this documentation review.
