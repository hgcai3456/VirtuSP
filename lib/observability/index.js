"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const catalog = require("./catalog");
const sanitize = require("./sanitize");

const storage = new AsyncLocalStorage();
const BUFFER_LIMIT = 1000;
const SPAN_BUFFER = 256;
const buffers = { logs: [], spans: [], emf: [], audits: [] };
let dropped = 0;
let installed = false;
let otelApi = null;

const NOOP_TURN = {
  stage(_name, fn) {
    return typeof fn === "function" ? fn() : undefined;
  },
  finish() {},
  fail() {},
};

function enabled() {
  return process.env.OBS_ENABLED !== "false";
}

function environment() {
  const value = String(process.env.OBS_ENVIRONMENT || "local");
  return catalog.ENVIRONMENTS.includes(value) ? value : "other";
}

function synthetic() {
  if (process.env.OBS_SYNTHETIC === "true") return true;
  return environment() === "local" || environment() === "test";
}

function region() {
  const value = String(process.env.AWS_REGION || "local");
  return /^[a-z]{2}-[a-z]+-\d$/.test(value) || value === "local" ? value : "other";
}

function buildVersion() {
  return String(process.env.VIRTUSP_BUILD_VERSION || "1.0.0").slice(0, 40);
}

function sampleRatio() {
  const raw = process.env.OBS_TRACE_SAMPLE_RATIO;
  if (raw == null || raw === "")
    return environment() === "production" ? 0.1 : 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return 1;
  return value;
}

function sampled(traceId) {
  const ratio = sampleRatio();
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  const slice = createHash("sha256").update(traceId).digest();
  const bucket = slice.readUInt32BE(0) / 0xffffffff;
  return bucket < ratio;
}

function hex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function context() {
  return storage.getStore() || null;
}

function run(fields, fn) {
  const parent = context() || {};
  return storage.run({ ...parent, ...fields }, fn);
}

function allow(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

function operationName(value) {
  return allow(value, catalog.OPERATIONS, "unlisted");
}

function outcomeName(value) {
  return allow(value, catalog.OUTCOMES, "unlisted");
}

function modelAlias(modelId) {
  if (!modelId) return "none";
  if (catalog.MODEL_ALIASES.includes(modelId)) return modelId;
  return "configured-unlisted";
}

function push(bucket, item) {
  buffers[bucket].push(item);
  if (buffers[bucket].length > BUFFER_LIMIT) {
    buffers[bucket].shift();
    dropped += 1;
  }
}

function noteDropped(reason) {
  dropped += 1;
  try {
    writeEmf("TelemetryDropped", 1, "Count", {
      Operation: "telemetry.export",
      Outcome: outcomeName(reason === "export_failed" ? "error" : "unavailable"),
    });
  } catch {
    dropped += 1;
  }
}

function baseDimensions(extra) {
  return {
    Environment: environment(),
    Service: "virtusp",
    ...extra,
  };
}

function metricDefinition(name) {
  return catalog.METRICS.find((item) => item.name === name) || null;
}

function writeEmf(name, value, unit, dimensions) {
  const definition = metricDefinition(name);
  if (!definition) {
    dropped += 1;
    return;
  }
  const dims = {};
  for (const key of definition.dimensions) {
    if (dimensions[key] != null) dims[key] = String(dimensions[key]);
  }
  if (!dims.Environment) dims.Environment = environment();
  if (!dims.Service) dims.Service = "virtusp";
  for (const key of Object.keys(dims)) {
    if (!definition.dimensions.includes(key)) {
      dropped += 1;
      return;
    }
  }
  const line = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: catalog.NAMESPACE,
          Dimensions: [Object.keys(dims)],
          Metrics: [{ Name: name, Unit: unit || definition.unit }],
        },
      ],
    },
    ...dims,
    [name]: value,
  };
  const serialized = JSON.stringify(line);
  push("emf", serialized);
  if (process.env.OBS_EMF === "true") {
    try {
      process.stdout.write(serialized + "\n");
    } catch {
      dropped += 1;
    }
  }
}

function emit(name, value, dimensions, unit) {
  if (!enabled()) return;
  try {
    writeEmf(name, value, unit, dimensions || {});
  } catch {
    dropped += 1;
  }
}

