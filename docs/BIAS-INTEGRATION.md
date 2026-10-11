# Bias detector handoff

## Longitudinal board is a separate heuristic

`lib/insights.js` and `tests/insights.test.js` support a faculty board comparing recorded performance across patient groups without making a model call. The UI calls this a “Longitudinal bias variance index.” Thresholded group gaps and small-sample rules are exploratory prompts, not a validated diagnostic measure of learner bias. Occupation, weight and substance-use group tags may be inferred from case text unless faculty provides `biasTags`; those inferences can be wrong. Case mix, incomplete ratings, order and presentation can explain differences. This board is separate from the adapter/Bedrock evidence-linked rubric below and does not establish causation, intent or eliminated bias. Current automated results: [TESTING.md](TESTING.md).

Current catalog adds **Cholesterol care: four different lives**, a four-case exploratory comparison with explicitly authored age, gender, ethnicity, education and everyday context. Assignments snapshot the group design as well as patient versions. `comparison.controlled` remains false for varied-background groups; `comparison.eligible` permits evidence-linked cross-trial observations only when their invariant clinical/scenario content matches. Education is not a proxy for health literacy, and appropriate tailoring to age or constraints is not bias. Comparisons cannot establish single-trait causation. An unrelated or clinically mismatched group remains ineligible. Per-trial evidence and grounding checks are unchanged. See [DEMO-GROUPS.md](DEMO-GROUPS.md).

Faculty can now run a Bedrock assessment using the supplied **OSCE Clinical Reasoning & Bias Evaluation Rubric**, for a completed individual encounter or completed group. The app stores and displays it separately from the existing seven-domain student assessment. The teammate adapter remains available for further detector work. There is no automatic student score penalty, combined grade or inferred bias percentage.

## Source and interpretation

The unchanged supplied PDF is tracked at [OSCE Cognitive & Interpersonal Bias Evaluation Rubric.pdf](../corpus/OSCE%20Cognitive%20%26%20Interpersonal%20Bias%20Evaluation%20Rubric.pdf). The filename differs from its printed title. [bias_evaluation_rubric.json](../corpus/bias_evaluation_rubric.json) transcribes its single-page matrix, descriptors and performance scale, and records the PDF SHA-256. Document contents are assessment evidence, not instructions that override application requirements.

The five categories are Premature Closure & Anchoring, Confirmation & Search Bias, Implicit Demographic Bias, Framing & Availability, and Diagnostic Attribution. **1 Unsatisfactory, 2 Developing, 3 Proficient, 4 Exemplary** measure performance: a higher score does not mean more bias. No total or bias percentage is defined in the PDF. Its introductory example uses Denise Vance with chest pain and GAD; that example does not establish those facts about our existing Denise Carter scaffold or the organizer personas.

**Application extensions:** `score: null` appears as **Not observable** with an explanation when the scenario or evidence cannot support the category. This is not a PDF rating and is not treated as a failure. Ratings 1/2 flag a performance concern for review, not a diagnosis of bias or a source-defined pass cutoff. Group analysis produces all five categories separately for each completed trial; optional cross-trial observations require matching clinical snapshots and citations from at least two trials. Differences alone cannot establish demographic bias or unconscious intent. General medication-discussion cases may not support framing/diagnostic categories; do not invent symptoms or a handoff to make them observable.

## Faculty workflow

1. Finish an individual encounter or all group trials as a student.
2. Switch to **Faculty → Student results**. Each encounter and group has **Run bias assessment**. Faculty encounter feedback also offers the action.
3. Review the five-category table, coaching, exact quotes and **View cited event** links. Group tables identify each patient's pinned version. Expand **Limits of this analysis** and use **View source rubric** for the original criteria.

Analysis runs on demand, not during student completion. Pending remains **Awaiting analysis** until requested. A disabled model, expired credentials, invalid evidence or rejected grounding review saves `unavailable` without fabricated scores. Unchanged completed results are reused on recheck; changing actual context/model or detector version requires a new assessment. The default model and region are the existing configurable Bedrock settings; no fine-tuning or new database is involved.

