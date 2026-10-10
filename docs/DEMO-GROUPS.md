# Faculty / Student comparison demo

Run `npm start`, open http://localhost:3000/app.html, and choose a workspace. If an older server is running, restart it and refresh the page. Sessions reset on a server restart; student aliases, assignments and encounter progress persist.

## Assign and run

1. Enter **Faculty**. Patient Studio has an **Assign a patient group** panel; click **Assign a group**, or use **Prepared groups** in navigation.
2. The preconfigured **Dyslipidemia: medication concerns** group is **Ready to assign** immediately. Choose Student A/B and click **Assign group**. No parsing, patient editing or publication is needed for assignment.
3. Switch to that student. **My assigned assessments** is their first page. Click **Start assessment** or **Resume assessment** directly. Cases run in a shuffled, persisted order.
4. Try a greeting, medication concern, a lipid-record question and an unspecified allergy. No allergy should be invented; the lipid report stays locked until a related question.
5. Finish the first trial, then use **Continue to next patient**. Standard feedback is released only after both trials finish.
6. Refresh/restart midway and select the same alias to test recovery. Starting twice resumes the same attempt and encounter.
7. Switch to Faculty → **Student results** for the trial assessments and evidence. Select **Run bias assessment** on the completed group or an individual encounter to use the supplied five-category OSCE criteria. Bias assessment stays separate from student feedback. Faculty inspection cannot change a student encounter.
8. Switch to another student to check ownership. Use **Select open assessments** for the large **Individual patient** / **Patient group** choices. Ordinary individual practice provides immediate feedback. **My assignments** returns to faculty-assigned work.
9. Separately demonstrate Faculty **Patient Studio → New patient → upload/extract → acknowledge/publish → Start visit**. Independent patient authoring remains available.

## Optional group settings

**Group details and settings** starts collapsed. It contains provenance, demographic differences, optional patient editing and one checkbox: **Include in open assessments**. When checked, students can self-select that ready group without a faculty assignment. When unchecked, only assigned students can start it. Existing assignments/attempts are retained when this setting changes.

**Create a patient group** selects at least two published patients, a title and group type; purpose is optional. Practice groups may combine conditions. Demographic comparisons require matching clinical/scenario settings. Editing patients is a separate preparation task, not a step during assignment. Student management is collapsed below the catalog.

## Prepared releases and existing work

Startup installs the bundled synthetic demo releases with explicit team-prepared provenance. This records no faculty clinical approval; it makes the supplied prototype immediately runnable. Custom authoring retains faculty review and acknowledgment.

Seed revision 2 uses separate `comparison-omar-demo` / `comparison-alex-demo` profile IDs. Earlier `comparison-omar` / `comparison-alex` drafts, publications and pinned encounters remain intact. The catalog moves to the bundled releases; previous assignments continue using their originally pinned cases. An explicitly saved availability setting is preserved during migration. New installations include the demo in open assessments.

## Prepared case provenance

The tracked seed is [prepared-groups.json](../corpus/prepared-groups.json). It uses the supplied **faculty CSV** and existing organizer-derived teaching suggestions for Omar, rather than importing the richer Hugging Face profile's inferred medications or other extra details. Raw CSV content is retained. The richer downloaded corpus remains available unchanged; do not silently combine differing versions.

Omar remains 45, male, African-American. Alex Morgan is an explicitly **team-authored adaptation**, 45, male, White American. The clinical facts, personality, language/style, objectives and disclosure rules match. Alex's source notes identify the retained original row as Omar's provenance, not Alex's biography. The bundled releases are team-prepared for the prototype; they do not assert clinical correctness or faculty clinical approval.

Supplied lipid values are retained with unspecified units/date. Medication names, doses and allergies remain unknown. General NHLBI/AHA reference excerpts support review and coaching; they do not add patient-specific facts. The supplied CSV subset has no meal-count contradiction to resolve; differing meal descriptions in the richer organizer-linked corpus have not been imported into this pair.

Both use a generic portrait and a common `presentationKey` for voice selection. Speech teammates must preserve that common selection within an attempt and avoid adding different videos/accents to this comparison. A changing voice catalog, model response variation and learning from the repeated clinical case remain possible confounds. Two trials are a prototype comparison, not a validated bias measurement.

## Remaining ownership

| Owner                 | Remaining work                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Faculty/case reviewer | Rehearse the ready cases and verify recorded assessments against the organizer rubric; review any custom clinical edits.                                     |
| Bias teammate         | Calibrate the supplied OSCE assessment, expand contrasting examples and repeatability tests, and coordinate the [faculty-only adapter](BIAS-INTEGRATION.md). |
| Speech/UI teammate    | Rehearse physical microphone, audio, common voice and generic portrait in Chrome/Edge.                                                                       |
| Demo teammate         | Record the assigned group, faculty results and independent new-patient creation; avoid claiming differences prove bias.                                      |

`npm test` covers the HTTP and DOM workflows with local inference. `node scripts/demo-smoke.js` uses real Bedrock and configured S3 in an isolated ignored data directory/cloud prefix, using the bundled prepared demo releases. It prints provider/storage results and writes ignored `output/group-smoke.json`. This does not publish cases in your active application store or replace faculty review.