function log(eventName, fields = {}) {
  if (!enabled()) return null;
  try {
    const current = context() || {};
    const record = {
      schema: catalog.SCHEMA,
      timestamp: new Date().toISOString(),
      severity: ["DEBUG", "INFO", "WARN", "ERROR"].includes(fields.severity)
        ? fields.severity
        : "INFO",
      service: "virtusp",
      environment: environment(),
      region: region(),
      build_version: buildVersion(),
      event_name: sanitize.boundedCode(eventName, "event"),
      operation: operationName(fields.operation || current.operation),
      route_template: operationName(
        fields.route_template || current.operation || "unlisted",
      ),
      request_id: current.requestId || fields.request_id || null,
      trace_id: current.traceId || fields.trace_id || null,
      span_id: current.spanId || fields.span_id || null,
      encounter_correlation_id:
        current.encounterCorrelationId ||
        fields.encounter_correlation_id ||
        null,
      duration_ms: numberOrNull(fields.duration_ms),
      outcome: fields.outcome ? outcomeName(fields.outcome) : null,
      error_code: fields.error_code
        ? sanitize.boundedCode(fields.error_code, "error")
        : null,
      provider: fields.provider
        ? allow(fields.provider, catalog.PROVIDERS, "none")
        : null,
      model_alias: fields.model_alias ? modelAlias(fields.model_alias) : null,
      synthetic: synthetic(),
      execution_mode: fields.execution_mode
        ? allow(fields.execution_mode, catalog.EXECUTION_MODES, "unavailable")
        : null,
      http_status: numberOrNull(fields.http_status),
      profile_version: numberOrNull(fields.profile_version),
      policy_version: catalog.POLICY_VERSION,
      retry_count: numberOrNull(fields.retry_count),
      token_input: numberOrNull(fields.token_input),
      token_output: numberOrNull(fields.token_output),
      estimated_cost_usd: fields.estimated_cost_usd ?? null,
      cost_basis: fields.cost_basis === "estimated" ? "estimated" : "unknown",
      finish_reason: fields.finish_reason
        ? sanitize.boundedCode(fields.finish_reason, "unlisted")
        : null,
      validation_outcome: fields.validation_outcome
        ? outcomeName(fields.validation_outcome)
        : null,
    };
    const serialized = JSON.stringify(record);
    push("logs", serialized);
    const level = String(process.env.OBS_LOG_LEVEL || "info").toLowerCase();
    const rank = { debug: 10, info: 20, warn: 30, error: 40 };
    if ((rank[record.severity.toLowerCase()] || 20) >= (rank[level] || 20)) {
      if (process.env.OBS_LOG_STDOUT === "true") {
        try {
          process.stdout.write(serialized + "\n");
        } catch {
          dropped += 1;
        }
      }
    }
    return record;
  } catch {
    dropped += 1;
    return null;
  }
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function startSpan(name, attributes = {}) {
  const parent = context() || {};
  const traceId = parent.traceId || hex(16);
  const spanId = hex(8);
  const keep = parent.forceTrace || sampled(traceId);
  const span = {
    name: operationName(attributes.operation || name),
    traceId,
    spanId,
    parentSpanId: parent.spanId || null,
    start: Date.now(),
    attributes: {
      operation: operationName(attributes.operation || name),
      "aws.local.service": "virtusp",
      "aws.local.operation": operationName(attributes.operation || name),
    },
    sampled: keep,
    status: "ok",
    otel: null,
  };
  if (attributes.provider)
    span.attributes["aws.remote.service"] = allow(
      attributes.provider,
      catalog.PROVIDERS,
      "none",
    );
  if (keep) {
    try {
      const api = loadOtel();
      if (api) {
        const tracer = api.trace.getTracer("virtusp", "1.0.0");
        span.otel = tracer.startSpan(span.name, {
          attributes: span.attributes,
        });
        const remote = span.otel.spanContext();
        if (remote && remote.traceId && !/^0+$/.test(remote.traceId)) {
          span.traceId = remote.traceId;
          span.spanId = remote.spanId;
        }
      }
    } catch {
      noteDropped("export_failed");
    }
  }
  return span;
}

function endSpan(span, outcome) {
  if (!span) return;
  span.end = Date.now();
  span.durationMs = span.end - span.start;
  span.status = outcome || "ok";
  if (span.sampled || span.status === "error") {
    if (buffers.spans.length >= SPAN_BUFFER) {
      buffers.spans.shift();
      noteDropped("buffer_full");
    }
    buffers.spans.push(span);
  }
  try {
    span.otel?.setStatus?.({ code: span.status === "error" ? 2 : 1 });
    span.otel?.end?.();
  } catch {
    noteDropped("export_failed");
  }
}

function withSpan(name, attributes, fn) {
  if (!enabled()) return fn();
  const span = startSpan(name, attributes);
  const parent = context() || {};
  const finish = (outcome, error) => {
    endSpan(span, outcome);
    if (error) throw error;
  };
  try {
    const value = storage.run(
      {
        ...parent,
        traceId: span.traceId,
        spanId: span.spanId,
        operation: span.name,
      },
      fn,
    );
    if (value && typeof value.then === "function") {
      return value.then(
        (result) => {
          finish("ok");
          return result;
        },
        (error) => {
          finish("error");
          throw error;
        },
      );
    }
    finish("ok");
    return value;
  } catch (error) {
    finish("error");
    throw error;
  }
}

function loadOtel() {
  if (otelApi !== null) return otelApi || null;
  try {
    otelApi = require("@opentelemetry/api");
  } catch {
    otelApi = false;
  }
  return otelApi || null;
}

function install() {
  if (installed) return;
  installed = true;
  if (!enabled()) return;
  if (!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return;
  try {
    require("./register-sdk").start();
  } catch {
    noteDropped("export_failed");
  }
}

function routeTemplate(method, pathname) {
  const parts = String(pathname || "/")
    .split("?")[0]
    .split("/")
    .filter(Boolean);
  const verb = String(method || "GET").toUpperCase();
  if (parts[0] !== "api") return operationName(`${verb} /static`);
  if (parts[1] === "live") return "GET /api/live";
  if (parts[1] === "ready") return "GET /api/ready";
  if (parts[1] === "health") return "GET /api/health";
  if (parts[1] === "session") return operationName(`${verb} /api/session`);
  if (parts[1] === "students")
    return operationName(`${verb} /api/students`);
  if (parts[1] === "references") return "GET /api/references";
  if (parts[1] === "files")
    return parts[2] ? `${verb} /api/files/:id` : "POST /api/files";
  if (parts[1] === "generate-synthetic") return "POST /api/generate-synthetic";
  if (parts[1] === "generate") return "POST /api/generate";
  if (parts[1] === "import") return "POST /api/import";
  if (parts[1] === "client-telemetry") return "POST /api/client-telemetry";
  if (parts[1] === "observability") {
    const view = ["summary", "timeline", "lookup", "alarms"].includes(parts[2])
      ? parts[2]
      : "summary";
    return operationName(`GET /api/observability/${view}`);
  }
  if (parts[1] === "profiles") {
    if (!parts[2]) return operationName(`${verb} /api/profiles`);
    if (parts[3] === "publish") return "POST /api/profiles/:id/publish";
    if (parts[3] === "prepare") return "POST /api/profiles/:id/prepare";
    if (parts[3] === "image") return "GET /api/profiles/:id/image";
    return operationName(`${verb} /api/profiles/:id`);
  }
  if (parts[1] === "encounters") {
    if (!parts[2]) return operationName(`${verb} /api/encounters`);
    if (!parts[3] && verb === "GET") return "GET /api/encounters/:id";
    if (parts[3] === "speech" && parts[5] === "stream")
      return "GET /api/encounters/:id/speech/:turn/stream";
    if (parts[3] === "artifacts" && parts[5] === "file")
      return "GET /api/encounters/:id/artifacts/:artifact/file";
    if (parts[3] === "export") return "GET /api/encounters/:id/export";
    if (parts[3] === "chart" && verb === "GET")
      return "GET /api/encounters/:id/chart";
    if (parts[3] === "events")
      return operationName(`${verb} /api/encounters/:id/events`);
    const action = [
      "turn",
      "open",
      "review",
      "complete",
      "begin",
      "note",
      "handoff",
      "plan",
      "coaching",
      "speech",
    ].includes(parts[3])
      ? parts[3]
      : null;
    if (action) return operationName(`${verb} /api/encounters/:id/${action}`);
    return "unlisted";
  }
  return "unlisted";
}

function eligibleApi(operation, status, aborted) {
  if (!operation.startsWith("GET /api") && !operation.startsWith("POST /api") && !operation.startsWith("PUT /api") && !operation.startsWith("DELETE /api"))
    return false;
  if (operation === "GET /api/live" || operation === "GET /static" || operation === "OPTIONS /api")
    return false;
  if (aborted) return false;
  if ([400, 401, 403, 404, 405, 422].includes(status)) return false;
  if (status === 429) return false;
  return true;
}

function instrumentRequest(req, res, handler) {
  if (!enabled()) return handler();
  const requestId = randomUUID();
  const operation = routeTemplate(req.method, (req.url || "/").split("?")[0]);
  const span = startSpan("http.server", { operation });
  const started = Date.now();
  let settled = false;
  const finish = (status, aborted) => {
    if (settled) return;
    settled = true;
    const duration = Date.now() - started;
    const outcome = aborted
      ? "cancelled"
      : status >= 500
        ? "error"
        : status === 401 || status === 403
          ? "unauthorized"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : status === 422 || status === 400
                ? "client_error"
                : status === 429
                  ? "rate_limited"
                  : status >= 200 && status < 400
                    ? "ok"
                    : "error";
    endSpan(span, outcome === "error" ? "error" : "ok");
    log(aborted ? "http.cancelled" : "http.request", {
      operation,
      route_template: operation,
      duration_ms: duration,
      outcome,
      http_status: status || null,
      severity: outcome === "error" ? "ERROR" : "INFO",
    });
    emit("ApiRequest", 1, { Operation: operation, Outcome: outcome });
    if (eligibleApi(operation, status, aborted)) {
      emit("ApiEligible", 1, {
        Operation: operation,
        Outcome: outcome === "ok" ? "success" : "failure",
      });
      emit("ApiLatency", duration, { Operation: operation }, "Milliseconds");
    }
  };
  try {
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Trace-Id", span.traceId);
  } catch {
    /* Headers may already be sent for a reused response in tests. */
  }
  res.on("close", () => {
    if (!res.writableEnded) finish(0, true);
  });
  res.on("finish", () => finish(res.statusCode, false));
  return storage.run(
    {
      requestId,
      traceId: span.traceId,
      spanId: span.spanId,
      operation,
      forceTrace: false,
    },
    handler,
  );
}

function appendAudit(enc, record) {
  if (!enc || typeof enc !== "object") {
    emit("AuditFailure", 1, {
      Operation: record.operation || "unlisted",
      Outcome: "audit_failed",
    });
    throw Object.assign(new Error("The audit record could not be stored."), {
      code: "AUDIT_FAILED",
      status: 500,
    });
  }
  if (!Array.isArray(enc.auditTrail)) enc.auditTrail = [];
  const key = `${record.operation}:${record.client_request_id || ""}`;
  if (
    record.client_request_id &&
    enc.auditTrail.some(
      (item) => `${item.operation}:${item.client_request_id || ""}` === key,
    )
  )
    return enc.auditTrail.find(
      (item) => `${item.operation}:${item.client_request_id || ""}` === key,
    );
  const entry = {
    schema: catalog.AUDIT_SCHEMA,
    id: randomUUID(),
    sequence: enc.auditTrail.length + 1,
    at: new Date().toISOString(),
    encounter_correlation_id: enc.id,
    operation: operationName(record.operation),
    outcome: outcomeName(record.outcome),
    profile_version: numberOrNull(enc.p?.version),
    policy_version: catalog.POLICY_VERSION,
    reason: sanitize.boundedCode(record.reason || "recorded", "recorded"),
    fact_ref_count: Number.isInteger(record.fact_ref_count)
      ? record.fact_ref_count
      : 0,
    client_request_id: record.client_request_id
      ? sanitize.boundedCode(record.client_request_id, "")
      : null,
    trace_id: context()?.traceId || null,
    request_id: context()?.requestId || null,
  };
  enc.auditTrail.push(entry);
  push("audits", JSON.stringify({ ...entry, encounter_correlation_id: enc.id }));
  return entry;
}

function openTurn(enc) {
  if (!enabled()) return NOOP_TURN;
  const started = Date.now();
  const span = startSpan("encounter.receive_turn", {
    operation: "encounter.receive_turn",
  });
  const parent = context() || {};
  storage.enterWith({
    ...parent,
    traceId: span.traceId,
    spanId: span.spanId,
    encounterCorrelationId: enc?.id || null,
    operation: "encounter.receive_turn",
  });
  let closed = false;
  const close = (info, failed) => {
    if (closed) return;
    closed = true;
    const duration = Date.now() - started;
    const outcome = failed ? "error" : info.outcome || "ok";
    endSpan(span, failed ? "error" : "ok");
    log("encounter.turn", {
      operation: "encounter.receive_turn",
      duration_ms: duration,
      outcome,
      error_code: info.error_code || null,
      provider: info.provider || "local",
      model_alias: info.model_alias || null,
      execution_mode: info.execution_mode || "deterministic",
      validation_outcome: info.validation_outcome || null,
      profile_version: enc?.p?.version ?? null,
      severity: failed ? "ERROR" : "INFO",
    });
    if (info.eligible) {
      emit("TurnEligible", 1, {
        Operation: "encounter.receive_turn",
        Outcome: info.approved ? "success" : "failure",
      });
      emit(
        "TurnLatency",
        duration,
        { Operation: "encounter.receive_turn" },
        "Milliseconds",
      );
      if (info.approved)
        emit(
          "ApprovedResponseLatency",
          duration,
          { Operation: "encounter.deliver_response" },
          "Milliseconds",
        );
    }
    if (info.validation_outcome)
      emit("ValidationOutcome", 1, {
        Operation: "encounter.validate_response",
        Outcome: info.validation_outcome,
      });
    if (info.selector_outcome)
      emit("ValidationOutcome", 1, {
        Operation: "encounter.invoke_model",
        Outcome: info.selector_outcome,
      });
    if (info.fallback)
      emit("FallbackUsed", 1, {
        Operation: "encounter.select_safe_fallback",
        Outcome: "fallback",
        Provider: "bedrock",
      });
    try {
      appendAudit(enc, {
        operation: "encounter.receive_turn",
        outcome,
        reason: info.reason || outcome,
        fact_ref_count: info.fact_ref_count || 0,
        client_request_id: info.client_request_id || null,
      });
    } catch (error) {
      if (error.code === "AUDIT_FAILED") throw error;
    }
  };
  return {
    stage(name, fn) {
      return withSpan(name, { operation: name }, fn);
    },
    finish(info = {}) {
      close(info, false);
    },
    fail(error) {
      close(
        {
          outcome: "error",
          error_code: sanitize.errorCode(error),
          eligible: !/Question must be|request ID|encounter is complete/i.test(
            String(error?.message || ""),
          ),
          approved: false,
          reason: "turn_failed",
        },
        true,
      );
    },
  };
}

function encounterStarted(enc) {
  if (!enabled() || !enc) return;
  emit("EncounterStarted", 1, {
    Operation: "encounter.start",
    Outcome: "started",
  });
  log("encounter.start", {
    operation: "encounter.start",
    outcome: "started",
    profile_version: enc.p?.version ?? null,
    encounter_correlation_id: enc.id,
  });
  appendAudit(enc, {
    operation: "encounter.start",
    outcome: "started",
    reason: "published_version",
    fact_ref_count: 0,
  });
}

function encounterCompleted(enc, outcome) {
  if (!enabled()) return;
  emit("EncounterCompleted", 1, {
    Operation: "encounter.complete",
    Outcome: outcome === "error" ? "error" : "completed",
  });
  if (enc)
    appendAudit(enc, {
      operation: "encounter.complete",
      outcome: outcome === "error" ? "error" : "completed",
      reason: outcome === "error" ? "completion_failed" : "student_finished",
    });
}

function noteQueue(enc) {
  if (!enabled()) return;
  emit("EncounterConflict", 1, {
    Operation: "encounter.load_state",
    Outcome: "queued",
  });
  log("encounter.queued", {
    operation: "encounter.load_state",
    outcome: "queued",
    encounter_correlation_id: enc?.id || null,
  });
}

function notePersistence(outcome, durationMs) {
  if (!enabled()) return;
  emit(
    "PersistenceLatency",
    durationMs,
    { Operation: "dependency.sqlite.save" },
    "Milliseconds",
  );
  if (outcome === "error")
    emit("PersistenceFailure", 1, {
      Operation: "dependency.sqlite.save",
      Outcome: "persistence_failed",
    });
  log("persistence", {
    operation: "dependency.sqlite.save",
    outcome: outcome === "error" ? "persistence_failed" : "ok",
    duration_ms: durationMs,
    severity: outcome === "error" ? "ERROR" : "INFO",
    error_code: outcome === "error" ? "persistence_failed" : null,
  });
}

function faultActive(name) {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.OBS_FAULT_INJECTION !== "1") return false;
  const armed = faultState[name];
  if (!armed || armed <= 0) return false;
  faultState[name] -= 1;
  return true;
}

const faultState = Object.create(null);

function armFault(name, count = 1) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Fault injection is disabled in production.");
  if (process.env.OBS_FAULT_INJECTION !== "1")
    throw new Error("Fault injection is not enabled.");
  faultState[name] = count;
}

