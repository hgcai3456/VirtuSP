# Clinical and faculty review checklist

Prepared 2026-10-11 against repository `eb7920b`. **Questions for the medical student and qualified faculty reviewer; not independent clinical approval.** Only synthetic cases. This research track changes no case facts, publications, transcripts or application code. The medical student can prepare findings; the appropriate faculty member must sign off on clinical suitability and rehearsal feedback.

Use [medical-student handoff](MEDICAL-STUDENT-HANDOFF.md), [objective workflow](OBJECTIVE-WORKFLOW.md), [comparison design](DEMO-GROUPS.md) and [bias integration](BIAS-INTEGRATION.md). Record the exact case IDs, immutable versions, encounter/event IDs, provider/model/mode and review date. Re-review after material case, prompt, provider, rubric or presentation changes; retain earlier versions and judgments.

## 1. Objective-to-case fit and discipline

- [ ] What observable learner action is intended? Does the published case actually support it? Confirm catalog categories against detailed objectives/evidence definitions; a filter label does not prove objective completion.
- [ ] Which discipline and learner level is appropriate: PA, nutrition/dietetics, PT, nursing or medicine? Does each requested task use suitable scope, supervision and language? Optional discipline selection is discovery metadata, not clinical authority or a grading adjustment.
- [ ] For the urgent-referral demonstration, has a **qualified faculty member** reviewed the authored facts, expected recognition, escalation destination/timing, uncertainty and learner wording? Is required evidence available in the encounter? Do not add emergency symptoms to an existing case merely to populate a category.
- [ ] Are missing expected actions distinguished from tasks the scenario cannot support? Is chart interpretation evaluated from what the student says, rather than treating a chart opening as comprehension?
- [ ] Is the assumed 15-minute duration suitable for this objective/discipline? What prebrief, accessibility support and debrief time is also required?

Reviewer return: objective, discipline/level, required observable behavior, source/version, concerns, and approved rehearsal case or **needs revision**. This checklist does not supply a clinical treatment/escalation protocol.

## 2. Provenance, identity, knowledge and disclosure

- [ ] Are original organizer rows/documents/identifiers retained and attributable? Are team-authored adaptations distinguishable from originals, with their own identities and versions? No source UUID/biography is silently reassigned.
- [ ] Is the correct patient being reviewed? Explicitly separate the organizer Yvette age 64/hypertension material from the roster Yvette age 74/heart-failure case identified in [HANDOFF](HANDOFF.md); no clinical assertion is transferred between them here.
- [ ] Can every patient assertion be traced to an authored fact or an explicitly labeled generated supplement? Distinguish source quotations, faculty additions and **AI draft (unverified)** content. Teaching references are not patient facts.
- [ ] Do unspecified medication names/doses, allergies, units, dates, past history and test results stay **unknown/unspecified**? An omitted allergy is not a negative allergy history. Do not complete missing units or infer dates from plausible values.
- [ ] Are chart-only findings available only through intended chart/artifact paths? Does patient-known history stay distinct from clinician findings/answer keys? Are report openings labeled as access events?
- [ ] Are guarded facts, empathy/trust requirements, deflections and neutral topic labels appropriate? Could a label or feedback gap itself reveal a hidden answer? Check actual before/after disclosure behavior in the chosen build with the engineering owner.
- [ ] Has engineering verified the active path? The optional Anthropic conversational branch receives guarded truths and has gate/grounding concerns in the handoff; do not sign off on the assumption that it matches the staged path. Faculty review cannot substitute for repairing a server disclosure defect.
- [ ] Does the import/authoring path preserve the original uploaded material in this build? The handoff flags original-byte retention and multi-file grouping risks in the optional mixed importer. Ask engineering to demonstrate the relevant path; do not import or publish in this research track.
- [ ] Are generated supplements plausible, consistent, necessary for the teaching goal and labeled? Have identity, source relationships, chart release rules and objective links been reviewed after generation? Publication acknowledgment does not prove a qualified clinical review occurred.

## 3. Strong and weak transcript review

Obtain two actual completed **synthetic** rehearsal encounters from the demo owner, with reviewed feedback. Neither transcript nor its rating is invented in this research. Read both independently of the model's summary and then reconcile every judgment. An automated second model review is not an independent clinical gold standard.

Use the unchanged supplied [seven-domain rubric](../corpus/encounter_evaluation_rubric.json). Domain names are included to identify the reviewer worksheet, not to replace its descriptors:

