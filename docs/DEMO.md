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

These timings are rehearsal targets. They are not measured performance, and a recorded script is not a video.

**0:00–0:20 — problem and promise**

Healthcare students need practice that faculty can stand behind. A chatbot can sound like a patient while inventing a stroke, a smoking history, or a family death. VirtuSP’s promise is narrower: faculty control the case, students practice the encounter, and patient answers and feedback stay traceable to approved information and encounter evidence. This is a student project. It is not an institutional product and it is not clinically validated.

**0:20–1:10 — create, edit, review, publish**

Screen: Patient Studio, New patient. Name the synthetic patient, for example Jordan Vale, age 34. Add one patient-known fact, “My schedule changed to nights last month.”, and one chart-only fact the patient must not speak. Add a rapport phrase of at least 12 characters if a later fact is guarded. Attach a document if you want; its awareness note stays an unapproved draft until you edit and check approval. Choose the general rubric unless this case really is the pediatric hearing scenario. Read the review summary, check the faculty review box, and publish. No JSON and no code change.

**1:10–2:00 — interview and one authored reveal**

Screen: the encounter, conversation beside the chart. Ask what changed at work. The patient uses the approved sentence. The chart item stays locked until the question matches its authored condition. Opening the tab does not count as interpretation. Point at the locked label, then ask the releasing question and show the newly available record.

**2:00–2:30 — unsupported question and provenance**

Ask something the case does not contain, such as a stroke, daily smoking, or a parent’s cause of death. The patient gives a courtesy or an explicit unknown, not a new clinical fact. On a faculty view, open the turn: case version, selected fact IDs, response mode, and server-constructed text. The model may have helped choose a topic. It did not write the line.

**2:30–3:15 — complete and inspect feedback**

Finish the encounter. The debrief leads with questions asked, what was disclosed, objective coverage, and next steps. In local mode the seven domains stay pending, labeled not assessed, with no overall total and no invented safety failure. If a model assessment is available, a rating links to a real turn. A demo review records a reason and keeps the model draft. Say that the demo alias is not a verified faculty identity.

**3:15–3:40 — architecture and tests**

The browser posts a question. The server serializes it, may ask Bedrock for a topic id, applies disclosure, and builds the sentence from approved wording. Speech speaks that saved sentence. `npm test` covers the boundary, rubric choice, and assessment states. `docs/RELEASE_READINESS.md` and `reports/release-results.json` are the evidence. Older benchmark tables are not measurements of this release.

**3:40–4:00 — limits and the next step**

We do not claim zero hallucinations, a learning gain, or institutional compliance. Institutional authentication, retention, an accessibility review, educator validation, and deployment governance are still required. The proposed next step is a faculty-led pilot on synthetic cases, with educators judging the feedback before any score is treated as a grade.

## If the live model is unavailable

Stay on local mode. The same screens still publish a case, answer from approved lines, refuse unsupported facts, and show a factual debrief with domains pending. Do not invent a score. Do not describe a file export as a Canvas integration.

## Capture checklist

- Run at 1280×720 or higher with readable text; close `.env` and credential consoles.
- Confirm model, provider, S3 status and fallback behavior. Review the final assessment manually.
- Test narrow layout, theme contrast, loading, keyboard focus, mute, pause and audio cancellation in Chrome/Edge.
- Record the new-patient flow and the four-minute narration; preserve the final files locally. No recording has been captured by this repository yet.
- Put only reviewed aggregate evaluation figures in the pitch; replace provisional results after the final run.