function clearFaults() {
  for (const key of Object.keys(faultState)) delete faultState[key];
}

function studio(operation, outcome, extra = {}) {
  if (!enabled()) return;
  emit("StudioOperation", 1, {
    Operation: operationName(operation),
    Outcome: outcomeName(outcome),
  });
  log("studio", {
    operation,
    outcome,
    duration_ms: extra.duration_ms,
    profile_version: extra.profile_version,
    severity: outcome === "error" ? "ERROR" : "INFO",
  });
}

function validationFindings(issues) {
  if (!enabled() || !Array.isArray(issues)) return;
  for (const issue of issues) {
    const message = String(issue?.message || "");
    const category = /artifact/i.test(message)
      ? "artifact"
      : /objective/i.test(message)
        ? "objective"
        : /source|document/i.test(message)
          ? "source"
          : /review/i.test(message)
            ? "acknowledgment"
            : /fact|wording|visibility/i.test(message)
              ? "fact"
              : /name|age|id/i.test(message)
                ? "identity"
                : "other";
    emit("StudioOperation", 1, {
      Operation: "studio.validate",
      Outcome: issue?.severity === "error" ? "validation_failed" : "ok",
    });
    log("studio.validation", {
      operation: "studio.validate",
      outcome: category,
      severity: issue?.severity === "error" ? "WARN" : "INFO",
    });
  }
}

