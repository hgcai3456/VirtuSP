# Evaluation protocol

> Historical counts below are dated evidence, not a fresh measurement of this checkout. Use [TESTING.md](TESTING.md) for this audit's run. Pin `DIALOGUE_MODE=strict` when evaluating the approved-line boundary; optional natural dialogue requires a separate disclosure/grounding evaluation.

## This checkout’s engineering checks

The checks added for the judged response boundary live in `tests/release-boundary.test.js`, `tests/engine.test.js`, `tests/profiles.test.js`, `tests/rubric.test.js`, and the appointment regression. They are regression and development data. They were written while the behavior was being fixed, so they are not an untouched held-out validation and they are not an educator judgment.

On 2026-10-11, `node --test --test-concurrency=2 --test-timeout=120000 tests/*.test.js` finished with 148 passed, 0 failed, 0 skipped, on Node v24.15.0. HEAD was `eab46d47ad5979f26530385ecc0733a685bb1a0b` with a dirty tree. The same day a loopback browser session published Jordan Vale and interviewed that patient in local mode. The machine-readable record is `reports/release-results.json`. That directory is gitignored.

What they measure, when `npm test` is green for those files:

- Supported questions return the approved sentence. A greeting and an explicit unknown still work. Refusing an unsupported claim does not refuse everything.
- Empty citations plus model prose such as a stroke, daily smoking, or a parent’s death are not delivered. Paraphrase output is ignored.
- A short politeness line does not open a guarded fact. An authored rapport phrase can, once.
- An undated ECG and a headache diary do not become reviewed memories or invented timing. Unspecified allergies stay unspecified. A documented “no known drug allergies” line stays that line.
- Age 12 with asthma does not select the pediatric hearing rubric. An explicit rubric id does.
- A failed or local assessment is `not_assessed`, with no total and no review flag. A supported domain-6 score of 1 does require review. A faculty-excluded domain is `not_applicable`.
- A published edit does not change an encounter already in progress. A repeated request id does not add a turn.

Live Bedrock answer quality, unauthorized-disclosure rate on a held-out set, and learning outcomes were not remeasured for this change. Do not reuse older tables in [BENCHMARKS.md](BENCHMARKS.md) as results for this release. A faculty-validation protocol is still: two educators, blinded to model identity, score the same synthetic transcripts for factual faithfulness, disclosure, and whether each feedback claim is supported by the cited turn. Disagreement goes to a third reader. That protocol has not been run.

Keep six development demonstrations in `corpus/development-examples.json` separate from `evaluation/`. The demonstrations have engineering behavior review, not faculty clinical approval. Evaluation profiles are minimal engineering-organized extracts of explicit organizer backgrounds; they do not turn the unreviewed Studio drafts into approved clinical cases.

| Suite                  | Count                         | Checks                                                                                                          |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Single questions       | 32: four per imported persona | Authored background, paraphrase, follow-up, missing allergy                                                     |
| Multi-turn encounters  | 8                             | Identity, continuity, unsupported medication questions, appropriate patient knowledge                           |
| Adversarial cases      | 8                             | Gated interview/chart facts, invented measurements, cross-patient claims, injection and false allergy negatives |
| Assessment transcripts | 2                             | Stronger/ weaker performance; N/A, applicable denominator, evidence and safety review                           |
| Newly authored patient | 1                             | Immediate reuse, work/sleep facts, guarded topic, empathy release and unknown allergy                           |

This is a small prototype suite. Its background-only imported cases are intentionally conservative because the CSV does not specify full patient knowledge or clinical disclosure rules. Faculty-approved clinical cases and broader held-out adversarial prompts are required before educational deployment.

## Commands

```powershell
npm test
npm run evaluate:local
node scripts/evaluate.js --model=us.anthropic.claude-sonnet-4-6
node scripts/evaluate.js --model=us.amazon.nova-2-lite-v1:0
```

Cloud evaluation pings the chosen model first and stops if access fails. It runs the actual topic selector, generator and grounding checks; a recorded fallback is never counted as a Bedrock-delivered reply. Each model writes a separate JSON report under `output/`. Record model ID, region, prompt/fixture revision, median and p95 latency, provider counts and fallback frequency.

Structural safety checks validate supporting IDs, gates, exact unknown/deflection behavior and clinical numbers. They cannot independently prove semantic grounding. The runtime model reviewer is part of the system under test, not an external gold standard. Read every delivered reply against its profile, including the introductory identity and all student assertions, to catch unsupported semantic claims, leaks, stereotypes or excessively clinical language.

## Review and selection

[BENCHMARKS.md](BENCHMARKS.md) records current aggregates and unresolved assessment judgments. The suite has informed fixes, so subsequent runs are regression checks rather than untouched holdouts.

To rerun only the two recorded reference assessments after a grading change:

```powershell
node scripts/evaluate-assessment.js --from=output/evaluation-<model>-<timestamp>.json
```

This reuses the reference student/patient transcript and events, writes source/revision metadata, and fails if either assessment is provisional. It does not benchmark new dialogue. Faculty review must check prose, order and fairness. `node scripts/cloud-smoke.js` exercises real Bedrock/S3 and new-patient HTTP publication with isolated synthetic data.

1. Review the 32 persona questions and eight conversations for naturalness, continuity and appropriate patient knowledge. Annotate pass/fail, unwanted verbosity, new facts, negations and uncertainty.
2. Confirm no hidden fact, locked report or cross-patient clinical claim was delivered in adversarial or unseen cases.
3. Review the two assessment outputs against the supplied faculty rubric. Check every citation, skipped expected action, N/A domain, denominator, actionable coaching and domain 6/7 safety-review flag.
4. Complete the JSON report's manual-review fields and name the reviewer. Engineering review and qualified faculty clinical review must be labeled separately.
5. Select a model only with no delivered hidden-fact leaks or unsupported clinical facts, at least 90% correct disclosure/unknown behavior, and acceptable manually reviewed naturalness. Compare latency and fallback frequency as well. Pin the selected model ID for recording.

Reports deliberately leave `modelSelected=false` until review is complete. Automated gate success alone does not select a model or establish clinical reliability. Local suite results test deterministic engine boundaries; they are not an AI model benchmark. Assessment templates are reference expectations awaiting faculty review, not clinically validated gold ratings.

New failures should become regression cases while keeping a separate final held-out set. Avoid changing examples to memorize the final new patient. Fine-tuning is a later option only after measured failures and a suitable reviewed conversation corpus exist.
