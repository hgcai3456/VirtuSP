# Security boundaries and reporting

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

## Data and trust model

Use synthetic cases and learner inputs only. Real patient information is outside the approved demo boundary. Browser recognition may send audio to the browser vendor; typed input avoids that dependency.

There is no authenticated identity, faculty/student authorization, case secrecy, rate limiting, tamper-resistant audit, or validated grading. Role labels are teaching metadata. Anyone with API access can read complete cases, publish, and operate known encounter IDs. The browser calculates editable assessment. Disclosure gates/event links do not prevent cheating or demonstrate competence.

## Implemented controls and limits

[server.js](../server.js) defaults to loopback, bounds API bodies to 256,000 bytes, handles malformed URLs/JSON, restricts static traversal, and serves API JSON with `no-store`. Static assets use `no-cache`. Host checks accept localhost/127.0.0.1 or configured exact Host values, including ports. Supplied Origin must match HTTP/HTTPS plus request Host; missing Origin is accepted. These controls do not authenticate a caller or replace TLS/proxy controls.

`/api/live` and `/api/ready` bypass those Host/origin checks and expose source/build identity. Neither checks writable storage, S3 availability, or institutional readiness. Readiness checks configured DynamoDB regional authority; liveness does not. [HTTP tests](../tests/integration.test.js) cover supplied-origin rejection, configured-host acceptance, traversal, malformed URL, and basic probes; this is not a penetration test.

Publication checks structure/references, not medical correctness. Turn replay deduplicates canonical questions in one process; general actions/publication lack that guarantee. In-memory attempts lack a durable retention or explicit garbage-collection policy; resource controls are necessary before broader exposure.

## Storage and credentials

The application does not encrypt recovery files or browser localStorage. Restrict access and establish retention/deletion and backup ownership before institutional data. Startup never restores from S3. Backup failure can occur after local publication; follow [operations](OPERATIONS.md).

Optional S3 uses the SDK credential/region chain and requests AES256 encryption on scoped publication objects. Narrow the runtime role's write permissions; verify actual bucket/role policies independently. Never embed credentials in source, cases, browser assets, logs, screenshots, or documentation. `.env` is not loaded automatically.

The [deployment workflow](../.github/workflows/deploy.yml) uses OIDC. The configuration script specifies a repository-ID-qualified subject, not the simple subject described in the earlier runbook. Inspect the exact checked-in and live trust policies before changes. Policy intent does not establish deployed IAM. The configurator changes AWS resources and requires an authorized operational action; do not run it for a documentation check.

## Before broader exposure

Implement and verify identity/permissions, protected learner/case APIs, TLS/proxy allowlists, rate/time/resource limits, shared durable state, reliable backup/restore, secrets management, alerts, incident handling, and audit integrity. Define ownership, consent, access review, retention/deletion, accessibility, and clinical/educational governance. No HIPAA, clinical-validation, or high-stakes assessment claim is supported.

## Repository hygiene and historical audit

Ignore rules do not remove previously tracked/staged files. Inspect intended release contents. [Preflight history](PREFLIGHT_REPORT.md) records exclusion of 14 certificate/generated artifacts with local files preserved. Its bounded text scan excluded encrypted/binary bundles, ignored environment contents, some data, and history. It was not comprehensive and was not repeated in this review.

For exposed credentials, revoke/rotate through the owner and investigate privately. Removing the latest file alone does not resolve historical exposure. Do not print values in diagnostic output.

## Reporting and incident response

No designated private reporting channel or security owner is documented. Coordinate privately with the project owner until one is established. Supply affected revision, synthetic reproduction, impact, and redacted evidence; never place secrets or patient information in public issues. Restrict access during an incident, preserve necessary evidence, involve the owner, and restore a verified release/data backup where appropriate. Rehearse a formal incident process before institutional deployment.

## Regional access fence

The optional DynamoDB control record can deny non-liveness APIs/readiness when this region lacks current authority. It is disabled without `VIRTUSP_DR_TABLE` and does not authenticate users, isolate multiple same-region tasks, or persist encounters. A three-second authority read can fail closed with 503; role permissions and the control-record renewal/ownership require independent operational verification. See [architecture](ARCHITECTURE_CURRENT.md) for exact lease checks.
