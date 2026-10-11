"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { OPERATIONS } = require("../../pacts/endpoints");

const root = path.resolve(__dirname, "../..");

function routeNames() {
  const http = fs.readFileSync(path.join(root, "lib", "http.js"), "utf8");
  const names = new Set();
  for (const match of http.matchAll(/parts\[1\] === "([^"]+)"/g)) names.add(match[1]);
  const block = http.match(/groundTruthRoutes = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(block, "ground-truth route set is present");
  for (const match of block[1].matchAll(/"([^"]+)"/g)) names.add(match[1]);
  return [...names];
}

test("every API route family has a Pact operation", () => {
  const ids = OPERATIONS.map((operation) => operation.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of routeNames()) {
    assert.ok(
      OPERATIONS.some((operation) => operation.id.includes(`/api/${name}`)),
      `missing Pact coverage for /api/${name}`,
    );
  }
  assert.ok(OPERATIONS.some((operation) => operation.id === "OPTIONS /api/health"));
  assert.ok(OPERATIONS.some((operation) => operation.direct && operation.id.includes("avatar/events")));
});
