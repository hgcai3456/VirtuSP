# Four-minute pitch research draft

Prepared 2026-10-11 against `eb7920b`. **Rehearsal draft, with clinical and engineering signoff outstanding.** This file does not replace or edit [DEMO.md](DEMO.md). The demo owner must reconcile that older script and these screen cues with the current app. Supporting research: [market/cost brief](MARKET-AND-COST-RESEARCH.md); [clinical checklist](CLINICAL-REVIEW-CHECKLIST.md).

## Storyline and five-label visual

Follow one learning goal from faculty authoring through a new synthetic patient's first conversation and evidence-linked feedback. Then show how faculty can inspect comparable encounters without declaring a learner biased. Close with an explicitly assumed budget and a supervised pilot.

Use one simple visual:

**Faculty case → Student conversation → Checked reply → Evidence-linked feedback → Saved progress**

Optional small technical caption, only after owner verification: “Server-controlled disclosure and immutable case versions; model-assisted feedback requires faculty review.” “Checked reply” is a label for the verified recorded path, not a universal guarantee of correctness. If the optional conversational path remains unresolved, do not use that caption to imply staged disclosure protection; use a recording on an owner-verified path or describe the label as the design goal.

## Timed outline: exactly four minutes

| Time | Purpose / screen | Spoken narration |
| --- | --- | --- |
| **0:00–0:25** (25 s) | Problem hook; visual or title card with source footer | “A student can know what to ask and still struggle to ask it when a patient is worried. That conversation needs practice, feedback and another try. Rutgers School of Health Professions reported 1,320 enrolled students in 2024–2025. VirtuSP is a prototype for adding focused conversation practice alongside supervised teaching and human standardized patients.” |
| **0:25–0:45** (20 s) | Five-label visual; faculty workspace | “Start with the learning goal. The faculty member chooses what the learner should demonstrate, reviews the synthetic case and decides what information the patient can share. The conversation is saved, and feedback should point back to what the student actually said. Faculty remains responsible for the teaching judgment.” |
| **0:45–1:25** (40 s) | New patient: learning goal, brief/preview, review, publish; immediately start that new published patient | “Here we create a new patient for a communication goal. The preview gives the faculty member a case to inspect: identity, patient-known information, chart findings and the expected learner actions. Missing information should stay unspecified. After faculty review and publication, we switch to the student workspace and start that same patient. Earlier attempts retain their original case version.” |
| **1:25–1:55** (30 s) | Student objective filter; optional discipline; assigned work/card; one short conversation exchange | “A learner begins with an objective, such as exploring a patient's concern, then can narrow the catalog by discipline. Assigned work stays visible. We ask an open question, listen and follow up. On this verified recording, the patient shares the information allowed for that point in the conversation. The screen also tells us when an AI reply uses fallback wording.” |
| **1:55–2:35** (40 s) | A precompleted, faculty-reviewed feedback record; objective panel, rating reason, cited event, one next action | “The next step is reflection. Here is a completed encounter: objectives are separate from the seven-domain rubric. We open the actual words behind a feedback claim and check whether they support it. When a skill cannot be observed, it should be marked not applicable. Faculty checks safety concerns and any disputed judgment. The learner selects one specific change to practice in the next attempt.” |
| **2:35–3:20** (45 s) | Faculty group results: completed four-case cholesterol comparison; two actual cited student actions and limitations | “Faculty can also explore conversations across similar scenarios with different backgrounds. These four synthetic cholesterol cases share clinical teaching content, while age, gender, ethnicity, education and everyday context vary together. A difference may reflect appropriate tailoring, trial order, repeated practice or model variation. We inspect the student's actual words across trials rather than infer intent from a score gap. The separate rubric rates performance; it produces no bias percentage and does not change the student's standard score. This is an exploratory prompt for faculty review.” |
| **3:20–4:00** (40 s) | Cost card with assumptions/range; pilot proposal and named owner blanks | “For a proposed school pilot, assume 200 active learners each complete four encounters a month: 800 encounters. Our planning example is about $1,260 a month, including budgeted hosting and operations, with a sensitivity range of about $280 to $4,430. These are estimates, excluding faculty case review and institutional setup. Provider and voice usage still need confirmation. We propose a supervised pilot that measures repeat use, corrected feedback, response time and total faculty review effort before wider adoption.” |

Narration is about 445 words, leaving room for brief clicks and pauses. Rehearse against a stopwatch; the time windows total **240 seconds**. Do not speed through a live generation or assessment wait to make the draft fit. Keep source and estimate labels visible while their claims are spoken.

