# Architecture

```mermaid
flowchart LR
    F[Faculty Studio] -->|edit and review| P[Draft profile]
    P -->|publication checks| V[Immutable published version]
    V --> E[Node encounter state]
    U[Student browser] -->|serialized question| E
    E --> T[Bedrock neutral topic selection]
    T --> G[Server disclosure gates]
    G -->|permitted fact IDs only| C[Server constructs approved wording]
    C --> D[Saved patient reply]
    D --> U
    D --> O[Optional ElevenLabs speech]
    E --> L[Atomic local recovery]
    L --> S[Private versioned S3]
    E --> B[Bedrock rubric assessment]
    X[Reviewed teaching excerpts] --> B
    B --> Q[Evidence validation and grounding review]
    Q --> FG[Role, ownership and group feedback gates]
    FG --> U
    GP[Prepared groups] --> AS[Faculty assignment pins versions]
    AS --> TR[Student attempt with fixed trial order]
    TR --> E
    E --> BC[Faculty-only detector context]
    BC --> BI[Teammate bias detector]
    BC --> BA[Faculty-triggered Bedrock OSCE bias rubric]
    BA --> BV[Exact student quotes and grounding review]
    BV --> BR
    BI --> BR[Separate evidence-validated analysis record]
    BR --> FV[Faculty student results]
```

## Data boundaries

The entry picker selects a local Faculty/Student demo session. Server guards protect authoring, raw files, student ownership and faculty analysis. Students see only their encounters; group assessments are filtered from every student response/export until all trials finish. Faculty can inspect student attempts but cannot alter them. Aliases, prepared groups, assignments, attempts and separate analysis results share the existing local/S3 manifest. Sessions reset on restart; saved progress remains. See [comparison workflow](DEMO-GROUPS.md) and [detector contract](BIAS-INTEGRATION.md). This is intentionally a local demonstration identity system, not public-hosting authentication.

| Data                               | Source of authority                      | Model use                                                                         |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| Patient name, age and identity     | Published faculty metadata               | Patient identity                                                                  |
| Patient facts and approved wording | Reviewed published profile               | The server speaks the selected, permitted wording; the model does not write it   |
| Hidden clinical values             | Backend profile snapshot                 | Excluded from topic selection and dialogue context until permitted                |
| Neutral topic descriptions         | Faculty-authored descriptors             | Semantic question matching; authors must avoid hidden values in these descriptors |
| History                            | Saved encounter turns                    | Conversational context; student statements remain untrusted claims                |
| Teaching excerpts                  | Explicitly selected reviewed sources     | Drafting support and assessment; not automatic patient facts                      |
| Student notes/SBAR                 | Student-authored claims                  | Evidence for assessment; never overwrite the patient                              |
| Development examples               | Six reviewed synthetic behavior examples | Inference-time demonstrations; no training or fine-tuning                         |

Profile `facts[]` is the authoritative authoring structure. Editable fields update that structure directly. Source content remains evidence, never an instruction source. Publications clone the profile; encounters clone their selected publication. Draft edits cannot alter an ongoing attempt.

Disclosure includes patient-known `ask` facts and chart-only `chart` facts. Trust gates apply to both. Reports can release by section, question keywords or either; a question-only report stays locked when its tab is opened. Every mapped fact must be permitted before its report releases. Releasing a report is distinct from opening/displaying it. Chart-section openings with released findings and report expansion record `view` events; no simulation review checkbox is required. Access can complete a record-access objective, but it does not establish reading or understanding. Legacy explicit review events remain valid.

## Dialogue workflow

1. The backend validates and serializes the question, deduplicating client request IDs.
2. An optional configured Bedrock Guardrail filters input. Explicit attacks are blocked locally too.
3. A semantic selector sees only neutral topic IDs/descriptions and the conversation. It does not receive hidden fact text or chart values.
4. The server applies authored disclosure rules. A guarded fact opens only when the student says a faculty-authored rapport phrase, once per phrase. Politeness keywords do not raise trust. Model empathy flags are recorded as uncertain and are not learner credit.
5. The server builds the spoken line from approved fact wording, an approved deflection, the courtesy catalog, or the unknown catalog. Unexpected model prose is ignored. `cloud.paraphrase()` is not on this path. Offline, a finding with no keywords can still be selected from the words in its topic and label. A direct question that matches nothing becomes an explicit unknown.
6. Attached documents do not become patient memories. A document-awareness note is an unapproved draft until faculty edit and approve it. An encounter keeps the published version it started with.
7. Stable events record the case version, selected permitted IDs, response mode, whether text was server-constructed, latency and fallback reason. Speech uses only the saved line. Students do not receive unreleased fact text through that metadata.

This is a bounded backend workflow, not an autonomous agent loop. A model-based reviewer can also make mistakes; the held-out suite and manual review remain necessary. The local fallback uses keyword matching and does not provide equivalent naturalness or semantic matching.

## Assessment and persistence

Seven domains use three states. `assessed` is a supported 1–4 rating. `not_applicable` is a faculty choice that the scenario cannot show the domain; it has no score. `not_assessed` means the domain applies but a judgment is unavailable, failed, or still pending; it has no score and is not treated as a 1 or as N/A. The denominator is `4 × applicable domains` only when every applicable domain is assessed. A supported 1 in domain 6 or 7 still requires review. A provider failure does not. Faculty objectives stay separate from rubric ratings. Local mode still produces the factual debrief. A demo-alias review can accept or edit one domain and keeps the original model draft. That alias is not an institutional identity. A specialty checklist runs only when faculty select its id. Age can suggest the pediatric hearing checklist; it does not apply it.

Local snapshots use a serialized write queue and atomic rename. Cloud snapshots copy attachments before their manifest; immutable profile versions and completed encounters also have explicit paths. These are application-level immutable versions with S3 versioning, not S3 Object Lock. Recovery is explicit into a new directory.

## AWS services

Supported Claude models use fixed strict JSON schemas for grounding claims and rubric outputs, with additional runtime checks for evidence, applicability and disclosure. Schemas are shared across cases to reuse the AWS compilation cache. First compilation may take minutes; warm them before rehearsal. [AWS structured-output documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html) describes supported models and schema restrictions. Nova uses prompted JSON and the same application validation.

Bedrock Converse uses configurable `us-west-2` or `us-east-1` access. Candidate model IDs are `us.anthropic.claude-sonnet-4-6` and `us.amazon.nova-2-lite-v1:0`. S3 stores source attachments, artifacts, versions and encounter recovery. Credentials are read only by the server and scripts through the AWS SDK credential provider chain.

Managed Knowledge Bases, Strands, AgentCore and fine-tuning are deferred. A larger reference corpus could justify retrieval; it must still distinguish teaching evidence from patient facts. Fine-tuning would require reviewed dialogue examples and a held-out validation set, not eight persona descriptions. AWS's contextual grounding check excludes conversational chatbot use cases, so this prototype retains its own validation and evaluations.

Official references: [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [S3 bucket creation and security defaults](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html), [grounding limitations](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-contextual-grounding-check.html), [model customization](https://docs.aws.amazon.com/en_en/bedrock/latest/userguide/custom-models.html).
