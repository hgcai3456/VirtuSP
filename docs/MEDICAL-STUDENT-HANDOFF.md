# Medical student: clinical review, market evidence and demo handoff

Status update (2026-10-11): the user has assigned this noncoding work to a human reviewer. Keep this as reference material; do not start additional Codex research unless the user requests it again.

Prepared 2026-10-10 against checkpoint `546fc20`. Development is continuing in parallel; verify the current app before recording. This is a task brief, not completed market research or clinical validation.

## Ready-to-send message

We are splitting the remaining work so you can focus on whether VirtuSP makes sense for health-professions education and how we explain its value. The coding team is handling an objective-first simulation catalog: choose a learning objective, see relevant patients or groups, and optionally filter by learner discipline. Faculty assignment will be visible on each card. Other teammates own the EMR layout, AI avatars, encounter timing and the recording failsafe.

Please prioritize these three deliverables for the demo:

1. **Clinical and feedback review:** choose realistic learning objectives for PA, nutrition/dietetics, physical therapy, nursing and medicine. Review one strong and one weak encounter against the supplied rubrics. Recommend clear, respectful debrief wording and identify unsafe, unsupported or unfair feedback. Include an appropriate urgent-referral scenario that a qualified faculty member should review before publication.
2. **One-page value and cost brief:** identify who buys this, what alternatives schools use, and what practice costs at realistic class sizes. Use current primary sources for Rutgers School of Health Professions enrollment, published competitor pricing, and faculty workload evidence. Give a low/base/high cost estimate with visible assumptions; do not treat hackathon credits as an ongoing operating budget.
3. **Demo and pitch outline:** make a four-minute story understandable to a nontechnical clinician. Start with the need for repeatable conversation practice, show a newly created patient working immediately, show evidence-linked feedback, then spend 30–60 seconds on exploratory comparisons across similar cases with different backgrounds. End with a credible school-sized cost example and a proposed supervised pilot.

Please send back a short source-linked brief, your corrections to the two encounters, and a timed narration. Mark anything you could not verify. We need reviewed claims and a small number of useful numbers, rather than more features before the recording.

## Priority and completion checks

| Priority | Work | What we need back |
| --- | --- | --- |
| Before recording | Review the clinical consistency of the chosen demo cases and their objectives | Corrected objective wording, unsupported facts, disclosure concerns and faculty-review items |
| Before recording | Inspect one strong and one weak assessment | Check each rating against recorded evidence; confirm N/A and safety-review handling; remove invented events and unfair penalties |
| Before recording | Review possible bias indicators | Distinguish disrespect or unsupported reasoning from appropriate tailoring; quote the student action and state alternative explanations |
| Before pitch | Define buyer, users and competitor comparison | One small table: standardized-patient practice, existing simulation products and our proposed role; official price or “quote required,” with date |
| Before pitch | Estimate cost and scale | Low/base/high scenarios with model, voice and hosting costs; separate per encounter, per active learner and a hypothetical seat price |
| Before pitch | Find two or three defensible problem numbers | School/program size and workload/practice evidence with primary links, population, year and limitations |
| Before rehearsal | Write and review the demo story | Four-minute pitch, short product walkthrough and 30–60-second comparison explanation; readable captions and no secrets |
| Later | Canvas, institutional hosting and curriculum evaluation | Feasibility note and pilot questions; these are future integrations, not features to claim are complete |

## Clinical review guidance

