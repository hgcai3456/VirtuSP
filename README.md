# VirtuSP

VirtuSP gives healthcare students repeatable interviewing practice with synthetic patients. Faculty review the patient wording, publish a frozen case version, and students investigate patient/chart discrepancies using the same encounter engine for every case.

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

## Run the supervised local demo

Use Node.js 18 or newer (verified with 24.15.0):

```sh
npm ci
npm test
npm start
```

Open [the simulator](http://127.0.0.1:3000/app.html). No external packages or provider credentials are required. The server binds to loopback; PORT defaults to 3000. The header shows application version, Git revision plus a runtime-source fingerprint, environment, and reviewed-wording mode. The revision remains the base commit until the changes are committed.

## What is implemented

- Studio drafts with editable exact patient wording, sources, disclosure keywords, chart findings, and faculty objective weights.
- Server validation and immutable publication; published versions saved atomically in ignored data/recovery/published-cases.json.
- Server-owned attempts pinned to a published version, approved responses, trust gates, deterministic chart release, transcript, and events.
- Request IDs: identical canonical payload replays; changed payload returns HTTP 409. Browser suppresses concurrent sending and preserves failed typed input for retry.
- Released, opened, and explicit review states remain separate. Review records learner acknowledgment; understanding is not inferred.
- Intentional discrepancies, follow-up, learner reconciliation notes, SBAR keyword coverage, and feedback with recorded event links.
- A bundled patient illustration and optional browser speech/recognition. Typed input remains available without microphone, speech, model, or cloud services.

## Grounding and provider mode

The active engine selects among published response keywords and delivers exact approved wording or an authored deflection. Unmatched topics use a fixed unknown response; ordinary greetings/acknowledgments are fixed server responses. No generated clinical paraphrasing or live model provider is enabled. Matching is conservative and can miss valid phrasings; faculty must review every authored fact and trigger. There is no claim of universal semantic understanding or zero hallucinations.

Imaging is question-only. Opening Imaging does not unlock it. Laboratory reports can be released by matching questions or opening Labs; this does not record review. The report displays the authoritative chart fact labels, including units and reference ranges.

Drafts and a display cache use browser localStorage. Published cases persist on the server filesystem. Active attempts and replay ledgers are process-local: restarting the server requires a new attempt. Browser refresh returns to Studio; it does not silently recover clinical state from localStorage.

## Verification and demo

Run `npm test` (also `npm run test:all`) for core, disclosure, grounding, HTTP integration, persistence, and UI-script tests. Subsets: `test:core`, `test:grounding`, `test:integration`, `test:ui`. UI-script tests use a DOM/API harness; manual browser verification is recorded separately. Historical files under tests/e2e/reports are not runnable browser tests.

See [demo sequence](docs/DEMO.md), [actual architecture](docs/ARCHITECTURE_CURRENT.md), [verification report](docs/PREFLIGHT_REPORT.md), and [security/deployment boundaries](docs/SECURITY.md).

## Deployment boundary

This is a supervised synthetic teaching demo. It has no authentication, role enforcement, durable attempt storage, institutional grading validation, LMS integration, or verified cloud deployment. Faculty case definitions are downloadable in this local demo; chart gating is a teaching workflow, not a secrecy boundary. Do not expose the server publicly without authentication, authorization, controlled origins/hosts, audit, retention, monitoring, and governance. Browser speech recognition may use the browser vendor's service; use typed input for an offline presentation.

The nested checkout and local Terraform artifacts do not establish that this root build is cloud-deployed. A static-only CloudFront deployment cannot run its new API routes; deploy the Node service and route /api to it before using a hosted demo.
