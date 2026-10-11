# Root AWS deployment runbook

Current regional decision (October 11, 2026): both regions serve independently with their original regional data stores. The primary/standby controller is deactivated and its application fence is outside the active runtime. See [the retained DR prototype and evidence](../infra/dr/README.md) before changing that architecture. Do not re-enable its EventBridge rule or Lambda during an ordinary deployment.

Reviewed October 11, 2026. Scope: the root application and checked-in automation. [Status](STATUS.md) records dated public observations; live AWS configuration was not audited during this documentation review. [Historical preparation](DEPLOYMENT_PENDING.md) is superseded.

## Trigger and build path

[GitHub workflow](../.github/workflows/deploy.yml) runs on pushes to `main` and manual dispatch on `main`. It uses OIDC to assume `virtusp-github-deploy` in `us-west-2`, starts CodeBuild project `virtusp-image` with the triggering SHA, retries account-capacity errors before starting a build, and polls for completion. The workflow logs the OIDC subject for diagnosis, not the token. GitHub deploy jobs are serialized with cancellation disabled. Review changes before pushing; a push to main is a deployment trigger.

The [configurator](../scripts/configure-aws-deployment.ps1) sets the CodeBuild GitHub source and single-build limit. It specifies a repository-ID-qualified OIDC subject (`repo:hgcai3456@14112169/VirtuSP@1413194225:ref:refs/heads/main`), plus audience `sts.amazonaws.com`. This is the checked-in value, not proof of the deployed trust policy or token subject. Verify both match before applying changes. The script mutates IAM/CodeBuild and saves prior configuration under a temporary backup directory; it must not be run as a documentation or read-only check.

[buildspec.yml](../buildspec.yml) runs in `us-west-2`, tests with Node 22 using `npm ci` and `npm test`, then builds the root Node 24 image once for linux/amd64 with the exact resolved `VIRTUSP_GIT_SHA`. It publishes that same image under the commit SHA to ECR repositories `virtusp` in `us-west-2` and `virtusp-east` in `us-east-1`. The post-build success gate prevents deployment after failed tests, build, or publication. It expects configured `AWS_ACCOUNT_ID`, `IMAGE_REPO=virtusp`, and regional runtime permissions. The image allowlist excludes nested checkout, local credentials, Terraform state, and generated artifacts.

## ECS release behavior

[deploy-ecs.sh](../scripts/deploy-ecs.sh) deploys first to eastern service/cluster `virtusp-east`, then western service/cluster `virtusp`. In each region it resolves the SHA-tagged ECR image to an immutable digest, captures the current task definition, updates the `virtusp` container image and `VIRTUSP_GIT_SHA`, registers a revision, updates the service, and waits for stability. It confirms that ECS retained the new task revision, then verifies the expected SHA through both public `/api/live` and `/api/ready` endpoints. The workflow succeeds only after both regions pass. Failure stops further deployment; ECS circuit-breaker rollback is detected and reported. The script does not roll back an already completed region if the later region fails.

The build role's deployment policy is scoped to the two named ECR repositories, ECS services, and their four task/execution roles. The configurator records these permissions so rerunning it retains dual-region deployment. GitHub continues to assume only the build-trigger role; no additional GitHub secrets are required. Mocked release tests cover both destinations, preservation of regional storage/roles, invalid digests, failed service waits, rollback, and wrong live identities.

The script preserves existing roles, environment, storage, health configuration, desired count, and deployment settings. **It does not enforce one task or prevent rolling-update overlap.** Verify task count/routing and overlap behavior before release. Process-local encounters can become unavailable when requests reach different tasks; concurrent publication writers can overwrite each other even on shared EFS. Single-process correctness does not establish seamless rolling deployment. Restrict publication/learner activity during a controlled release until shared coordination exists.

The Dockerfile runs as non-root and requires a writable configured data mount. Keep recovery data distinct from any older application storage; startup uses the local collection, not S3. Back up it and confirm schema compatibility before replacing a runtime.

## Pre-release checks

1. Confirm source SHA, tests, intended change set, and authorization to deploy. Protect secrets/generated artifacts and contributor changes.
2. Inspect actual service/task/IAM/CodeBuild/proxy/cache settings; record prior task ARN, current digest, desired/running tasks, deployment settings, and storage location privately.
3. Back up publication data and establish restore/rollback ownership. Warn active learners that attempts will be lost.
4. Verify exact Host/origin forwarding, TLS, cache policy, data writability, synthetic S3 prefix/permissions, and resource controls. Do not infer auth from a hosted endpoint.
5. Confirm IAM/SDK regions and the workflow token/trust subject; do not blindly reapply all infrastructure or nested Terraform.

