# Faculty / Student comparison demo

Run `npm start`, open http://localhost:3000/app.html, and choose a workspace. If an older server is running, restart it and refresh the page. Sessions reset on a server restart; student aliases, assignments and encounter progress persist.

## Prepare once before rehearsal

1. Enter **Faculty**. Above the individual patient cards, select a group under **Assign a patient group** and click **Review & assign group**. The **Prepared groups** navigation tab opens the same workspace.
2. Review **Omar Sinclair** and **Alex Morgan**, correct any problems, acknowledge faculty review, and publish each. Review includes history, reference excerpts, objectives and advanced disclosure/release rules. Automated publication checks are not clinical validation.
3. The catalog becomes **Ready to assign** after both are published with matching clinical/scenario settings. If settings differ, correct and republish the pair. Existing assignments retain their earlier versions.
4. Choose Student A or another demo alias and click **Assign group**. Aliases can be added in this workspace. Assignment does not draft or generate patients.

## Run and review

1. Use **Faculty · switch**, choose **Student A**, then enter Student.
2. Start the assigned test. Its two cases run in a shuffled order that is saved once. Try a greeting, medication concerns, a lipid-record question and an unspecified allergy. No allergy should be invented; the lipid report stays locked until a related question.
3. Finish the first trial. Feedback is held. Continue through **Assigned tests → Start / resume test** for the second trial. Finishing both releases the standard rubric and separate learning-objective feedback.
4. Refresh or restart midway to test recovery. Choose the same alias after restart, then resume the assignment. Starting twice resumes the same attempt and encounter.
5. Switch to Faculty and open **Student results**. Inspect the trial assessments and evidence. Group and encounter bias panels say **Awaiting analysis** until the teammate's detector supplies results. Faculty inspection cannot modify a student's encounter.
6. Switch to Student B: Student A's assignments, history and faculty analysis should be absent. Ordinary single-patient practice still provides immediate feedback.
7. Separately demonstrate **Patient Studio → New patient → upload/extract → review/publish → Start visit**. Comparison groups supplement the challenge's required reusable authoring demonstration.

## Prepared case provenance

The tracked seed is [prepared-groups.json](../corpus/prepared-groups.json). It uses the supplied **faculty CSV** and existing organizer-derived teaching suggestions for Omar, rather than importing the richer Hugging Face profile's inferred medications or other extra details. Raw CSV content is retained. The richer downloaded corpus remains available unchanged; do not silently combine differing versions.

Omar remains 45, male, African-American. Alex Morgan is an explicitly **team-authored adaptation**, 45, male, White American. The clinical facts, personality, language/style, objectives and disclosure rules match. Alex's source notes identify the retained original row as Omar's provenance, not Alex's biography. Both need faculty review; publication does not assert clinical correctness.

Supplied lipid values are retained with unspecified units/date. Medication names, doses and allergies remain unknown. General NHLBI/AHA reference excerpts support review and coaching; they do not add patient-specific facts. The supplied CSV subset has no meal-count contradiction to resolve; differing meal descriptions in the richer organizer-linked corpus have not been imported into this pair.

Both use a generic portrait and a common `presentationKey` for voice selection. Speech teammates must preserve that common selection within an attempt and avoid adding different videos/accents to this comparison. A changing voice catalog, model response variation and learning from the repeated clinical case remain possible confounds. Two trials are a prototype comparison, not a validated bias measurement.

## Remaining ownership

| Owner                 | Remaining work                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faculty/case reviewer | Review and publish both cases before rehearsal; verify actual recorded assessments against the organizer rubric.                                  |
| Bias teammate         | Implement detection and connect the [faculty-only integration contract](BIAS-INTEGRATION.md). No detector or sample findings are fabricated here. |
| Speech/UI teammate    | Rehearse physical microphone, audio, common voice and generic portrait in Chrome/Edge.                                                            |
| Demo teammate         | Record the assigned group, faculty results and independent new-patient creation; avoid claiming differences prove bias.                           |

`npm test` covers the HTTP and DOM workflows with local inference. `node scripts/demo-smoke.js` uses real Bedrock and configured S3 in an isolated ignored data directory/cloud prefix, with synthetic **test-only** approvals. It prints provider/storage results and writes ignored `output/group-smoke.json`. This does not publish cases in your active application store or replace faculty review.
