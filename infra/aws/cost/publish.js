"use strict";

const {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetDimensionValuesCommand,
  ListCostAllocationTagsCommand,
} = require("@aws-sdk/client-cost-explorer");
const {
  CloudWatchClient,
  PutMetricDataCommand,
} = require("@aws-sdk/client-cloudwatch");
const {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} = require("@aws-sdk/client-ssm");
const {
  CACHE_MAX_AGE_MS,
  buildFilter,
  dailyRange,
  hourlyRange,
  hourFloor,
  isHourlyDisabled,
  isRangeError,
  isTagError,
  latestCompleteHour,
  needsRefresh,
  periodCosts,
  roundUsd,
  selectableHours,
} = require("./windows");

const PERIODS = ["Hour", "Day", "Week", "Month", "Year"];
const CACHE_SCHEMA = 2;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function usage(client, filter, range, granularity) {
  const rows = [];
  let token;
  do {
    const page = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: range.start, End: range.end },
        Granularity: granularity,
        Metrics: ["UnblendedCost"],
        Filter: filter,
        NextPageToken: token,
      }),
    );
    rows.push(...(page.ResultsByTime || []));
    token = page.NextPageToken;
  } while (token);
  return rows;
}

async function dimensionValues(client, now, dimension) {
  const range = dailyRange(now);
  const names = [];
  let token;
  do {
    const page = await client.send(
      new GetDimensionValuesCommand({
        TimePeriod: { Start: range.start, End: range.end },
        Dimension: dimension,
        Context: "COST_AND_USAGE",
        NextPageToken: token,
      }),
    );
    for (const item of page.DimensionValues || []) {
      if (item.Value) names.push(item.Value);
    }
    token = page.NextPageToken;
  } while (token);
  return names;
}

function accessDenied(err) {
  const text = `${err && err.name ? err.name : ""} ${err && err.message ? err.message : err}`;
  return /AccessDenied|not authorized|explicit deny/i.test(text);
}

async function projectTagActive(client) {
  try {
    let token;
    do {
      const page = await client.send(
        new ListCostAllocationTagsCommand({
          Status: "Active",
          TagKeys: ["Project"],
          MaxResults: 100,
          NextToken: token,
        }),
      );
      const active = (page.CostAllocationTags || []).some(
        (tag) => tag.TagKey === "Project" && tag.Status === "Active",
      );
      if (active) return true;
      token = page.NextToken;
    } while (token);
    return false;
  } catch (err) {
    if (accessDenied(err)) return false;
    throw err;
  }
}

async function loadDaily(client, filter, now) {
  const range = dailyRange(now);
  try {
    return await usage(client, filter, range, "DAILY");
  } catch (err) {
    if (!isRangeError(err)) throw err;
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const shorter = {
      start: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      end: range.end,
    };
    return usage(client, filter, shorter, "DAILY");
  }
}

async function collect(client, accountId, project, now) {
  const names = await dimensionValues(client, now, "SERVICE");
  const usageTypes = await dimensionValues(client, now, "USAGE_TYPE");
  let choice = buildFilter({
    accountId,
    project,
    tagActive: await projectTagActive(client),
    serviceNames: names,
    usageTypeNames: usageTypes,
  });
  if (!choice.filter) {
    return {
      scope: "unavailable",
      hourBasis: "none",
      costs: { hour: 0, day: 0, week: 0, month: 0, year: 0 },
      hours: [],
    };
  }
  let daily;
  try {
    daily = await loadDaily(client, choice.filter, now);
  } catch (err) {
    if (choice.scope !== "tag" || !isTagError(err)) throw err;
    choice = buildFilter({
      accountId,
      project,
      tagActive: false,
      serviceNames: names,
      usageTypeNames: usageTypes,
    });
    if (!choice.filter) throw err;
    daily = await loadDaily(client, choice.filter, now);
  }
  const periods = periodCosts(daily, now);
  let hour = null;
  let hours = [];
  let hourBasis = "day-divided-by-24";
  try {
    const rows = await usage(client, choice.filter, hourlyRange(now), "HOURLY");
    hours = selectableHours(rows, now);
    hour = latestCompleteHour(rows, now);
    if (hour != null) hourBasis = "cost-explorer-hour";
  } catch (err) {
    if (!isHourlyDisabled(err)) throw err;
  }
  if (hour == null) {
    hour = roundUsd(periods.day / 24);
    hours = [
      {
        start: new Date(hourFloor(now).getTime() - 60 * 60 * 1000),
        value: hour,
      },
    ];
  }
  return {
    scope: choice.scope,
    hourBasis,
    costs: {
      hour: roundUsd(hour),
      day: periods.day,
      week: periods.week,
      month: periods.month,
      year: periods.year,
    },
    hours,
  };
}

