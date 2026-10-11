"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MatchersV3, PactV4 } = require("@pact-foundation/pact");
const { OPERATIONS } = require("../../pacts/endpoints");

const root = path.resolve(__dirname, "../..");
const pactDir = path.join(root, "pacts");
const { string, integer, boolean, eachLike, fromProviderState } = MatchersV3;

function expand(value) {
  if (Array.isArray(value)) return value.map((item) => expand(item));
  if (!value || typeof value !== "object" || !value.$) {
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = expand(item);
      return out;
    }
    return value;
  }
  if (value.$ === "string") return string(value.example);
  if (value.$ === "int") return integer(value.example);
  if (value.$ === "bool") return boolean(value.example);
  if (value.$ === "state") return fromProviderState(value.expression, value.example);
  if (value.$ === "each") return eachLike(expand(value.example), value.min);
  throw new Error("Unknown matcher " + value.$);
}

function example(value) {
  if (Array.isArray(value)) return value.map((item) => example(item));
  if (!value || typeof value !== "object" || !value.$) {
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = example(item);
      return out;
    }
    return value;
  }
  if (value.$ === "each") return [];
  if (value.$ === "null") return null;
  return value.example;
}

function requestHeaders(operation) {
  const headers = {};
  if (operation.body !== undefined) headers["Content-Type"] = "application/json";
  if (operation.cookie) headers.Cookie = fromProviderState("${cookie}", "virtusp_demo=faculty-example");
  return headers;
}

function exampleHeaders(operation) {
  const headers = {};
  if (operation.body !== undefined) headers["Content-Type"] = "application/json";
  if (operation.cookie) headers.Cookie = "virtusp_demo=faculty-example";
  return headers;
}

function exampleUrl(operation) {
  const target = new URL(example(operation.path), "http://127.0.0.1");
  for (const [key, value] of Object.entries(operation.query || {})) {
    target.searchParams.set(key, String(example(value)));
  }
  return target.pathname + target.search;
}

async function record(pact, operation) {
  let interaction = pact.addInteraction();
  if (operation.state) interaction = interaction.given(operation.state);
  interaction = interaction.uponReceiving(operation.id).withRequest(operation.method, expand(operation.path), (builder) => {
    const headers = requestHeaders(operation);
    if (Object.keys(headers).length) builder.headers(headers);
    if (operation.query) builder.query(expand(operation.query));
    if (operation.body !== undefined) builder.jsonBody(expand(operation.body));
  });
  await interaction
    .willRespondWith(operation.status, (builder) => {
      if (operation.binary) {
        const type = operation.binary.contentType;
        builder.headers({ "Content-Type": type });
        const bytes = operation.binary.text
          ? Buffer.from(operation.binary.text)
          : fs.readFileSync(path.join(root, operation.binary.file));
        builder.body(type, bytes);
        return;
      }
      if (operation.response !== undefined) {
        builder.headers({ "Content-Type": "application/json; charset=utf-8" });
        builder.jsonBody(expand(operation.response));
      }
    })
    .executeTest(async (mock) => {
      const response = await fetch(mock.url + exampleUrl(operation), {
        method: operation.method,
        headers: exampleHeaders(operation),
        body: operation.body !== undefined ? JSON.stringify(example(operation.body)) : undefined,
      });
      assert.equal(response.status, operation.status, operation.id);
      if (response.body) await response.body.cancel();
    });
}

test("consumer records a Pact interaction for every API operation", async () => {
  fs.mkdirSync(pactDir, { recursive: true });
  fs.rmSync(path.join(pactDir, "virtusp-web-virtusp-api.json"), { force: true });
  const pact = new PactV4({
    consumer: "virtusp-web",
    provider: "virtusp-api",
    dir: pactDir,
    logLevel: "warn",
    cors: false,
  });
  for (const operation of OPERATIONS) {
    if (operation.direct) continue;
    try {
      await record(pact, operation);
    } catch (error) {
      throw new Error(`${operation.id}: ${error.message}`);
    }
  }
  const written = JSON.parse(fs.readFileSync(path.join(pactDir, "virtusp-web-virtusp-api.json"), "utf8"));
  const descriptions = new Set((written.interactions || []).map((item) => item.description));
  for (const operation of OPERATIONS) {
    if (operation.direct) continue;
    assert.ok(descriptions.has(operation.id), operation.id);
  }
});
