# Objective-first scenario workflow

Students see assigned assessments first. Below that, select a learning objective, optionally narrow by learner discipline, then start an individual patient or a multi-patient assessment. Faculty uses the same filters and can assign directly from each card: select a student, then click **Assign**. There is no disclosure panel to open before assigning.

The categories are communication/empathy, patient history, medication review/shared decisions, nutrition counseling, mobility/fall safety, and urgent referral. They are discovery labels, not diagnoses, scoring rules or a claim that a case is suitable for every discipline. An empty result means a matching published case has not been categorized; it does not create clinical facts. The urgent-referral demonstration still needs a qualified reviewer to author/review an appropriate case.

## Authoring

The faculty form begins with **Learning goal first**. Check teaching categories and, optionally, appropriate disciplines. No discipline checked means no discipline restriction. Keep the detailed case-specific objectives and evidence definitions separate; categories do not award objective credit.

Quick AI authoring has an optional learning-objective selector before the brief. Its selected goal is supplied to the model and becomes draft catalog metadata. Briefs, uploads, dictation and random generation continue to work without selecting a goal. Model-generated cases still require faculty review; a tag is not proof the generated encounter supports that goal. Existing upload extraction preserves categories the faculty has explicitly selected.

Existing cases without explicit categories are matched from their authored objective **titles only**, using the fixed category vocabulary. No facts, descriptions, demographics, hidden values or source documents are scanned. Faculty should confirm or correct these matches during rehearsal. Explicit empty categories stay empty and appear under All objectives. Missing or ambiguous titles may require manual categorization.

## Persistence and interfaces

- `profile.catalog = { objectives: [categoryId], disciplines: [disciplineId] }` is optional, validated metadata. Editing saves a draft; publish a new version to change the runnable catalog. Earlier releases and assigned versions remain fixed.
- `GET /api/catalog` returns the allowed objective and discipline choices. Profile listings expose only neutral categories from the latest published release when one exists, including in the faculty catalog; the editor loads the draft separately.
- Group categories default to the intersection across the current published cases, so every trial matches the goal. Unrestricted disciplines accept any discipline; incompatible discipline sets exclude the group from a specific-discipline filter. Faculty-created group metadata can be provided using `catalog` on create/update. Assignments are not filtered or rewritten.
- `PUT /api/student-preferences` accepts `{ "discipline": "pa" }`, or `""` for All disciplines. Only the signed-in demo student can change their own preference. `GET /api/session` returns their preference; the public alias list does not expose preferences. It uses existing JSON/S3 persistence and survives restart. These demo aliases are not institutional authentication.
- Filters never change assessment applicability, ownership, clinical state, disclosure rules or rubric scores. They reset on role switching; a new student receives their own saved discipline preference.

## Faculty feedback and parallel work

Faculty encounter feedback shows coaching, objectives/findings, seven-domain ratings, evidence, interview review and presence feedback in one vertical view. Ratings and cited evidence are expanded. The optional full rubric guide remains collapsed. Faculty bias analysis stays separate, with pending/unavailable status and visible limitations. Student feedback tabs and held group feedback remain unchanged.

This work does not redesign the EMR layout, avatars, speech, timer, recording failsafe, model/provider or import pipeline. Coordinate those changes with their owners. The incoming optional Anthropic conversational path has separate disclosure/grounding concerns described in the checkpoint handoff; these workflow tests do not validate that path clinically.

Give the medical reviewer [MEDICAL-STUDENT-HANDOFF.md](MEDICAL-STUDENT-HANDOFF.md). Start an independent research agent with [RESEARCH-AGENT-HANDOFF.md](RESEARCH-AGENT-HANDOFF.md); it owns source-backed market/cost/clinical-review/pitch documents, not these application files.
