# Challenge 1 requirements traceability

Based on the requirements supplied for this documentation audit, not an independently obtained organizer PDF. **Verified** means an automated test exercised the stated scope in the 241-test passing run recorded in [TESTING.md](TESTING.md). **Implemented** means code exists without current end-to-end proof; **Partially verified** means only a subset is tested. Deferred and Not implemented identify missing capability. Verification is engineering evidence, not clinical validation. Demo steps refer to [the judge proof sequence](DEMO.md#judge-proof-sequence).

| Requirement | Implementation | Evidence / File | Demo Step | Status |
| --- | --- | --- | --- | --- |
| Faculty patient-profile creation | Structured Studio and faculty API | `lib/http.js`, `tests/authoring.test.js`, `tests/frontend.test.js` | 2 | Verified |
| Structured authoring | Editable case facts and metadata | `lib/profiles.js`, `public/js/app.js`, `tests/profiles.test.js` | 2 | Verified |
| Descriptive authoring | Optional generation produces a reviewable draft | `lib/generation.js`, `tests/generation.test.js`; providers mocked | 2 optional | Partially verified |
| Knowledge/source management | Sources and uploaded excerpts remain separate from facts | `lib/profiles.js`, `tests/authoring.test.js`, `tests/generation.test.js` | 2 | Verified |
| Clinical artifact attachment | File upload, mapped artifact and protected release | `lib/http.js`, `tests/http.test.js`, `tests/release-boundary.test.js` | 2, 4 | Verified |
| Disclosure configuration | Fact gates; report section/question/both release | `lib/engine.js`, `tests/engine.test.js` | 2, 4 | Verified |
| Review and correction | Edit draft, review acknowledgment and publication validation | `lib/profiles.js`, `tests/authoring.test.js` | 2 | Verified |
| Internal consistency checks | Structural/reference and medication/allergy checks; optional AI review | `lib/profiles.js`, `lib/generation.js`, `tests/profiles.test.js` | 2 | Partially verified |
| Approval/publication | Immutable publication snapshot | `lib/http.js`, `tests/release-boundary.test.js` | 2 | Verified |
| Multiple reusable profiles | Generic library, publication and encounter engine | `lib/store.js`, `tests/profiles.test.js`, `tests/engine.test.js` | 6 | Verified |
| Any published patient without case-specific code | Generic encounter creation from publication | `tests/release-boundary.test.js` new-patient HTTP workflow | 2, 3 | Verified |
| Split-screen interaction and dynamic record | Conversation and chart UI | `public/app.html`, `public/js/app.js`, `tests/frontend.test.js`; DOM rather than visual browser proof | 3, 4 | Partially verified |
| Text interaction | Answer incoming call, submit typed question | `tests/frontend.test.js`, `tests/encounter-call-ui.test.js` | 3 | Verified |
| Voice interaction | Browser recognition; optional ElevenLabs saved-turn speech | `lib/speech.js`, `tests/speech.test.js`, `tests/encounter-media.test.js`; no audible live check | 3 optional | Partially verified |
| Avatar interaction | Portrait fallback and optional LiveAvatar LITE | `lib/avatar-session.js`, `tests/avatar.test.js`, `tests/avatar-view.test.js`; mock only | 3 optional | Partially verified |
| Consistent identity/state | Encounter clones selected case/version | `lib/engine.js`, `tests/release-boundary.test.js`, `tests/visit-memory.test.js` | 3 | Verified |
| Progressive disclosure | Server applies gates and artifact access rules | `tests/engine.test.js`, `tests/release-boundary.test.js` strict mode | 4 | Verified |
| Medical records/artifacts | Chart facts distinct from patient-known facts | `tests/authoring.test.js`, `tests/engine.test.js` | 4 | Verified |
| Patient memory/state | Transcript, recalled facts and encounter snapshots | `lib/engine.js`, `tests/visit-memory.test.js` | 3 | Verified |
| Prevention of unsupported clinical facts | Strict approved-line construction; unknowns and injection checks | `tests/release-boundary.test.js`, `tests/appointment-regression.test.js`; not universal semantic proof | 4 | Partially verified |
| Encounter logging | Transcript/events persisted in JSON manifest; separate tracker/log paths | `lib/store.js`, `tests/chat-tracker.test.js`, `tests/appointment-timer.test.js` | 5 | Verified |
| Important findings elicited/missed | Fact/objective coverage and factual debrief | `lib/assessment.js`, `tests/feedback.test.js`, `tests/engine.test.js` | 5 | Verified |
| Interview structure/sequencing | Rubric domains and draft reasoning with evidence | `lib/assessment.js`, `tests/rubric.test.js`; educational judgment unvalidated | 5 | Partially verified |
| Communication/empathy/professionalism | Draft rubric assessment; unavailable judgments stay unassessed | `lib/assessment.js`, `tests/rubric.test.js`, `tests/release-boundary.test.js` | 5 | Partially verified |
| Explainable evidence-linked feedback | Event references and evidence validation | `lib/feedback.js`, `tests/feedback.test.js` | 5 | Verified |
| Strengths and improvement areas | Factual debrief plus supported assessment narrative | `lib/assessment.js`, `tests/feedback.test.js`; semantic quality needs faculty review | 5 | Partially verified |
| Actionable next steps | Objective tips and assessment coaching | `tests/feedback.test.js`, `tests/appointment-regression.test.js` | 5 | Verified |
| Faculty-defined objectives | Case-owned mappings and independent objective coverage | `lib/profiles.js`, `tests/authoring.test.js`, `tests/engine.test.js` | 2, 5 | Verified |
| Feedback encounter logging | Saved completed encounter and assessment state | `lib/store.js`, `tests/appointment-timer.test.js`, `tests/feedback.test.js` | 5 | Verified |
| Patient grounded in approved profile | Strict mode builds permitted approved lines; natural mode differs | `lib/engine.js`, `tests/release-boundary.test.js` | 3, 4 | Partially verified |
| History/medications/diagnoses/labs/artifacts internally consistent | Explicit case content, mappings and narrow validation | `lib/profiles.js`, `tests/profiles.test.js`, `tests/patient-data.test.js`; no comprehensive medical validator | 2 | Partially verified |
| Unsupported information not presented as fact | Strict unknown/deflection behavior on tested prompts | `tests/release-boundary.test.js`; natural generated prose needs separate validation | 4 | Partially verified |
| Faculty-approved source of patient truth | Publication freezes reviewed case; sources do not auto-create facts | `tests/profiles.test.js`, `tests/release-boundary.test.js`; approval not verified clinician identity | 2, 3 | Partially verified |
| NEW case → review/publish → immediate encounter | Studio DOM and HTTP publication/launch checks | `tests/frontend.test.js`, `tests/release-boundary.test.js`; no new physical-browser run in audit | 2–5 | Verified |
| Same reusable architecture; zero case-specific changes | Data-driven create/ask path exercised by new case | `lib/engine.js`, `tests/release-boundary.test.js` | 2–6 | Verified |
| Canvas/LMS institutional connection | No working launch/enrollment/grade connector found | `docs/HACKATHON_SUBMISSION.md` future path | 6 | Not implemented |
| Institutional authentication/privacy/accessibility/retention | Demo security guards exist; adoption governance remains | `lib/security.js`, `docs/RELEASE_READINESS.md` | 6 | Deferred |

Live provider quality, comprehensive medical consistency, educator validation, accessibility certification and distributed production capacity remain outside these passing checks. See [audit report](DOCUMENTATION_AUDIT.md).
