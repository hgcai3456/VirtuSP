# Hackathon judging evidence

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

The categories below are attributed to the supplied Rutgers Health Hackathon rubric by the [nested rubric record](../VirtuSP-upstream/docs/JUDGING_MATRIX.md). Original text, weights, eligibility, and full submission requirements are unavailable here. Confirm them before claiming full compliance. No numeric score is awarded.

## Innovation & Creativity

Evidence: faculty-owned exact wording, unknown preservation, immutable cases, disclosure, patient/chart discrepancies, and event-linked feedback. [Engine](../lib/encounter.js), [authoring](AUTHORING.md), and [UI tests](../tests/ui.test.js).

Demo: publish a new synthetic case and interview it without changing code. Limit: conservative routing; differentiation/educational benefit unmeasured.

## Technical Implementation

Evidence: server encounter engine, schema/version checks, publication recovery, replay/conflict, optional S3 adapter, probes, and deployment automation. [Architecture](ARCHITECTURE_CURRENT.md), [testing](TESTING.md), and [deployment](DEPLOYMENT.md) distinguish code from execution evidence.

Demo: frozen version, unknown reply, CT boundary, review/evidence links. Limit: no auth, durable attempts, shared replay, trusted grading, or production load verification. Mock S3 does not prove backup.

## Healthcare Impact

Evidence: repeatable interviewing, authored objectives, discrepancy follow-up, and learner notes for formative debrief. [Submission](HACKATHON_SUBMISSION.md).

Demo: compare patient/chart claims and explain next-attempt coaching. Limit: no measured learning gains, validated competence instrument, clinical validation, or proven savings; a faculty-led pilot is needed.

## Presentation & Demonstration

Evidence: build identity, Studio/check/publish/start flow, typed fallback, and [timed demo](DEMO.md).

Demo: one encounter/debrief plus another case. Limit: real-browser automation, audio rehearsal, pitch/video completion, and original deliverable compliance are separate checks. Confirm hosted revision; health alone is insufficient.

## Feasibility & Scalability

Evidence: cases reuse schema/engine; default typed operation needs no external provider; optional backups and deployment scripts provide an operational path.

Demo: new case without patient-specific code. Limit: process-local attempts, uncoordinated writers, missing identity/governance, and unverified load capacity. One-task operation is a constraint, not horizontal scale. [Status](STATUS.md).

## Readiness decision

Evidence addresses all five recorded categories with explicit gaps; it does not establish the highest possible score. If live AI, institutional integration, or specific hosted/pitch artifacts are mandatory, verify those for the chosen build. Follow the [release checklist](../README.md#contributing-and-release-checklist); do not import nested-checkout features or counts.
