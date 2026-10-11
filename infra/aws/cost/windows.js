"use strict";

// Period math for the AWS cost chart. Cost Explorer returns UnblendedCost
// as a string. These helpers never call AWS.

const STACK_SERVICES = Object.freeze([
  "Amazon Elastic Container Service",
  "Amazon Elastic Load Balancing",
  "Amazon Relational Database Service",
  "Amazon Elastic File System",
  "Amazon CloudFront",
  "Amazon Simple Storage Service",
  "Amazon CloudWatch",
  "Amazon EC2 Container Registry (ECR)",
  "Amazon Elastic Container Registry",
  "Amazon Virtual Private Cloud",
  "AWS Key Management Service",
  "AWS Secrets Manager",
  "AWS Cost Explorer",
  "AWS Lambda",
  "AWS CodeBuild",
  "Amazon Bedrock",
]);

const CACHE_MAX_AGE_MS = 55 * 60 * 1000;
const HOUR_HISTORY_MS = 13 * 24 * 60 * 60 * 1000;

function amount(row) {
  const raw =
    row &&
    row.Total &&
    row.Total.UnblendedCost &&
    row.Total.UnblendedCost.Amount;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function roundUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1e6) / 1e6;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoHour(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function utcMidnight(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDayMs(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function hourFloor(now) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  date.setUTCMilliseconds(0);
  return date;
}

function errorText(err) {
  if (!err) return "";
  return `${err.name || ""} ${err.message || err}`;
}

function isTagError(err) {
  const text = errorText(err);
  return (
    /tag/i.test(text) &&
    /(not (?:a )?valid|invalid|not active|inactive|cost allocation)/i.test(text)
  );
}

function isHourlyDisabled(err) {
  const text = errorText(err);
  return /hourly/i.test(text) || /opt-?in/i.test(text);
}

function isRangeError(err) {
  return /time range|date interval|granularity/i.test(errorText(err));
}

function isStackService(name) {
  return STACK_SERVICES.includes(name) || /bedrock/i.test(String(name));
}

function deduped(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row || !row.TimePeriod || !row.TimePeriod.Start) continue;
    map.set(row.TimePeriod.Start, row);
  }
  return [...map.values()].sort((a, b) =>
    a.TimePeriod.Start.localeCompare(b.TimePeriod.Start),
  );
}

function dailyRange(now) {
  const today = utcMidnight(now);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const weekFloor = new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000);
  const start = yearStart < weekFloor ? yearStart : weekFloor;
  const end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return { start: isoDate(start), end: isoDate(end) };
}

function hourlyRange(now) {
  const end = hourFloor(now);
  const start = new Date(end.getTime() - HOUR_HISTORY_MS);
  return { start: isoHour(start), end: isoHour(end) };
}

function periodCosts(rows, now) {
  const today = utcMidnight(now).getTime();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
  const unique = deduped(rows);
  const finished = unique.filter((row) => {
    const end = utcDayMs(row.TimePeriod.End);
    return end != null && end <= today;
  });
  const day = finished.length ? amount(finished[finished.length - 1]) : 0;
  const week = finished.slice(-7).reduce((sum, row) => sum + amount(row), 0);
  const inRange = (startMs, from) =>
    startMs != null && startMs >= from && startMs <= today;
  const month = unique.reduce((sum, row) => {
    return inRange(utcDayMs(row.TimePeriod.Start), monthStart)
      ? sum + amount(row)
      : sum;
  }, 0);
  const year = unique.reduce((sum, row) => {
    return inRange(utcDayMs(row.TimePeriod.Start), yearStart)
      ? sum + amount(row)
      : sum;
  }, 0);
  return {
    day: roundUsd(day),
    week: roundUsd(week),
    month: roundUsd(month),
    year: roundUsd(year),
  };
}

function selectableHours(rows, now) {
  const end = hourFloor(now);
  const earliest = end.getTime() - HOUR_HISTORY_MS;
  const unique = new Map();
  for (const row of rows || []) {
    if (!row || !row.TimePeriod || !row.TimePeriod.Start || !row.TimePeriod.End)
      continue;
    const start = new Date(row.TimePeriod.Start);
    const stop = new Date(row.TimePeriod.End);
    if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime())) continue;
    if (stop.getTime() > end.getTime() || start.getTime() < earliest) continue;
    unique.set(start.toISOString(), { start, value: roundUsd(amount(row)) });
  }
  return [...unique.values()].sort((a, b) => a.start - b.start);
}

function latestCompleteHour(rows, now) {
  const points = selectableHours(rows, now);
  if (!points.length) return null;
  return points[points.length - 1].value;
}

function buildFilter({ accountId, project, tagActive, serviceNames }) {
  const account = {
    Dimensions: { Key: "LINKED_ACCOUNT", Values: [accountId] },
  };
  const names = Array.isArray(serviceNames) ? serviceNames : [];
  const bedrock = [...new Set(names.filter((name) => /bedrock/i.test(name)))];
  if (tagActive) {
    const tag = { Tags: { Key: "Project", Values: [project] } };
    const scoped = bedrock.length
      ? { Or: [tag, { Dimensions: { Key: "SERVICE", Values: bedrock } }] }
      : tag;
    return { scope: "tag", filter: { And: [account, scoped] } };
  }
  const wanted = [...new Set(names.filter(isStackService))];
  if (!wanted.length) return { scope: "unavailable", filter: null };
  return {
    scope: "services",
    filter: {
      And: [
        account,
        { Dimensions: { Key: "SERVICE", Values: wanted } },
      ],
    },
  };
}

function needsRefresh(updatedAt, now, maxAgeMs = CACHE_MAX_AGE_MS) {
  const then = new Date(updatedAt);
  if (Number.isNaN(then.getTime())) return true;
  return now.getTime() - then.getTime() >= maxAgeMs;
}

module.exports = {
  STACK_SERVICES,
  CACHE_MAX_AGE_MS,
  amount,
  roundUsd,
  isoDate,
  isoHour,
  utcMidnight,
  hourFloor,
  isTagError,
  isHourlyDisabled,
  isRangeError,
  isStackService,
  dailyRange,
  hourlyRange,
  periodCosts,
  selectableHours,
  latestCompleteHour,
  buildFilter,
  needsRefresh,
};