## Post-release acceptance

Check CodeBuild logs (`/aws/codebuild/virtusp-image`) and GitHub Actions. Record image digest, new/previous task ARN, source SHA, and verification time. Confirm HTML and probes agree with expected identity. Health is only a basic process check.

On an authorized synthetic case, verify publish (including S3 when enabled), fresh visit, exact wording, unknowns, chart release/review, plan/handoff, and feedback event links. Inspect JSON HTTP statuses; HTML in a JSON consumer indicates routing/build trouble. Verify publication recovery after a controlled restart; existing attempts are expected to disappear. Rehearse rendering, keyboard use, and optional audio separately.

API responses are `no-store`; static responses require revalidation. Earlier deployment records report disabled CloudFront caching, but the live distribution policy was not inspected here. Check actual cache/proxy settings before relying on them.

## Failures and rollback

Tests/build failure should prevent the scripted deployment path. GitHub timeout or build failure does not prove the cloud build stopped; inspect CodeBuild/ECS before retriggering. Deployment-script SHA failure can occur after service mutation, so inspect the actual selected/running task revisions.

The log line `rollback task:` records the previous task definition. With authorized operator credentials, restore that exact ARN, then wait and verify:

```sh
aws ecs update-service --region us-west-2 --cluster virtusp --service virtusp --task-definition <recorded-previous-task-arn>
aws ecs wait services-stable --region us-west-2 --cluster virtusp --services virtusp
```

Replace the placeholder with the captured ARN. Recheck task selection, public source identity, static UI/API alignment, and a fresh synthetic visit. Rolling back code does not roll back publications or restore attempts; restore data only through a reviewed backup/compatibility procedure. Preserve failed-release evidence privately. There is no fully automatic application/data rollback or validated zero-downtime guarantee.

## Verified 503 recovery — October 11, 2026

The [failed Actions run for `2a6e772`](https://github.com/hgcai3456/VirtuSP/actions/runs/38153212418) authenticated to AWS successfully. CodeBuild `virtusp-image:7541cf59-817b-44d2-9d31-173ddd41c142` completed PRE_BUILD and BUILD, then failed in POST_BUILD while running `scripts/deploy-ecs.sh`. Public liveness, readiness, and simulator requests returned HTTP 503 at 12:00 PM EDT. These facts localize the failure to the deployment/verification stage; they do not establish a single exclusive root cause for every 503.

The concurrently running deployment work subsequently restored the service with source `0038b0cb89ee73bb7d2851bac9507f7d9db23485`. Its [Actions run completed successfully](https://github.com/hgcai3456/VirtuSP/actions/runs/38154030611). This chat did not change application code or cloud configuration to perform that recovery.

Reconfirmed at **1:14 PM EDT, October 11, 2026**:

- [West simulator](https://d18g7r2mfy8mll.cloudfront.net/app.html) and [east simulator](https://d1uwsor6aitm.cloudfront.net/app.html) returned HTTP 200.
- Both `/api/live` and `/api/ready` returned HTTP 200 with the complete source SHA above, fingerprint `0038b0c-0ad0ea897b`, and `responsePolicy: approved-case-only`.
- HTML build identity matched each region's health identity and GitHub main at the verification time.
- During the preceding recovery check, fresh synthetic Denise attempts in both regions returned exact approved opening wording and preserved an unspecified smoking topic as unknown. Those API checks created only process-local attempts; no case was published by this chat.

These are dated verification results. This documentation push will trigger another main deployment, so later releases must be checked against their own SHA. Do not treat the recorded `0038b0c` identity as the permanent latest release.

## Verification boundary and regional constraints

The earlier 37-test working-tree snapshot remains historical evidence in [testing](TESTING.md); it included proposed fencing outside the subsequently selected active runtime. The recovery work's release evidence and this chat's endpoint/interview checks are separate from that snapshot. This documentation update does not rerun a container build, publish a case, test backup/restore, conduct a load test, or certify production/clinical readiness.

Both regions remain independently writable with separate data stores. The retained authority-fence/controller prototype is inactive and outside the current root application. Its `VIRTUSP_DR_TABLE`/control-region settings are not active runtime setup guidance. Do not re-enable it during a normal deployment; any future primary/standby design needs a new coordinated decision and verification. See [DR review notes](../infra/dr/README.md) and [status](STATUS.md).