function datum(name, dimensions, timestamp, value) {
  return {
    MetricName: name,
    Dimensions: dimensions,
    Timestamp: timestamp,
    Value: roundUsd(value),
    Unit: "None",
  };
}

function snapshotDatums(costs, project, now) {
  const dimensions = (period) => [
    { Name: "Project", Value: project },
    { Name: "Period", Value: period },
  ];
  return PERIODS.map((period) =>
    datum(
      "CostUsd",
      dimensions(period),
      now,
      costs[period.toLowerCase()],
    ),
  );
}

function historyDatums(hours, project, now) {
  const earliest = hourFloor(now).getTime() - 13 * 24 * 60 * 60 * 1000;
  return (hours || [])
    .filter((point) => point.start && point.start.getTime() >= earliest)
    .map((point) =>
      datum(
        "HourlyCostUsd",
        [{ Name: "Project", Value: project }],
        point.start,
        point.value,
      ),
    );
}

async function putAll(client, namespace, data) {
  for (let index = 0; index < data.length; index += 150) {
    if (!data.slice(index, index + 150).length) continue;
    await client.send(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: data.slice(index, index + 150),
      }),
    );
  }
}

async function readCache(client, name) {
  try {
    const out = await client.send(new GetParameterCommand({ Name: name }));
    const parsed = JSON.parse(out.Parameter && out.Parameter.Value);
    if (!parsed || parsed.schema !== CACHE_SCHEMA || !parsed.costs || !parsed.updatedAt) {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err && err.name === "ParameterNotFound") return null;
    throw err;
  }
}

async function writeCache(client, name, cache) {
  await client.send(
    new PutParameterCommand({
      Name: name,
      Type: "String",
      Overwrite: true,
      Value: JSON.stringify(cache),
    }),
  );
}

exports.handler = async () => {
  const project = requiredEnv("PROJECT_TAG");
  const accountId = requiredEnv("ACCOUNT_ID");
  const namespace = requiredEnv("METRIC_NAMESPACE");
  const parameterName = requiredEnv("PARAMETER_NAME");
  const now = new Date();
  const ce = new CostExplorerClient({ region: "us-east-1" });
  const cw = new CloudWatchClient({});
  const ssm = new SSMClient({});
  let cache = await readCache(ssm, parameterName);
  let refreshed = false;
  let hours = [];
  if (!cache || needsRefresh(cache.updatedAt, now, CACHE_MAX_AGE_MS)) {
    const collected = await collect(ce, accountId, project, now);
    cache = {
      schema: CACHE_SCHEMA,
      updatedAt: now.toISOString(),
      scope: collected.scope,
      hourBasis: collected.hourBasis,
      costs: collected.costs,
    };
    hours = collected.hours;
    await writeCache(ssm, parameterName, cache);
    refreshed = true;
  }
  const data = snapshotDatums(cache.costs, project, now);
  if (refreshed) data.push(...historyDatums(hours, project, now));
  await putAll(cw, namespace, data);
  const summary = {
    refreshed,
    scope: cache.scope,
    hourBasis: cache.hourBasis,
    costs: cache.costs,
  };
  console.log(JSON.stringify(summary));
  return summary;
};
