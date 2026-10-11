# Recording the bias segment

Aim for **50 seconds**, leaving a ten-second margin below your one-minute limit. Finish all generation and assessments before recording. Open **Faculty → Student results**, choose the medical student's alias or a labeled AI demo alias, and enable **Presentation view**. This uses stored ratings and exact recorded quotes; it does not create or alter scores.

The supplied OSCE bias rubric already supports individual encounters. A group adds cross-trial observations when its clinical/scenario snapshots are comparable; it is not necessary to assess anchoring, leading questions or demographic assumptions in one encounter. Ratings are performance levels (higher is stronger), not an amount or probability of bias. Unsupported categories remain Not observable.

## Screen sequence and narration

| Time | Screen | What to say |
| --- | --- | --- |
| 0–10 sec | Selected learner's result | “A standard score can miss why an interaction went wrong. Faculty can also review reasoning and communication through five bias-related criteria.” |
| 10–28 sec | One actual concern or strength and its quote | “Here, the system links its judgment to what the learner actually said. Faculty can inspect the original conversation instead of trusting a number alone.” Point out the real category and quote; do not read all five categories. |
| 28–40 sec | Coaching below that quote | “The feedback suggests a concrete change for the next encounter. If there isn't enough evidence, the category stays unscored.” |
| 40–50 sec | Completed comparison group, if available | “Across similar cases, faculty can also review differences in questioning and respect. These are prompts for a debrief, not proof of a person's beliefs.” |

When showing generated results, add: **“These are labeled AI-generated demonstration encounters.”** If the model reports no concern, show that result honestly; do not describe a planned behavior as a detected finding. Skip the group transition if its analysis is unavailable. A single quoted rubric assessment is enough for this segment.

The separate Bias review board contains heuristic performance variance summaries. These differ from the supplied five-category rubric: do not describe its variance index as a validated bias score, or substitute its gaps for transcript evidence.

## AI-to-AI preparation

Start the updated backend with `npm start`. The preparation script connects to the running local app, creates a separate **AI demo** alias, generates the learner's utterances using server-only local AI credentials, and sends them through the normal student encounter APIs. The patient responds through the existing model/disclosure pipeline. Standard and bias assessments are generated normally afterward; their ratings are never supplied by the replay tool.

Three behavior instructions are available: `balanced`, `anchoring`, and `stereotyping`. These are test inputs, **not predicted severity labels**. The stereotype example deliberately simulates poor communication without slurs or inferred demographics. It is not clinical guidance. Four to eight turns per trial are allowed (six by default). These short examples are not full-length OSCE encounters and may leave categories unobservable.

Preview without spending AI calls or creating records:

```powershell
node scripts/prepare-bias-demo.js --profile b5814549-fd2b-42a2-af78-9b681ad6f268 --behavior balanced
node scripts/prepare-bias-demo.js --group dyslipidemia-diverse-backgrounds --behavior anchoring
```

Use an existing published patient **ID**, not its name. The commands above use organizer Omar Sinclair, **45**, with dyslipidemia, UUID `b5814549-fd2b-42a2-af78-9b681ad6f268`, preserved from the faculty CSV. The roster ID `omar` is a different **54-year-old** chest-pressure case. Check the recorder's database for the intended published case before running. For another case, obtain its ID from the faculty API or patient form. The tool never edits patient profiles or existing human encounters. Direct Node commands avoid PowerShell/npm argument-forwarding differences; the `demo:bias` npm alias is available in shells that forward `--` correctly.

Create a single example (real AI usage):

```powershell
node scripts/prepare-bias-demo.js --profile b5814549-fd2b-42a2-af78-9b681ad6f268 --behavior balanced --turns 6 --manifest output/demo-balanced.json --run
node scripts/prepare-bias-demo.js --profile b5814549-fd2b-42a2-af78-9b681ad6f268 --behavior anchoring --turns 6 --manifest output/demo-anchoring.json --run
```

Optional group example:

```powershell
node scripts/prepare-bias-demo.js --group dyslipidemia-diverse-backgrounds --behavior anchoring --turns 6 --manifest output/demo-group.json --run
```

One four-patient group uses up to 24 learner generations, plus patient generation/validation and assessment calls. No speech or avatar generation is requested. The script reports progress and stores an ignored recovery manifest. Repeat the identical command to resume existing encounters and retain already submitted turns. Do not change the manifest's server, target, behavior or turn count. Preserve partial encounters after failure; refresh credentials/configuration and retry rather than inventing a successful result. New manifests deliberately create separate runs. There is a small interruption window before an encounter ID is first written to the manifest; inspect the new AI alias's history after an interrupted start to avoid duplicating that encounter.

AI demo aliases carry `aiDemo: true`, display an explicit faculty label and are excluded from human cohort averages. They still appear separately in the faculty results and review board. Run this tool only against local synthetic demo data. Normal alias permissions, publication pinning, trial order and evidence validation still apply. Generation may take minutes; it does not fit inside the recorded segment.

Start with the two individual examples above. The optional `--behavior stereotyping` deliberately adds overt demographic assumptions; it is available for testing but is not necessary for the recording. Do not promise graded levels of bias. Review **every** chosen recording example once: patient replies/provider fallback, exact supporting quotes, category explanations, clinical availability and alternative explanations. Intentional behavior prompts do not establish detector reliability; generated examples demonstrate workflow only. This short learner replay uses the visible patient overview and dialogue, without automated chart navigation. It is not a full chart-review OSCE. The cholesterol scenario may not support diagnostic attribution or handoff-framing ratings.

## Full recording budget

| Segment | Target |
| --- | --- |
| Teammate hook | 0:00–0:25 |
| Teammate core screenshare | 0:25–3:00 |
| Your bias segment | 3:00–3:50 |
| Technical and business explanation | 3:50–4:20 |
| Closing | 4:20–4:25 |
| Spare time | 5 seconds |

For the last 30 seconds, use the human-prepared business figures and a simple architecture picture: **case library → patient conversation → evidence-linked feedback → faculty review**. Describe costs as measured usage or explicitly labeled estimates. No new market/cost research is included in this task.

The medical student's real Omar result is on **the recorder's computer**. Keep it there and select its actual student alias. Per the user's choice, the recorder will generate any AI examples there too. Local generation here stopped before the first learner turn because AWS credentials had expired: no generated dialogue or ratings are ready on this laptop. An explicitly labeled AI alias and its empty encounter remain recoverable through ignored `output/demo-omar-balanced.json`; no human alias or unfinished human encounter was changed.

Still needed before rehearsal: select the medical student's completed Omar result on the recording machine; run the chosen AI examples with working credentials; review their returned assessments; choose one readable quote and optional group comparison; rehearse the complete 4:25 cut. Automated checks cover replay/ownership/recovery, not clinical validity or real-model performance.
