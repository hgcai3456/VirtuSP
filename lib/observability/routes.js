"use strict";

const obs = require("./index");
const aws = require("./aws-read");
const demo = require("../demo");

const cache = new Map();
let inFlight = 0;
const MAX_IN_FLIGHT = 2;
const clientEvents = [];

function rangeMs(value) {
  return aws.RANGES[value] || aws.RANGES["1h"];
}

function objectiveStatus(sampleCount, ratio, target) {
  if (!sampleCount) return { value: null, status: "insufficient_data" };
  return {
    value: ratio,
    status: ratio >= target ? "met" : "missed",
  };
}

function summaryFromLocal(range) {
  const windowMs = rangeMs(range);
  const data = obs.localSummary(windowMs);
  const success = data.count("ApiEligible", "success");
  const failure = data.count("ApiEligible", "failure");
  const apiSamples = success + failure;
  const turnValues = data.values("ApprovedResponseLatency");
  const turnWithin = turnValues.filter((value) => value <= 5000).length;
  const feedbackValues = data.values("FeedbackLatency");
  const feedbackWithin = feedbackValues.filter((value) => value <= 30000).length;
  const newestAge = data.newest ? Date.now() - data.newest : null;
  let label = "Local synthetic test telemetry";
  if (obs.environment() === "production") label = "Not configured";
  if (!data.sampleCount && !data.values("TelemetryHeartbeat").length) label = "No data";
  else if (newestAge != null && newestAge > 5 * 60 * 1000) label = "Stale data";
  const objectives = obs.catalog.OBJECTIVES.map((item) => {
    if (item.id === "api-success") {
      const status = objectiveStatus(
        apiSamples,
        apiSamples ? success / apiSamples : null,
        item.target,
      );
      return { ...item, sampleCount: apiSamples, ...status, observationMs: windowMs };
    }
    if (item.id === "turn-latency") {
      const status = objectiveStatus(
        turnValues.length,
        turnValues.length ? turnWithin / turnValues.length : null,
        item.target,
      );
      return {
        ...item,
        sampleCount: turnValues.length,
        ...status,
        observationMs: windowMs,
      };
    }
    const status = objectiveStatus(
      feedbackValues.length,
      feedbackValues.length ? feedbackWithin / feedbackValues.length : null,
      item.target,
    );
    return {
      ...item,
      sampleCount: feedbackValues.length,
      ...status,
      observationMs: windowMs,
    };
  });
  return {
    label,
    source: obs.environment() === "production" ? "not_configured" : "local",
    generatedAt: new Date().toISOString(),
    environment: obs.environment(),
    buildVersion: process.env.VIRTUSP_BUILD_VERSION || "1.0.0",
    sampleCount: data.sampleCount,
    telemetryFreshnessMs: newestAge,
    counts: {
      apiSuccess: success,
      apiFailure: failure,
      turns: data.count("TurnEligible", "success"),
      persistenceFailures: data.count("PersistenceFailure", "persistence_failed"),
      confirmedUnsupported: data.count(
        "ValidationOutcome",
        "confirmed_unsupported_delivered",
      ),
      blocked: data.count("ValidationOutcome", "blocked_before_delivery"),
      validatorUnavailable: data.count("ValidationOutcome", "validator_unavailable"),
      fallbacks: data.count("FallbackUsed", "fallback"),
      dropped: obs.snapshot().dropped,
    },
    latency: {
      approvedResponseP95: obs.percentile(turnValues, 95),
      feedbackP95: obs.percentile(feedbackValues, 95),
    },
    objectives,
    alarms: [],
  };
}

