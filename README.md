# VirtuSP

**AI powers the experience. Faculty defines the patient.**

[Live demo](https://d18g7r2mfy8mll.cloudfront.net/app.html) · [Repository](https://github.com/nathans3/VirtuSP) · [Judge submission](docs/HACKATHON_SUBMISSION.md) · [Judging demo](docs/DEMO.md#judge-proof-sequence)

Healthcare students need repeated interviewing and reasoning practice. Human standardized-patient sessions require trained participants and scheduling. VirtuSP provides additional formative practice, preparation and remediation alongside educators and human standardized patients. Learning gains and cost savings have not been measured.

**Patients are data, not deployments.** The key Challenge 1 demonstration is **create a new profile → review/publish → immediately interview it → inspect feedback**, with **zero patient-specific code changes**. Faculty → Studio → Publish; Student → Encounter → Dynamic chart → Feedback. A faculty member can review a case once and allow repeated learner attempts through the same engine.

A reusable virtual standardized patient simulator for healthcare education. Faculty author and review profiles; students interview a patient, progressively disclose chart records, document findings and receive evidence-linked feedback using the supplied seven-domain rubric.

The backend owns case facts and disclosure rules. For judging use `DIALOGUE_MODE=strict`: Bedrock may select a neutral topic, then the server constructs approved wording, an approved deflection, a fixed courtesy or an explicit unknown. Optional natural dialogue generates prose and receives guarded wording; it must not inherit strict-mode safety claims. These checks reduce errors; they do not establish clinical reliability.

## Run

Requires Node.js 22.17+.

```powershell
npm ci --ignore-scripts
$env:AI_ENABLED='false'
$env:DIALOGUE_MODE='strict'
npm start
```

Open [http://127.0.0.1:3000/app.html](http://127.0.0.1:3000/app.html). The demo server binds to loopback unless `HOST` is set. Without cloud configuration it uses local keyword matching, approved patient responses and browser speech. Judgment-dependent rubric ratings stay unassessed in local mode, so there is no overall total. Objective completion and the factual debrief still appear. Demo role switching is not institutional authentication.

For optional real AWS calls, follow [setup](docs/SETUP.md); setup/preflight creates or checks cloud resources and makes real provider calls. They are not required for offline practice. Credentials remain server-side. Use an isolated data directory and unset storage/provider configuration when rehearsing without cloud access.

## Faculty workflow

Teammates and their agents should start with [the handoff and remaining steps](docs/HANDOFF.md). [Prototype results](docs/BENCHMARKS.md) distinguish verified behavior from unresolved assessment quality and recording work.

1. Eight organizer personas arrive as UUID-preserving, unreviewed drafts. Denise and Marcus remain published synthetic scaffold examples.
2. Select Omar or Yvette and **Prepare organizer teaching suggestions**, or create a patient directly/from a description. Descriptive generation is an unreviewed AI draft when enabled.
3. Edit patient-known facts, approved wording, chart records, sources, artifacts, release conditions and mapped learning objectives. Original CSV content and provenance remain preserved. Unknown allergies, medications, dates and units stay unspecified.
4. Review each record, select scenario-applicable rubric domains, acknowledge the whole profile and publish an immutable version. Active attempts retain their earlier version.
5. Launch, interview, release and explicitly review chart findings. Save team notes, SBAR and plans. Finish for feedback and export the evidence-linked record.

Teaching references are selected summaries from NHLBI and AHA for review and assessment. They are not patient facts. No model is trained or fine-tuned on the eight persona descriptions.

## Verify

```powershell
npm test
npm run evaluate:local
node scripts/evaluate.js --model=us.anthropic.claude-sonnet-4-6
node scripts/evaluate.js --model=us.amazon.nova-2-lite-v1:0
```

Cloud evaluation makes real calls using event access. It generates ignored JSON artifacts under `output/`, including responses, latency, fallback frequency and two assessment transcripts for manual review. The suite contains 32 persona questions, eight multi-turn encounters, eight adversarial cases and a newly authored patient. [Evaluation protocol](docs/EVALUATION.md) explains the acceptance gate and limitations.

The last two commands above are optional billable cloud evaluations, not offline checks. [Testing](docs/TESTING.md) records this audit's actual results and distinguishes unit/DOM tests, integration, Pact and browser suites.

## Repository

| Path                | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `public/`           | Landing page, Studio, encounter and feedback UI; no clinical seed database or credentials   |
| `lib/profiles.js`   | CSV parsing, profile schema and publication checks                                          |
| `lib/engine.js`     | Authoritative state, gates, releases, evidence and response validation                      |
| `lib/cloud.js`      | Bedrock, optional Guardrails, S3 adapters and preflight                                     |
| `lib/assessment.js` | Seven-domain rubric and separate faculty objectives                                         |
| `lib/http.js`       | Local API, protected encounter artifacts and speech                                         |
| `corpus/`           | Organizer CSV, engineering teaching drafts, six development examples and scaffold artifacts |
| `evaluation/`       | Separate held-out fixtures and review transcripts                                           |
| `data/`             | Ignored local recovery and attachments                                                      |
| `scripts/`          | Preflight, AWS storage setup, backup/recovery and evaluation                                |

[Architecture](docs/ARCHITECTURE.md) · [Short demo and four-minute pitch](docs/DEMO.md) · [Implementation status](docs/STATUS.md) · [Research and review drafts](docs/RESEARCH.md)

## Architecture, integrations and limitations

HTML/CSS/JavaScript provide Studio, encounter and feedback screens. Node.js centralizes rules and API integrations. Terraform defines CloudFront (HTTPS public front door), ALB (traffic manager), ECS/Fargate (compute), EFS (persistent files), SQLite (ground-truth data), private PostgreSQL (profile archives), S3 (objects) and CloudWatch (monitoring). Studio/encounter state uses an atomic JSON manifest as well. Historical deployment observations are in the handoff; this audit did not independently verify AWS resources. [Architecture](docs/ARCHITECTURE.md#current-stack-and-persistence).

Bedrock supports semantic selection and draft assessment. ElevenLabs is an optional speech adapter for saved replies. LiveAvatar LITE is default-disabled/local-only, with mock tests; live lip synchronization remains unverified. Browser speech/portrait/text provide fallbacks. Canvas is a future LMS integration, not a working connector.

“And because patients are data rather than patient-specific code, we can add new cases, new students, new integrations, and more computing capacity without rebuilding the platform.” This describes extensibility: integrations still need engineering and compute capacity still needs validation. Shared files, process-local sessions and provider quotas constrain scaling; no production concurrency claim is made.

This synthetic-data educational prototype is not clinically validated, HIPAA certified, a validated grading system or production ready. Faculty validation, institutional identity, accessibility review, retention/privacy governance and security review remain outstanding. No proven learning gain, eliminated bias or zero-hallucination claim is made. [Requirements](docs/REQUIREMENTS_TRACEABILITY.md) · [Judging matrix](docs/JUDGING_MATRIX.md) · [Audit report](docs/DOCUMENTATION_AUDIT.md).
