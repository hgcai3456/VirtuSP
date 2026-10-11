# Historical preflight archive — earlier cleanup snapshot

**Historical record, not current release status.** The report below preserves the earlier 26-test run, build identity, manual-browser rehearsal, intermediate failures, and artifact-cleanup history. Its original headings and statements about uncommitted work, pending hosting, dependency-free operation, and staged artifacts describe that checkpoint; they do not govern the current implementation. The artifact-exclusion follow-up supersedes the earlier remaining-artifact warnings within this record.

For the October 11, 2026 documentation review, use [TESTING.md](TESTING.md) (37/37 passing tests in the final working-tree snapshot), [STATUS.md](STATUS.md) (local/observed hosted revisions), [ARCHITECTURE_CURRENT.md](ARCHITECTURE_CURRENT.md), [DEPLOYMENT.md](DEPLOYMENT.md), and [SECURITY.md](SECURITY.md). Optional S3 and basic health endpoints now exist. This review did not repeat the archived browser rehearsal, secret scan, artifact hash checks, or live microphone checks.

## Archived report

## Submission follow-up: artifacts excluded

At the user's request, all 14 staged files under certs/ and infra/aws/ were inspected and removed from the Git index without deleting local files. This includes the three local certificate files, Terraform state/backup/variables/plan, six cached provider files, and the generated deployment ZIP. The CER and PEM parse as X.509 certificates and contain no private-key blocks. The PFX and binary plan/bundles were excluded conservatively; no password-protected bundle was decrypted. Terraform state metadata and variable assignment counts were inspected without printing values. SHA-256 hashes verify that local contents were preserved. Ignore rules now cover the full certificate directory, Terraform provider caches, and generated deployment ZIP.

The staged-artifact action described as remaining in the original report below is resolved. The verified root cleanup is committed separately from unrelated staged contributor changes; the final chat response records its commit SHA. The original build/test/browser snapshot below remains the pre-commit verification record.

Verified October 11, 2026. Scope: the root application started by npm start in C:\Users\Jasna\VirtuSP. VirtuSP-upstream is a separate nested checkout and was preserved; its cloud build and historical reports are not evidence for the root demo.

## Current build

- Branch: main.
- Base commit: a5faf8d127409619e467b97d6405ab1675549515.
- Visible running build: a5faf8d-9b59d1b90c (base revision plus SHA-256 fingerprint of active runtime sources).
- Application: 1.0.0; Node: v24.15.0; npm: 11.13.0.
- Changes remain uncommitted. No commit, reset, push, or cloud deployment was performed. Existing contributor changes, staging and nested checkout were preserved.
- git log -5 --oneline returned the single available root commit: a5faf8d Add VirtuSP virtual patient simulator for healthcare education.
- No root or ancestor AGENTS.md or baseline package-lock.json was present. The nested checkout's AGENTS.md applies to that checkout, which was not modified. A root lockfile was generated without adding dependencies.

## Rubric readiness

Innovation & Creativity: faculty-approved exact wording, versioned reusable cases, unknown preservation, progressive records and intentional contradictions are implemented. Weakness: conservative keyword routing and unmeasured educational differentiation.

Technical Implementation: one server-owned encounter engine, HTTP replay/conflict, server validation, frozen attempts, persisted publications, tested chart boundaries and visible source identity. Weakness: active attempts/replay are process-local, no production access control, and staged infrastructure artifacts require submission review.

Healthcare Impact: synthetic repeated practice, faculty objectives, observable follow-up and event-linked feedback. Weakness: no clinical or competence validation and no measured learning outcomes.

Presentation & Demonstration: faculty review/check/publish/start workflow, typed-input default, accurate report/review wording, build identity and timed guide. Weakness: no automated real-browser suite or microphone/audio verification on the presentation computer.

Feasibility & Scalability: one schema and engine support Denise, Marcus and published custom cases; no external provider required. Weakness: public/institutional deployment requires durable attempts/shared replay, identity, governance and operational controls. No numeric score is claimed.

## Fixes, root causes and regressions