function feedbackRecord(enc, assessment, durationMs, failed) {
  if (!enabled()) return;
  emit(
    "FeedbackLatency",
    durationMs,
    { Operation: "feedback.generate" },
    "Milliseconds",
  );
  emit("FeedbackEligible", 1, {
    Operation: "feedback.generate",
    Outcome: failed ? "failure" : "success",
  });
  const domains = assessment?.domains || [];
  for (const domain of domains) {
    const status = domain.status || "not_assessed";
    emit("ObjectiveCoverage", 1, {
      Operation: "feedback.evaluate_objectives",
      Outcome: ["assessed", "not_assessed", "not_applicable"].includes(status)
        ? status === "assessed"
          ? "ok"
          : status
        : "not_assessed",
    });
  }
  for (const objective of assessment?.objectives || []) {
    const outcome =
      objective.evidence && objective.evidence.length
        ? "elicited"
        : objective.credit > 0
          ? "elicited"
          : "not_elicited";
    emit("ObjectiveCoverage", 1, {
      Operation: "feedback.evaluate_objectives",
      Outcome: outcome,
    });
  }
  if (enc)
    appendAudit(enc, {
      operation: "feedback.generate",
      outcome: failed ? "error" : "completed",
      reason: failed ? "feedback_failed" : assessment?.provider || "recorded",
    });
  log("feedback", {
    operation: "feedback.generate",
    outcome: failed ? "error" : "completed",
    duration_ms: durationMs,
    provider: assessment?.provider === "bedrock" ? "bedrock" : "local",
    model_alias: assessment?.model || null,
    execution_mode: assessment?.provider === "bedrock" ? "live" : "deterministic",
  });
}

