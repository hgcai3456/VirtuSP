# Prototype results, 2026-10-10

> Historical model measurements, not a benchmark of this audit's checkout or its strict/natural-mode changes. Do not quote these as current-release performance or learner outcomes. See [current verification](TESTING.md).

Region: `us-west-2`. Each dialogue run scored 85 turns: 32 persona questions, 40 turns across eight encounters, eight adversarial prompts and five new-patient turns. Six development examples remain separate. Imported evaluation profiles use explicit organizer backgrounds rather than unapproved complete histories.

| Iteration/model     | Correct disclosure/unknown | Median / p95 turn latency | Provider fallbacks | Structural violations |
| ------------------- | -------------------------- | ------------------------- | ------------------ | --------------------- |
| Initial Sonnet 4.6  | 81/85 (95.3%)              | 3310 / 4535 ms            | 16 (18.8%)         | 0                     |
| Initial Nova 2 Lite | 57/85 (67.1%)              | 1776 / 2904 ms            | 0                  | 0                     |
| Revised Sonnet 4.6  | 79/85 (92.9%)              | 3390 / 4421 ms            | 12 (14.1%)         | 0                     |
| Revised Nova 2 Lite | 82/85 (96.5%)              | 2442 / 3062 ms            | 4 (4.7%)           | 0                     |
| Latest Sonnet 4.6   | 78/85 (91.8%)              | 3532 / 5015 ms            | 5 (5.9%)           | 0                     |
| Latest Nova 2 Lite  | 83/85 (97.6%)              | 2522 / 3435 ms            | 7 (8.2%)           | 0                     |

Fallbacks exclude three deliberately blocked attacks. Latency includes selection, generation and grounding. Correctness includes approved fallbacks, with provider counts reported separately. Small timing differences are not definitive.

Initial Sonnet prose review failed despite clean structural checks: replies invented work hours, job duration and spouse gender. Nova initially lost continuity when transcript metadata contaminated selection. Fixes included explicit entailment for everyday facts, role/text-only history, opaque topic IDs, first-person approved wording, quote validation and handling unrelated identity selection.

Coding-agent engineering inspection read all 85 delivered replies in each latest run against their explicit profiles. No delivered hidden leaks or unsupported clinical facts were found. Sonnet has more natural paraphrasing and personality; Nova is mostly literal/repetitive. Sonnet's seven incorrect answers were conservative unknowns on routine/follow-up prompts. Nova missed a Yvette follow-up and the new patient's empathy release. Unknown wording remains repetitive; personality tone, especially Walter's hostility, needs faculty review.

These are iterative diagnostic/regression results: the same suite informed fixes. They are **not untouched final held-out results or proof of clinical reliability**. Background-heavy cases, few attacks, same-family model review and coding-agent inspection leave coverage gaps. Qualified faculty review and broader clinical/adversarial conversations are outstanding.

## Assessment and integration

The latest full comparison exposed a nullable-score schema incompatibility in Sonnet and applicability failures in Nova. Sonnet was corrected to supported `anyOf` branches; recorded transcripts were reassessed separately without changing student dialogue. Corrected Sonnet outputs had seven domains, denominator 20/two N/A for the stronger case and denominator 28/no N/A with domains 6/7 at 1 for the weaker case. Repeated stronger totals varied 15–17/20; weaker totals were 8/28. These are draft judgments, not gold grades.

Semantic inspection found speculative and misordered coaching that model review accepted. Automated classification metadata is now excluded as grading evidence; prompts forbid speculation and unfair relevance assumptions. Human review remains necessary. Structure success does not establish assessment accuracy, chronology or inter-rater reliability. **Do not show an unreviewed assessment as a validated score.**

A separate new-patient HTTP integration passed real Bedrock dialogue, guarded disclosure, protected report release/review, unknown allergy, Bedrock feedback, grounded descriptive drafting and private S3 file/manifest/version readback. Backup/restore recovered five files, three versions and one completed encounter into a fresh directory. A real rubric PDF uploaded/extracted. ElevenLabs and real browser/microphone/recording checks remain deferred or outstanding.

Sonnet is the pinned technical prototype default; Nova remains a comparison option. Final faculty/recording approval is pending. Report provider fallbacks and observed failures in the presentation.

## Local audit artifacts

Raw artifacts are ignored in `output/`; preserve them before workspace/account loss:

- Latest dialogue: `evaluation-us_anthropic_claude-sonnet-4-6-1791642621760.json` and `evaluation-us_amazon_nova-2-lite-v1_0-1791642542579.json`.
- Dialogue revision: `a30898a74da7611fdc326f12e4b6da5e91d11829768fa482d7c893ad9d8d5b62`. Later rubric schema/prompt changes were checked by assessment regressions, not another full dialogue run.
- Corrected assessment: `assessment-us_anthropic_claude-sonnet-4-6-1791642877799.json`, including source/revision metadata. Faculty review remains pending.
- Integration: `cloud-smoke.json`, including local recovery directory and isolated S3 prefix.

Label coding-agent engineering inspection separately from qualified faculty clinical approval. Preserve earlier failed outputs to explain what changed and why.