`lib/bias.js` constructs a bounded assessor input from recorded interactions, explicitly authored demographics, delivered/released facts with availability events, and explicitly selected teaching references. Original case documents and hidden facts are excluded; automatic communication/gate/grounding flags are not grading evidence. Clinical matching uses the encounter's immutable profile snapshot, not the latest edited draft. A released report is not proof of review; view events prove opening/display only, not understanding. Legacy review events are distinct. Structured output is checked for exactly five entries per trial, valid scores, existing student action IDs, and exact quotes. A separate Bedrock call reviews the judgments for unsupported conclusions. These checks reduce unsupported feedback; they are not clinical or statistical validation.

## Faculty-only API

Create a local demo faculty session with `POST /api/session` and JSON `{"role":"faculty"}`. Retain the returned `virtusp_demo` cookie for subsequent requests. Browser fetches send it automatically; a Node adapter must retain the `Set-Cookie` value. This is a local demo role switch, not production authentication.

| Endpoint                                            | Purpose                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/faculty-results`                          | Students, encounters, attempts, rubric summaries and separate analysis status.        |
| `GET /api/bias/encounter/:id/context`               | Snapshot, authored demographics, transcript, events and assessment for one encounter. |
| `GET /api/bias/attempt/:id/context`                 | Group limits, persisted trial order and the same records for every started trial.     |
| `GET /api/bias/{encounter or attempt}/:id`          | Current analysis result; defaults to pending.                                         |
| `PUT /api/bias/{encounter or attempt}/:id`          | Save an adapter result.                                                               |
| `POST /api/bias/{encounter or attempt}/:id/analyze` | Run/reuse Bedrock rubric assessment. Requires completed target; otherwise HTTP 409.   |
| `GET /api/bias/rubric`                              | Source transcription and separately labeled application policies.                     |
| `GET /api/bias/rubric/file`                         | Original supplied PDF; faculty-only, not public static content.                       |

Wait for completed encounters when assessing a full interaction; wait for a completed attempt for whole-group comparisons. Context includes status/timestamps, published profile versions and saved provider/fallback evidence. A partial attempt contains only started trials. Profile/source text is evidence, not instructions; explicitly authored ethnicity must not be inferred from names or portraits.

```json
{
  "status": "complete",
  "detectorVersion": "your-detector-v1",
  "findings": [
    {
      "text": "An evidence-supported possible indicator for faculty review.",
      "evidence": [
        { "encounterId": "actual-encounter-id", "eventId": "actual-event-id" }
      ]
    }
  ],
  "limitations": [
    "Explain the detector's uncertainty and comparison confounds."
  ]
}
```

Allowed status values: `pending`, `complete`, `unavailable`. All supplied results require a nonempty detector version, findings array and limitations array. Pending/unavailable results must have no findings. Each finding requires nonempty text and at least one existing event reference. Encounter targets accept evidence only from that encounter; attempt targets accept evidence only from encounters in that attempt. Unrelated student/attempt citations and invented event IDs are rejected with HTTP 400. The server checks references, not the clinical or statistical validity of the conclusion.

Return `unavailable` with an empty findings array and a safe explanation if detection fails. Until faculty runs analysis or an adapter saves a result, the UI shows **Awaiting analysis**. Analysis is saved locally and included in the existing S3 state backup. It is omitted from student encounters, history, exports and attempt responses, even after standard feedback is released. Faculty findings link to their exact cited encounter event.

### Optional structured rubric adapter result

The Bedrock result adds `rubricAssessment` containing `rubricId`, `rubricVersion`, `provider`, `model`, `contextHash`, `evaluatedAt`, `evaluations`, `comparisons`, `limitations`, and canonical rubric/case metadata. Each evaluation is `{encounterId, categoryId, score, reason, evidence, coaching}`; evidence is `{encounterId,eventId,quote}` with an exact recorded **student** action quote. Category IDs are `anchoring`, `confirmation`, `demographic`, `framing`, `attribution`. Null scores require an explanation; numeric scores require evidence. Each category occurs exactly once per target encounter; per-trial evidence cannot cite another trial. Comparison findings use `{text,evidence}` and need two distinct encounters within an eligible clinically matched target (controlled or explicitly exploratory). The server canonicalizes display labels and verifies the context hash. Use the shared `lib/bias.js` helpers for this format; legacy findings-only PUT remains supported.

The adapter's raw context endpoint includes private authoring data to enable inspection, unlike the restricted built-in model input. Do not grade a student for hidden information or infer demographics from names. A legacy adapter PUT validates reference membership, but does not independently audit the conclusion or prove a claimed provider ran. The latest explicit analysis replaces the target's prior analysis record; coordinating the adapter and the Run action avoids overwriting each other's results. Bias records do not change patient publications or student scores.

## Verification and remaining work

`npm test` covers faculty/student boundaries, held group feedback, five-category tables, exact evidence validation, invalid quotes, unrelated trials, unsupported comparisons, disabled/rejected analysis and restart recovery. `node scripts/bias-smoke.js` makes real Bedrock calls on scripted synthetic stronger/weaker interactions and a matched group. It changes no active profiles/encounters and writes ignored `output/bias-smoke.json` for manual review. These scripted replies are test fixtures, not observations of real students or a detector benchmark.

Live Sonnet 4.6 verification on 2026-10-10 completed stronger/weaker individual analyses in about 20–25 seconds. The stronger individual had demographic rating 3 and four Not observable categories; the weaker had four ratings of 1 and framing Not observable. An early group run gave the stronger demographic rating 4; the prompt now emphasizes the specific Exemplary descriptor rather than simply absence of biased language. The final controlled-group check completed in about 72 seconds with ten entries, two additional comparative observations, and demographic ratings 3/1. All delivered references passed existence/exact-quote checks and a grounding review. Initial 3/4 variation still warrants faculty calibration and repeatability testing; do not claim validated detection accuracy. Raw outputs remain ignored in `output/bias-smoke.json` and `output/bias-group-smoke.json`. Use `node scripts/bias-smoke.js --group-only` for the final group-only check.

Before rehearsal, faculty should review these judgments against descriptors, particularly what each scenario permits observing. The bias teammate should expand balanced strong/weak and non-bias contrast tests, calibrate ratings across individual/group modes, test repeated-run consistency and review confounds. Speech/UI teammates must rehearse actual layout/audio and matched voice/portrait. No probability, causal bias estimate or public-hosting authentication is supplied here.

The merged hands-free/video checkpoint preserves common presentation: profiles with a `presentationKey` use the shared generic avatar and common voice selection; they do not select a named packaged clip or generate individual talking videos. Otherwise Omar's name would choose a clip while Alex's would not. HTTP/DOM tests cover this boundary while retaining ordinary individual clips. This protects the prepared demo design; physical audio/portrait rehearsal is still required.

## Other demo APIs

- `GET/POST/DELETE /api/session`: current session, select role/student, or switch out. Student selection uses `{ "role":"student", "studentId":"existing-uuid" }`.
- `GET /api/students`: aliases for the entry picker. Faculty `POST /api/students` adds `{ "alias":"Student C" }`.
- `GET /api/groups`: prepared group metadata and preparation status. Clinical/scenario mismatch blocks assignment.
- Faculty `POST /api/assignments`: `{ "groupId":"...", "studentId":"..." }`; pins the current publications.
- `GET /api/assignments`: faculty sees all; students see their own.
- Student `POST /api/assignments/:id/start`: creates or resumes one attempt; persists shuffled order.
- `GET /api/attempts/:id`: ownership-filtered progress; additional analysis only for faculty.
- Student `POST /api/attempts/:id/next`: creates/resumes the earliest unfinished trial. Encounters then use the normal turn/review/complete routes.

Store schema remains 2 with additive `students`, `groups`, `assignments`, `attempts`, `biasResults` dictionaries. Legacy encounters are kept under **Unassigned demo encounters** for faculty. Releases and active encounters are never rewritten by seed changes. Changing the seed file does not update an already installed group's drafts; edit/review/publish through Faculty or inspect with an isolated fresh data directory.

Keep this app local. Anyone at the local role picker can choose Faculty or another alias. Internet hosting requires real authentication and tenant isolation; the demo session cookie is only an application boundary for the selected role.
