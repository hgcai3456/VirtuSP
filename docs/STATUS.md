# Implementation status

> Historical checkpoint below: its counts, selected model and “public hosting deferred” row are not current-release claims. The checkout now contains AWS deployment configuration and historical rollout observations. Use [submission](HACKATHON_SUBMISSION.md), [current architecture](ARCHITECTURE.md#current-stack-and-persistence) and [current testing record](TESTING.md) for this audit. Exact approved-line guarantees apply to strict mode, not optional natural dialogue.

Checkpoint date: 2026-10-10. Read [HANDOFF.md](HANDOFF.md) for teammate tasks and [BENCHMARKS.md](BENCHMARKS.md) for measured results.

| Capability                                                                | Status                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Eight UUID-preserving CSV drafts and original provenance                  | Implemented                                                                                             |
| Omar/Yvette organizer teaching suggestions                                | Unreviewed drafts                                                                                       |
| Structured/descriptive authoring, sources, uploads, artifacts, objectives | Implemented; live descriptive drafting and real PDF extraction exercised                                |
| Publication and immutable encounter versions                              | Implemented and regression tested                                                                       |
| Server gates, progressive records, grounding, fallback and stable events  | Implemented; live comparisons and new-patient integration exercised                                     |
| Bedrock                                                                   | Sonnet 4.6 and Nova 2 Lite verified in us-west-2                                                        |
| Private encrypted/versioned S3                                            | Saves, file/version readback, backup and restore verified                                               |
| Seven-domain rubric and separate objectives                               | Implemented; strict Sonnet schema and reference transcripts exercised; semantic faculty review required |
| Separate evaluations/development examples                                 | Implemented; three iterative cloud comparisons retained locally                                         |
| Organizer S3 portraits                                                    | Read returned AccessDenied; neutral SVG fallback supplied                                               |
| ElevenLabs                                                                | Adapter implemented; live voice deferred by user                                                        |
| Browser recognition, cancellation and playback animation                  | Implemented; actual microphone/audio checks pending                                                     |
| Frontend                                                                  | DOM workflow passed; connected-browser visual review pending                                            |
| Setup, architecture, evaluation, demo/pitch and handoff                   | Included                                                                                                |
| Short demo and four-minute pitch video                                    | Script included; recording pending                                                                      |
| Public hosting, managed agents/retrieval, fine-tuning                     | Deferred by plan                                                                                        |

Engineering checks: 19 regression tests pass; local evaluation passes 85/85 with zero structural violations. Latest cloud dialogue: Sonnet 78/85, Nova 83/85. Coding-agent prose inspection found no delivered hidden leaks or unsupported clinical facts in these two runs. This small, repeatedly used suite is not proof of clinical reliability.

Sonnet is the pinned technical prototype default for more natural dialogue and working corrected rubric schemas. Nova is faster and literal; both latest assessment outputs failed applicability validation. Neither model has faculty or final recording approval. Evidence IDs and model review cannot guarantee chronology, fairness or assessment accuracy.

Organizer drafts remain unpublished pending author review. Faculty approval of persona knowledge, sources, supplements and rubric judgments is separate from engineering verification.

Faculty creation now uses a modal upload/review form with one acknowledgment. See [AUTHORING.md](AUTHORING.md); OCR and actual browser layout checks remain pending.
