# Root application architecture

Reviewed October 11, 2026. Scope: the root application started by `npm start`. The separate `VirtuSP-upstream/` checkout has its own implementation and documentation; its features and reports are not evidence for this runtime.

## Boundaries and responsibilities

The browser owns Studio drafts, display, optional speech, and formative assessment calculations. The Node service owns published versions, encounter truth, disclosure, turns, and recorded actions. It serves UI assets and JSON APIs from the same origin. No live generative dialogue or external TTS adapter is enabled. Browser recognition may use a vendor service.

- [server.js](../server.js): static files, build identity, basic probes, Host/origin checks, bounded JSON, and optional publication backup.
- [lib/api.js](../lib/api.js): validation, publication/version assignment, recovery-file writes, and process-local encounter registry.
- [lib/encounter.js](../lib/encounter.js): matching, trust/disclosure gates, chart release, transcript, events, review, and reconciliation.
- [lib/cases.js](../lib/cases.js): packaged synthetic definitions, served as `/js/cases.js` for authoring.
- [lib/virtusp-core.js](../lib/virtusp-core.js): matching helpers; browser-copy parity is tested.
- [lib/region-fence.js](../lib/region-fence.js): optional DynamoDB active-writer authority check; no shared attempt persistence.
- [lib/region-fence.js](../lib/region-fence.js): optional DynamoDB authority check, not shared attempt persistence.
- [lib/cloud-store.js](../lib/cloud-store.js): optional AWS SDK S3 publication-copy adapter.
- [public/js/app.js](../public/js/app.js): state projection, retries, Studio, and heuristic assessment.

## Publication and encounter flow

1. Browser draft → `POST /api/cases` → server structure/reference validation.
2. Assign the next case version, deep-freeze the object, write the publication collection to a temporary file, then rename into recovery storage.
3. Add the version to memory; optionally write a per-version local copy and S3 backup. Backup failure returns 503 **after** local publication, including the published profile.
4. `POST /api/encounters` selects published ID/version and creates a fresh snapshot, transcript, events, and replay ledger.
5. Turns supply question/request ID; client facts are not patient truth. The engine returns approved wording, authored deflection, or fixed unknown/conversational replies.
6. Chart/review/role/plan/handoff/reconciliation actions operate on the registered encounter. The browser renders state and calculates formative feedback with event links.

Identical canonical questions under the same per-attempt request ID replay the original turn result without a second turn. Changed questions return 409. The accompanying snapshot reflects current encounter state; replay does not guarantee identical response bytes. Publication and general actions lack this idempotency contract. [README API contract](../README.md#api-contract) documents routes and limits.

## State semantics

Release, opening, and explicit review are distinct. Opening Imaging does not release question-only artifacts. Labs can release through an authored question or opening the section. Section review requires an opened section with disclosed evidence; locked artifacts cannot be reviewed. Ineligible review attempts return unchanged state, not a distinct error. Review is acknowledgment, not understanding.

Intentional discrepancies retain patient and chart sources. Reconciliation credit uses authored keywords after a discrepancy surfaces; it is not semantic validation. SBAR coverage matches disclosed fact labels or eligible authored keywords. Browser objective/communication assessment is editable and not a grading authority. Interview-sequence heuristics include seed identifiers; broad educational generalization is unverified.

## Storage and failure model

Browser localStorage holds drafts/display cache; refresh returns to Studio. Published versions use `published-cases.json` in the configured directory. Startup validates recovery content and fails on invalid data. Temporary-file rename does not establish crash durability or concurrent-writer safety.

Encounters/replay live in one process and disappear on restart. Multiple processes can disagree on publications and lose attempts; shared EFS alone does not fix this. S3 writes publication copies with AES256 encryption; startup never reads S3. See [operations](OPERATIONS.md) for recovery and partial-publication handling.

## HTTP, identity, and deployment

API JSON uses `no-store`; static assets use `no-cache` for revalidation. `/api/live` and `/api/ready` precede Host/origin checks and expose build metadata; neither tests writable storage or S3. Readiness checks regional authority when fencing is configured; liveness bypasses it. Other API routes enforce localhost or configured Host values and reject a supplied mismatching Origin. Requests without Origin are accepted; this is not authentication.

Build identity combines a source SHA with selected-file hashes, not signed provenance or a complete content checksum. The [deployment pipeline](DEPLOYMENT.md) uses image digests and checks hosted SHA. Local/hosted revisions can differ; see [status](STATUS.md).

Full faculty definitions reach the browser. Disclosure is a teaching workflow, not confidentiality. Institutional use requires the controls and governance in [security](SECURITY.md).

## Optional regional authority fence

With `VIRTUSP_DR_TABLE` set, readiness and other non-liveness APIs read DynamoDB `control` consistently in `VIRTUSP_DR_CONTROL_REGION` (default us-west-2). The record must identify `AWS_REGION` as active and have `leaseExpires` more than five seconds ahead; missing/wrong/expired records or read errors produce 503. Reads have a three-second abort timeout and one SDK attempt. This checks access before dispatch but does not coordinate filesystem versions, recover encounters, renew authority, or establish regional failover. Without the table, checks are disabled. Mock fence tests do not establish live disaster recovery.

Unmapped `manual` objectives remain unassessed. Handoff state now retains submitted text alongside heuristic coverage counts; it is still process-local.
