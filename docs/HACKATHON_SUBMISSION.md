# VirtuSP root demonstration

This documents the application started by `npm start` in the repository root. `VirtuSP-upstream/` is a separate nested checkout; its deployment, integrations, and historical test reports are not evidence for this root application.

Healthcare students need repeated, safe interviewing practice. This local synthetic simulator lets faculty review and publish exact patient wording, then run encounters and inspect objective evidence using a reusable engine.

The implemented distinction is faculty-owned patient truth: approved wording is selected deterministically; unspecified topics remain unknown; chart and patient sources stay distinct; intentional contradictions can be investigated. Published case versions are frozen per attempt. Students can repeat the same version or launch another case without a new code branch.

Demonstrate the sequence in [DEMO.md](DEMO.md). Evidence and remaining weaknesses for all five rubric categories are in [JUDGING_MATRIX.md](JUDGING_MATRIX.md). Actual runtime is in [ARCHITECTURE_CURRENT.md](ARCHITECTURE_CURRENT.md); tests and limitations are in [PREFLIGHT_REPORT.md](PREFLIGHT_REPORT.md) and [SECURITY.md](SECURITY.md).

Current provider mode is local reviewed wording; no live generative model, external TTS, animated avatar, AWS connectivity or LMS integration is claimed. Browser speech/recognition are optional. Report findings are synthetic text; image pixels are not bundled. Feedback uses recorded actions and keyword/rule heuristics for faculty review, not a clinically validated grade or competence measurement.

Institutional deployment is future work requiring authentication, authorization, durable attempts/shared replay, audit, retention, privacy review, monitoring and clinical/educational governance. A nested checkout and local infrastructure artifacts do not prove this build is deployed or production-ready.
