# Release readiness

> The verification table below is historical. This audit's current results are in [TESTING.md](TESTING.md). Strict-mode boundary tests do not verify optional natural dialogue, which generates prose and receives guarded wording. No live cloud/provider or qualified educator validation was performed for this documentation change.

Status words mean: **implemented** (in the running path), **verified** (an automated check exercised that path on this checkout), **blocked** (a required check could not be completed), **deferred** (intentionally left for later). Engineering evidence is not educator validation, clinical validation, or institutional approval.

Checkout: branch `feature/talking-patient-avatar`. Record the commit and dirty-diff hash from `reports/release-results.json` after each verification run. Do not treat an older benchmark file as a measurement of this tree.

| Organizer requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- |
| Faculty create a new patient and interview it without patient-specific code | Patient Studio plus `POST /api/encounters` on any published profile | `tests/release-boundary.test.js` HTTP publish and interview; `tests/authoring.test.js` | verified for the HTTP path |
| Patient factual text comes from approved wording | `engine.ask` builds the line; unexpected prose is dropped | Same file, empty-citation attacks and paraphrase mock | verified |
| Courtesy and approved answers still work | Courtesy catalog and exact `say` text | Engine and boundary tests | verified |
| No invented document memories | `documentAwarenessFact` is an unapproved draft; `create` does not insert it | `tests/profiles.test.js`, engine attachment tests | verified |
| Unspecified allergy stays unspecified | Unknown catalog, not a negative | Appointment regression and boundary test | verified |
| Locked facts stay locked across routes | Server disclosure; export uses the public view; missing artifact file is 403 | Boundary HTTP test and disclosure tests | verified for the routes those tests call |
| Rubric is not chosen by age alone | `caseRubric.forProfile` requires an explicit id | `tests/rubric.test.js` | verified |
| Assessment failure is not a score of 1 or a false N/A | `not_assessed`, null total, no review flag | Engine local-assessment test and boundary test | verified |
| Valid N/A and a real low score on domain 6 or 7 | Faculty exclusion vs supported score 1 | Boundary test | verified |
| Running encounter keeps its version | Encounter clones the publication | Boundary version-freeze test | verified |
| Duplicate turns and trust | Request id dedupe; rapport phrase counted once | Boundary and engine tests | verified |
| Feedback cites encounter evidence | Existing feedback validators; chart open is not interpretation | Existing feedback tests; not re-audited in the browser this run | verified in unit tests |
| Prompt injection does not publish facts | Student text is untrusted; paraphrase output is ignored | Boundary injection question and paraphrase mock | verified for those channels |
| Demo stays on loopback and roles are labeled | `HOST` defaults to `127.0.0.1`; reviewer type `demo-alias` | README and assessment review route | implemented |
| Browser workflow from Studio through the incoming call | DOM test and a local browser pass | `tests/frontend.test.js` publishes a patient, answers the call, and checks feedback. A loopback browser session on 2026-10-11 created Jordan Vale, heard the approved night-schedule line, and answered a stroke question with “I'm not sure about that.” The debrief showed 0/7 domains assessed and no overall total | verified |
| Live provider smoke | Optional Bedrock | Not run for this change; missing credentials must not block offline work | deferred |
| Educator review of cases and scores | Demo review stores a reason and the model draft | No educator ran the protocol in `docs/EVALUATION.md` | deferred |
| Institutional authentication, retention, accessibility review, deployment governance | Not built | Documented as remaining adoption work | deferred |

## Unresolved before calling this a release candidate

No live model was scored on this tree. Local mode leaves judgment-dependent domains unassessed on purpose. A faculty member has not reviewed the cases or the feedback. Institutional authentication, retention, an accessibility review, and deployment governance are not done.

The New patient control can sit under the sticky header until the page is scrolled. The form itself opens and publishes. A blank age used to be shown as age 0 and offered the pediatric hearing checklist as a suggestion; an empty age no longer does that.
