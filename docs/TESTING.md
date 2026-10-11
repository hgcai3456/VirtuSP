# Root verification and test inventory

Reviewed October 11, 2026. Scope: the root Node application, not `VirtuSP-upstream/`.

## Current execution record

The final `npm test` run, with HEAD `fec19bcff67d04f2ea0efff7bdf94f8a32f4aeb7` and concurrent uncommitted objective/handoff/regional-fence changes, discovered eight files and completed **37 tests: 37 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo**. Node 24.15.0/npm 11.13.0; runner duration 1764.6869 ms. This review ran with loopback access because the sandbox blocked HTTP connections in the preceding README review. This documentation pass made no application code edits. Other work changed the shared source during review; counts and behavior here reflect the final tested working-tree snapshot, not a claim that every change belongs to HEAD. The initial audit run at `d8afabb` passed 31/31 before those changes.

The earlier README review had 14 passes/17 socket `EACCES` failures inside the sandbox, followed by 31/31 passing with loopback permitted. Those environment failures were not counted as successes. [Preflight](PREFLIGHT_REPORT.md) preserves the separate older 26-test snapshot and manual browser observations.

## Commands and discovery

```sh
npm test
npm run test:all
npm run test:core
npm run test:grounding
npm run test:integration
npm run test:ui
```

[Runner](../scripts/run-tests.js) recursively discovers `*.test.js` under `test/` and `tests/`, excluding node_modules directories. `test:all` aliases the full run; named subsets omit cloud/disclosure/persistence tests, so use the full run for release evidence. Historical e2e HTML/JSON are not runnable browser scenarios. Node tests require loopback connections for the HTTP file.

## Tests that ran

All scenarios below passed in the recorded run.

[core.test.js](../tests/core.test.js), 2 tests:

- Direct/root keyword matches without substring collisions.
- Stable question normalization and greetings.

[disclosure.test.js](../tests/disclosure.test.js), 2 tests:

- Short abbreviation exact tokens, including CT near-match exclusions.
- Browser/server helper source parity.

[grounding.test.js](../tests/grounding.test.js), 1 test:

- Avoid false-positive chart matching.

[cloud-store.test.js](../tests/cloud-store.test.js), 2 tests:

- Scoped S3 key, encryption request, exact profile payload.
- Propagate cloud write failure instead of reporting success.

[integration.test.js](../tests/integration.test.js), 17 tests:

- Basic health probes expose approved response policy/build identity.
- Configured hosted Host accepts matching Origin and rejects a different one.
- Unknown preservation for a claimed lisinopril prescription.
- Unknown preservation for smoking.
- Unknown preservation for family diabetes history.
- Deflection of a request to invent missing medication facts.
- Concurrent identical turns produce one turn; changed payload conflicts.
- Greeting/confirmation leave CT locked; explicit CT releases it.
- Opening Imaging does not release question-only images.
- Release/open/review remain distinct without inferred understanding.
- Locked artifact cannot be marked reviewed.
- Compound greeting returns exact chief complaint.
- Confirmation repeats disclosed wording.
- Negation/numeric roles and frozen version survive edits/repeated attempts.
- Pediatric case retains explicitly authored objectives.
- Malformed URL and traversal fail safely.
- Cross-origin writes rejected.

[persistence.test.js](../tests/persistence.test.js), 1 test:

- New API instances reload old/new publications from disk with truth preserved. This exercises recovery reload, not OS crash recovery or a full container restart.

[region-fence.test.js](../tests/region-fence.test.js), 4 tests:

- Disabled local fencing makes no authority read.
- Strongly consistent active-writer record with sufficient lease.
- Wrong/missing/expired/malformed authority denied.
- Authority-read errors fail closed.

[ui.test.js](../tests/ui.test.js), 8 tests:

- Faculty edits approved wording, publishes, launches frozen version.
- Newly authored chief complaint answers suggested opening question.
- Authored objectives use their own evidence independent of list order.
- Custom/unavailable objectives stay unassessed until faculty maps evidence.
- Feedback requires review and links recorded evidence.
- Failed typed question retained; retry uses same request ID.
- Team plan/handoff, including submitted text, survive a later server turn.
- Typed input remains available without speech/microphone APIs.

## What the suite does not establish

UI tests use a DOM/API harness, not Selenium or real-browser automation. S3 and regional-authority tests use fake clients. Regional fence tests do not establish live failover or a complete configured-HTTP-fence contract. No live AWS write, HTTP cloud-partial-failure recovery test, complete handoff-label scoring matrix, container build, CI execution, hosted full workflow, production load, coverage instrumentation, accessibility audit, or clinical validation was performed here. A passing scenario is bounded evidence, not proof of all possible inputs or zero hallucinations.

A read-only hosted health check is recorded in [status](STATUS.md), distinct from this local suite. CodeBuild tests are configured for Node 22 before a Node 24 image build; this local Node 24 run does not prove a specific CI build.

## Manual acceptance and reporting

Rehearse [demo](DEMO.md) on the presentation machine. Check rendering, keyboard access, publish/version wait, unknowns, release/open/review, reconciliation, evidence links, second/new case, and voice if used. Record browser/runtime, source/fingerprint, inputs, outcomes, failures, and what was not tested. Old screenshots or historical reports do not substitute for a new run.

For a release, retain exact test output, revision, runtime, command, counts, and exclusions. Report intermediate failures and their disposition. Add meaningful regressions when changing behavior; do not inflate evidence with implementation-mirroring tests or unsupported coverage percentages.
