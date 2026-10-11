"use strict";

const RANGES = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

let clientPromise = null;

function configured() {
  return process.env.OBS_AWS_READ === "true";
}

function loadClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve()
      .then(() => require("@aws-sdk/client-cloudwatch"))
      .catch(() => null);
  }
  return clientPromise;
}

function environmentToken() {
  const value = process.env.OBS_ENVIRONMENT || "production";
  return /^[a-z0-9_-]{1,32}$/.test(value) ? value : null;
}

function alarmPrefix() {
  const value = process.env.OBS_ALARM_PREFIX || "virtusp-";
  return /^[a-z][a-z0-9-]{0,40}$/.test(value) ? value : null;
}

function metricQueries(environment) {
  const schema = "{VirtuSP,Environment,Service,Operation,Outcome}";
  const where = `Environment="${environment}"`;
  const rows = [
    ["api_success", `${schema} MetricName="ApiEligible" ${where} Outcome="success"`],
    ["api_failure", `${schema} MetricName="ApiEligible" ${where} Outcome="failure"`],
    ["turns", `${schema} MetricName="TurnEligible" ${where} Outcome="success"`],
    ["blocked", `${schema} MetricName="ValidationOutcome" ${where} Outcome="blocked_before_delivery"`],
    ["unauthorized", `${schema} MetricName="ValidationOutcome" ${where} Outcome="confirmed_unsupported_delivered"`],
    ["persistence", `${schema} MetricName="PersistenceFailure" ${where} Outcome="persistence_failed"`],
    ["dropped", `${schema} MetricName="TelemetryDropped" ${where} Outcome="error"`],
    ["heartbeat", `{VirtuSP,Environment,Service} MetricName="TelemetryHeartbeat" ${where}`],
  ];
  return rows.map(([id, search]) => ({
    Id: id,
    Expression: `SUM(SEARCH('${search}', 'Sum', 60))`,
    ReturnData: true,
  }));
}

function sumOrNull(item) {
  if (!item || !Array.isArray(item.Values) || item.Values.length === 0) return null;
  return item.Values.reduce((sum, value) => sum + value, 0);
}

async function metricData(rangeMs) {
  if (!configured()) return { configured: false };
  const environment = environmentToken();
  if (!environment) return { configured: false, reason: "invalid_environment" };
  const sdk = await loadClient();
  if (!sdk?.CloudWatchClient || !sdk.GetMetricDataCommand)
    return { configured: false, reason: "sdk_missing" };
  const end = new Date();
  const start = new Date(end.getTime() - rangeMs);
  const client = new sdk.CloudWatchClient({
    region: process.env.AWS_REGION || "us-west-2",
    maxAttempts: 2,
  });
  const queries = metricQueries(environment);
  const response = await client.send(
    new sdk.GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: queries,
      MaxDatapoints: 1000,
    }),
  );
  return {
    configured: true,
    results: response.MetricDataResults || [],
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function logsForEncounter(encounterId) {
  if (!configured()) return { configured: false };
  if (!/^[0-9a-f-]{36}$/i.test(encounterId))
    return { configured: true, events: [] };
  let sdk;
  try {
    sdk = require("@aws-sdk/client-cloudwatch-logs");
  } catch {
    return { configured: false, reason: "sdk_missing" };
  }
  const group = process.env.OBS_LOG_GROUP;
  if (!group) return { configured: false, reason: "log_group_missing" };
  const client = new sdk.CloudWatchLogsClient({
    region: process.env.AWS_REGION || "us-west-2",
    maxAttempts: 2,
  });
  const started = await client.send(
    new sdk.StartQueryCommand({
      logGroupName: group,
      startTime: Math.floor(Date.now() / 1000) - 7 * 24 * 3600,
      endTime: Math.floor(Date.now() / 1000),
      queryString: `fields @timestamp, event_name, operation, outcome, duration_ms, request_id, trace_id, encounter_correlation_id, validation_outcome | filter encounter_correlation_id = "${encounterId}" | sort @timestamp asc | limit 100`,
      limit: 100,
    }),
  );
  const deadline = Date.now() + 8000;
  let result = null;
  while (Date.now() < deadline) {
    result = await client.send(
      new sdk.GetQueryResultsCommand({ queryId: started.queryId }),
    );
    if (result.status === "Complete" || result.status === "Failed") break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return {
    configured: true,
    status: result?.status || "Timeout",
    events: (result?.results || []).map((row) =>
      Object.fromEntries(row.map((cell) => [cell.field, cell.value])),
    ),
  };
}

async function alarmState() {
  if (!configured()) return { configured: false };
  const prefix = alarmPrefix();
  if (!prefix) return { configured: false, reason: "invalid_alarm_prefix" };
  const sdk = await loadClient();
  if (!sdk?.CloudWatchClient || !sdk.DescribeAlarmsCommand)
    return { configured: false, reason: "sdk_missing" };
  const client = new sdk.CloudWatchClient({
    region: process.env.AWS_REGION || "us-west-2",
    maxAttempts: 2,
  });
  const response = await client.send(
    new sdk.DescribeAlarmsCommand({
      AlarmNamePrefix: prefix,
      MaxRecords: 20,
    }),
  );
  return {
    configured: true,
    alarms: (response.MetricAlarms || []).slice(0, 20).map((alarm) => ({
      name: alarm.AlarmName,
      state: alarm.StateValue,
      updated: alarm.StateUpdatedTimestamp
        ? new Date(alarm.StateUpdatedTimestamp).toISOString()
        : null,
    })),
  };
}

module.exports = {
  configured,
  metricData,
  logsForEncounter,
  alarmState,
  metricQueries,
  sumOrNull,
  RANGES,
};
