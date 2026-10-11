# Historical hosting preparation — superseded

This preserves preparation context for baseline `00a5815b50dd74e1fb940083f63947bce62037dc` on October 11, 2026. It is **not current status or an executable runbook**. Use [deployment](DEPLOYMENT.md) and [status](STATUS.md).

## Earlier checkpoint

The older hosted application had reported S3 PutObject AccessDenied, generic patient fallback, and HTML returned to a feedback JSON consumer. Local AWS authentication was then unavailable; container/hosting verification was pending and local tests were recorded as 28/28. These describe that checkpoint, not current failures or counts.

Later handoff records report a root deployment of `c29ccd8` on ECS revision 9. This review's public probe returned `118043b`; [status](STATUS.md) records the full SHA/build. Earlier hosted error scenarios were not repeated and no hosted case was published during this review.

## Still-relevant constraints

- Deploy root Node/API plus UI; static-only hosting cannot serve its routes.
- Preserve existing EFS/recovery data; do not overwrite authored truth with seeds.
- Attempts/replay are process-local; multiple tasks require shared state and coordinated publication. A volume alone is insufficient.
- S3 backup exists but can fail after local publication; no backup-only retry route exists.
- Record immutable source/digest, previous task, storage backup, workflow verification, and rollback result.
- Inspect intended release contents; preserve contributor changes and avoid unrelated nested Terraform.

Blanket statements that no cloud deployment had occurred are superseded historical statements. Verify current operational claims per release.
