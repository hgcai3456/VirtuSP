# Patient information audit — October 10, 2026

The six empty-placeholder deletions did not remove patient information. Comparing the complete pre-cleanup snapshot against the active store found **no changes to any retained draft**, no removed published versions, and no missing upload metadata. The earlier pre-group snapshot also contains the same original Yvette draft: age 64, three findings and one CSV source. Later records were added, not replacements for that draft.

## What caused the apparent loss

- The curated catalog excluded original CSV profiles and retired demo cases. Those records still existed in storage. Faculty can now open **Patient Studio → Saved patient library → Edit case**.
- A newer roster adapter copied encounter facts but omitted descriptive source fields such as history, diagnosis, medications, allergies and the example conversation. It retained only complaint/history/diagnosis combined in one source excerpt. The complete roster source is now preserved separately and visible in **Documents and references → Complete saved case source**. This does not automatically turn contextual fields into patient-known facts.
- The ordinary editor never displayed the synthetic generator's `summary`. **Case description (faculty only)** is now editable and retained when saving/publishing. Existing CSV descriptions are recovered from their preserved original summary/notes; roster descriptions come from their preserved authored case text.
- Chart facts have both a release section (`sec`) and display section (`ehr`). A Notes release could appear only under History. Released findings now appear in either relevant section. Reports are filtered to the selected chart tab; Overview shows all released content. Disclosed patient wording appears alongside findings instead of showing only a generic heading.
- Startup previously replaced any draft at a roster ID if its `origin` changed. That was a latent data-loss risk, although it did not change the retained drafts in this snapshot. Initialization now seeds only absent drafts and fills missing context once. Existing clinical facts and faculty edits are preserved.

## Same names are different cases

Do not combine these histories or change ages to reconcile them. The roster and organizer CSV are different source records. The downloaded Hugging Face case documents are another explicitly preserved corpus; files on disk do not automatically become live encounter profiles.

| Name | Original CSV case | Current roster case |
| --- | --- | --- |
| Yvette Armstrong | 64; hypertension | 74; heart failure |
| Omar Sinclair | 45; dyslipidemia | 54; hypertension/chest-pressure presentation |
| Nisha Patel | 29; newly diagnosed MS | 29; asthma |
| Wyatt Nelson | 18; obesity, dyslipidemia, constipation | 23; sleep-related presentation |
| Walter Greene | 72; heart failure | 79; falls presentation |
| Vladko / Vadko Bareche | 31; supplied substance/social history | 31; headache presentation; differently spelled name |
| Dominic Rivera | 22; trauma service | 27; sickle-cell presentation |
| Marcus Ramirez | 59; heart failure | 48; hypertension; retired from the curated catalog |

Saved cases remain editable. The saved library does not automatically republish cases or put retired cases back into the student catalog. Published encounter snapshots and existing assignments retain their original versions.

## Where information lives

- **`data/state.json`**: active faculty drafts, immutable releases, students, assignments, encounter snapshots, transcripts, clinical notes and uploaded-file metadata. This is the patient database used by Patient Studio and the encounter engine. JSON/S3 persistence remains in place.
- **`data/files/<file ID>`**: original uploaded bytes. Sources retain their extracted text. Files are served only through role/ownership-checked endpoints.
- **`public/js/roster.js`**: complete authored demo cases, converted by `lib/roster-profiles.js`.
- **`corpus/faculty-patients.csv`**: original eight-person organizer seed. The original row remains in each imported draft.
- **`corpus/downloads/virtual-patient-profiles-sample/studio/<patient>/`**: tracked, richer case brief, clinical record and faculty notes for upload/review. These are not silently merged into same-named roster cases.
- **`data/virtusp*.sqlite`**: separate reference/report/conversation ingestion store. Both local shards had empty tables during this audit; they are not the patient database used by these encounters.

**Clinical-record Notes** and **Team → Saved clinical claims** serve different purposes. Clinical-record Notes contain approved case findings released by disclosure rules. Team notes are the student's own saved claims and do not alter the patient. The two recent Yvette encounters retained their pharmacy note disclosures; neither contained a saved student clinical note. Question-only lab reports stay locked until a matching interview question; opening Labs alone does not override that authored rule.

## Remaining extraction limitation

One older extracted Omar draft (`comparison-omar`) has generic chart labels such as “Primary diagnosis” rather than the clinical value. Those headings were already present before cleanup. Its source files and source text survive. The extraction prompt now explicitly requires values in finding labels and preserves/reviews a faculty summary. **That prompt change does not repair previously extracted headings**: re-extract and review the originals before using that old draft. Never recover clinical values from question keywords or merge another Omar's history.

Extraction intentionally selects a limited set of findings (currently prompted for up to 35); complete source material remains available for authoring. Scans still require transcription. A short extracted profile does not mean the original document has been deleted. Faculty must select the correct document purpose: Case brief, Chart report, or Reference; selecting Case brief for a chart file changes its disclosure treatment.

## Verification and recovery

The original repair passed 81 regressions; after merging teammate `a09d7f3`, **all 104 automated regressions pass**, including every roster's clinical Notes, full source preservation, summary save/reload, faculty-library/student denial, once-only migration, edited-draft protection, and immutable releases/encounters. Isolated Chrome checks verify the saved library, Yvette editor and Notes visibility below pinned controls at desktop/mobile widths. The merge also repairs the missing chat-tracker import and restores test-database isolation. Tests use fixtures/local inference; no new live Bedrock quality or clinical-validation claim is made.

The applied local migration preserved all 27 drafts, 16 encounters, 20 earlier releases and uploaded originals, appended eight contextual bundled versions, and reported S3 synced. Each existing clinical fact, artifact, source and objective array was compared before/after. Newer optional profile archival from the teammate merge is a separate replica; the active encounter authority remains JSON.

Before applying context restoration, take a full ignored backup and stop the local app. The migration preserves clinical fact/source/artifact/objective arrays and appends contextual versions for existing bundled releases; older versions are never edited. Backups and live state stay ignored.

Read-only reproduction:

```powershell
node scripts/audit-patient-data.js
node scripts/audit-patient-data.js --before tmp\your-state-backup.json
```

The audit does not initialize the store, run migrations, load credentials or contact AWS. Inspect `headingOnlyCandidates` manually; they are candidates, not proof of a missing value.