| Domain | Strong encounter: 1–4/N/A + exact quote/event | Weak encounter: 1–4/N/A + exact quote/event | Correction or applicability rationale |
| --- | --- | --- | --- |
| Opening and purpose | To complete | To complete | To complete |
| Rapport, respect, and empathy | To complete | To complete | To complete |
| Information gathering | To complete | To complete | To complete |
| Listening and response to cues | To complete | To complete | To complete |
| Explanation and shared decisions | To complete | To complete | To complete |
| Clinical reasoning and synthesis | To complete | To complete | To complete |
| Professionalism, safety, and closure | To complete | To complete | To complete |

- [ ] For each numeric rating, does the quoted action support the domain and level descriptor? Is the exact quote attributed to the correct speaker/event, with preceding/following context and sequence checked?
- [ ] For each missed action, is absence checked against the **whole transcript**, with the point where it was expected identified? Do not fabricate a quote for an omission. Exclude automatic classifier tags, model review flags and chart opening alone as proof of clinical understanding.
- [ ] Is N/A justified by scenario unobservability/inappropriateness rather than poor performance? Do not turn failure to perform an expected action into N/A. Exclude N/A from both numerator and maximum: `sum(observed domain ratings) / (4 * observed domain count)`. If all are N/A, no total/percentage. The source total is a discussion aid, not an established pass/fail grade.
- [ ] Are objective completion and rubric quality reported separately? Are “asked,” “withheld,” “released” and “opened” described accurately without awarding understanding automatically?
- [ ] Is a rating **1 in clinical reasoning or professionalism/safety** flagged for faculty review even if the total is high? Are additional safety claims grounded in actual wording and reviewed scenario references? “Potential risk” is not confirmed harm; a suggestion is not a completed prescription.
- [ ] Does feedback avoid speculative patient emotion/outcomes, unsupported medical irrelevance penalties and reversed event order? Does it avoid teaching the student hidden answer-key facts they could not access?
- [ ] Can the learner act on one concrete next step, rehearse alternative wording and retry? Is the rewrite labeled as a suggestion and checked for new unsupported clinical facts?
- [ ] Is any case-specific rubric appropriate? The handoff flags automatic pediatric-hearing rubric applicability and an app-created equal item-point split; confirm both before use. Do not apply a hearing rubric to an unrelated pediatric case.
- [ ] Do presence/eye-contact/filler flags respect camera conditions, disability, neurodiversity, language and cultural context? These prototype signals do not independently establish empathy or professionalism and do not establish a validated assessment instrument.

Reviewer return: original judgment, corrected judgment, actual quote/event or verified absence, descriptor, clinical/safety concern, and one next-practice action. Keep unsupported or contested judgments out of the recording until resolved.

## 4. Exploratory comparison and supplied bias rubric

- [ ] Is the group appropriately similar in clinical/scenario content for its teaching/comparison purpose? Shared objectives and clinical invariants are intentional in comparison groups, not a defect. Label unrelated practice groups separately.
- [ ] Does the four-case cholesterol group accurately disclose that **age, gender, ethnicity, education and everyday context vary together**? It is not a single-variable experiment. Confirm immutable case snapshots match the declared invariant content.
- [ ] Before flagging a difference, what appropriate tailoring could explain it: age, health concerns, resources, schedules, patient preferences or authored context? Do not equate education with health literacy or infer intent from a score gap.
- [ ] What other confounds are present: repeated-case learning, trial order, fatigue, voices, portraits/accents, model/provider/prompt versions, response variation, question opportunities and missing/held feedback? Record them, including common-presentation choices and any incongruence with authored identity.
- [ ] How many observations support each category? Four demo patients and two visits per dashboard group are not validated sample-size thresholds. Do not present a trend, significance, prevalence or causal attribution from a small selected sample.
- [ ] Are comparison observations tied to exact student actions in at least two relevant trials? Does the reviewer consider non-bias explanations and keep descriptive observations separate from causal conclusions?
- [ ] Use the original supplied [OSCE rubric PDF](../corpus/OSCE%20Cognitive%20%26%20Interpersonal%20Bias%20Evaluation%20Rubric.pdf) and [transcription](../corpus/bias_evaluation_rubric.json): five categories—Premature Closure & Anchoring; Confirmation & Search Bias; Implicit Demographic Bias; Framing & Availability; Diagnostic Attribution. Higher **1–4 scores mean better performance**, not more bias.
- [ ] Is **Not observable** clearly labeled as an application extension rather than a source-defined fifth level? Does the scenario really permit observing each category? Do not invent a diagnostic opportunity, handoff or symptom to force a score.
- [ ] Are analysis results kept separate from the seven-domain rubric, objectives and student grades? No bias percentage, probability, combined score or diagnosis of unconscious intent is defined by the supplied rubric.
- [ ] Have faculty inspected the dashboard's **under 10 / 10–19 / 20+ point-gap heuristics** and minimum-two-visit rule in [HANDOFF](HANDOFF.md)? They are unvalidated display thresholds, not diagnostic cutoffs. Check category extraction/keyword tags against authored data; mismatched tags can create misleading groups.
- [ ] Does a detector/provider failure appear as pending/unavailable, without invented findings? Do faculty review results privately and use them for mentorship rather than automatic penalties?

