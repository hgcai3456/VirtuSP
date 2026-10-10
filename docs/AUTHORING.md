# Faculty patient creation and document uploads

The challenge overview requires profile authoring, teaching references, clinical attachments, disclosure rules, correction, consistency review and publication. It does not prescribe separate upload widgets or a file count. The student performance rubric evaluates encounters, not faculty upload behavior.

The provided faculty CSV supplies eight short patient personas. Richer organizer-linked profiles are now available locally; use Omar or Yvette as the main case. See [CORPUS.md](CORPUS.md) for paths, provenance and disclosure review. The challenge overview and rubric describe requirements and assessment criteria, not patient histories. There is no required faculty PDF template.

A useful starting package contains a case brief and an optional clinical report. Add more documents whenever the scenario needs them:

| Document purpose   | Faculty supplies                                                                                                                                         | Application use                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Faculty case brief | Synthetic name, age, concerns, symptoms/history, medications/allergies if explicitly known, personality, disclosure expectations and learning objectives | Patient profile and patient-known interview facts; retained as faculty evidence  |
| Clinical report    | Synthetic lab report, prior note, ECG/image/report, or other patient-specific chart material                                                             | Chart-only facts and a protected original attachment, released by authored rules |
| Teaching reference | Guideline, paper or institutional protocol                                                                                                               | Authoring and assessment evidence; never establishes facts about this patient    |

These purposes remain distinct even though the interface uses one upload area. A faculty case brief may include answers or learning objectives and is not automatically shown in the student chart. Teaching papers are not student clinical reports. Clinical report facts are chart-only in the upload pipeline. If a student should hear a result from the patient, faculty must explicitly author that patient-known fact.

## Workflow

1. Click **New patient**. A dialog opens immediately; nothing is added to the library yet. **Edit** opens the same dialog for an existing patient.
2. Drag PDF/TXT/image files into the upload area or browse, then choose each file's purpose. Uploading saves the original attachment locally and to the configured private S3 bucket; canceling the form does not remove stored uploads, but does not create a patient.
3. Add optional patient details, then click **Extract & fill form**. Selectable PDF text is parsed and Bedrock organizes explicit case details into a temporary preview. References are passed separately. With AI disabled or unavailable, original text is preserved for manual entry.
4. Review and correct identity, clinical facts, sources, chart artifacts, release conditions and objectives. Dates, units, medications and allergies are not invented; missing fields remain blank/unknown. Report dates are optional and fill automatically when an unambiguous labeled ISO date is present. Extraction rebuilds the form and can replace manual edits. Review originals before approving.
5. Check the single **Faculty review and publication acknowledgment**. This attests to review of synthetic material and approval of that version; it is not an automated certification. Further content edits clear acknowledgment.
6. **Save draft** accepts unfinished work. **Create & publish patient** validates and creates an immutable first version; failures leave the new patient out of the library. Existing patients use **Publish version**. Start the encounter directly from the resulting card.

Publication checks remain on the server. The UI omits the persistent error inventory and repeated record-review checkboxes. Failed submissions show a short red popup, retain the form, and return focus to the relevant field. Detailed editor sections start closed. A single whole-profile acknowledgment covers review of all records; separate approval flags do not cause additional submission errors. All seven rubric domains apply by default; optional scope editing remains available for scenarios that cannot support some observations.

Images, scanned PDFs and handwritten notes can be retained, but no OCR or image interpretation is implemented. Transcribe their content manually. PDF limits: 5 MB/file, 50 pages, 100,000 extracted characters/file; drafting accepts at most 48,000 patient-text characters. There is no file-count cap in the dialog or profile attachment lists; structured facts, references and reports can still be authored directly.

## Example faculty case brief

Use this structure in a text-based PDF or paste it into the description:

```text
Synthetic educational case
Name: Alex Rivera
Age: 42
Reason for visit: I want to discuss feeling tired.
Patient-known history: I have felt tired for two weeks.
Personality: Reserved, answers politely.
Communication style: Short everyday sentences.
Allergies: Not specified (must remain unknown).
Faculty objective: Elicit the reason for visit and symptom duration.
Disclosure: Patient history available when asked; chart reports available
only through the separately authored release conditions.
```

A second document can contain explicitly authored chart findings, with dates, units and reference/interpretation context where relevant. Do not copy a general reference's example values into this patient's chart.

## Verification limits

Regression coverage exercises real PDF text extraction, simulated Bedrock drafting, document-role separation, chart-only enforcement, preview/cancel behavior, single acknowledgment invalidation, publication and immediate encounter reuse. Model extraction and final clinical consistency still require faculty review. Actual browser layout and microphone verification require a connected browser or manual rehearsal.

## Where to find documents

The initial organizer data is [faculty-patients.csv](../corpus/faculty-patients.csv); use **Import faculty CSV** for that file. Richer organizer-linked case documents are described in [CORPUS.md](CORPUS.md). The challenge/rubric PDFs describe requirements and scoring, not individual histories.

For the New Patient upload flow, use the newly authored synthetic [Alex Rivera case brief](../corpus/examples/alex-rivera-case.txt) and optional [prior note](../corpus/examples/alex-rivera-prior-note.txt). These TXT files work directly; PDF conversion is not needed. Label them **Faculty case brief** and **Clinical report**, respectively. They are examples created for this application, not organizer/faculty-approved cases.