1. Competing browser authority: dialogue/disclosure lived in the browser, while tests covered a separate helper copy. Extracted the existing deterministic encounter logic into lib/encounter.js, added lib/api.js routes, and delegated UI questions/chart/review/team actions to those routes. The normal UI no longer executes an alternate clinical engine. Tests: HTTP integration and UI-script workflow.
2. Unknown/injected questions and conversational routing: broad keyword selection could route a family-history question to an unrelated authored diabetes answer; every greeting overrode an answerable clinical question. Added conservative unknown-domain routing, declarative/injection deflection, server-owned conversation replies, compound chief-complaint routing and confirmation restricted to disclosed facts. Answers remain exact published strings, never generated clinical paraphrases. Tests: four adversarial unknown questions, compound greeting, confirmation, authored negation and 155/110 role preservation.
3. CT false disclosure: short keywords accepted token prefixes; opening Imaging released all images; chart-fact matching bypassed artifact triggers. Short abbreviations now require exact tokens, artifact-linked facts cannot bypass artifact release, and Imaging opening leaves images locked. Tests: ct vs doctor/correct/contact/activity/ctscan, the exact supplied long confirmation, greeting, explicit CT and Imaging opening.
4. Release/open/review confusion: artifact release set opened state and feedback called released artifacts reviewed; review functions accepted locked/unopened evidence. Removed inferred opening, require observable section evidence before section review, reject locked-artifact review, and list only explicit artifact reviews. Feedback explains that acknowledgment does not prove understanding. Tests: HTTP state distinction and UI grade/evidence links.
5. Replay and async input safety: request IDs were browser-memory only and conflicts produced no HTTP contract. Server per-attempt canonical-payload ledger reuses exact results, changed payload returns 409, concurrent identical requests yield one turn; browser avoids duplicate speech on replay, disables Send while pending, keeps failed typed input and reuses its ID. Tests: concurrent identical requests, conflict and UI retry retention.
6. Frozen versions and faculty-edit truth: the compact summary editor did not update the already-populated facts used by encounters. Studio now edits actual approved fact wording and chart labels. Server owns publication/version assignment, snapshots attempts, and atomically persists publications. One packaged case module is shared by server and Studio. Tests: UI edit/publish/launch, draft-change isolation, repeat attempt and restart recovery.
7. Evidence/scoring accuracy: links did not point to recorded events; denominator assumed 100; empty handoff could divide by zero; server snapshots could erase browser-only team changes. Added actual event anchors, authored denominator, safe ratios, and server-owned team/handoff state. Feedback explicitly identifies rule-based faculty-review evidence. Tests: UI event links/review grade and handoff/plan persistence after a later turn.
8. Demo assets/status/fallback: portrait and scan image URLs referenced absent assets; build revision was injected but not visible; microphone errors could restart recognition indefinitely; speech callbacks could leave or overwrite busy state. Added bundled synthetic illustration, authoritative chart-label rendering, text-only imaging-report explanation, visible revision/source fingerprint, typed-input default, recognition-error stop and bounded/generation-safe speech callbacks. Tests: UI absent speech/microphone and manual browser rehearsal. Live microphone and audio playback are not claimed tested.
9. Release verification/security hygiene: scripts named nonexistent integration/e2e suites; no lockfile; malformed URLs could throw and static prefix checks were insufficient; runtime artifacts were not ignored. Added a cross-platform recursive test discovery script covering test/ and tests/, a real UI subset, dependency-free lockfile, URL/traversal checks, bounded JSON requests, loopback binding, host/origin checks, and ignore rules. Tests: malformed URL, traversal, origin rejection and all discovered release tests.

## Files changed by this cleanup

Modified: .gitignore; README.md; package.json; server.js; lib/virtusp-core.js; public/app.html; public/index.html; public/js/app.js; public/js/virtusp-core.js; docs/ARCHITECTURE_CURRENT.md; docs/DEMO.md; docs/HACKATHON_SUBMISSION.md; docs/HANDOFF.md; docs/JUDGING_MATRIX.md; docs/REQUIREMENTS_TRACEABILITY.md; docs/STATUS.md.

