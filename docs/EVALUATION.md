# Evaluation protocol

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

1. Review the 32 persona questions and eight conversations for naturalness, continuity and appropriate patient knowledge. Annotate pass/fail, unwanted verbosity, new facts, negations and uncertainty.
2. Confirm no hidden fact, locked report or cross-patient clinical claim was delivered in adversarial or unseen cases.
3. Review the two assessment outputs against the supplied faculty rubric. Check every citation, skipped expected action, N/A domain, denominator, actionable coaching and domain 6/7 safety-review flag.
4. Complete the JSON report's manual-review fields and name the reviewer. Engineering review and qualified faculty clinical review must be labeled separately.
5. Select a model only with no delivered hidden-fact leaks or unsupported clinical facts, at least 90% correct disclosure/unknown behavior, and acceptable manually reviewed naturalness. Compare latency and fallback frequency as well. Pin the selected model ID for recording.

Reports deliberately leave `modelSelected=false` until review is complete. Automated gate success alone does not select a model or establish clinical reliability. Local suite results test deterministic engine boundaries; they are not an AI model benchmark. Assessment templates are reference expectations awaiting faculty review, not clinically validated gold ratings.

New failures should become regression cases while keeping a separate final held-out set. Avoid changing examples to memorize the final new patient. Fine-tuning is a later option only after measured failures and a suitable reviewed conversation corpus exist.
