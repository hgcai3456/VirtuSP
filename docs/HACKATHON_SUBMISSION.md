# VirtuSP hackathon submission narrative

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

## Problem and users

Healthcare learners need repeated interviewing/reasoning practice. Human standardized-patient sessions require participants, training, and scheduling. VirtuSP aims to complement faculty and human standardized patients with synthetic formative practice. Learning gains, costs, and institutional demand are unmeasured.

## Solution and distinction

Faculty defines reviewed facts, exact wording, chart sources, disclosure triggers, discrepancies, and objectives. Publication freezes a version; learners use one shared engine. Missing facts stay unknown instead of becoming generated findings. Patient/chart disagreement prompts follow-up and reconciliation.

Cases are reviewed data, not patient-specific deployments. New cases can use the application without new encounter code. Keyword routing is conservative, can miss valid wording, and is not live generative dialogue.

## Demonstration

[DEMO.md](DEMO.md): review/publish → interview → unknown topic → discrepancy → explicit chart review → reconciliation → assessment evidence → second case. New-case publication proves reuse. Typed input is the default; browser voice is optional. Show version/build identity.

## Engineering evidence

The Node API validates publication, preserves versions, owns attempts, enforces disclosure, and deduplicates canonical turns. Publications persist in a recovery collection; optional S3 copies use scoped keys and AES256 encryption. Attempts remain process-local. Browser assessment links to events but remains editable/heuristic and is not a grade authority.

[Testing](TESTING.md) records 37/37 locally passing tests with mock-cloud/UI-harness limits. [Deployment](DEPLOYMENT.md) describes GitHub/CodeBuild/ECS automation; [status](STATUS.md) records a hosted SHA differing from the local baseline. Health, full workflow, backup, and production readiness are separate evidence.

## Impact evaluation plan

Potential uses: preparation, remediation, communication practice, and debrief. Faculty remain responsible for cases and feedback interpretation. Before outcome claims, conduct a faculty-led pilot with reviewed cases, a suitable assessment instrument, defined outcomes, accessibility checks, consent/data governance, and comparison with the training baseline. Publish methods/limitations with results. No completed outcome study is established.

## Feasibility, costs, and priorities

Local typed use needs Node/browser after installation. Hosted compute, networking, storage, logs, and optional services can incur costs; per-student costs/savings are unverified. Additional cases reuse schema; concurrent processes require shared durable encounter/replay/publication coordination.

Priorities: identity/permissions, durable attempts, backup retry/recovery, browser/accessibility testing, operational verification, and educational validation. LMS, live generative dialogue, external TTS, animated avatars, HIPAA compliance, validated grading, and distributed scale are not established root capabilities.

## Submission boundaries

[Judging evidence](JUDGING_MATRIX.md) maps all five recorded categories. Original rules, weights, pitch/video requirements, and eligibility still need confirmation. Do not borrow nested features/counts or treat historical deployment as verification of current source.
