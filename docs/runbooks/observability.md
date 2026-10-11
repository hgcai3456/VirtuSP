# Observability runbook

These alarms exist in Terraform only when `observability_alarms_enabled` is true. Until that apply is done and a notification is confirmed, an alarm in this document is configured in code, not a tested alarm. No email was sent.

Safe contents for a page: alarm name, time, environment, operation, outcome, trace id, request id. Do not paste questions, replies, or prompts.

## api-errors

Alarms `virtusp-api-burn-fast`, `virtusp-api-burn-slow`, and composite `virtusp-api-burn`. The page fires only when both windows show an eligible error rate above 7.2% and at least 20 eligible calls. Missing data does not page.

Check `/api/ready`, the load balancer target 5xx graph, and the service dashboard. Then Logs Insights query `virtusp/encounter-turn` for `outcome = error`. A 4xx validation failure is not in `ApiEligible`.

## latency

Alarm `virtusp-turn-latency` when p95 approved-response time stays above 5 seconds for three periods. Compare `ProviderLatency` on the AI dashboard. A local catalog reply should be far under that line; a live Bedrock selection is the usual cause. The patient line is still built on the server after the model returns.

## persistence

Alarm `virtusp-persistence` on any `PersistenceFailure`. The caller receives an error. Check the EFS percent IO limit and the task logs for `event_name = persistence`. Do not mark the turn successful. Restore from the last good `state.json` only with a copy, not by deleting the volume.

## unauthorized-delivery

Alarm `virtusp-unauthorized-delivery` when `confirmed_unsupported_delivered` is above zero. Blocked replies do not use this counter. Open the faculty encounter, not the operational timeline, for the clinical text. Keep the encounter id and trace id in the incident note.

## audit

Alarm `virtusp-audit` when a required audit record cannot be stored. Treat the operation as failed. Confirm the local snapshot write before retrying.

## provider

Alarms `virtusp-fallback` and `virtusp-provider-throttle`. Fallback to approved wording is a successful safe reply and a dependency problem. Throttling uses the Bedrock attempt counter. Confirm the model alias on the task before changing quotas. Do not turn on Bedrock invocation payload logging for this.

## telemetry

Alarm `virtusp-telemetry-heartbeat` treats missing data as a breach after the alarm is enabled. Alarm `virtusp-telemetry-export` pages when drops are sustained. Heartbeat silence means the process or the log pipeline stopped. It is not a healthy zero. The canary, once started, is the check that does not run inside the application process.

## synthetic

Alarm `virtusp-synthetic-ready` watches `SuccessPercent` for the canary. The canary requests `GET /api/ready` and does not store response bodies. A failure with a healthy heartbeat means the public edge or the database check failed outside the process logs.

## budget

The optional budget notification is not a cap. If it is configured, compare Cost Explorer with the estimated model metric. Missing estimated cost means usage or the price row was absent.
