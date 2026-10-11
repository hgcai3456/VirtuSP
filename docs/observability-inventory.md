# Observability inventory

Verified from the repository on 2026-10-10. This is the baseline the instrumentation was added to. It is not a claim that the public site was re-tested during this change.

## Stack and deployment

- Node.js 22 CommonJS application. `server.js` loads `lib/http.js`, which owns HTTP, sessions, Patient Studio, and encounter routes. `lib/engine.js` owns encounter state. `lib/cloud.js` calls Bedrock and S3. `lib/assessment.js` builds feedback.
- Local recovery is a JSON document written by `lib/store.js` with an atomic rename. Encounters, drafts, and releases live there. PostgreSQL is used by the separate ground-truth library routes. Profile archive can copy profiles to S3 and RDS when `PROFILE_ARCHIVE=true`.
- The container is `Dockerfile` (`node:22-bookworm-slim`). ECS Fargate runs it in us-west-2. Terraform in `infra/aws` is the only infrastructure framework. The task definition in this tree is the source for the service; the handoff records task definition `virtusp:7` and CloudFront `https://d18g7r2mfy8mll.cloudfront.net`.
- There is no Kubernetes cluster and no second application server. Sessions are in memory on one task. The load balancer uses a stickiness cookie.
- Existing CloudWatch coverage before this work: the application log group `/ecs/virtusp`, an infrastructure dashboard, and CPU and memory alarms in `infra/aws/monitoring.tf`. Container Insights defaults off.

## Instrumentation already present

- Encounter events in `enc.events` record start, student text, disclosure, release, review, and completion. Those events are the durable teaching record. `publicView` returns them to the encounter owner. They are not CloudWatch metrics.
- Patient turns store `provider`, `model`, `latencyMs`, `failure`, and `responseMode` on the encounter.
- `/api/live`, `/api/ready`, and `/api/health` already separate process liveness from database readiness.
- Request idempotency uses the client `requestId` on a turn.
- Logs before this work were unstructured `console.log` / `console.error` lines, including an appointment duration line that prints the encounter id.

## Request and encounter path

1. `POST /api/session` chooses the faculty or student demo role. This is the existing demo boundary, not an external identity provider.
2. Faculty create and publish profiles through `/api/profiles`. Publication runs `profiles.validate` and stores an immutable release.
3. `POST /api/encounters` clones a published release. An unpublished id is rejected.
4. `POST /api/encounters/:id/turn` calls `engine.ask`. The server selects facts, applies trust gates, constructs the reply from approved wording, and checks `validResponse`. Bedrock, when `AI_ENABLED=true`, classifies topics. It does not stream the patient line. A rejected construction is replaced with approved unknown wording.
5. Chart release happens inside that turn or `open`. Artifact bytes are served only after release.
6. `POST .../complete` marks the encounter complete and calls `assess`. With Bedrock off, rubric domains stay `not_assessed` and scores stay null.
7. `store.save` writes the local snapshot. A failure is thrown to the caller. S3 mirror failure is recorded on `store.sync` and does not roll back the local write.

The current turn path does not call `cloud.verify` and does not stream model tokens. Time to first provider token is therefore unknown on this path. Time to the approved reply is the turn duration.

## Dependencies and configuration

- Bedrock Converse and optional Guardrails via the AWS SDK credential chain. `BEDROCK_MODEL_ID` defaults in code to Claude Sonnet and on the deployed task to `us.xai.grok-4.7`. Invocation payload logging was not enabled from this repository.
- S3 for recovery and the profile archive. Object keys are not telemetry dimensions.
- EFS for the shared SQLite and JSON store. RDS for the ground-truth library and the archive.
- ElevenLabs and LiveAvatar are optional and off unless configured. The avatar path is not a second clinical engine.
- No OpenTelemetry SDK was installed before this work.

## Gaps before this change

- No structured log schema, trace ids, or correlation between a browser failure and a server request.
- No custom CloudWatch metrics for turns, disclosure, feedback, or provider attempts.
- No separation between operational telemetry and the encounter record beyond "logs are unstructured and the store is the record."
- No faculty operator view, no burn-rate alarms, and no synthetic check of `/api/ready` outside the load balancer.
- Provider usage and cost were not recorded. A health response that says Bedrock is configured is not evidence of a successful live call.
- High-cardinality risk if encounter ids or question text were later used as metric dimensions.

## Baseline tests

`node --test --test-timeout=120000 --test-reporter=spec tests/*.test.js` completed before these application edits were wired through the engine. Result: 125 tests, 124 passed, 1 failed.

The failure was `tests/frontend.test.js`: "Studio edits, publication, interview, progressive chart and feedback work through the DOM" with `DOM action did not settle`. The handoff already records that this frontend check does not reach the incoming-call control after publication. It is a pre-existing failure, not caused by the observability modules (those modules were not imported by the application yet).

## Implementation order used

The code that follows this inventory adds one in-process telemetry path, encounter and provider instrumentation, Terraform for CloudWatch, a faculty page, and local tests. Paid resources such as the CloudWatch agent sidecar, Synthetics, and alarm notifications stay off until an apply is approved.
