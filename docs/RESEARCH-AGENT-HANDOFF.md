# Separate agent window: research and pitch handoff

Prepared 2026-10-10 against `546fc20`. This document can be pasted into another agent window. Research outputs stay separate from application edits so the workflow, EMR and avatar owners can work in parallel.

## Paste this task into the new window

> Work in the VirtuSP repository. Read `AGENTS.md`, `docs/HANDOFF.md`, `docs/MEDICAL-STUDENT-HANDOFF.md`, `docs/DEMO-GROUPS.md` and `docs/BIAS-INTEGRATION.md` first. Inspect the current Git checkpoint because teammates are still merging changes. Your task is research and pitch preparation; do not change application code, patient data, the existing demo script or shared handoff.
>
> Produce three new files: `docs/MARKET-AND-COST-RESEARCH.md`, `docs/CLINICAL-REVIEW-CHECKLIST.md` and `docs/PITCH-RESEARCH-DRAFT.md`. Use current primary sources, dated links and explicit assumptions. Research online rather than relying on remembered prices, enrollment or statistics. Do not claim completed integrations, validated bias detection or clinical reliability. Do not send messages to other people or publish/deploy anything. Return the files and a brief list of unresolved facts requiring the medical student or engineering owner.
>
> The active coding window owns learning-objective metadata and filtering, optional learner-discipline selection, visible per-card student assignment, and readable feedback. Other teammates own the EMR layout, avatar, encounter clock and recording failsafe. Keep those files untouched. Use only synthetic cases; never open, print, copy or commit `.env`, credentials, runtime databases or recovery artifacts. Do not install unrelated tools or make paid cloud calls for this research.

## Deliverable 1: market and cost research

Write a concise, source-linked brief with:

1. **Buyer and need:** program/course leadership, simulation center and IT responsibilities; practice challenges across PA, nutrition/dietetics, physical therapy, nursing and medicine. State a proposed role alongside supervised teaching, not replacement of faculty or standardized patients.
2. **Rutgers SHP scale:** official enrollment/program/cohort numbers with reporting year and scope. Separate total seats, participating users, concurrent users and encounters. Use “not found” if a relevant number is unavailable.
3. **Evidence for the problem:** two or three original studies or official reports on repeat practice, standardized-patient logistics and educator workload/burnout. Record study population and limitations. Do not use general clinician burnout to infer SHP faculty burden or claim causal savings.
4. **Alternatives:** a small comparison of standardized-patient services and relevant educational simulation vendors using official product/pricing pages. List published price and date, “quote required,” or “not published.” Do not invent competitor rates or treat a vendor's marketing claim as independent effectiveness evidence.
5. **Transparent costs:** current provider and hosting options with official price links. Verify the active provider/model with the engineering owner; repository history includes Bedrock and an optional direct Anthropic path. If usage telemetry is unavailable, label low/base/high token, turn, voice and session assumptions rather than presenting measured costs.

Use these calculations and show their inputs:

```text
AI cost per encounter = sum across dialogue, assessment and optional analysis calls
                       (input tokens × input rate + output tokens × output rate)
Voice cost per encounter = speech usage × applicable rate
Variable cost per encounter = AI + voice + attributable storage/network costs
Monthly cost = encounters per month × variable cost + fixed hosting/operations
Cost per active learner = monthly cost / monthly active learners
```

Honor the unit in the price source (for example per million tokens, credits or characters) and convert explicitly. Show authoring separately; include retries, fallback activity and optional analysis in the assumptions. Distinguish provider cost from a proposed customer seat price, which also needs support, security, review and margin. Use USD, pricing date and AWS region. Hackathon credits are not a production price.

Show a realistic cohort scenario and, separately, a labeled 1,000-encounters/day scenario. The 15-minute encounter length is a mentor planning assumption until supported for the relevant discipline. Get plausible practice frequency from evidence or mark it as a pilot assumption. Offer a range rather than a guaranteed daily bill or capacity claim. Existing local load tests do not establish cloud capacity or latency under real AI traffic.