Source for the only school-scale statistic: [Rutgers SHP 2024–2025 report, Study section](https://shp.rutgers.edu/community-impact-report/study/) and [report cover](https://shp.rutgers.edu/community-impact-report/), checked 2026-10-11. This is total school enrollment, not active users. The repeat-practice rationale is supported by a different system's [421-student communication trial](https://pubmed.ncbi.nlm.nih.gov/27939846/); do not attribute its results to VirtuSP. No workload reduction or clinical outcome statistic is spoken.

## Rehearsal mechanics and screen evidence

The creation sequence must demonstrate a **new synthetic case**, faculty review and immediate reuse of the resulting published version. Use a short, faculty-approved fictional brief; do not add case facts to this document or repurpose organizer identities. A preview or saved draft alone does not prove it can run. The owner should select the authoring path that has been verified on the recording build; optional mixed-file import has unresolved provenance/provider issues in [HANDOFF](HANDOFF.md).

Do authoring once in a rehearsed short walkthrough. If AI generation takes longer than the 40-second slot, record the actual process and include an explicitly labeled edit: “Generation wait shortened; faculty review still required.” Do not claim instant generation. “Immediate use” means the published new case can be started without another implementation step, not zero inference latency. Preserve the preview-to-published identity/version visibly.

Use a precompleted **different** encounter for the 1:55 feedback segment, labeled “Earlier completed encounter—faculty-reviewed feedback.” Do not imply a single demonstration question produced a full assessment or that the shown feedback belongs to the just-created patient. If a full newly authored-case encounter was recorded earlier, its case/encounter label may instead be used with a truthful time transition. Complete all four group trials before showing held group feedback; the research track does not generate those recordings.

| Claim in narration | Exact screen evidence required | Owner / release condition |
| --- | --- | --- |
| Faculty can create and use a new patient | Goal/brief, preview, acknowledged publication and Start on that published new case | Demo + faculty verify actual flow; retain original/supplement provenance. |
| Objective-first discovery and discipline preference | Learning-objective choices, filtered published cards, optional discipline and still-visible assigned work | Workflow owner; [OBJECTIVE-WORKFLOW](OBJECTIVE-WORKFLOW.md) describes `eb7920b`, but current build needs rehearsal. |
| Visible individual/group assignment | Faculty student selection and Assign on a card, then the correct student's assigned list | Demo owner checks roles/pinning; do not reuse older expansion instructions without checking. |
| Reply respects authored disclosure | A reviewed example of a permitted answer; if demonstrating a gate, actual before/after withholding | Engineering verifies provider/mode and active gates; faculty checks wording. Do not claim every reply is clinically correct. |
| Evidence-linked feedback | Actual rating reason and matching transcript/event in sequence, separately displayed objective completion | Faculty reviews actual record first; no synthetic “success score” substituted for an unavailable assessment. |
| N/A and safety review | Appropriate N/A rationale and separate safety-review status in reviewed record | Faculty; total is a discussion aid, not clinical validation/pass standard. |
| Saved progress | A rehearsed resume/history view containing the right learner/encounter and pinned version | Engineering/demo; a view is not proof of multi-task cloud durability or recovery. |
| Exploratory comparison | Reviewed four-case design, two actual student-action quotes, limits, separate OSCE categories | Clinical/bias owner; available/unavailable state must remain honest. Avoid heuristic dashboard gap labels as the lead visual. |

If analysis is still pending/unavailable, say: “This is where faculty can request a separate review; we do not yet have a reviewed result to show.” Show the actual status, then the comparison design and limitations. Do not substitute a fabricated finding. If quoting a disputed rating, identify it as a judgment under review or omit it.

## Exact claims and numbers needing signoff

| Claim/input | Status and exact wording/number | What must be confirmed |
| --- | --- | --- |
| Rutgers scale | External finding: **1,320**, reporting **2024–2025**, not “current users” | Demo owner checks on-screen source/year and avoids enrolling every SHP student in the forecast. |
| School pilot volume | Hypothesis: **250 invited seats / 200 active / 4 visits each / 800 per month** | Course/medical owner agrees plausible participation and practice frequency; not an adopted school program. |
| Encounter duration | Hypothesis: **15 minutes** | Discipline/faculty suitability; no claim it is an OSCE-wide standard. Not needed in spoken cost claim. |
| Base AI usage | Estimate: **176,440 input + 40,645 output tokens**, including declared calls, optional-analysis allocation, revisions and retries | Engineering measures all-call usage including reasoning; not just patient-visible text. |
| Main tariff | Provisional example: **Grok Geo CRIS $2.20/$6.60 per million**, origin **us-west-2** | Engineering confirms actual provider, inference profile/tier and tariff; cost example is not evidence that this model is the recording provider. [AWS price source](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-xai-grok-4-7.html). |
| Base voice | Estimate: **6,000 patient characters + 15 minutes realtime STT**, 5% replay/retry reserve = **$0.354375** | Speech owner confirms paid path/account; typed/browser STT lowers this API component. [Official speech prices](https://elevenlabs.io/pricing/api). |
| Base cost | Estimate: **$1.0158 variable/encounter**, plus **$450/month** illustrative fixed hosting/operations; `800*1.0158+450 = $1,262.64`; **$6.31/active learner** | Engineering replaces provisional inputs and actual stack costs. This is a proposed Lightsail-based budget, not the deployed ECS bill or customer seat price. |
| Low/high range | **$278.13–$4,430.12/month** at the same 800 visits; range changes voice/calls/review reserves and fixed budget | Review the [full assumptions](MARKET-AND-COST-RESEARCH.md); excludes faculty case/feedback labor, institutional setup/security review and optional paid guardrail. Not a cap. |
| Provider sensitivity | Derived regional Sonnet base example: **$1,739.82/month** at same workload/fixed budget | Do not leave the Grok number attached to a verified Sonnet recording as an observed bill. Label hypothetical service choice or recalculate. |
| Checked reply / hidden facts | Conditional safeguard claim on verified staged path | Engineering confirms active build. Optional Anthropic conversational branch sends guarded truths and must not be called equivalent. Numeric checks do not prove complete grounding. |
| Rubric and comparison | **7 standard domains**, **5 separate OSCE categories**, **4 demo patients** | Faculty checks observability, rating direction and exact quotes; four is a demo design, not validated sample size. |
| Response speed | **No verified recording-build latency number** | Use “we measure response time in the pilot”; if showing measured speed, capture build/provider, sample count, start/end definition and fallback cases. Do not call a planned silence delay model latency. |
| Recording timer/failsafe, voice/avatar | Owned by other teammates; current behavior not verified here | Physical rehearsal of sound, silence delay, playback, clock and stop behavior; do not promise these from old notes. |
| Canvas/university readiness | Future feasibility, **not completed integration** | Engineering/institution owner; real identity, access controls, tenancy, retention and support remain decisions. |

The [market brief](MARKET-AND-COST-RESEARCH.md) prices a separate **1,000-encounters/day sensitivity**, not a capacity claim. Keep it for questions rather than the four-minute narration. Its daily variable range is **$160.16–$3,412.65**, before a properly sized production hosting/operations budget. No local load test proves that throughput.

## Proposed pilot close and evaluation

Ask a course director and simulation/faculty lead to supervise a small, formative pilot with synthetic cases, a defined learner level and reviewed objectives. The 200-active-learner budget is a planning illustration; an initial pilot can be smaller. Faculty reviews urgent-referral content before use and checks the selected strong/weak transcripts using [CLINICAL-REVIEW-CHECKLIST](CLINICAL-REVIEW-CHECKLIST.md).

Collect completion/repeat uptake, all-call cost and retries, median/tail response time, unsupported reply/feedback reports and total authoring/review effort. Independent faculty judgments of evidence and usefulness should accompany learner reflection; automated scores alone do not demonstrate educational benefit. Define success and revision/stop criteria with faculty before starting, including an unresolved disclosure defect. Any claim of improvement needs an appropriate study design and institutional research review, not a pitch extrapolation from the demo.

## Short recording checklist

- [ ] Freeze and note the actual code/image, provider/model/mode, case versions and rehearsal date with engineering. Rehearse the current app; `DEMO.md` has older assignment controls and inconsistent voice-delay notes.
- [ ] Faculty signs off on synthetic cases, urgent-referral fit if used, both transcript examples and every recorded assessment/comparison claim. Clarify “empathy radiant scale”; no new instrument or score is announced.
- [ ] Close IDE credential tabs, terminals, cloud consoles and private material. Record only the intended app/window; hide `.env`, cookies, headers, token-bearing URLs, identity-picker secrets and unreviewed feedback. Use a demo alias and synthetic records.
- [ ] Rehearse faculty → student switches, objective filter, optional discipline, card assignment, new-case publication/start, resume and feedback navigation. Check source/year and “estimate” captions are readable at capture size.
- [ ] Rehearse microphone permission, audio levels, silence timing, mute/pause, text fallback and avatar playback. Confirm timer/recording-stop behavior with its owner before relying on it. Do not request credentials or change speech configuration in the research track.
- [ ] Label any shortened generation/assessment waits and precompleted-record transitions. Keep provider/fallback and unavailable-analysis status truthful; never splice a fallback into an apparent successful live-AI claim.
- [ ] Time the 240-second outline; keep exploratory comparisons to 45 seconds. Capture a clean take, then review the full audio/video for private material, unsupported claims, wrong event order and readable feedback before submission.

Unresolved handback: **faculty**—cases/objectives, exact transcript corrections, comparison/debrief appropriateness and realistic practice frequency; **engineering**—recording provider/mode/safeguards, actual telemetry/hosting, live session persistence, audio/timer/failsafe; **institution owner**—adoption, access/retention and Canvas decisions. No recording, message to others, publication, deployment, commit or push was performed by this research task.
