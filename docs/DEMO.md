# Demo and four-minute pitch

## Rehearsal setup

Run preflight and the reviewed evaluation before recording. Pin the selected model ID in `.env`, set `AI_ENABLED=true` and restart. Check that real replies show their provider and S3 copies succeed. Keep keys and the event's token-bearing URLs outside the recording. ElevenLabs is optional; text is the required fallback.

Prepare Omar and Yvette through Studio. Review organizer-provided facts and source wording; retain unspecified allergies, medication lists, lipid units and measurement dates. Add selected teaching sources for review. A synthetic supplement must be clearly authored and sourced separately from organizer facts. Use Omar for medication concerns and Yvette for explanation/understanding as the second case.

## New patient to author during the short demo

Use a new name and explicit facts; no engine or prompt-example change is needed. This example is synthetic and separate from the organizer personas:

| Field                  | Value                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name / age             | Jordan Vale / 34                                                                                                                                                                                                                       |
| Opening                | Hi, I'm Jordan.                                                                                                                                                                                                                        |
| Personality/style      | Thoughtful; short everyday answers                                                                                                                                                                                                     |
| Source                 | `demo-author`: Newly authored synthetic shift-work interview; copy the explicit facts below into its excerpt                                                                                                                           |
| Concern, patient-known | Trouble sleeping after a work schedule change. Approved wording: “Since my work schedule changed, I have trouble sleeping.” Keywords `bring, sleep, concern`; neutral topic `Reason for visit and sleep concern`                       |
| Work, patient-known    | Works alternating shifts at a grocery store. Wording: “I work alternating shifts at a grocery store.” Keywords `work, shift, job`                                                                                                      |
| Guarded concern        | Uncomfortable asking the supervisor to change the schedule. Wording: “I feel uncomfortable asking my supervisor to change my schedule.” Keywords `supervisor, manager`; gate 1; deflection “I'd rather not discuss my supervisor yet.” |
| Chart-only fact        | Synthetic intake note: alternating shifts at a grocery store; exact dates/times unspecified. Category and release section `notes`; keywords `schedule record`; approved patient wording empty                                          |
| Report artifact        | `schedule-note`; title “Synthetic intake note”; source `demo-author`; actual authoring date; section `notes`; question release with keywords `schedule record`; link the chart fact; text exactly matching it                          |
| Objective 1            | Elicit concern; fact mapping; weight 40                                                                                                                                                                                                |
| Objective 2            | Explore the guarded concern respectfully; fact mapping; weight 30                                                                                                                                                                      |
| Objective 3            | Explicitly review the intake note; review `notes`; weight 30                                                                                                                                                                           |
| Rubric applicability   | 1, 2, 3, 4, 7 for this focused introductory history; 5 and 6 N/A because no explanation/decision or clinical synthesis task is assigned                                                                                                |

Use valid stable IDs, provide coaching tips, review all authored records and acknowledge whole-profile review before publishing. Omitted medications, allergies, diagnosis and treatment remain unknown. This is an interview scenario, not a treatment case.

## Short demo, about 90–120 seconds

1. **0–30 seconds:** Create Jordan in Studio. Show the explicit facts, guarded topic, chart-only note and objectives. Review and publish v1. State that this profile is data, not patient-specific code.
2. **30–60 seconds:** Launch. Ask “What brings you in?” and “What kind of work do you do?” Ask about the supervisor before acknowledging the concern to show a deflection. Then ask “That sounds difficult. What concerns you about speaking with your supervisor?”
3. **60–80 seconds:** Open Notes; the question-only report stays locked. Ask “Can I see your schedule record?” to release it. Explicitly record review. Ask about allergies to demonstrate authored uncertainty.
4. **80–110 seconds:** Finish. Show seven domains, two N/A domains, denominator 20, and an expanded evidence link. Show objective completion separately. Export the encounter. Briefly show Omar/Yvette available through the same engine.

Recording a live AI response may take several seconds; allow that time and show the loading state. Do not edit out fallback status while implying every reply came from Bedrock. If only provisional assessment is available, label it and do not present placeholder ratings as measured performance.

## Four-minute pitch narration

**0:00–0:30 — problem**

Healthcare students need repeatable practice with conversations that are difficult to rehearse: asking sensitive questions, listening to uncertainty, reviewing records, and explaining next steps. Faculty need control over the case and visibility into what actually happened. A generic chatbot can sound convincing while inventing details or acting like a clinician. Our project, VirtuSP, is a reusable virtual standardized patient workspace designed around that problem.

**0:30–1:05 — authoring**

The faculty author a patient in Patient Studio. They define what the patient knows, what belongs only in the chart, which topics require rapport, and what the learner should demonstrate. Sources, measurements and artifacts are reviewed before publication. A published version stays fixed for an active encounter. Eight organizer personas arrive as editable drafts with original provenance. Missing medications, allergies, units and dates remain unspecified. A description can help draft a profile, but generated material still needs review.

**1:05–2:05 — live product demonstration**

Here we create a new synthetic patient, Jordan. This patient has a sleep concern after a schedule change, a work context, and a guarded concern about speaking with a supervisor. We publish the profile and immediately start an encounter using the same engine. An open question elicits the concern. A respectful acknowledgment allows the guarded topic to emerge. The chart begins with a locked intake note; the authored release condition makes it available, and an explicit review records that the student read it. An allergy question stays unknown because the author did not supply that information. No patient-specific code or new training run was needed.

**2:05–2:50 — architecture and evidence**

Our local Node backend owns the encounter state. Amazon Bedrock matches the question to neutral topics. The server applies disclosure rules before giving the dialogue model permitted patient facts. A generated response must cite valid fact IDs and pass numeric and grounding checks. Rejected replies use approved wording. Stable events record the actual conversation, disclosure, report release, review and provider status. S3 stores private recovery copies and attachments with encryption and versioning. Optional ElevenLabs speech speaks only a saved, validated reply. The browser also supports text and browser speech.

**2:50–3:25 — assessment and evaluation**

Feedback uses the supplied seven-domain rubric with ratings from one to four, or N/A when the scenario cannot support observation. It cites actual encounter evidence and provides next-attempt coaching. Objective completion is separate. A rating of one in clinical reasoning or professionalism and safety triggers review. We compare models using persona questions, multi-turn encounters, adversarial prompts and a new patient. Manual review matters: an automated pass can still conceal invented background details. We report measured prototype results, latency and fallbacks without claiming clinical reliability.

**3:25–4:00 — value and next step**

The reusable core is faculty control, progressive information, patient continuity, and feedback that can be traced to evidence. New patients work through profiles rather than custom engine branches. The next step is qualified faculty review, broader cases and held-out conversations, followed by controlled classroom evaluation. A larger teaching corpus could justify retrieval; fine-tuning would require a reviewed dialogue dataset and measured failures. Today’s demonstration focuses on the core teaching experience and makes its limitations visible.

## Capture checklist

- Run at 1280×720 or higher with readable text; close `.env` and credential consoles.
- Confirm model, provider, S3 status and fallback behavior. Review the final assessment manually.
- Test narrow layout, theme contrast, loading, keyboard focus, mute, pause and audio cancellation in Chrome/Edge.
- Record the new-patient flow and the four-minute narration; preserve the final files locally. No recording has been captured by this repository yet.
- Put only reviewed aggregate evaluation figures in the pitch; replace provisional results after the final run.
