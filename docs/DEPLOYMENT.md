# Root AWS deployment runbook

Reviewed October 11, 2026. Scope: the root application and checked-in automation. [Status](STATUS.md) records dated public observations; live AWS configuration was not audited during this documentation review. [Historical preparation](DEPLOYMENT_PENDING.md) is superseded.

## Trigger and build path

[GitHub workflow](../.github/workflows/deploy.yml) runs on pushes to `main` and manual dispatch on `main`. It uses OIDC to assume `virtusp-github-deploy` in `us-west-2`, starts CodeBuild project `virtusp-image` with the triggering SHA, retries account-capacity errors before starting a build, and polls for completion. The workflow logs the OIDC subject for diagnosis, not the token. GitHub deploy jobs are serialized with cancellation disabled. Review changes before pushing; a push to main is a deployment trigger.

The [configurator](../scripts/configure-aws-deployment.ps1) sets the CodeBuild GitHub source and single-build limit. It specifies a repository-ID-qualified OIDC subject (`repo:hgcai3456@14112169/VirtuSP@1413194225:ref:refs/heads/main`), plus audience `sts.amazonaws.com`. This is the checked-in value, not proof of the deployed trust policy or token subject. Verify both match before applying changes. The script mutates IAM/CodeBuild and saves prior configuration under a temporary backup directory; it must not be run as a documentation or read-only check.

[buildspec.yml](../buildspec.yml) tests with Node 22, runs `npm ci` and `npm test`, uses the resolved source SHA, builds the root Node 24 image for linux/amd64 with `VIRTUSP_GIT_SHA`, and pushes a SHA-tagged image to ECR. The post-build checks build success before invoking the deployment script. It expects configured `AWS_ACCOUNT_ID`, `IMAGE_REPO`, and AWS region/runtime permissions. The image allowlist excludes nested checkout, local credentials, Terraform state, and generated artifacts.

## ECS release behavior

[deploy-ecs.sh](../scripts/deploy-ecs.sh) resolves the ECR digest, captures the current service task definition, changes only the `virtusp` container image, registers a revision, updates service/cluster `virtusp`, waits for stability, and checks that the selected task revision remains active. It then polls the public `/api/live` for the expected source SHA. A mismatch fails the build; the script does not perform its own rollback on every failure.

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

## Verification boundary

This review inspected scripts and read the public health endpoint; it did not run a build, configure IAM, deploy, roll back, or verify live backup/full workflow. Local tests passed 37/37; [testing](TESTING.md). The observed hosted SHA differs from the local baseline; [status](STATUS.md). Public hosting remains a synthetic prototype and does not establish institutional security or clinical validation.

## Optional authority configuration

Concurrent working-tree code adds `VIRTUSP_DR_TABLE`, `AWS_REGION`, and `VIRTUSP_DR_CONTROL_REGION`. Establish control-record ownership/renewal, narrow GetItem permissions, and failure procedures before enabling fencing. This is not durable encounter storage or validated disaster recovery. Confirm the deployed revision includes the feature before expecting its behavior.