function usageNumbers(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = numberOrNull(
    usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens,
  );
  const output = numberOrNull(
    usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens,
  );
  const cacheRead = numberOrNull(
    usage.cacheReadInputTokens ??
      usage.cacheReadInputTokenCount ??
      usage.cache_read_input_tokens,
  );
  const cacheWrite = numberOrNull(
    usage.cacheWriteInputTokens ?? usage.cacheWriteInputTokenCount,
  );
  if (input == null && output == null && cacheRead == null && cacheWrite == null)
    return null;
  return { input, output, cacheRead, cacheWrite };
}

function estimateCost(alias, usage, regionName, tableOverride) {
  let table = tableOverride || null;
  if (!table)
    try {
      table = require("./pricing.json");
    } catch {
      table = null;
    }
  const row = table?.models?.[alias];
  const numbers = usageNumbers(usage);
  if (!row || !numbers) {
    return {
      estimatedUsd: null,
      basis: "unknown",
      source: table?.source || null,
      effectiveDate: table?.effectiveDate || null,
    };
  }
  if (
    Array.isArray(row.regions) &&
    regionName &&
    regionName !== "local" &&
    !row.regions.includes(regionName)
  )
    return {
      estimatedUsd: null,
      basis: "unknown",
      source: table.source,
      effectiveDate: table.effectiveDate,
    };
  const parts = [
    [numbers.input, row.inputPer1k],
    [numbers.output, row.outputPer1k],
    [numbers.cacheRead, row.cacheReadPer1k],
    [numbers.cacheWrite, row.cacheWritePer1k],
  ];
  if (parts.some(([tokens, price]) => tokens != null && price == null))
    return {
      estimatedUsd: null,
      basis: "unknown",
      source: table.source,
      effectiveDate: table.effectiveDate,
    };
  let usd = 0;
  let any = false;
  for (const [tokens, price] of parts) {
    if (tokens == null || price == null) continue;
    usd += (tokens / 1000) * Number(price);
    any = true;
  }
  if (!any)
    return {
      estimatedUsd: null,
      basis: "unknown",
      source: table.source,
      effectiveDate: table.effectiveDate,
    };
  return {
    estimatedUsd: usd,
    basis: "estimated",
    source: table.source,
    effectiveDate: table.effectiveDate,
  };
}

