"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFilter,
  dailyRange,
  hourlyRange,
  isHourlyDisabled,
  isTagError,
  latestCompleteHour,
  needsRefresh,
  periodCosts,
  roundUsd,
  selectableHours,
} = require("../infra/aws/cost/windows");

function row(start, end, dollars) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { UnblendedCost: { Amount: String(dollars), Unit: "USD" } },
  };
}

test("period costs use complete days, month to date, and year to date", () => {
  const now = new Date("2026-10-10T15:30:00Z");
  const rows = [
    row("2025-12-31", "2026-01-01", 9),
    row("2026-01-02", "2026-01-03", 4),
    row("2026-10-03", "2026-10-04", 1),
    row("2026-10-04", "2026-10-05", 1),
    row("2026-10-05", "2026-10-06", 1),
    row("2026-10-06", "2026-10-07", 1),
    row("2026-10-07", "2026-10-08", 1),
    row("2026-10-08", "2026-10-09", 1),
    row("2026-10-09", "2026-10-10", 2),
    row("2026-10-10", "2026-10-11", 0.5),
  ];
  const costs = periodCosts(rows, now);
  assert.equal(costs.day, 2);
  assert.equal(costs.week, 8);
  assert.equal(costs.month, 8.5);
  assert.equal(costs.year, 12.5);
});

test("a short history sums the complete days that exist", () => {
  const now = new Date("2026-10-10T01:00:00Z");
  const costs = periodCosts(
    [row("2026-10-09", "2026-10-10", 3), row("2026-10-10", "2026-10-11", 1)],
    now,
  );
  assert.equal(costs.day, 3);
  assert.equal(costs.week, 3);
  assert.equal(costs.month, 4);
});

test("duplicate days are counted once", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const costs = periodCosts(
    [
      row("2026-10-09", "2026-10-10", 2),
      row("2026-10-09", "2026-10-10", 9),
    ],
    now,
  );
  assert.equal(costs.day, 9);
  assert.equal(costs.week, 9);
});

test("the latest complete hour ignores the hour still in progress", () => {
  const now = new Date("2026-10-10T15:45:00Z");
  const rows = [
    row("2026-10-10T13:00:00Z", "2026-10-10T14:00:00Z", 0.2),
    row("2026-10-10T14:00:00Z", "2026-10-10T15:00:00Z", 0.4),
    row("2026-10-10T15:00:00Z", "2026-10-10T16:00:00Z", 9),
  ];
  assert.equal(latestCompleteHour(rows, now), 0.4);
  const points = selectableHours(rows, now);
  assert.equal(points.length, 2);
  assert.equal(points[1].value, 0.4);
});

test("an empty hour series has no latest hour", () => {
  assert.equal(latestCompleteHour([], new Date("2026-10-10T15:00:00Z")), null);
});

test("ranges cover the calendar year and stop at the current hour", () => {
  const now = new Date("2026-10-10T15:40:00Z");
  assert.deepEqual(dailyRange(now), {
    start: "2026-01-01",
    end: "2026-10-11",
  });
  assert.deepEqual(hourlyRange(now), {
    start: "2026-09-27T15:00:00Z",
    end: "2026-10-10T15:00:00Z",
  });
});

test("the first week of January still includes the previous days", () => {
  const range = dailyRange(new Date("2026-01-03T08:00:00Z"));
  assert.equal(range.start, "2025-12-26");
  assert.equal(range.end, "2026-01-04");
});

test("tag filter includes Bedrock, and the service filter uses stack names only", () => {
  const tagged = buildFilter({
    accountId: "389023343021",
    project: "virtusp",
    tagActive: true,
    serviceNames: ["Amazon Bedrock", "Amazon Elastic Compute Cloud"],
  });
  assert.equal(tagged.scope, "tag");
  assert.deepEqual(tagged.filter.And[1].Or[1].Dimensions.Values, [
    "Amazon Bedrock",
  ]);

  const services = buildFilter({
    accountId: "389023343021",
    project: "virtusp",
    tagActive: false,
    serviceNames: [
      "Amazon Elastic Container Service",
      "Amazon Elastic Compute Cloud",
      "Amazon Bedrock",
    ],
  });
  assert.equal(services.scope, "services");
  assert.deepEqual(services.filter.And[1].Dimensions.Values, [
    "Amazon Elastic Container Service",
    "Amazon Bedrock",
  ]);

  const none = buildFilter({
    accountId: "389023343021",
    project: "virtusp",
    tagActive: false,
    serviceNames: ["Amazon Elastic Compute Cloud"],
  });
  assert.equal(none.scope, "unavailable");
  assert.equal(none.filter, null);
});

test("Cost Explorer errors are classified for fallback", () => {
  assert.equal(
    isTagError(new Error("Tag key Project is not a valid tag key")),
    true,
  );
  assert.equal(isTagError(new Error("Access denied")), false);
  assert.equal(
    isHourlyDisabled(
      new Error("Hourly data granularity is an opt-in only feature"),
    ),
    true,
  );
  assert.equal(isHourlyDisabled(new Error("Access denied")), false);
});

test("the cache refreshes after 55 minutes", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(
    needsRefresh("2026-10-10T11:30:00Z", now),
    false,
  );
  assert.equal(needsRefresh("2026-10-10T11:04:00Z", now), true);
  assert.equal(needsRefresh("not-a-date", now), true);
});

test("currency is rounded to six decimal places", () => {
  assert.equal(roundUsd(1.23456789), 1.234568);
  assert.equal(roundUsd("nope"), 0);
});
