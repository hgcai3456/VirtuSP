# Local operations and recovery

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

## Start, identify, stop

Use [setup](SETUP.md), `npm start`, and `/app.html`; stop with Ctrl+C. Verify the header revision/fingerprint. `/api/live` reports identity, but neither probe checks disk/S3. Configured readiness additionally checks DynamoDB authority. Keep one process. Restart/deploy loses attempts, events, transcript, and replay ledgers; start fresh visits. Refresh returns to Studio; browser drafts do not recover authoritative attempts.

## Publication storage and backup

The collection is `published-cases.json` under `VIRTUSP_DATA_DIR`, default root `data/recovery`. With S3 configured, the adapter can additionally write `<case-id>-<version>.json` in the explicitly configured directory and upload a version object. Individual files do not replace the collection.

Stop publication writes before copying the collection. Preserve a known-good copy outside the active path with date/source context, restricted access, and Git exclusion. Define retention/ownership; no scheduler or backup verification service is included.

To restore:

1. Stop the server; preserve the current file for diagnosis.
2. Place a known-good full collection at the configured `published-cases.json` path with correct ownership/permissions.
3. Restart; parsing/schema checks must succeed.
4. Inspect `/api/cases` and Studio for expected versions; start a fresh synthetic visit and verify wording.
5. Record restoration results. In-memory attempts cannot be recovered.

Invalid recovery data deliberately stops startup. Do not delete/rewrite it to hide errors. Atomic rename does not guarantee power-loss durability or concurrent-writer safety. Startup never reads S3 automatically.

## Publication errors

Local recovery-write failure returns 503 before adding the version to memory. Inspect permissions/free space and published state before retrying after an ambiguous response or crash.

Optional backup failure returns 503 **after local publication**, including `profile`. Read `/api/cases`, retain the ID/version, and avoid blind republishing, which creates another version. Repair AWS identity/region/bucket access and per-version local write permissions, then arrange a reviewed backup of that exact version. There is no backup-only retry API. Never modify published truth to recover a backup.

Dropped responses can also leave publication uncertain. Inspect versions before retrying. Turn replay protections do not apply to publication/general actions.

## Attempt/display issues

After restart, start fresh. For missed valid phrasing, inspect published keywords/wording/gates, edit the draft, validate/publish, and start another attempt. Do not alter a frozen attempt. Imaging needs an authored unlock question; opening alone is insufficient. Use typed input when speech fails.

## Hosted incidents

[Deployment](DEPLOYMENT.md) describes rollback/identity checks. Rolling back code does not restore attempts or publication data. Preserve backups and validate data compatibility before running an older release. Do not mutate infrastructure during read-only diagnosis. Capture redacted errors/revisions and involve the owner; [security](SECURITY.md) covers private reporting.

## Regional authority errors

When enabled, wrong/missing/expired records or failed reads deny readiness/non-liveness APIs with 503. Inspect ownership, region, renewal, SDK credentials/permissions, and connectivity with the authorized operator. Do not bypass fencing to force writes during uncertainty. A successful read does not recover attempts or coordinate writers. No authority-renewal/failover controller is implemented in `lib/region-fence.js` itself.
