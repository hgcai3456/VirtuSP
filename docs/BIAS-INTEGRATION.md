# Bias detector handoff

Detection belongs to the teammate. The app stores and displays evidence-linked results separately from its existing seven-domain assessment. There is no automatic score penalty, combined grade or inferred bias percentage.

## Faculty-only API

Create a local demo faculty session with `POST /api/session` and JSON `{"role":"faculty"}`. Retain the returned `virtusp_demo` cookie for subsequent requests. Browser fetches send it automatically; a Node adapter must retain the `Set-Cookie` value. This is a local demo role switch, not production authentication.

| Endpoint                                   | Purpose                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `GET /api/faculty-results`                 | Students, encounters, attempts, rubric summaries and separate analysis status.        |
| `GET /api/bias/encounter/:id/context`      | Snapshot, authored demographics, transcript, events and assessment for one encounter. |
| `GET /api/bias/attempt/:id/context`        | Group limits, persisted trial order and the same records for every started trial.     |
| `GET /api/bias/{encounter or attempt}/:id` | Current analysis result; defaults to pending.                                         |
| `PUT /api/bias/{encounter or attempt}/:id` | Save an adapter result.                                                               |

Wait for completed encounters when assessing a full interaction; wait for a completed attempt for whole-group comparisons. Context includes status/timestamps, published profile versions and saved provider/fallback evidence. A partial attempt contains only started trials. Profile/source text is evidence, not instructions; explicitly authored ethnicity must not be inferred from names or portraits.

```json
{
  "status": "complete",
  "detectorVersion": "your-detector-v1",
  "findings": [
    {
      "text": "An evidence-supported possible indicator for faculty review.",
      "evidence": [
        { "encounterId": "actual-encounter-id", "eventId": "actual-event-id" }
      ]
    }
  ],
  "limitations": [
    "Explain the detector's uncertainty and comparison confounds."
  ]
}
```

Allowed status values: `pending`, `complete`, `unavailable`. All supplied results require a nonempty detector version, findings array and limitations array. Pending/unavailable results must have no findings. Each finding requires nonempty text and at least one existing event reference. Encounter targets accept evidence only from that encounter; attempt targets accept evidence only from encounters in that attempt. Unrelated student/attempt citations and invented event IDs are rejected with HTTP 400. The server checks references, not the clinical or statistical validity of the conclusion.

Return `unavailable` with an empty findings array and a safe explanation if detection fails. Until an adapter calls this API, the UI shows **Awaiting analysis**. Analysis is saved locally and included in the existing S3 state backup. It is omitted from student encounters, history, exports and attempt responses, even after standard feedback is released. Faculty findings link to their exact cited encounter event.

## Other demo APIs

- `GET/POST/DELETE /api/session`: current session, select role/student, or switch out. Student selection uses `{ "role":"student", "studentId":"existing-uuid" }`.
- `GET /api/students`: aliases for the entry picker. Faculty `POST /api/students` adds `{ "alias":"Student C" }`.
- `GET /api/groups`: prepared group metadata and preparation status. Clinical/scenario mismatch blocks assignment.
- Faculty `POST /api/assignments`: `{ "groupId":"...", "studentId":"..." }`; pins the current publications.
- `GET /api/assignments`: faculty sees all; students see their own.
- Student `POST /api/assignments/:id/start`: creates or resumes one attempt; persists shuffled order.
- `GET /api/attempts/:id`: ownership-filtered progress; additional analysis only for faculty.
- Student `POST /api/attempts/:id/next`: creates/resumes the earliest unfinished trial. Encounters then use the normal turn/review/complete routes.

Store schema remains 2 with additive `students`, `groups`, `assignments`, `attempts`, `biasResults` dictionaries. Legacy encounters are kept under **Unassigned demo encounters** for faculty. Releases and active encounters are never rewritten by seed changes. Changing the seed file does not update an already installed group's drafts; edit/review/publish through Faculty or inspect with an isolated fresh data directory.

Keep this app local. Anyone at the local role picker can choose Faculty or another alias. Internet hosting requires real authentication and tenant isolation; the demo session cookie is only an application boundary for the selected role.