Added: package-lock.json; lib/api.js; lib/cases.js; lib/encounter.js; scripts/run-tests.js; public/img/patient.svg; tests/disclosure.test.js; tests/integration.test.js; tests/persistence.test.js; tests/ui.test.js; docs/SECURITY.md; this report.

Temporary editing/audit scripts and browser screenshot are under ignored tmp/ and output/. Existing tests/core.test.js and tests/grounding.test.js were retained unchanged. Existing staged e2e HTML/JSON reports were preserved, not counted as executable tests.

## Test commands and actual counts

Baseline before edits: npm test → node --test tests/**/*.test.js: 3 tests, 3 pass, 0 fail, 0 skipped, 0 suites, 0 cancelled, 0 todo. Root had only core (2 tests) and helper grounding (1 test); no root test/ directory or runnable e2e/integration suite. Nested-checkout tests and historical reports were not included.

Final release: npm test → node scripts/run-tests.js → 6 test files discovered recursively in test/ and tests/: 26 tests, 26 pass, 0 fail, 0 skipped, 0 suites, 0 cancelled, 0 todo. Duration in final run: 1744.9896 ms. No runnable root test suite is excluded. npm run test:all aliases the same release command.

Other executed commands: node --test tests/*.test.js (20/20 after initial route fixes); node --test tests/ui.test.js (5/5 after harness fixes); npm install --package-lock-only --ignore-scripts (audited 1 package, 0 vulnerabilities); node --check public/js/app.js, lib/encounter.js and server.js (passed); git diff --check on modified root implementation/docs (exit 0; line-ending conversion notices only). Coverage instrumentation was not run; no percentage is claimed.

All final tests:

- tests/core.test.js: keyword/root matching without collisions; question normalization/greetings (2 pass).
- tests/disclosure.test.js: short abbreviation token boundaries; browser/server helper parity (2 pass).
- tests/grounding.test.js: false-positive chart matching (1 pass).
- tests/integration.test.js: unknown medication statement; unknown smoking; unknown family history; injection deflection; concurrent replay/conflict; greeting/confirmation/explicit CT; Imaging section locking; release/open/review distinction; locked-artifact review rejection; compound greeting; confirmation wording; negation/numeric roles/frozen version/repeat attempt; unrelated pediatric objectives; malformed URL/traversal; cross-origin rejection (15 pass).
- tests/persistence.test.js: publications retain old/new versions across server restart (1 pass).
- tests/ui.test.js: faculty edit/publish/frozen launch; review grading/event links; failed typed input/retry; team state across later turn; absent microphone/speech typed fallback (5 pass).

## Intermediate failures and disposition

No pre-existing baseline test failure. Failures introduced or exposed during this pass were fixed:

- Initial 20-test route run: 5 pass/15 fail due to sandbox socket EACCES; reran with approval outside sandbox. All 15 HTTP tests were affected by the same environment restriction. A later sandbox npm test likewise reported 10 pass/15 socket failures; approved runs passed.
- First unrestricted route run: 16 pass/4 fail. Identical replay returned undefined; section review accepted unopened Labs; artifact review accepted locked CT; compound greeting fell back. All four fixed, then 20/20 passed.
- Tightened schema run: 19 pass/1 fail. Negation/numeric fixture lacked required fact labels; fixture corrected rather than weakening validation.
- Initial UI harness: 3 pass/2 fail. Retry fixture had not instantiated its fake input; typed-row assertion assumed no whitespace before the closing bracket. Both harness assertions fixed; 5/5 passed.
- Attempted directory test command node --test tests: 0 pass/1 fail (MODULE_NOT_FOUND on this Windows runtime). Replaced with explicit recursive discovery and native Node runner invocation.
- Recovery suite: 25 pass/1 fail. New persistence code shadowed the filesystem path module with a route path parameter. Isolated test exposed path.dirname is not a function; renamed module reference. Final 26/26 passed.
- Browser's first connection attempt failed because the server was not running. Started server, then rehearsed the actual workflow successfully.

Remaining test failures: none in the final release suite. Runtime claims are limited to the tested root path.

## Manual browser and provider/deployment status

Final build manually verified in Codex in-app browser: Check → Publish Denise v2 → Start visit v2 → supported question → unknown smoking → metformin claim → Notes discrepancy → Labs release/explicit section review → Imaging still locked → empathic missed-dose question → learner reconciliation → Assessment actual event links and competence caveat. Then Marcus v1 used the same engine and returned his own exact chief complaint.

The observed illustrative assessment was 84% on 95 of 100 assessed objective weight after four questions; this is recorded workflow output, not a rubric-readiness score or learner competence conclusion. Screenshot: output/preflight-feedback.png.

- Locally tested: server/API, actual engine, persistence, core helpers and browser-script behavior.
- Harnessed: UI-script tests use fake DOM and in-process API transport, not Selenium or a real-browser runner.
- Browser tested: the manual typed sequence above, visible build/version and second patient.
- Cloud tested: none. No cloud deployment, AWS provider, LMS, external model, external TTS or live animated avatar was exercised.
- Not tested: live microphone permission flow, audio audibility/quality, browser-vendor recognition service, institutional authentication, production recovery/concurrency/load, and nested checkout deployment.

The root demo makes no model/cloud requests. Text appears before optional browser speech. Existing server-owned state is retained when speech or recognition fails. Published versions survive restart; active attempts/replay ledgers do not. Server currently remains running on http://127.0.0.1:3000/app.html.

## Remaining limitations and submission review

Security pattern scan inspected bounded nonbinary indexed text files: 6271 index entries inventoried, 0 matches for private-key/AWS/GitHub/OpenAI credential patterns in the scanned subset. It excluded large files, tmp, node_modules, binary bundles, ignored .env contents and Git history. Do not interpret this as a complete secret audit.

Pre-existing staged artifacts remain: certs/localhost.pem, certs/localhost.pfx, infra/aws/terraform.tfstate, infra/aws/terraform.tfstate.backup, infra/aws/terraform.tfvars, infra/aws/tfplan. Ignore rules do not unstage existing files. These require inspection/exclusion before submission; contributor files/staging were preserved. No secrets were printed or newly exposed by the root API. Full faculty definitions remain downloadable by design in the supervised demo, so student disclosure is not an authorization boundary.

Known P0/P1 defects found in the root demonstration path were corrected and covered as above. This report does not certify the separate nested checkout, hosted URLs, production security, or clinical validity. Reconciliation, empathy, sequence and SBAR signals are simple heuristics for faculty review. Conservative routing can reject a valid phrasing; exact reviewed wording prevents it from generating a new patient fact.

## Exact recommended demo sequence

Use docs/DEMO.md for timings. Studio → review/edit approved wording → Check → Publish → wait for updated version → Start visit → “Hello Denise, how can I help you today?” → “Do you smoke?” → “Tell me how you take your metformin.” → Notes → Labs → Record review of this section → Imaging (locked) → “I am sorry this has been hard. What gets in the way of every dose?” → Medications → save “Refill gap and skipped evening doses need follow-up.” → Assessment → event links/next attempt → Studio → Marcus → Start visit → “What brings you in today?”

## Claims supported and unsupported

Safe: patient responses on the demonstrated path use published exact case wording, approved deflections or fixed unknown/conversational replies; unspecified topics tested remain unknown; cases are frozen per attempt; records release deterministically; feedback links to recorded events; different patients share one engine; typed demo needs no external model/cloud service.

Unsupported: zero hallucinations; clinically validated; HIPAA compliant; replaces clinicians or standardized patients; automatically measures competence; live AI/cloud connection; animated avatar playback; audited production readiness; distributed scalability already demonstrated.

## Top three actions before judging

1. Inspect/exclude the pre-existing staged certificate and Terraform artifacts, and choose the intended root vs nested build explicitly before submission.
2. Rehearse docs/DEMO.md on the presentation machine; verify the visible build fingerprint, typed input, browser audio if desired, and keep the local Node server running.
3. Commit the reviewed cleanup and independently verify any hosted deployment includes the Node API and matching source fingerprint. Use the verified local demo until that is proven.
