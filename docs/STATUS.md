# Root application status

Reviewed October 11, 2026. Scope: the root application started by `npm start`. The separate `VirtuSP-upstream/` checkout has its own implementation and documentation; its features and reports are not evidence for this runtime.

## Implemented and locally verified

Server-owned deterministic encounters; approved wording/deflections and unknown preservation; frozen versions; file recovery; conservative matching/CT boundaries; separate release/open/review; turn replay/conflict; Studio authoring; evidence-linked browser assessment; typed fallback; optional browser speech; basic probes; configured hosted Host checks; optional S3 copies; optional DynamoDB authority fence; unmapped objectives left unassessed; retained handoff text; static revalidation; GitHub/CodeBuild/ECS scripts.

`npm test` passed 37/37 tests across eight files on October 11, 2026, against a working-tree snapshot with HEAD `fec19bcff67d04f2ea0efff7bdf94f8a32f4aeb7` and concurrent uncommitted objective/handoff/regional-fence changes. [Testing](TESTING.md) records scenarios and exclusions. Mock S3 and UI-script tests do not establish live cloud backup or browser/audio quality.

## Hosted observation and deployment records

A read-only request to the [public health endpoint](https://d18g7r2mfy8mll.cloudfront.net/api/live) during this review returned `status: ok`, `responsePolicy: approved-case-only`, SHA `118043b1f6c958e36a4f4e454bb84951ae6faf6d`, and build ID `118043b-fbc7609ca0`. This dated observation is not a guarantee of the current release. It differs from the local source baseline above.

Earlier handoff records report an October 11 root deployment of `c29ccd8` on ECS revision 9. That record supersedes original pending-hosting statements but is not a fresh ECS inventory. This review did not inspect live IAM, task count, EFS, CloudFront configuration, CodeBuild settings, or S3 writes. No cloud mutation, hosted publication, or hosted learner visit was performed.

[Deployment](DEPLOYMENT.md) documents automation and verification. [Deployment preparation](DEPLOYMENT_PENDING.md) is historical. Passing health proves neither the full user workflow nor production readiness.

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
