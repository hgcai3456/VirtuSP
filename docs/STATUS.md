# Root application status

Reviewed October 11, 2026. Scope: the root application started by `npm start`. The separate `VirtuSP-upstream/` checkout has its own implementation and documentation; its features and reports are not evidence for this runtime.

## Implemented and locally verified

Server-owned deterministic encounters; approved wording/deflections and unknown preservation; frozen versions; file recovery; conservative matching/CT boundaries; separate release/open/review; turn replay/conflict; Studio authoring; evidence-linked browser assessment; typed fallback; optional browser speech; basic probes; configured hosted Host checks; optional S3 copies; unmapped objectives left unassessed; retained handoff text; static revalidation; GitHub/CodeBuild/ECS scripts. The DynamoDB authority fence is now an inactive [DR review prototype](../infra/dr/README.md), outside the active runtime, following the user's independently writable regional choice.

Historical working-tree verification: `npm test` passed 37/37 tests across eight files on October 11, 2026, against a working-tree snapshot with HEAD `fec19bcff67d04f2ea0efff7bdf94f8a32f4aeb7` and concurrent uncommitted objective/handoff/regional-fence changes. [Testing](TESTING.md) records scenarios and exclusions. Mock S3 and UI-script tests do not establish live cloud backup or browser/audio quality.

## Verified hosted recovery

**Reconfirmed 1:14 PM EDT, October 11, 2026:** both [us-west-2](https://d18g7r2mfy8mll.cloudfront.net/app.html) and [us-east-1](https://d1uwsor6aitm.cloudfront.net/app.html) returned HTTP 200 for `/app.html`, `/api/live`, and `/api/ready`. Health and HTML reported source `0038b0cb89ee73bb7d2851bac9507f7d9db23485`, fingerprint `0038b0c-0ad0ea897b`, and approved-case-only response policy. The source matched GitHub main at that time.

[GitHub Actions for that source passed](https://github.com/hgcai3456/VirtuSP/actions/runs/38154030611). The preceding [run for `2a6e772` failed](https://github.com/hgcai3456/VirtuSP/actions/runs/38153212418): AWS authentication, CodeBuild PRE_BUILD, and BUILD succeeded; POST_BUILD failed in deployment verification. All three public paths returned 503 at 12:00 PM EDT. A newer release from the concurrent deployment work restored the service; this chat verified recovery without application-code or infrastructure changes.

Fresh synthetic Denise interviews during the preceding recovery verification succeeded in both regions: approved opening wording matched published case truth, and an unspecified smoking question stayed unknown. These tests created process-local attempts and made no publication/storage mutation. The 1:14 PM reconfirmation repeated health/HTML identity checks, not the interview or backup tests.

The observations establish recovery and selected API behavior at the recorded revision, not live backup, complete learner/faculty workflows, browser/audio quality, institutional security, or clinical validation. A later main push can deploy a new SHA; verify that release separately. [Deployment](DEPLOYMENT.md) records the failure/recovery and remaining constraints.

## Historical deployment observations

Earlier records reported hosted `118043b` with fingerprint `118043b-fbc7609ca0`, and a prior deployment of `c29ccd8` on ECS revision 9. Those checkpoints are superseded by the recovery above. They are not current service inventory. [Deployment preparation](DEPLOYMENT_PENDING.md) remains historical material.

## Remaining work

- Authentication, faculty/student authorization, and protected case/learner data.
- Durable encounters, bounded retention, shared replay/version coordination, and safe deployment overlap.
- Backup-only retry/recovery after an S3 failure following local publication.
- Independent hosted workflow, IAM, container, storage/restore, and monitoring verification per release.
- Real-browser regression coverage, accessibility, presentation-machine voice checks, and load testing.
- Faculty clinical/educational validation; no measured learning gains or competence claims.
- Node engine declaration aligned with locked dependencies; use Node 24 today.
- Ownership, license/asset provenance, and private vulnerability reporting.

## Evidence policy

Current source establishes behavior; dated runs establish execution; hosted verification establishes deployment claims. The nested checkout is distinct. [Preflight](PREFLIGHT_REPORT.md) preserves the earlier 26-test/manual-browser snapshot; [testing](TESTING.md) governs current test evidence.