async function providerCall(meta, fn) {
  const maxAttempts = Math.max(1, Math.min(3, Number(meta.maxAttempts) || 1));
  const operation = operationName(meta.operation);
  const provider = allow(meta.provider, catalog.PROVIDERS, "none");
  const alias = modelAlias(meta.modelId);
  const executionMode = allow(
    meta.executionMode,
    catalog.EXECUTION_MODES,
    "unavailable",
  );
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (faultActive("provider_throttle")) {
      lastError = Object.assign(new Error("Injected provider throttle."), {
        name: "ThrottlingException",
        code: "ThrottlingException",
      });
      recordAttempt({
        operation,
        provider,
        alias,
        executionMode,
        outcome: "throttled",
        duration: 0,
        retry: attempt - 1,
        usage: null,
        finish: null,
        requestId: null,
      });
      if (attempt === maxAttempts) break;
      continue;
    }
    if (faultActive("provider_timeout")) {
      lastError = Object.assign(new Error("Injected provider timeout."), {
        name: "TimeoutError",
        code: "ETIMEDOUT",
      });
      recordAttempt({
        operation,
        provider,
        alias,
        executionMode,
        outcome: "timeout",
        duration: 0,
        retry: attempt - 1,
        usage: null,
        finish: null,
        requestId: null,
      });
      if (attempt === maxAttempts) break;
      continue;
    }
    const started = Date.now();
    try {
      const value = await withSpan(operation, { operation, provider }, () =>
        fn(attempt),
      );
      const detail = value && value.__obs ? value.__obs : {};
      recordAttempt({
        operation,
        provider,
        alias,
        executionMode,
        outcome: "ok",
        duration: Date.now() - started,
        retry: attempt - 1,
        usage: detail.usage || null,
        finish: detail.finishReason || null,
        requestId: detail.requestId || null,
      });
      emit("ProviderLogicalRequest", 1, {
        Operation: operation,
        Outcome: "ok",
        Provider: provider,
        ModelAlias: alias,
        ExecutionMode: executionMode,
      });
      return value && value.__virtuspProviderResult ? value.value : value;
    } catch (error) {
      lastError = error;
      recordAttempt({
        operation,
        provider,
        alias,
        executionMode,
        outcome: sanitize.errorCode(error),
        duration: Date.now() - started,
        retry: attempt - 1,
        usage: error.__obs?.usage || null,
        finish: error.__obs?.finishReason || null,
        requestId: error.__obs?.requestId || null,
      });
      const retryable = ["timeout", "throttled"].includes(sanitize.errorCode(error));
      if (!retryable || attempt === maxAttempts) break;
    }
  }
  emit("ProviderLogicalRequest", 1, {
    Operation: operation,
    Outcome: "error",
    Provider: provider,
    ModelAlias: alias,
    ExecutionMode: executionMode,
  });
  throw lastError;
}

