# VirtuSP

**Faculty defines the patient. Learners practice the encounter.** VirtuSP is a virtual standardized-patient prototype for repeatable, formative healthcare interviewing practice with synthetic cases. Faculty review exact patient wording, publish an immutable case version, and learners interview that version, investigate patient/chart discrepancies, and inspect feedback linked to recorded actions.

The intended benefit is additional practice alongside faculty and human standardized patients. Learning gains, cost savings, clinical validity, and suitability for high-stakes grading have not been measured.

**Scope:** this README describes the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout. Its integrations, infrastructure, documentation, and historical test counts do not establish capabilities of this application.

## Contents

- [Quick start](#quick-start)
- [Judge and learner walkthrough](#judge-and-learner-walkthrough)
- [Hackathon rubric alignment](#hackathon-rubric-alignment)
- [Implemented behavior and limits](#implemented-behavior-and-limits)
- [Architecture and repository map](#architecture-and-repository-map)
- [Configuration](#configuration)
- [API contract](#api-contract)
- [Persistence and recovery](#persistence-and-recovery)
- [Verification](#verification)
- [Security and deployment](#security-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing and release checklist](#contributing-and-release-checklist)
- [Documentation, ownership, and licensing](#documentation-ownership-and-licensing)

The [documentation guide](docs/README.md) links setup, authoring, testing, operations, deployment, and historical evidence.

## Quick start

Use **Node.js 24**, npm, and a browser with JavaScript and localStorage enabled. This checkout was tested with Node 24.15.0 and npm 11.13.0. Although `package.json` declares Node `>=18`, locked AWS SDK dependencies require Node `>=20`; Node 18 is not a supported setup for the current dependency tree. Git is optional at runtime and supplies the revision when available.

Run these commands from the repository root:

```sh
npm ci
npm test
npm start
```

Open [the simulator](http://127.0.0.1:3000/app.html). The landing page is at [localhost](http://127.0.0.1:3000/). Stop the server with Ctrl+C.

`npm ci` installs locked dependencies, including `@aws-sdk/client-s3` and `@aws-sdk/client-dynamodb`, and normally needs package-registry access. The default typed encounter requires no model provider, AWS credentials, microphone, or cloud service. Leave `PROFILE_S3_BUCKET` and `VIRTUSP_DR_TABLE` unset for this mode. The application does **not** load `.env` files; configure variables in the launching process.

The server defaults to `127.0.0.1:3000`. The header displays application version, Git revision plus a runtime-source fingerprint, environment, and response mode. Uncommitted changes affect the fingerprint but do not change the Git revision. The fingerprint covers selected runtime files, not every repository asset or a signed release.

## Judge and learner walkthrough

The [four-minute demo](docs/DEMO.md) provides the rehearsed sequence. A short proof of the core workflow is:

1. Open Patient Studio, select Denise, review/edit exact approved wording and chart sources, click **Check**, then **Publish**. Wait for the published version to update before starting.
2. Start a visit. Ask “Hello Denise, how can I help you today?” and compare the reply with the approved chief complaint. The attempt uses a frozen published version.
3. Ask “Do you smoke?” to demonstrate an unspecified topic remaining unknown.
4. Ask about metformin use, then open Notes to compare the patient claim with the pharmacy record. Open Labs, then explicitly record review of the section.
5. Open Imaging to show that opening alone does not release question-only reports. Ask “Can I see the CT?” to release the authored CT findings.
6. Ask empathically about missed doses, record a reconciliation note, then open Assessment and follow the evidence-event links.
7. Start a new visit with Marcus to demonstrate another case through the same engine. For reuse proof, author and publish a new synthetic case without changing code; the publication workflow is covered by UI-script tests.

Use typed input as the reliable presentation path. Optional speech depends on browser capabilities and permissions. Reports contain synthetic text findings; scan image pixels and an animated avatar are not bundled. Rehearse on the presentation machine and verify the visible build before judging.

## Hackathon rubric alignment

The repository records five categories attributed to the supplied Rutgers Health Hackathon rubric in the [nested judging matrix](VirtuSP-upstream/docs/JUDGING_MATRIX.md). The original rubric text, weights, and complete submission rules are not reproduced here; this mapping demonstrates category coverage, not certification of every eligibility requirement or a self-awarded score. The [root judging evidence](docs/JUDGING_MATRIX.md) and [submission narrative](docs/HACKATHON_SUBMISSION.md) provide additional context.

- **Innovation & Creativity:** faculty-owned wording, preserved unknowns, versioned cases, progressive disclosure, intentional discrepancies, and event-linked feedback support the product distinction. Demonstrate a new case through the existing engine. Differentiation and educational benefit remain unmeasured.
- **Technical Implementation:** the Node API owns encounters, validates publication, freezes case versions, persists publications, and handles turn replay/conflict. Evidence: [API](lib/api.js), [engine](lib/encounter.js), [HTTP tests](tests/integration.test.js), [persistence tests](tests/persistence.test.js), and [UI-script tests](tests/ui.test.js). Authentication and durable shared encounters remain missing.
- **Healthcare Impact:** repeated synthetic interviews, authored objectives, discrepancy follow-up, and debrief evidence address a concrete educational use case. A faculty-led pilot must evaluate learning outcomes, accessibility, case validity, and assessment reliability before institutional grading claims.
- **Presentation & Demonstration:** the review → publish → interview → chart → assessment path, typed fallback, build identity, and [timed demo](docs/DEMO.md) make the prototype reviewable. A finished pitch video and current hosted-build verification are not established by this README.
- **Feasibility & Scalability:** adding reviewed case data reuses one schema and engine. Local operation has no required external provider; optional S3 backup exists. Horizontal scaling is not demonstrated: attempts and replay ledgers are process-local, and institutional operation requires durable shared state, identity, governance, and operational controls.

If the challenge requires live generative AI, hosted operation, or integrations, the root build does not establish those requirements. Confirm the intended submission build and the original rules before presenting those capabilities.

## Implemented behavior and limits

Faculty can edit exact patient wording, source labels, disclosure keywords, chart findings, and objective weights. Studio validation is advisory; server validation controls publication. It checks structure and references, not medical correctness or the reviewer's qualifications. Warnings require faculty judgment.

The server selects published responses using conservative keyword/rule matching. It returns exact approved wording, an authored deflection, or a fixed unknown/conversational reply. **No live generative dialogue model is enabled.** Valid phrasings can be missed, and poorly authored triggers can select an inappropriate response. Exact wording does not guarantee clinical correctness or universal semantic understanding.

Artifact release, section opening, and explicit review are separate states. Imaging is question-only; opening Imaging does not unlock it. Labs can release through matching questions or opening Labs. Review is learner acknowledgment and does not demonstrate understanding. Lab and imaging text comes from published chart labels, including authored units and reference ranges.

Patient and chart sources remain distinct when intentionally contradictory. Reconciliation notes, objective coverage, empathy signals, and SBAR keyword coverage support faculty review. Assessment is calculated in the browser over server state; it is heuristic, editable by a client, and unsuitable as an authoritative grade. Role selection is a teaching label, not an authenticated identity or permission.

Identical canonical question payloads with the same request ID replay without a second turn; changed payloads return HTTP 409. The browser suppresses concurrent sends and retains failed typed input for retry. Publication and general encounter actions do not share this turn-idempotency guarantee.

## Architecture and repository map

```text
Browser Studio / interview / chart / assessment
          | same-origin JSON requests
          v
server.js: static UI, build metadata, host/origin/body checks
          |
          v
lib/api.js: validated publication, version lookup, server attempts
          |
          v
lib/encounter.js + lib/virtusp-core.js: matching, disclosure, events
          |
          +--> local atomic publication recovery file
          +--> optional S3 publication backup (lib/cloud-store.js)
```

Clinical encounter authority lives on the server; the UI projects returned state. Feedback calculations live in `public/js/app.js`. `lib/cases.js` is the packaged schema/seed-case source and is also served to Studio as `/js/cases.js`. A parity test checks the browser/server matching helper copies.

- `server.js`: application entry point, static delivery, health probes, and HTTP boundary.
- `lib/`: API, encounter engine, case definitions, shared matching, and optional cloud storage.
- `public/`: landing page, simulator, styles, browser scripts, and bundled illustration.
- `scripts/run-tests.js`: recursive discovery of runnable root tests.
- `tests/`: core, grounding, disclosure, HTTP, persistence, cloud-adapter, and UI-script tests.
- `docs/`: architecture, demo, rubric evidence, security, handoff, and historical verification records.
- `Dockerfile` / `.dockerignore`: Node 24 container preparation with an allowlisted build context.
- `data/recovery/`: default generated publication storage, ignored by Git.
- `VirtuSP-upstream/`, `infra/`, `reports/`, `output/`, and `tmp/`: separate checkout, infrastructure, or local/historical artifacts; their presence does not prove active root integrations or deployed capabilities.

See [current architecture](docs/ARCHITECTURE_CURRENT.md) for the detailed encounter path. Some older documents predate the optional S3 adapter and health endpoints; current source and the verification section below govern those details.

## Configuration

Set environment variables before launching `npm start`. No environment file is automatically read.

- `PORT`: listening port; default `3000`.
- `HOST`: bind address; default `127.0.0.1`. `0.0.0.0` exposes the listener beyond loopback and requires deployment controls.
- `NODE_ENV`: displayed environment label; default `local`. Setting `production` does not enable authentication or other missing controls.
- `VIRTUSP_DATA_DIR`: publication recovery directory; default `<repository>/data/recovery`. The process needs write access. Custom directories need their own exclusion from version control and backup policy.
- `VIRTUSP_ALLOWED_HOSTS`: comma-separated, lowercased HTTP Host values accepted by the API in addition to localhost/127.0.0.1. Include the port when present, for example `demo.example.org:3000`; omit the URL scheme and path. Configure reverse-proxy Host forwarding consistently.
- `VIRTUSP_GIT_SHA`: optional full 40-character lowercase hexadecimal source revision for packaged builds; otherwise Git is queried and may be unavailable.
- `VIRTUSP_DR_TABLE`: optional DynamoDB authority table. When set, non-liveness APIs and readiness require a strongly consistent `control` record identifying the active region with an unexpired lease. This is access fencing, not shared encounter persistence.
- `AWS_REGION`: runtime region compared with the active-writer record when fencing is enabled; also used by AWS SDK region resolution.
- `VIRTUSP_DR_CONTROL_REGION`: DynamoDB control-region override; default `us-west-2`. Fence-disabled local operation performs no authority read.
- `PROFILE_S3_BUCKET`: optional existing bucket for publication backup. If unset, the adapter performs no S3 write. If set, the AWS SDK uses its standard credential/region resolution; configure the runtime identity and region outside source control.

Example in PowerShell for a different local port:

```powershell
$env:PORT = '3100'
npm start
```

S3 writes use `virtusp/cleanup/published/<case-id>/<version>.json` and request AES256 server-side encryption. Scope the runtime identity's `s3:PutObject` permission to the intended bucket/prefix. The adapter writes backups; it does not load cases from S3 on startup or prove a complete disaster-recovery workflow. Its tests use a fake client, not a live AWS account.

## API contract

All application routes use same-origin JSON. Successful calls return HTTP 200. API input bodies are limited to 256,000 bytes. There is no authentication, external API compatibility guarantee, or separate feedback endpoint.

- `GET /api/live` and `GET /api/ready`: return `status`, `gitSha`, `buildId`, and `responsePolicy`. Liveness is a basic probe; readiness additionally checks regional authority when `VIRTUSP_DR_TABLE` is set. Neither verifies S3, storage writability, or institutional readiness. These probes run before API host/origin checks.
- `GET /api/cases`: returns `{ profiles }`, including full faculty definitions and published versions.
- `POST /api/cases`: accepts `{ "profile": <case-definition> }`; validates and assigns the next case version; returns `{ profile, storage }` on success. Use Studio or [case definitions](lib/cases.js) for the complete authored schema.
- `POST /api/encounters`: accepts `{ "caseId": "<published-id>", "version": 1 }`; returns `{ state }` with the new encounter ID and frozen case.
- `POST /api/encounters/:id/turns`: accepts `{ "question": "What brings you in today?", "requestId": "turn-001" }`; question must be nonempty and at most 2,000 characters. Request IDs must use letters, digits, `_`, or `-`, with length 1–100. Returns the turn result, `replayed`, and state.
- `POST /api/encounters/:id/actions`: accepts `{ "action": "<action>", "value": "<value>" }` and returns state. Actions: `open`, `reviewSection`, `reviewArtifact`, `reconcile`, `role`, `plan`, and `handoff`. Chart-section codes are `ov`, `hx`, `meds`, `labs`, `img`, `notes`, and `soc`; artifact review uses the published artifact ID.

Errors return JSON containing `error`: 400 for invalid input/state, 403 for rejected Host/origin, 404 for unavailable versions/attempts/routes, 409 for a changed question under an existing request ID, 413 for oversized bodies, and 503 for publication-storage failure or configured regional authority failure. See [route source](lib/api.js) for action limits and [HTTP tests](tests/integration.test.js) for behavioral examples.

**Partial publication failure:** local publication commits before the optional S3 write. If S3 fails, HTTP 503 includes the already-published `profile`. Do not blindly repeat `POST /api/cases`: that creates another version. Check `GET /api/cases`, retain the returned version, repair cloud access, and use a reviewed operational backup procedure. No dedicated cloud-backup retry route exists.

## Persistence and recovery

- **Browser:** drafts and display cache use localStorage. Browser refresh returns to Studio; the cache does not restore authoritative clinical state. Clearing site storage can remove unpublished drafts.
- **Server filesystem:** all published versions are saved in `published-cases.json` beneath `VIRTUSP_DATA_DIR` or the default recovery directory, using a temporary file and rename. Startup reloads and validates this file; malformed recovery data stops startup.
- **Server memory:** active attempts, transcript/events, plans/handoffs, and turn replay ledgers are process-local. Restart loses them; start a fresh visit. There is no durable attempt export/recovery contract.
- **Optional S3:** publication copies only; startup still reads the local recovery file.

Before changing storage or deploying, stop publication writes and back up the recovery file. To restore, stop the server, preserve the suspect file, place a known-good backup at the configured path, restart, and verify published versions through Studio or `GET /api/cases`. Rehearse restoration before relying on it. Do not delete a damaged file as a first troubleshooting step. Atomic rename does not establish power-loss durability, coordinated multi-process writes, or a tested backup policy.

## Verification

```sh
npm test                  # all recursively discovered root *.test.js files
npm run test:all           # alias of npm test
npm run test:core
npm run test:grounding
npm run test:integration
npm run test:ui
```

The runner searches `test/` and `tests/`; it does not execute the separate nested checkout. Run the full suite to include disclosure, persistence, and cloud-adapter tests as well as the named subsets.

HTTP tests connect to a temporary loopback server. UI-script tests use a DOM/API harness, not Selenium or a full browser. Historical `tests/e2e/reports/` HTML/JSON files are artifacts, not runnable browser tests. Cloud tests validate request construction and error propagation with a fake S3 client. No coverage percentage, live-provider verification, production load capacity, or clinical validation is established by this suite.

The [preflight report](docs/PREFLIGHT_REPORT.md) records an earlier 26-test/manual-browser snapshot; it is historical evidence, not the current suite count. Rehearse the [demo](docs/DEMO.md) separately for rendering, keyboard access, microphone permissions, and audible speech.

**README review verification — October 11, 2026:** `npm test` discovered 7 files and passed **31/31 tests**, with 0 failures, skips, cancellations, or todo items, on Node 24.15.0/npm 11.13.0. The initial sandbox run passed 14 tests and failed 17 HTTP tests with loopback `EACCES`; the rerun with local socket access passed all 31. No application code changed during this documentation review. Dependency installation, container build, hosted deployment, live AWS, microphone/audio, coverage instrumentation, and a fresh manual browser rehearsal were not performed in this review.

**Full documentation audit follow-up — October 11, 2026:** after concurrent source changes, the final working-tree suite passed **37/37 tests across eight files**. The snapshot had HEAD `fec19bcff67d04f2ea0efff7bdf94f8a32f4aeb7` plus uncommitted objective/handoff/regional-fence changes. See [current testing](docs/TESTING.md) for exact scope; the earlier 31-test review record above is historical. This documentation work changed no application code.

## Security and deployment

This is a **supervised synthetic teaching prototype**. It has no authentication, faculty/student authorization, rate limiting, durable learner audit trail, institutional grading validation, or LMS integration. Full case definitions are downloadable; disclosure gates are a teaching workflow, not a secrecy boundary. Use synthetic data only. Browser recognition may use a vendor service; typed input avoids that dependency.

The server bounds JSON requests, rejects malformed URLs and traversal, checks API Host/origin, and binds to loopback by default. These measures do not make it safe for public healthcare deployment. See [security boundaries](docs/SECURITY.md).

Before external access, implement and verify TLS, identity and permissions, controlled proxy/host/origin behavior, resource limits, durable state, audit, backups/restoration, secret management, monitoring, retention/deletion, accessibility, and educational/privacy governance. HIPAA compliance, validated competence measurement, and production readiness are not claimed.

The root Node service must run alongside the UI; static-only CloudFront hosting cannot serve its API. The [Dockerfile](Dockerfile) prepares a Node 24 runtime; its non-root user needs a writable mounted `VIRTUSP_DATA_DIR`. The [deployment runbook](docs/DEPLOYMENT.md) describes GitHub-main → CodeBuild → immutable ECS image releases. CodeBuild currently tests under Node 22 before building the Node 24 image. The deployment script preserves existing service settings and does not enforce one task or prevent rolling-update overlap. Keep one application process until encounters, replay, and publication writes have shared durable coordination. EFS alone does not solve process-local attempts or concurrent publication.

Use an immutable source revision and image digest, verify identity through HTML/probes, rehearse the full workflow, and retain rollback information. During the October 11 documentation review, the public health endpoint reported root SHA `118043b1f6c958e36a4f4e454bb84951ae6faf6d` and build `118043b-fbc7609ca0`; the local source baseline was `d8afabbe506b29d11389d3bfb7b4489f5671b2ae`. This verifies a dated health observation, not the full hosted workflow, live S3 backup, AWS configuration, or deployment of the local baseline. [Status](docs/STATUS.md) records the observation and historical deployment context. [Deployment preparation](docs/DEPLOYMENT_PENDING.md) is superseded historical material.

## Troubleshooting

- **Install reports unsupported engines:** use Node 24 and rerun `npm ci` against the committed lockfile; the root Node 18 declaration is behind the locked dependency requirements.
- **Port already in use (`EADDRINUSE`):** stop the known prior instance or set another `PORT`; open that port in the browser.
- **HTTP tests fail with loopback `EACCES`:** the execution environment may block local socket connections. Run in an environment that permits them; do not count affected tests as passing.
- **API returns 403 behind a proxy:** check the forwarded Host, exact configured allowed host/port, and same-origin scheme/host. Do not enable wildcard cross-origin access to bypass the boundary.
- **Publish returns 503:** distinguish a local recovery-write failure from an S3 backup failure. Check directory ownership/permissions or runtime AWS access. An S3 failure may already have published a version; inspect it before retrying.
- **Server rejects recovery data:** preserve the file and restore a validated backup as described above.
- **Attempt unavailable after restart:** start a new visit; server-memory attempts cannot be recovered from the browser cache.
- **Expected answer stays unknown:** inspect the published version's exact wording, keywords, and disclosure/trust rules. Edit the draft, validate, publish a new version, and start a new attempt; existing attempts remain frozen.
- **Imaging stays locked:** ask an authored unlock question; opening the tab is insufficient. Reports are text findings, not missing scan images.
- **Microphone or speech fails:** continue with typed input and transcript. Verify permission, browser support, and audio separately before a voice demo.
- **Hosted API returns HTML or an old build:** verify routing to the root Node service, cached assets, and build identity before using that URL for judging.

## Contributing and release checklist

Keep changes scoped to the intended root or nested application. Preserve other contributors' changes and staging. For root behavior, update the relevant source and meaningful regression tests; maintain the matching-helper parity and server-owned patient truth. Never substitute client-authored facts for the frozen server version or describe heuristic feedback as clinical validation.

For a documentation change, verify commands, configuration, API/state claims, relative links, and current source. For a behavioral change, run `npm test`, then manually exercise affected UI paths. Report exact failures and test scope; mock tests and manual rehearsals are distinct evidence.

Before submission or release:

1. Confirm original rubric rules, intended build, and required pitch/demo deliverables.
2. Review synthetic content and warnings with faculty; rehearse a new-case publication and a fresh learner visit.
3. Install from the lockfile, run the full suite, and record revision, source fingerprint, runtime, counts, and limitations.
4. Rehearse typed input, disclosure/review distinctions, feedback links, and optional voice on the actual presentation machine.
5. Inspect intended commit contents for credentials, certificates, private records, generated state, and irrelevant artifacts. Ignore rules do not remove already tracked/staged files.
6. Verify backup/restore and any hosted runtime independently; retain a rollback path and avoid unsupported capability claims.

## Documentation, ownership, and licensing

- [Demo](docs/DEMO.md), [submission narrative](docs/HACKATHON_SUBMISSION.md), and [judging evidence](docs/JUDGING_MATRIX.md).
- [Architecture](docs/ARCHITECTURE_CURRENT.md), [requirements traceability](docs/REQUIREMENTS_TRACEABILITY.md), [status](docs/STATUS.md), and [handoff](docs/HANDOFF.md).
- [Security](docs/SECURITY.md), [historical preflight](docs/PREFLIGHT_REPORT.md), and [historical deployment preparation](docs/DEPLOYMENT_PENDING.md).
- [Setup](docs/SETUP.md), [authoring](docs/AUTHORING.md), [current tests](docs/TESTING.md), [operations/recovery](docs/OPERATIONS.md), and [deployment runbook](docs/DEPLOYMENT.md).

Some historical records contain earlier counts, provider boundaries, or deployment status. Check dates and scope against current source; documentation alone does not verify a live service.

`package.json` marks this package private. No root `LICENSE`, designated maintainer contact, or documented private vulnerability-reporting channel is present. Do not infer an open-source license from repository visibility or dependency licenses. Project owners must establish distribution rights, third-party asset provenance, accountable maintenance, and a private reporting channel before broader distribution. For now, coordinate through the project owner; never include credentials or sensitive records in a public issue.
