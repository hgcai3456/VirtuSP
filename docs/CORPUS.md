# Patient corpus and faculty uploads

Use the organizer-linked **virtual-patient-profiles-sample** for case authoring: **Omar Sinclair** for the primary demonstration and **Yvette Armstrong** second. The earlier faculty CSV provides shorter drafts. Downloading these richer profiles does not overwrite drafts, published versions or active encounters.

**Alex Rivera was authored by the coding agent for upload and reuse testing.** `corpus/examples/` contains optional synthetic examples, not organizer patient histories. Denise and Marcus remain scaffold examples. Organizer-linked Marcus and the scaffold Marcus are distinct sources; do not blend their facts automatically.

## Download and locations

```powershell
npm run corpus:fetch
```

Run from the repository root. This downloads public files, verifies pinned revisions, preserves original bytes and records SHA-256 hashes. It requires internet access, but no Hugging Face key or AWS credentials. It does not train a model, import facts or publish patients. [datasets.json](../corpus/datasets.json) records revisions, URLs and license notes. The 24 Studio TXT documents and their attribution README are tracked in Git, so teammates can use them directly after pulling. Raw/normalized caches and the Patient-Doctor download remain ignored; reproduce those with this command.

| Directory                                                                 | Contents                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `corpus/downloads/virtual-patient-profiles-sample/raw/`                   | Original README and patient file: eight synthetic profiles |
| `corpus/downloads/virtual-patient-profiles-sample/normalized/`            | The same values as JSON and one-record-per-line JSONL      |
| `corpus/downloads/virtual-patient-profiles-sample/studio/<patient-name>/` | Tracked TXT documents for Studio upload and review           |
| `corpus/downloads/patient-doctor/raw/`                                    | 271 original conversation TXT files                        |

Both downloads succeeded: 115,364 bytes for the profile source and 2,277,538 bytes for conversations. Each directory has `manifest.json` with provenance and hashes. Upstream `patients.jsonl` actually contains consecutive pretty-printed objects; normalization parses boundaries without evaluating text or changing values.

Profile roster: Dominic Rivera, Yvette Armstrong, Nisha Patel, Omar Sinclair, Marcus Ramirez, Walter Greene, Wyatt Nelson and Vladko Bareche.

## Use Omar in Studio

Open `corpus/downloads/virtual-patient-profiles-sample/studio/omar-sinclair/`. Drag files into **New patient** or browse:

1. `case-brief.txt` → **Case brief**: overview, demographics, nutrition, psychosocial material, initial/discoverable/reluctant information and learning opportunities.
2. `clinical-record.txt` → **Chart report**: clinical/medication sections and hidden information. Protect it with artifact release conditions.
3. Read `faculty-notes.txt` separately. Assumptions and optional details are not approved patient facts; do not upload these as patient history.

Select **Extract & fill form**, then review. These files are evidence packages, not approved application profiles. Complete original JSON is retained for comparison.

Rich-case drafting allows more output than the short Alex example and may take about a minute. The first structured review may need Bedrock schema warm-up time; see [SETUP.md](SETUP.md). It proposes a concise selection of facts; review originals and author any further required details. Unapproved faculty assumptions and optional details are excluded by the extraction/review prompts. Keep `faculty-notes.txt` beside the form rather than uploading it as patient history. Failed AI retries now show a specific reason and retain your form edits and attachments.

**Review/author trust gates and guarded replies for reluctant facts** in the clinical-facts section. Draft extraction does not reliably convert disclosure labels into application gates. Hidden values must remain chart-only. Overview prose can repeat clinical or guarded details, so review every fact's visibility and artifact release conditions. Do not publish with all gates at zero by default.

The source includes assumptions and conflicting statements: Omar's meal pattern and discoverable meal count differ. Preserve these for explicit faculty review rather than silently resolving them. Missing dates, units, medications or allergies must remain unspecified. Add selected teaching references separately and review learning objectives. Existing published encounters retain their immutable versions.

## Faculty upload types in the challenge

The supplied **SHP C1 Virtual Patient Encounter System Overview**, Faculty Component, describes:

| Type              | Challenge material                                         | Use                                                        |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Patient profile   | Structured or descriptive patient profiles                 | Identity, history, personality and patient knowledge       |
| Knowledge source  | Papers, guidelines and institutional protocols             | Authoring/assessment support, not facts about this patient |
| Clinical artifact | Laboratory reports, ECGs, X-rays, CT scans and prior notes | Student chart, released under authored conditions          |

Faculty define availability, review/correct generated information, check consistency and approve reusable profiles. Disclosure conditions and objectives can be entered in the form. There is no required faculty artifact template, separate widget per category, or two-file limit. The student performance rubric evaluates encounters; it does not specify upload counts.

The app supports PDF/TXT/PNG/JPG in one drop area, with purpose selection and **no file-count cap**. Existing file/text limits remain. Scans and handwriting need manual transcription until OCR is implemented. Documents are evidence, never executable instructions.

## Source use and attribution

[virtual-patient-profiles-sample](https://huggingface.co/datasets/joeljames270/virtual-patient-profiles-sample) declares CC-BY-4.0 with VHS (Virtual Human Simulation) project at Rutgers University attribution. Its card identifies synthetic generation, assumptions and inconsistencies. Organizer linkage does not establish clinical validation.

[Patient-Doctor](https://huggingface.co/datasets/Postzeun/Patient-Doctor) is dialogue reference material for reviewing conversational patterns and authoring evaluations. Viewer rows are lines, not distinct encounters. No license or dataset card was declared at the inspected revision; keep it local and establish reuse terms before redistribution. Do not assume all conversations are synthetic or clinically correct. Do not merge their patient facts into organizer profiles or live encounters. No model training uses this corpus in this iteration.

Reviewed development examples and evaluation cases remain separate from downloaded source material. A source transcript is not automatically a reliable answer key.