## 5. Psychologically safe debrief options

Original method publications checked 2026-10-11. These are **proposed adaptations**, not proof of fidelity or validation of an automated debrief.

| Option and original literature | Proposed wording for faculty review | What is adapted / limitation |
| --- | --- | --- |
| Plus–delta: [Cheng et al., 2021, *Embracing informed learner self-assessment during debriefing*](https://link.springer.com/article/10.1186/s41077-021-00173-1), published June 5, 2021 | “Which part helped you understand the patient's concern?” Then “What would you try differently?” Review one learner-selected event against the objective and choose one change. | Use learner self-assessment **before** a faculty/model interpretation; unpack strengths and reconcile perception mismatches with evidence. A static “strengths/weaknesses” list alone is not the interactive method. This is an original methodological discussion, not an AI efficacy trial or a claim to be the historical first use of plus–delta. |
| Debrief diamond: [Jaye, Thomas & Reedy, 2015, *The Diamond: a structure for simulation debrief*](https://pmc.ncbi.nlm.nih.gov/articles/PMC4497353/), June 2015 | Description: “What happened at that point?” Analysis: “What were you considering?” Application: “What will you practice in your next conversation?” Faculty facilitates and checks the clinical issue before agreeing on a next action. | Adapt description → analysis → application to one short encounter and transcript excerpt. The original is a faculty-facilitated nontechnical-skills structure; short on-screen prompts do not reproduce the full facilitated discussion or establish clinical effectiveness. |

- [ ] Does the prebrief explain formative use, limitations, who can view records and how feedback can be challenged? Can learners opt for typed input or accessible alternatives without assuming an unbuilt app control?
- [ ] Does feedback describe actions rather than label the learner's character? Allow uncertainty and disagreement; invite reflection without humiliating comparisons or required personal disclosure.
- [ ] Can faculty offer guided oral debrief or learner-first written reflection according to the course? These are proposed feedback options for the reviewer, not new controls claimed in the app.
- [ ] **Clarify “empathy radiant scale.”** Ask the mentor/reviewer for the exact instrument name, authors, source, scoring direction, population and intended use. Do not silently substitute the Jefferson Scale, CARE measure or an invented empathy score. Use the existing rubric domain pending clarification.

## 6. Diversity, coverage and rehearsal signoff

- [ ] Are case identities distinct and consistently authored, without duplicate names/IDs masquerading as new patients? Is ethnicity explicitly supplied rather than inferred from a name/portrait?
- [ ] Does each background avoid stereotypes about adherence, intelligence, literacy, income, personality or competence? Have patient voice and portrait choices been reviewed for identity congruence and confounding?
- [ ] Does the catalog offer meaningful objective/discipline coverage rather than counting near-identical scenarios as breadth? Document intentional similarity inside comparison groups, and avoid portraying those groups as four different clinical conditions.
- [ ] Have the medical student and qualified faculty reviewer reviewed the actual rehearsal cases **and** recorded feedback, including the strong/weak examples? Automated test counts and model audits do not replace this review.
- [ ] Is the pitch's claim language accurate for the recorded build, with provider/fallback honesty and no clinical-reliability, validated-bias-detection or completed-Canvas claim?

| Signoff record | To complete by human owner |
| --- | --- |
| Cases / immutable versions / discipline / objectives | Pending |
| Strong and weak encounters / event IDs / corrected feedback | Pending |
| Disclosure path verified by engineering / image / provider / mode | Pending |
| Safety and bias-category applicability / unresolved findings | Pending |
| Debrief adaptation and empathy-instrument clarification | Pending |
| Reviewer name, qualification, scope and date | Pending |
| Decision | Approved for the stated rehearsal scope / needs revision / exclude |

Passing this checklist does not establish patient-care suitability or high-stakes assessment validity. Keep open items visible and seek the appropriate faculty/engineering decision; do not fabricate completion or publish cases from this research track.
