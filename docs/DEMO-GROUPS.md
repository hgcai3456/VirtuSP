# Faculty and student simulation catalog

Run `npm start`, open http://localhost:3000/app.html, and choose a workspace. Restart an older server and refresh with Ctrl+F5 after pulling. Aliases, assignments, trial order and encounters persist in local JSON with the existing S3 backup; sessions reset on restart.

## Assign and rehearse

1. Faculty opens **Patient Studio**. **Select an AI patient** lists individual simulations. **Multi-patient assessment** follows below with ready group cards. There is no assignment banner or availability switch.
2. Under either a patient or group, expand **Assign this simulation to student**, select an alias, then **Assign**. Individual assignments pin one published version; groups pin all published versions and their comparison design. Students cannot create aliases, patients or groups.
3. Switch to that student. Their first page shows **My assigned assessments**, followed immediately by all available individual and group simulations. Assignments recommend work; they do not restrict the catalog. Every ready group is open, including older `availableToAll: false` groups. Drafts and incompatible/unpublished groups remain unrunnable.
4. An individual visit releases standard feedback immediately on completion. In the four-case group, try a greeting, medication concerns, work/context, a lipid-record question and an unspecified allergy. Reports follow authored disclosure rules; unspecified allergy/medication history must not become negative findings.
5. Finish each trial and choose **Continue to next patient**. Group feedback stays held until all four trials finish. Refresh/restart midway to verify resume. Duplicate starts reuse the existing encounter.
6. Faculty **Student results** shows trial feedback and separate **Run bias assessment**. The supplied five-category OSCE rubric is applied per encounter. **Bias review** retains the teammate's longitudinal performance view. Students cannot retrieve faculty analysis or another student's records.
7. Independently demonstrate **AI Generate a new Patient** or the existing upload/manual **New patient** flow. Publication remains faculty-only.

## Four prepared comparison cases

**Cholesterol care: four different lives** uses separate `lipids-*-demo` IDs and retains the original Omar Sinclair row as provenance, not as the new identities' biographies.

| Patient | Age | Gender | Self-described ethnicity | Education and everyday context |
| --- | --- | --- | --- | --- |
| Jordan Ellis | 34 | Female | Black American | Vocational certificate; aircraft maintenance with changing shifts |
| Daniel Brooks | 45 | Male | White American | University degree; office-based project coordination |
| Meera Shah | 58 | Female | South Asian American | Secondary school; shop owner and family caregiver |
| Roberto Vega | 67 | Male | Latino American | Associate degree; retired transit worker on a fixed income |

These are **team-authored synthetic adaptations of supplied clinical material**, prepared before the demo. Demographics and everyday context are explicitly authored; no faculty clinical approval is fabricated. Education does not establish health literacy. Backgrounds do not imply adherence, intelligence or personality. Clinical findings, medication concerns, personality, communication style, objectives and gates are shared. Identity, work, education and everyday context vary.

Sources: [prepared-groups.json](../corpus/prepared-groups.json) and retained [faculty CSV](../corpus/faculty-patients.csv). Cholesterol values retain missing units/date; medication names and allergies remain unspecified. No imaging was invented. Earlier cases/releases remain intact. The teammate's **Practice patients** group remains available separately; it mixes conditions and is not the matched cholesterol comparison.

Startup installs immutable team-prepared demo releases. New IDs preserve older releases and pinned attempts. Changing the seed does not rewrite installed published cases. Custom creation still needs the faculty publication acknowledgment. Clinical mismatches block new comparison starts/assignments; pinned attempts continue unchanged.

## What the guide supports

The supplied [bias rubric](../corpus/bias_evaluation_rubric.json) names race, gender, **age and socioeconomic status**. It prescribes neither sample size nor matched-case experimental design. Four trials are a demo choice, not a statistically validated minimum. Education/background add authored scenario context.

This is an **exploratory varied-background comparison**, not a controlled single-variable experiment. Age, affordability and schedules can legitimately change care. Possible indicators must cite recorded student actions from at least two trials and acknowledge alternative explanations. Trial order, repeated-case learning and model variation remain confounds. See [BIAS-INTEGRATION.md](BIAS-INTEGRATION.md). Bias points are never added to standard rubric scores.

Each case now has an explicitly mapped synthetic portrait matching its authored age and visual character. The original common voice-selection key remains; the speech teammate should review voice/portrait presentation before rehearsal. Portrait variation is another possible comparison confound. See [PORTRAITS.md](PORTRAITS.md) for assets and generation prompts. No demographic videos or accents were added.

Comparison purpose, demographic differences and limitations remain faculty-only in both the catalog UI and API. Students see group titles, patient names, trial counts and neutral completion instructions. Assigned/active encounters serve portraits from their pinned profile snapshot, even after a draft or later release changes.

## Cleanup and remaining work

`node scripts/cleanup-empty-drafts.js` previews untouched placeholders. Stop the app, then use `--apply` to back up the complete local state under ignored `tmp/` and remove only eligible drafts. Authored content, files, publications, encounters, group references and assignments survive. Applying uses normal JSON/S3 persistence; runtime backups are never pushed.

`npm test` verifies HTTP/DOM workflows, ownership, pinning, four-trial feedback release and recovery. Isolated Chrome checks cover 1280px and 600px layouts. These tests do not establish clinical or bias-detection validity. Faculty should calibrate cases and repeated Bedrock ratings; speech should rehearse microphones/audio; demo owners should record assignment, completion, faculty evidence and independent creation. This remains a local demo alias system, not production authentication.

Simulation review checkboxes/buttons are removed. Opening a chart is recorded as an opening; it is not fabricated evidence that the student read or understood it. Legacy explicit review events/API remain available for old records. Faculty should judge demonstrated interpretation from the conversation. Legacy review-type objectives now count an explicit opening of released findings or an expanded report, with evidence labeled as access, not comprehension. Clinical interpretation is assessed separately in the rubric.
