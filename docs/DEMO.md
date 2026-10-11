# Four-minute supervised demo

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

Problem: healthcare learners need repeated interviewing practice without treating invented patient details as clinical truth.

Before presenting: npm test; npm start; open http://127.0.0.1:3000/app.html. Verify the source fingerprint in the header. Use typed input, keep the Node process running, and use only synthetic data.

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

If audio/microphone is unavailable, continue typing and reading the transcript. There are no model/AWS requests on this path, so those services are not prerequisites. Imaging pixels are not bundled; demonstrate the synthetic report findings rather than an absent scan image. Do not switch to a historical hosted URL during judging unless its API and build identity have been independently verified.