async function summary(range) {
  const key = `summary:${range}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 15000) return cached.value;
  if (!aws.configured()) {
    const value = summaryFromLocal(range);
    cache.set(key, { at: Date.now(), value });
    return value;
  }
  if (inFlight >= MAX_IN_FLIGHT) {
    return cached?.value || { ...summaryFromLocal(range), label: "Not configured" };
  }
  inFlight += 1;
  try {
    const live = await aws.metricData(rangeMs(range));
    if (!live.configured) return summaryFromLocal(range);
    const byId = Object.fromEntries(
      (live.results || []).map((item) => [item.Id, aws.sumOrNull(item)]),
    );
    const success = byId.api_success;
    const failure = byId.api_failure;
    const complete = success != null && failure != null;
    const samples = complete ? success + failure : 0;
    const value = {
      label: samples || byId.heartbeat != null ? "Live AWS telemetry" : "No data",
      source: "aws",
      generatedAt: new Date().toISOString(),
      environment: obs.environment(),
      buildVersion: process.env.VIRTUSP_BUILD_VERSION || "1.0.0",
      sampleCount: samples,
      observedFrom: live.start,
      observedTo: live.end,
      counts: {
        apiSuccess: success,
        apiFailure: failure,
        turns: byId.turns,
        persistenceFailures: byId.persistence,
        blocked: byId.blocked,
        confirmedUnsupported: byId.unauthorized,
        dropped: byId.dropped,
      },
      objectives: [
        {
          id: "api-success",
          target: 0.995,
          sampleCount: samples,
          observationMs: rangeMs(range),
          ...(complete && samples
            ? {
                value: success / samples,
                status: success / samples >= 0.995 ? "met" : "missed",
              }
            : { value: null, status: "insufficient_data" }),
        },
      ],
      alarms: [],
    };
    if (!samples && byId.heartbeat == null) value.label = "No data";
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return {
      label: "No data",
      source: "aws_error",
      generatedAt: new Date().toISOString(),
      sampleCount: 0,
      counts: {},
      objectives: [],
      alarms: [],
      errorCode: "query_failed",
    };
  } finally {
    inFlight -= 1;
  }
}

function timeline(store, session, encounterId) {
  if (!/^[0-9a-f-]{36}$/i.test(encounterId || "")) return null;
  const enc = store.state.encounters[encounterId];
  if (!enc || !demo.canSee(session, enc)) return null;
  const events = (enc.auditTrail || []).map((item) => ({
    at: item.at,
    operation: item.operation,
    outcome: item.outcome,
    reason: item.reason,
    profile_version: item.profile_version,
    policy_version: item.policy_version,
    fact_ref_count: item.fact_ref_count,
    trace_id: item.trace_id,
    request_id: item.request_id,
    sequence: item.sequence,
  }));
  return {
    label: events.length ? "Local synthetic test telemetry" : "No data",
    encounterCorrelationId: enc.id,
    profileVersion: enc.p?.version ?? null,
    status: enc.status,
    events,
    links: investigationLinks(events[0]?.trace_id, events[0]?.request_id),
  };
}

function lookup(requestId) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId || "")) return null;
  const logs = obs.snapshot().logs.filter((item) => item.request_id === requestId);
  if (!logs.length) return null;
  return {
    label: "Local synthetic test telemetry",
    requestId,
    events: logs.map((item) => ({
      timestamp: item.timestamp,
      event_name: item.event_name,
      operation: item.operation,
      outcome: item.outcome,
      duration_ms: item.duration_ms,
      trace_id: item.trace_id,
      span_id: item.span_id,
      error_code: item.error_code,
      validation_outcome: item.validation_outcome,
    })),
    links: investigationLinks(logs[0].trace_id, requestId),
  };
}

function investigationLinks(traceId, requestId) {
  const regionName = process.env.AWS_REGION;
  if (!regionName || process.env.OBS_AWS_READ !== "true")
    return { traces: null, logs: null, label: "Not configured" };
  const group = process.env.OBS_LOG_GROUP || "";
  return {
    label: "Live AWS telemetry",
    traces: traceId
      ? `https://${regionName}.console.aws.amazon.com/cloudwatch/home?region=${regionName}#xray:traces/${traceId}`
      : null,
    logs: group
      ? `https://${regionName}.console.aws.amazon.com/cloudwatch/home?region=${regionName}#logsV2:log-groups/log-group/${encodeURIComponent(group)}`
      : null,
    requestId: requestId || null,
  };
}

function clientEvent(input) {
  const eventName = ["ui.error", "ui.failed_request"].includes(input?.event_name)
    ? input.event_name
    : null;
  if (!eventName) return false;
  if (clientEvents.length > 200) clientEvents.shift();
  clientEvents.push(Date.now());
  const recent = clientEvents.filter((at) => Date.now() - at < 60000);
  if (recent.length > 30) return false;
  obs.log(eventName, {
    operation: "POST /api/client-telemetry",
    outcome: input.outcome === "cancelled" ? "cancelled" : "error",
    http_status: Number.isInteger(input.http_status) ? input.http_status : null,
    severity: "WARN",
  });
  return true;
}

async function handle({ req, res, url, parts, store, session, send }) {
  if (req.method !== "GET") {
    send(res, 405, { error: "Method not allowed." });
    return;
  }
  const view = parts[2] || "summary";
  if (view === "summary") {
    const range = aws.RANGES[url.searchParams.get("range")]
      ? url.searchParams.get("range")
      : "1h";
    send(res, 200, await summary(range));
    return;
  }
  if (view === "timeline") {
    const body = timeline(store, session, url.searchParams.get("encounterId"));
    if (!body) {
      send(res, 404, { error: "Encounter not found.", label: "No data" });
      return;
    }
    send(res, 200, body);
    return;
  }
  if (view === "lookup") {
    const body = lookup(url.searchParams.get("requestId"));
    if (!body) {
      send(res, 404, { error: "Request not found.", label: "No data" });
      return;
    }
    send(res, 200, body);
    return;
  }
  if (view === "alarms") {
    if (!aws.configured()) {
      send(res, 200, {
        label: "Not configured",
        alarms: [],
        note: "Alarm state is read from CloudWatch only after OBS_AWS_READ is enabled and a query succeeds. An empty list is not a healthy alarm state.",
      });
      return;
    }
    try {
      const live = await aws.alarmState();
      if (!live.configured) {
        send(res, 200, {
          label: "Not configured",
          alarms: [],
          reason: live.reason || "sdk_missing",
          note: "The read role or CloudWatch client is not available. This is not an OK alarm state.",
        });
        return;
      }
      send(res, 200, {
        label: live.alarms.length ? "Live AWS telemetry" : "No data",
        alarms: live.alarms,
        note: "These are alarms whose names start with the configured prefix. An empty list means none were returned. It does not mean every alarm is OK, and a returned alarm has not been proven by a test notification.",
      });
    } catch {
      send(res, 200, {
        label: "No data",
        alarms: [],
        errorCode: "query_failed",
      });
    }
    return;
  }
  send(res, 404, { error: "Not found." });
}

module.exports = { handle, clientEvent, summaryFromLocal, investigationLinks };