Add short feasibility notes for university-managed hosting and Canvas integration. Use official Canvas/LTI documentation and official infrastructure documentation. Distinguish existing repository deployment work from institutional readiness: real authentication, access controls, tenant separation, retention, privacy/security review and operational ownership remain decisions for a later implementation. Do not promise Canvas integration is already built.

Each important claim should have a supporting link near it. End with a source table: claim, source/publisher, publication or pricing date, scope and caveat. Mark actual measurements, external findings, estimates and proposed pilot hypotheses separately.

## Deliverable 2: clinical-review checklist

Prepare questions for the medical student/faculty reviewer, not independent clinical approval:

- Objective-to-case fit, including an urgent-referral case reviewed by a qualified faculty member; tasks and wording suitable for each learner discipline.
- Retained organizer provenance, correct patient identity, explicitly authored facts, unspecified medications/allergies/units/dates, chart-only and guarded information, and generated supplements.
- Strong/weak transcript ratings grounded in actual quotes; seven-domain 1–4/N/A handling, objective completion separately, safety flags and actionable next practice.
- Comparison confounds: age/context-specific tailoring, multiple demographic changes, case repetition, trial order, voice/portrait variation, model variation and small samples. Do not infer intent or causal bias from score gaps.
- Supplied bias rubric direction and observability; no bias percentage or combined score. Review heuristic dashboard thresholds as unvalidated.
- Psychologically safe feedback options using the original literature on plus–delta and the debrief diamond; explain what is adapted. Flag the unclear “empathy radiant scale” note for human clarification rather than silently inventing an instrument.
- Case diversity without stereotypes, duplicate identities or near-identical objectives presented as broader coverage. Document appropriate scenario similarity in comparison groups rather than treating all similarity as a defect.

Do not rewrite actual case facts or publish cases in this research track. Ask the clinical reviewer to sign off on the rehearsal cases and feedback; automated test counts do not replace that review.

## Deliverable 3: pitch research draft

Provide a timed four-minute outline and a short recording checklist. Use a clear problem hook, one source-supported scale/workload number, authoring and immediate use of a new patient, an objective-first scenario selection demonstration, evidence-linked feedback, and a 30–60-second explanation of exploratory cross-case analysis. Close with a transparent school-sized cost example and supervised-pilot proposal.

Use plain English for clinicians and health-professions stakeholders. Emphasize response speed/cost where relevant rather than model brand names. Propose a five-label visual: **Faculty case → Student conversation → Checked reply → Evidence-linked feedback → Saved progress**. Add a separate small technical caption only if needed. Verify which safeguards are active before describing them; the optional conversational path must not be presented as identical to the older strict pipeline.

Include a rehearsable storyline, draft spoken narration, exact numbers/claims needing signoff, and what screen should demonstrate each claim. Avoid announcing unbuilt roadmap items as available. Existing `docs/DEMO.md` has older controls/timing and must be checked against the current app by the demo owner. Hide secrets and token-bearing URLs, preserve provider/fallback honesty, and review recorded feedback before capture.

## Parallel ownership and finish conditions

| Owner | Work |
| --- | --- |
| Active workflow agent | Objective-first discovery, canonical teaching metadata, optional discipline preference, visible assignment controls, feedback readability |
| EMR teammate | Application layout, visual styling and navigation presentation |
| Avatar/voice teammate | Patient presentation, speech and playback integration |
| Timer/failsafe teammate | Visible elapsed time, recording-stop safeguard and related lifecycle behavior |
| This research window | Only the three new research/checklist/pitch draft files above |
| Medical student/faculty | Clinical appropriateness, transcript judgment, rubric calibration and final narrative review |

Do not edit `docs/HANDOFF.md` or shared application files in this research window. Report new paths, source coverage, assumptions and blockers to the active workflow agent. Coordinate before committing or pushing shared `main`; never rewrite Git history. The active agent owns the combined tested checkpoint. Document-only research needs link/fact review; application regressions are handled by the active coding window.

Research is complete when the files offer a source-linked value claim, reproducible cost ranges, explicit clinical-review questions and a timed narration with unresolved claims clearly marked. It is acceptable to report missing enrollment/pricing evidence instead of filling it with invented numbers.