- Start with what the learner should demonstrate, then decide what information the patient must supply. A sample objective such as “recognize a need for urgent escalation” requires a reviewed case that actually supports that decision. Do not add emergency symptoms to an existing case simply to make it fit the filter.
- Discipline is a discovery preference. It does not change rubric ratings, grant clinical authority or turn one discipline's learners into physicians. PA, nutrition and physical therapy scenarios should use appropriate tasks and language. Education level must not be used as a proxy for health literacy.
- Use the supplied seven-domain encounter rubric for standard feedback. Objective completion stays separate. A missed expected action is not N/A; N/A is for what the scenario cannot support observing. Ratings of 1 in clinical reasoning or professionalism/safety need review.
- Use the supplied OSCE bias rubric for separate faculty review. Higher 1–4 ratings indicate better performance, not more bias. “Not observable” is an application extension, and differences between encounters do not establish bias or intent.
- The four-case cholesterol comparison varies age, gender, ethnicity, education and everyday context while retaining shared clinical/scenario content. It is exploratory: clinical tailoring, trial order, learning, model replies, voices and portraits can affect the comparison. Four cases are a demo choice, not a validated sample size.
- Review numerical ratings for evidence, fairness and consistency. A model's second review and automated tests are not an independent clinical gold standard. Older benchmark numbers do not automatically apply after provider or prompt changes.
- Prefer psychologically safe debriefing: ask the learner to reflect, identify what helped, and select one specific change to practice. Review whether **plus–delta** or the **debrief diamond** fits this setting using their original literature; name an adaptation rather than claiming fidelity to a validated method. Mentor's “empathy radiant scale” wording is unclear: confirm the intended instrument before proposing an additional score.

## Market and cost questions

- Who would sponsor a pilot: SHP program lead, course director, simulation center or university IT? Who authors/reviews cases, and who supervises feedback? Case ownership, delete permissions and named authorship are product-governance questions to list for a future institutional version.
- Use Rutgers SHP's own reported enrollment and program information. Distinguish total students, relevant program cohorts, active users and simultaneous users. Do not turn school enrollment into daily simulation demand without evidence.
- Find primary research on learner practice frequency, standardized-patient resources and educator workload/burnout. Identify the population studied. General clinician burnout statistics do not measure simulation-faculty workload or prove VirtuSP reduces it.
- Price the current architecture with the engineering owner: AI turns, rubric assessment, optional bias analysis, optional voice, storage, compute, networking and logs. Include case generation separately from routine encounters. Distinguish Workshop credits from published rates and ongoing costs.
- Show an explicitly assumed 15-minute practice session and estimated turns; the mentor's 15-minute encounter is a planning input, not a verified standard for every discipline. Compare school-cohort usage with a labeled 1,000-encounters/day scaling scenario if useful. Never call a local load-test result proof of school-wide capacity.
- Explain university-managed hosting as feasible engineering work requiring real identity, access controls, backups and institutional review. The repository contains AWS deployment work, but demo aliases are not production authentication. Canvas integration is a future path to verify, not a current integration.

## Demo language and materials

Use plain English: “faculty chooses what to practice,” “the patient shares information as the conversation develops,” and “feedback points to what the learner actually said.” Explain a cheaper/faster AI option in terms of cost and response time. A model name is optional technical detail, not the hook for a School of Health Professions audience.

Prepare a visual with five short labels: **Faculty case → Student conversation → Checked reply → Evidence-linked feedback → Saved progress**. Keep detailed provider, storage and deployment names available for technical questions. Describe safeguards only after engineering verifies them on the recorded version; one recently added conversational path needs review before claiming every reply passes the older strict pipeline.

Check [DEMO.md](DEMO.md) against the current product before reusing its narration: some older steps refer to removed review controls or previous voice timing. Do not record credentials, token-bearing URLs or unreviewed feedback. Describe comparative findings as possible indicators for faculty review, and finish with an appropriately scoped pilot rather than a claim of clinical reliability.

Useful starting documents: [CORPUS.md](CORPUS.md), [DEMO-GROUPS.md](DEMO-GROUPS.md), [BIAS-INTEGRATION.md](BIAS-INTEGRATION.md), [EVALUATION.md](EVALUATION.md), [BENCHMARKS.md](BENCHMARKS.md) and [HANDOFF.md](HANDOFF.md). The supplied rubric files are assessment sources, not instructions to add features or override user decisions.
