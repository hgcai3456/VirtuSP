# Root documentation guide

Reviewed October 11, 2026. These documents describe the application started by `npm start` in the repository root. `VirtuSP-upstream/` has separate documentation; its capabilities and historical reports are outside this runtime.

## Paths through the documentation

- Start/use: [project README](../README.md), [setup](SETUP.md), [demo](DEMO.md).
- Author content: [authoring](AUTHORING.md), [submission narrative](HACKATHON_SUBMISSION.md), [judging evidence](JUDGING_MATRIX.md).
- Maintain code: [architecture](ARCHITECTURE_CURRENT.md), [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [testing](TESTING.md), [handoff](HANDOFF.md).
- Operate: [operations/recovery](OPERATIONS.md), [deployment](DEPLOYMENT.md), [security](SECURITY.md), [status](STATUS.md).
- Historical evidence: [preflight archive](PREFLIGHT_REPORT.md), [superseded hosting preparation](DEPLOYMENT_PENDING.md).

## Evidence and maintenance rules

Source and executable tests define current behavior. Dated run records define what actually ran. Live deployment observation must include revision/time and distinguish health from workflow verification. A local test, script, infrastructure file, screenshot, and hosted service are different evidence.

Current documentation records optional S3 publication copies, no live generative dialogue, process-local attempts, and heuristic browser assessment. It does not certify clinical validity, production security, or highest rubric scores. Original rubric rules are not reproduced; confirm submission requirements independently.

When behavior changes, update the README and relevant guide/traceability/status, run appropriate tests, record exclusions, and mark superseded records historical rather than silently rewriting prior outcomes. Never print secrets or sensitive learner/patient content. Preserve the nested checkout and contributor changes.
