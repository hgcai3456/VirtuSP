# VirtuSP — Rutgers Health Hackathon submission

## 1. Executive summary
**AI powers the experience. Faculty defines the patient.** VirtuSP is a reusable virtual standardized-patient prototype for formative healthcare education. This submission maps to the supplied Challenge 1 criteria without self-assigned scores.

## 2. Problem
Learners need repeated interviewing and reasoning practice. Human standardized-patient sessions require trained participants and scheduling. Additional practice is the intended benefit; learning gains and quantified savings have not been measured.

## 3. VirtuSP solution
Faculty review a case once; learners practice it repeatedly. The reusable case library complements educators and human standardized patients in preparation, remediation and formative assessment.

## 4. Why it is different
Faculty clinical content, progressive disclosure and published versions are distinct from AI capabilities. **Patients are data, not deployments.** Their combination with dynamic records and evidence-linked feedback is the product differentiation; containers and storage are standard infrastructure.

## 5. User workflow
Faculty → Studio → publish. Student → encounter → dynamic chart → feedback. Role selection uses demo aliases rather than institutional identities.

## 6. Faculty workflow
Create structured facts or an optional descriptive AI draft; manage sources/artifacts; author disclosure and objectives; correct/review; publish an immutable version. Publication checks structure and review acknowledgment, not medical correctness. [Authoring](AUTHORING.md).

## 7. Student workflow
Launch any published profile through the same engine. Interview by text or available speech, release chart records, review artifacts, document findings and finish. Snapshots preserve identity, case version, transcript and events.

## 8. Key judging demonstration
**Create a NEW synthetic patient → review/publish → immediately interview → finish → inspect evidence. Zero patient-specific code changes, builds or separate environments.** [Demo steps 1–6](DEMO.md#judge-proof-sequence) provide the principal proof of Challenge 1 reuse.

## 9. Clinical grounding and safety
In `DIALOGUE_MODE=strict`, the server constructs approved wording after disclosure checks. Missing facts stay unknown. Optional natural dialogue generates prose and receives guarded wording; it must not inherit strict-mode guarantees. Faculty approval is an application review state, not proof of qualified clinical validation. Sources and AI drafts remain separate from approved patient facts.

## 10. Architecture
The top is what users interact with. The middle runs the simulation and enforces the rules. The bottom stores reviewed clinical data and encounter records. [Technical and simplified architecture](ARCHITECTURE.md#current-stack-and-persistence).

## 11. Tech stack
HTML/CSS/JavaScript support Studio/encounter views. Node.js centralizes rules/integrations. JSON snapshots preserve Studio/encounter state; SQLite supports ground-truth data; S3 holds objects/recovery; PostgreSQL supports profile archival. These are distinct roles, not interchangeable primary databases.

## 12. AWS scalability
Terraform defines CloudFront as HTTPS public front door, ALB as traffic manager, ECS/Fargate as compute, EFS for persistent files and CloudWatch for monitoring. CPU/memory policies allow additional tasks. Configuration proves an architectural path, not production load capacity.

## 13. Integrations
The application layer serves as an integration hub, connecting VirtuSP to AWS Bedrock for AI and ElevenLabs for voice, with a future path to LMS platforms like Canvas. Provider configuration does not prove a request succeeded. LiveAvatar LITE is optional, default-disabled/local-only and mock-tested; portrait/text fallbacks remain available.

## 14. Evidence-linked feedback
Fact/objective coverage identifies elicited and missed content. Assessment covers interviewing, communication, empathy/professionalism and reasoning with evidence references, coaching and review states. Citations establish record membership, not educational correctness. Provider failure leaves dependent domains unassessed; objectives remain separate from rubric scores.

## 15. Bias review
Faculty-only analysis supports an external adapter and Bedrock rubric analysis linked to encounter evidence. Varied-background comparisons are exploratory and cannot establish demographic causation or prove absence of bias. [Bias contract](BIAS-INTEGRATION.md).

The longitudinal faculty board also computes group-performance gaps in `lib/insights.js` without a model call. Its “bias variance” labels are heuristic review prompts, not validated bias scores; some tags are inferred from case text unless faculty supplies them.

## 16. Testing and verification
[Testing](TESTING.md) records the actual checkout run and exclusions. HTTP/DOM, grounding, publication/version, feedback, bias, media, observability and contract tests exist. Mock coverage is not a live-provider demonstration or clinical validation.

## 17. Healthcare impact
Potential uses include repeated practice, preparation, remediation, communication training and reasoning practice. Faculty retain responsibility for cases and interpretation of formative feedback. This is not a patient-care or validated high-stakes grading system.

## 18. Feasibility and scalability
New patient = reviewed profile, not new code, application or cloud environment. “And because patients are data rather than patient-specific code, we can add new cases, new students, new integrations, and more computing capacity without rebuilding the platform.” This expresses extensibility: integrations still need engineering and capacity still needs concurrency/provider validation.

## 19. Cost / operational considerations
Compute, load balancing, storage, logs, models and voice incur cost. Cost Explorer dashboard code supports reporting; hourly estimates may be daily charges divided by 24, and service-based attribution is not exact project allocation. No current dollar cost or per-student saving was independently verified in this audit.

## 20. Canvas / institutional integration path
Future work: verified identity/enrollment, assignment launch, secure learner/attempt mapping, consent/retention policy and reviewed grade return, potentially using LTI. No Canvas launch or grade synchronization exists here. Exporting JSON is not LMS integration.

## 21. Known limitations
Educator validation and measured outcomes are absent; demo identity, distributed state correctness, browser/provider-dependent voice, live avatar verification and accessibility/privacy/security governance remain unresolved. Strict and natural dialogue differ. [Release status](RELEASE_READINESS.md).

## 22. Next steps
Maintain passing engineering suites; validate strict mode on a held-out set; obtain faculty case/feedback review; test multi-task writes and session recovery; conduct accessibility/security review; run a governed synthetic-case pilot.

## 23. Live application link
[Live application](https://d18g7r2mfy8mll.cloudfront.net/app.html). This audit's web fetch could not confirm availability or revision; historical observations are in [handoff](HANDOFF.md).

## 24. GitHub repository link
[nathans3/VirtuSP](https://github.com/nathans3/VirtuSP). These local documentation changes must be published before judges can see them online.

## 25. Demo instructions
[Four-minute pitch and reproducible judging sequence](DEMO.md). Rehearse strict/offline fallback first; label AI availability and unassessed feedback honestly. Use synthetic data and keep credentials off screen.
