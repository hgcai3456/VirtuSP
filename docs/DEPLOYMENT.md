# AWS deployment

Pushes to GitHub `main` run `.github/workflows/deploy.yml`. GitHub authenticates with OIDC as `virtusp-github-deploy`; its trust permits only `repo:hgcai3456/VirtuSP:ref:refs/heads/main`. No long-lived AWS keys are stored in GitHub.

The workflow starts `virtusp-image` in `us-west-2` with the pushed commit SHA. CodeBuild downloads `https://github.com/hgcai3456/VirtuSP.git` directly, runs `npm ci` and `npm test`, builds the root Dockerfile with `VIRTUSP_GIT_SHA`, and pushes a commit-tagged image. It no longer consumes the manually uploaded S3 source ZIP.

`scripts/deploy-ecs.sh` resolves the image digest, copies the current ECS task configuration, changes only the `virtusp` container image, registers a revision and updates the `virtusp` service in cluster `virtusp`. It waits for stability and verifies the live commit at `https://d18g7r2mfy8mll.cloudfront.net/api/live`. A failed test/build prevents deployment; an ECS rollback or incorrect live SHA fails the build. GitHub deployments are serialized.

The runtime remains one task with its existing EFS storage, roles, environment and health checks. Active encounters are in memory; a deployment requires fresh visits. CloudFront caching is disabled, and static responses require browser revalidation.

Watch deployment logs in GitHub Actions and CodeBuild `/aws/codebuild/virtusp-image`. The build log records the previous task ARN for rollback. To roll back, update the ECS service to that recorded ARN and wait for service stability. Do not use the nested `VirtuSP-upstream` deployment scripts for this application.

The earlier `DEPLOYMENT_PENDING.md` is historical preparation material. Its authentication and undeployed-build statements were superseded by the verified deployment on October 11, 2026.
