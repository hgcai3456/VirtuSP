# VirtuSP

A reusable virtual standardized patient simulator for healthcare education. Faculty author and review profiles; students interview a patient, progressively disclose chart records, document findings and receive evidence-linked feedback using the supplied seven-domain rubric.

The backend owns clinical facts and disclosure rules. Bedrock selects neutral topics, receives only permitted patient facts, generates a reply, and independently reviews grounding. Rejected or unavailable responses use approved wording. These checks reduce errors; they do not establish clinical reliability.

## Run

Requires Node.js 22.17+.

```powershell
npm ci
npm start
```

Open [http://localhost:3000/app.html](http://localhost:3000/app.html). Without cloud configuration it uses local keyword matching, approved patient responses and browser speech. Rubric ratings in local mode are explicitly provisional placeholders, with objective completion reported separately.

For real AWS calls, fill the root `.env` from `.env.example`, run `npm run setup:aws` and `npm run preflight`, then set `AI_ENABLED=true` and restart. [Complete setup instructions](docs/SETUP.md) cover temporary event credentials, S3, recovery and optional ElevenLabs. Credentials remain server-side.

## Faculty workflow

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

[Architecture](docs/ARCHITECTURE.md) · [Short demo and four-minute pitch](docs/DEMO.md) · [Implementation status](docs/STATUS.md)

This is a local synthetic-data teaching prototype. Live model results and faculty review must be reported separately from engineering tests. No public hosting, autonomous agent runtime, managed retrieval or model training is included in this iteration.
