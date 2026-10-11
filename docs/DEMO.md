# Four-minute supervised demo

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

Problem: healthcare learners need repeated interviewing practice without treating invented patient details as clinical truth.

Reviewed October 11, 2026. Before presenting: use Node 24, run `npm test`, then `npm start`; open [the simulator](http://127.0.0.1:3000/app.html). Verify the source fingerprint and case version in the header. Use typed input, keep the Node process running, and use only synthetic data. For a local presentation, leave `PROFILE_S3_BUCKET` and `VIRTUSP_DR_TABLE` unset; `.env` is not loaded automatically. See [setup](SETUP.md) and [current testing](TESTING.md).

If presenting hosted, compare its HTML and `/api/live` identity with the intended source, verify the whole workflow separately, and use an authorized synthetic case. [Status](STATUS.md) records a dated hosted SHA differing from the local baseline. A passing probe does not prove publication, backup, or assessment. Avoid publishing during task overlap/deployment; [deployment constraints](DEPLOYMENT.md).

1. 0:00–0:40: Patient Studio → Denise. In Review approved facts, edit the chief complaint's exact wording to a reviewed variant if desired. Point out Draft wording and separate chart sources. Click Check, then Publish. Wait for “Published Denise Carter vN” and its card version to update before clicking Start visit.
2. 0:40–1:00: Type “Hello Denise, how can I help you today?” → exact approved chief complaint. Point out frozen encounter version.
3. 1:00–1:20: “Do you smoke?” → unknown in Denise's case. Explain that missing data is not a negative finding.
4. 1:20–1:45: “Tell me how you take your metformin.” → everyday-use claim. Open Notes → pharmacy fill gap. Both sources remain distinct.
5. 1:45–2:05: Open Labs → released eGFR/HbA1c. Click “Record review of this section.” Explain that opening and recorded review are separate; neither proves understanding.
6. 2:05–2:20: Open Imaging → CT remains locked. Optional proof: “So you've been experiencing thirst and fatigue for a few months, and your doctor diagnosed you with diabetes. Is that correct?” does not release CT. “Can I see the CT?” does.
7. 2:20–2:50: “I am sorry this has been hard. What gets in the way of every dose?” → approved evening-dose barrier. Open Medications. In Document the conflict, type “Refill gap and skipped evening doses need follow-up.” Click Save note. This is a learner claim recorded for faculty review.
8. 2:50–3:30: Assessment → objective weights/assessed denominator → evidence Event links → next-attempt guidance. Explain keyword/rule feedback and faculty review; do not describe the score as clinical competence.
9. 3:30–4:00: Patient Studio → Marcus → Start visit → “What brings you in today?” Demonstrate the same engine and a fresh attempt using a different published case.

Repeatability means the same published truth and disclosure rules, not necessarily identical speech output or learner behavior. Every new visit starts fresh. Server restart ends active attempts; published versions remain saved. Browser refresh returns to Studio.

If audio/microphone is unavailable, continue typing and reading the transcript. No dialogue-model service is enabled. With `PROFILE_S3_BUCKET` unset, publication makes no S3 request; with it set, publication attempts a backup. AWS is not a prerequisite for the default local demo. Imaging pixels are not bundled; demonstrate synthetic report findings. Use a hosted URL only after its API, build, and workflow have been independently verified.

## New-case reuse proof and acceptance record

If the rubric requires a newly created patient, rehearse Studio authoring before the timed pitch: define a synthetic case with reviewed wording, sources, triggers, and objectives; Check → Publish → wait for the assigned version → fresh visit → suggested opening question → Assessment. No patient-specific code change is needed. [Authoring guide](AUTHORING.md) describes review and validation limits.

Record presentation browser/runtime, revision/fingerprint, published version, supported/unknown reply, chart release/open/review distinction, reconciliation and event links, plus second/new-case result. Assess keyboard operation and audio separately if used. This documentation review did not perform a fresh manual browser rehearsal; archived observations remain in [preflight](PREFLIGHT_REPORT.md).

## Failure decisions

- Publication error: inspect whether a version was already locally saved before retrying; S3 failure can follow local success. Use [operations](OPERATIONS.md).
- Attempt lost after restart/deploy: start fresh; browser cache cannot restore it.
- Unknown for an expected question: check the frozen version and authored keywords; do not improvise an unsupported clinical answer.
- Hosted routing/build mismatch: return to the verified local presentation and record the failure for investigation.

Describe feedback as formative keyword/rule evidence for faculty review. Do not describe chart review as comprehension, percentages as competence, or optional cloud/deployment code as validated scale. [Judging evidence](JUDGING_MATRIX.md) records all five categories and remaining gaps.
