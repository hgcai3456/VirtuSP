# Quick faculty AI authoring

Open **Faculty → Patient Studio → AI Generate a new Patient**. The original **New patient** workflow still extracts supplied material without inventing patient facts.

1. Type a short scenario, use **Dictate brief**, or optionally drop documents into the upload pane. No bloodwork entry or full clinical form is required. Alternatively choose **Random patient** with no input.
2. **Generate patient** creates a fictional case using the configured Bedrock model and runs a separate consistency review. Expect roughly one to two minutes; a correction pass can take longer. Failures keep the brief/files, and failed regeneration keeps the previous generated case.
3. Review the compact summary, expandable findings, reports, objectives and sources. **Edit patient details** opens the existing editor; **Change brief** lets you revise the prompt. Details remain collapsed by default.
4. Save a draft, or check the single faculty review acknowledgment and **Create & publish patient**. Publication creates an immutable version that immediately supports an ordinary encounter and later group membership. Generation alone does not create a library entry or publish anything.

## What the AI creates

The generator requests a substantial faculty summary, fictional identity, character and communication style, 20–32 patient/history/chart findings, educational objectives and relevant clinical measurements. The server accepts 16–40 findings and 3–6 objectives, validates their structure and references, and builds reports from chart-only facts. Facts can include patient perspectives, illness concerns and authored guarded disclosures. Nonessential unknowns remain explicit.

Lab tables are structured text, not images: test, value, units, context and date. Their contents and the encounter's chart labels derive from the same fields. Edited generated measurements update the report before saving/publication. Written imaging findings use the same chart/report pipeline. No new scan images are generated in this feature. Reports carry a **Synthetic teaching report** label.

A database of existing patients is not required to author fictional cases. A reviewed case/template library and clinical references would help calibrate case realism. The model's second review is an automated consistency check, not evidence of clinical accuracy, and faculty review remains part of publication. Generating plausible-looking radiology images would not establish their diagnostic correctness; suitable licensed/synthetic teaching assets should be attached if actual scans are needed. AWS provides a separate [Nova Canvas image generation model](https://docs.aws.amazon.com/nova/latest/userguide/image-generation.html), which is not integrated here. The selected [Claude Sonnet 4.6 model](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html) produces the structured text case.

## Uploads and provenance

The shared upload pane supports PDF, TXT, PNG and JPG, multiple files, 5 MB per file. Generation reads selectable PDF/TXT text. Image/scanned originals are preserved as faculty source files, but this feature does not read pixels or perform OCR; the review notice names unread files. Dictation uses browser recognition in supported Chrome/Edge environments and requires microphone permission. Typed text always works. Dictation is stopped on generation, upload, closing or switching workspaces. Physical microphone accuracy needs rehearsal.

- **Case brief:** supplied case facts constrain generation, including identity and explicit unknowns. AI may add fictional background; it must label the additions separately.
- **Chart report:** supplied findings stay chart-only; the generator does not turn uploaded clinical values into patient knowledge. Parsed originals can be attached to the encounter with their mapped findings.
- **Reference:** teaching context, never proof of patient-specific findings.

Sources preserve original uploaded text/file IDs, the faculty brief and the raw generated case. Supplied facts require an exact source quotation. Added facts have `origin: "ai-synthetic"`; they are not organizer-provided facts. Uploaded missing measurement metadata or explicitly unspecified allergies/medications must stay unknown. Generating a case never modifies organizer drafts or existing encounters.

## Backend and verification

`POST /api/generate-synthetic` is faculty-only:

```json
{"description":"An adult concerned about cholesterol medication","files":[],"random":false}
```

For random generation use `{"random":true}` without a brief or files. Attachments reuse `POST /api/files`, followed by `{id, role, section}` entries; total extracted context is limited to 48,000 characters. A random seed encourages variation. Bedrock must be enabled; there is no hard-coded patient pretending to be an AI response. Server-only AWS credentials/model configuration remain unchanged. No new database, model training or image-generation service is required.

The response contains an unreviewed profile, provider status and unread-file names. One bounded regeneration/repair pass can address structural omissions or a rejected review; a second failure returns an error. The accepted case's review status is recorded in provenance. Generation does not mark any record faculty-reviewed or save a patient automatically. Existing publication, JSON recovery, immutable releases and S3 mirroring remain in use.

`npm test` covers faculty/student authorization, truthful source references, chart-only boundaries, report/value binding, unknown preservation, dictation lifecycle, uploads, preview versus publication, failed provider recovery and the repair limit. Browser layout checks were run separately at desktop and narrow widths. These prototype tests do not validate clinical realism.

Run `node scripts/generate-smoke.js` for isolated real Bedrock checks of a brief, random case and uploaded fictional brief. Pass `brief`, `random` or `documents` to run just one. It saves drafts under ignored `tmp/generation-smoke/`, never writes the active library or S3, and uses the existing `.env`. Remaining work: faculty case calibration, clinical review of generated labs/imaging prose, physical dictation rehearsal, and optional OCR/curated diagnostic image assets.