function recordAttempt(info) {
  const outcome = outcomeName(
    info.outcome === "timeout"
      ? "timeout"
      : info.outcome === "throttled"
        ? "throttled"
        : info.outcome === "invalid_response"
          ? "invalid_response"
          : info.outcome === "ok"
            ? "ok"
            : "error",
  );
  emit("ProviderAttempt", 1, {
    Operation: info.operation,
    Outcome: outcome,
    Provider: info.provider,
    ModelAlias: info.alias,
    ExecutionMode: info.executionMode,
  });
  emit(
    "ProviderLatency",
    info.duration,
    { Operation: info.operation, Provider: info.provider },
    "Milliseconds",
  );
  const numbers = usageNumbers(info.usage);
  if (numbers?.input != null)
    emit("TokenInput", numbers.input, {
      Provider: info.provider,
      ModelAlias: info.alias,
    });
  if (numbers?.output != null)
    emit("TokenOutput", numbers.output, {
      Provider: info.provider,
      ModelAlias: info.alias,
    });
  if (numbers?.cacheRead != null)
    emit("TokenCacheRead", numbers.cacheRead, {
      Provider: info.provider,
      ModelAlias: info.alias,
    });
  const cost = estimateCost(info.alias, info.usage, region());
  if (cost.estimatedUsd != null)
    emit("EstimatedModelCostMicroUsd", Math.round(cost.estimatedUsd * 1e6), {
      Provider: info.provider,
      ModelAlias: info.alias,
    });
  log("provider.attempt", {
    operation: info.operation,
    outcome,
    provider: info.provider,
    model_alias: info.alias,
    execution_mode: info.executionMode,
    duration_ms: info.duration,
    retry_count: info.retry,
    token_input: numbers?.input ?? null,
    token_output: numbers?.output ?? null,
    estimated_cost_usd: cost.estimatedUsd,
    cost_basis: cost.basis,
    finish_reason: info.finish,
    error_code: outcome === "ok" ? null : outcome,
  });
}

