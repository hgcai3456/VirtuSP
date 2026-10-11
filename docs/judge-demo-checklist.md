# Judge demonstration checklist

> Historical observed checklist. Its failures and not-run statements are dated 2026-10-10, not current status. The authoritative rehearsal is [DEMO.md](DEMO.md#judge-proof-sequence); current automated evidence is [TESTING.md](TESTING.md) and [requirements traceability](REQUIREMENTS_TRACEABILITY.md). Use strict mode explicitly.

Use this sequence for the Challenge 1 fresh-patient demonstration: a faculty member creates a new patient in Patient Studio, publishes it, and a student interviews that same patient without a code change or a restart.

Statuses were observed on 2026-10-10 against the working tree, with `AI_ENABLED` not set to `true`. The official challenge PDF was not in the workspace. Details and evidence are in `docs/requirements-audit.md`.

Do not use a seeded roster patient, a database edit, or a hidden route as a substitute for steps 1–8.

## Before you start

1. Use Node.js 22.17 or newer. This audit used v24.15.0.
2. From the repository, run `npm ci` if dependencies are not installed.
3. Leave `AI_ENABLED` unset or `false` unless you are intentionally testing Bedrock. This checklist's observed results are the local path.
4. Start with `npm start` and open `http://127.0.0.1:3000/app.html` in Chrome or Edge.
5. Use a desktop window at least 1280 pixels wide so the encounter stays two columns. Below 900 pixels the panes stack.
6. Use a clearly synthetic patient. Do not type real patient information.

## Faculty creates the patient

| Step | Action | Observed result |
| --- | --- | --- |
| 1 | Choose Faculty. Open Patient Studio. Click **New patient**. | **Pass.** The New patient dialog opened. |
| 2 | Add a knowledge source: a short synthetic excerpt or a TXT/PDF teaching note. | **Not completed in the browser pass.** The API audit uploaded a text source and published it on a different profile. The form has **Documents and references** and **Add source**. |
| 3 | Attach a clinical artifact, such as a TXT or PDF note, and set its chart section. | **Not completed in the browser pass.** The API audit attached a text note, kept it hidden, then opened the file after the release phrase. PNG, JPG, PDF, TXT, and CSV are the upload types. Scans are not read. |
| 4 | Set when the finding and the artifact become available. | **Fail for a form-only patient.** Trust gates and report release modes exist under **Advanced scenario settings**. The finding form has no question-phrase field. New findings are saved with an empty keyword list, and publication allows that. |
| 5 | Add learning objectives and coaching tips whose weights total 100. | **Not completed in the browser pass.** The API audit published objectives and the feedback used them. The form can add objectives. They are optional. |
| 6 | If generation was used, read and correct the draft before publish. | **Not run.** AI Generate requires Bedrock. With AI off, a descriptive preview does not create a patient and does not invent facts. |
| 7 | Check consistency. | **Partial.** The review checkbox is an attestation. Publishing a medication that repeats an allergy returned 422 in the API audit. That is not a clinical review. The pathology sample is not clinical validation. |
| 8 | Check the acknowledgment and click **Create & publish patient**. | **Pass.** Synthetic patient Lane Ortiz published. Toast: `Lane Ortiz published. Start a visit from the patient card.` No restart was required. |

## Student interviews the new patient

| Step | Action | Observed result |
| --- | --- | --- |
| 9 | Switch to Student. Choose open assessments, then individual patients. Find the new name. | **Pass.** Lane Ortiz was listed with age unspecified and **Start visit**. |
| 10 | Start the visit immediately. | **Pass.** The encounter opened on case v1. The greeting was `Hello.` |
| 11 | Confirm the split screen and ask a text question. | **Layout pass. Text fail.** The page used two columns, about 600px and 733px, with the chart on the right and `Nothing in this section yet.` Typed Send did not add the question. The Answer button is not shown, and Send returns without contacting the server until that missing control marks the call live. |
| 12 | Ask for identity, a repeat, and a paraphrase of the finding. | **Fail in the page.** On the API, a keyworded profile answered name, age, and an exact keyword, repeated with `As I said`, and did not answer a paraphrase that omitted the keywords. The Studio patient answered the finding question with `Okay, I'm listening.` |
| 13 | Open the chart and the artifact only after the release condition. | **Fail for the Studio patient**, because nothing was disclosed. On the API, opening Notes or Labs did not release a question-only file. The release phrase returned the file. An unrelated question did not release it. |
| 14 | Finish the encounter. | **Not reached in the browser**, because the question never submitted. The API complete path returned feedback. |
| 15 | Read objective-linked feedback. | **Partial on the API.** A hello-only visit scored 0 on both objectives and suggested asking about them. A visit that actually disclosed the facts scored full credit. Rubric domains stayed **Not assessed** with no total. Empathy and interview-sequence notes were observations, not communication grades. |
| 16 | Inspect the encounter record. | **Pass on the API.** The export contained disclose and release events. `appointment-log.csv` listed the encounter. `chat-tracker.csv` stored the question and reply. The duration file does not list disclosed facts. |

## Second patient

Repeat steps 1–12 with a different name and a different finding. In the API audit, Casey Quinn returned only the knee sentence and did not receive Avery Quinn's sleep fact or lab value. Student B received 404 for Student A's encounter.

The browser pass did not create the second patient.

## Stop if you see these

- Send leaves the transcript on the greeting. The demonstration is blocked. Do not switch to a roster patient and describe it as the patient you just created.
- The new patient says `Okay, I'm listening.` to the finding you entered. The profile was published without question phrases.
- The page shows rubric scores while the provider is `local-provisional` and the domains say **Not assessed**. Say that the scores were not produced.
- A lab value or unreleased report title appears before the student asks for it. In this audit the LDL value stayed hidden. Feedback did name an unreleased report title after the visit.

## After the P0 fixes

Re-run steps 1–16 on a new synthetic name. The pass condition is: one faculty publish, no restart, the student types a question, the approved sentence appears, the chart updates only after the authored condition, feedback names that finding, and a second patient does not say the first patient's sentence.
