# Faculty case authoring and review

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

## Workflow

Studio edits a browser-local draft. Review wording, chart labels, sources, keywords, artifacts, discrepancies, and objectives. **Check**, address errors/review warnings, **Publish**, then wait for the returned version before **Start visit**. Test supported, unknown, and ambiguous questions before learner use.

The server assigns a version and each attempt snapshots its selected published version. Later edits/publications do not alter existing attempts. Structural validation does not establish medical accuracy, educational quality, or reviewer qualifications. There is no faculty authentication/authorization.

## Structure and validation

[Case definitions](../lib/cases.js) supply current examples; [server validation](../lib/encounter.js) specifies checks. Profiles need IDs using letters/digits/underscore/hyphen (1–80), nonempty names (at most 120), facts (at most 200), and objectives (at most 100).

Facts have unique IDs, labels, sources, keyword arrays, and `ask`/`chart` visibility. Ask facts need approved `say`; optional `deflect` supplies gated wording. Chart facts need sections; lab facts need units/reference ranges. Artifacts reference facts and unlock triggers. Section codes: `ov`, `hx`, `meds`, `labs`, `img`, `notes`, `soc`.

Objective types: `manual` (unassessed until faculty maps evidence), `fact`, `review`, `mm` (discrepancy), `emp` (empathy/open questions), `ho` (handoff coverage), with positive weights. Fact objectives reference facts; review objectives reference sections. Custom or unavailable objectives can remain `manual`; they must not receive guessed credit. Studio maps recognized objective text to its required evidence, independent of list order. A total other than 100 produces a warning; assessment uses assessed objective weight. Discrepancy references must identify authored facts. Source governs optional fields; this is not a versioned public schema contract.

## Faculty review

- Confirm synthetic facts, wording, units/ranges, sources, and objectives.
- Missing data is unknown, not a negative finding.
- Keep patient/chart sources distinct; author intentional discrepancies and follow-up keywords deliberately.
- Test ordinary wording, near matches, negations, and compound questions. Approved wording can still be selected incorrectly by a poor trigger.
- Confirm gates/deflections and release; Imaging is question-only and Labs can release on opening unless authored otherwise.
- Inspect release/open/review and feedback evidence; keyword credit/review does not establish understanding.
- Test new cases through the engine and inspect seed-specific feedback assumptions. No automatic age-based specialty rubric exists.
- Treat empathy, SBAR, and reconciliation credit as faculty prompts, not validated grades.

## Persistence and failures

Drafts use localStorage and can be lost by clearing site storage. Published versions persist on the server; attempts disappear on restart. With S3, a backup error may follow successful local publication. Inspect the returned profile/list before retrying; [operations](OPERATIONS.md).

No authenticated reviewer approval, formal clinical review record, or institutional assessment validation is established. Governance owners must define those processes before broader use.