function disclosure(enc, outcome, factRefCount, reason) {
  if (!enabled()) return;
  emit("DisclosureDecision", 1, {
    Operation: "encounter.evaluate_disclosure",
    Outcome: outcomeName(outcome),
  });
  if (enc)
    appendAudit(enc, {
      operation: "encounter.evaluate_disclosure",
      outcome,
      reason,
      fact_ref_count: factRefCount || 0,
    });
}

function artifact(enc, outcome, reason) {
  if (!enabled()) return;
  emit("DisclosureDecision", 1, {
    Operation: "encounter.retrieve_artifact",
    Outcome: outcomeName(outcome),
  });
  if (enc)
    appendAudit(enc, {
      operation: "encounter.retrieve_artifact",
      outcome,
      reason,
      fact_ref_count: 0,
    });
}

function heartbeat() {
  if (!enabled()) return;
  emit("TelemetryHeartbeat", 1, {});
  log("telemetry.heartbeat", {
    operation: "telemetry.heartbeat",
    outcome: "ok",
  });
}

let heartbeatTimer = null;
function startHeartbeat() {
  if (heartbeatTimer || !enabled()) return;
  if (process.env.OBS_HEARTBEAT === "false") return;
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 60000);
  heartbeatTimer.unref?.();
}

function snapshot() {
  return {
    logs: buffers.logs.map((line) => JSON.parse(line)),
    spans: buffers.spans.map((span) => ({
      name: span.name,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      durationMs: span.durationMs,
      status: span.status,
      sampled: span.sampled,
      attributes: span.attributes,
    })),
    emf: buffers.emf.map((line) => JSON.parse(line)),
    audits: buffers.audits.map((line) => JSON.parse(line)),
    dropped,
    serialized: [...buffers.logs, ...buffers.emf],
  };
}

function resetForTests() {
  buffers.logs.length = 0;
  buffers.spans.length = 0;
  buffers.emf.length = 0;
  buffers.audits.length = 0;
  dropped = 0;
  clearFaults();
}

function localSummary(rangeMs) {
  const now = Date.now();
  const logs = buffers.logs
    .map((line) => JSON.parse(line))
    .filter((item) => now - Date.parse(item.timestamp) <= rangeMs);
  const emf = buffers.emf
    .map((line) => JSON.parse(line))
    .filter((item) => now - item._aws.Timestamp <= rangeMs);
  const count = (name, outcome) =>
    emf
      .filter((item) => item[name] != null && (!outcome || item.Outcome === outcome))
      .reduce((sum, item) => sum + Number(item[name] || 0), 0);
  const latencies = (name) =>
    emf.filter((item) => item[name] != null && item.Outcome == null).map((item) => item[name]);
  // Distribution metrics still carry no Outcome dimension, so the value sits on the metric name.
  const values = (name) =>
    emf
      .filter((item) => Object.hasOwn(item, name) && typeof item[name] === "number")
      .map((item) => item[name]);
  const newest = logs.reduce(
    (max, item) => Math.max(max, Date.parse(item.timestamp) || 0),
    0,
  );
  return {
    logs,
    count,
    values,
    latencies,
    newest,
    sampleCount: logs.length,
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function watchStream(req, res) {
  if (!enabled() || !req || !res) return;
  const started = Date.now();
  let settled = false;
  const done = (outcome) => {
    if (settled) return;
    settled = true;
    log("encounter.deliver_response", {
      operation: "encounter.deliver_response",
      outcome,
      duration_ms: Date.now() - started,
    });
  };
  res.once("finish", () => done("ok"));
  req.once("close", () => {
    if (!res.writableEnded) done("cancelled");
  });
  res.once("error", () => done("error"));
}

function failOpen(error) {
  noteDropped("export_failed");
  log("telemetry.export_error", {
    operation: "telemetry.export",
    outcome: "error",
    error_code: sanitize.errorCode(error),
    severity: "WARN",
  });
}

module.exports = {
  enabled,
  environment,
  install,
  instrumentRequest,
  routeTemplate,
  openTurn,
  encounterStarted,
  encounterCompleted,
  noteQueue,
  notePersistence,
  studio,
  validationFindings,
  feedbackRecord,
  providerCall,
  disclosure,
  artifact,
  heartbeat,
  startHeartbeat,
  snapshot,
  resetForTests,
  localSummary,
  percentile,
  estimateCost,
  usageNumbers,
  appendAudit,
  log,
  emit,
  withSpan,
  context,
  run,
  modelAlias,
  faultActive,
  armFault,
  clearFaults,
  failOpen,
  watchStream,
  sampleRatio,
  sampled,
  catalog,
};
