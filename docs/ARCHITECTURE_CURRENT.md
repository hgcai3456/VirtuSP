# Actual root runtime

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

Browser public/js/app.js sendQuestion/ask
→ POST /api/encounters/:id/turns with question and requestId
→ server.js origin/host/body checks
→ lib/api.js existing server attempt lookup (client facts ignored)
→ lib/encounter.js request ledger and keyword selection
→ provider/model: none; deterministic published wording
→ disclosure/trust checks, exact wording or approved deflection/unknown/conversation
→ saved patient turn in server state, event recording, deterministic artifact release
→ JSON snapshot back to browser
→ optional browser speech synthesis and static synthetic illustration
→ transcript/chart projection
→ public/js/app.js grade/vRep over recorded state, event links, faculty-review caveat.

Publication: browser draft → POST /api/cases → schema/reference validation → new immutable version → atomic recovery-file write. Start: POST /api/encounters with caseId/version → snapshot of the server-owned version. State-changing chart, review, role, plan, handoff and reconciliation actions use POST /api/encounters/:id/actions.

## Competing and historical paths

- Browser clinical ask/disclosure implementations were removed. The normal UI cannot call an alternate browser dialogue engine.
- lib/cases.js is the single packaged schema/data definition, served as /js/cases.js for faculty authoring. Drafts are editable copies. A publication never trusts an encounter-turn payload as patient truth.
- lib/virtusp-core.js contains matching helpers used by the server. public/js/virtusp-core.js is an identical browser bundle; the parity test prevents drift. It does not execute encounters.
- The localStorage cache holds drafts and display snapshots; it is not restored as clinical authority. Refresh starts at Studio.
- Server validate is authoritative; the Studio has an earlier advisory validation pass. Publication can still reject a draft which passed the advisory pass.
- VirtuSP-upstream is a separate checkout; root scripts import nothing from it. Its engines/providers/tests are outside this runtime and were not deleted.
- No external dialogue, TTS, animated avatar, AWS adapter, duplicate health endpoint or LMS integration is active in root code.

## States and limitations

Artifact release does not establish that a section was opened. Opening question-only Imaging does not release records. Explicit section review requires that section to have been opened and contain released chart evidence. Locked artifacts cannot be reviewed. Review remains self-reported acknowledgment, not comprehension.

Lab and imaging display text comes from the published chart fact labels, not from newly generated content. Intentional discrepancies remain two distinct sources. Reconciliation and empathy/SBAR feedback are simple rule/keyword heuristics for faculty review, not validated clinical assessment.

Published versions persist on disk. Attempt snapshots and replay ledgers live in one server process; multiple replicas require shared durable state and atomic idempotency. The local teaching UI receives full faculty case definitions, so disclosure is not an access-control barrier.
