"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-origin-"));

function request(port, method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path: urlPath,
        headers: headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("session accepts the site host and rejects a foreign origin", async (t) => {
  const app = await createApp({ dataDir: dir });
  const server = app.server;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const local = await request(port, "POST", "/api/session", {
    Host: "127.0.0.1:" + port,
    Origin: "http://127.0.0.1:" + port,
    "Content-Type": "application/json",
  }, JSON.stringify({ role: "faculty" }));
  assert.equal(local.status, 200);
  assert.equal(JSON.parse(local.body).session.role, "faculty");
  assert.match(local.headers["set-cookie"][0], /virtusp_demo=/);

  const sameHost = await request(port, "POST", "/api/session", {
    Host: "d18g7r2mfy8mll.cloudfront.net",
    Origin: "https://d18g7r2mfy8mll.cloudfront.net",
    "Content-Type": "application/json",
  }, JSON.stringify({ role: "faculty" }));
  assert.equal(sameHost.status, 200);
  assert.equal(JSON.parse(sameHost.body).session.role, "faculty");

  const forwarded = await request(port, "GET", "/api/session", {
    Host: "virtusp-alb.elb.amazonaws.com",
    "X-Forwarded-Host": "d18g7r2mfy8mll.cloudfront.net",
    Origin: "https://d18g7r2mfy8mll.cloudfront.net",
  });
  assert.equal(forwarded.status, 200);

  const foreign = await request(port, "POST", "/api/session", {
    Host: "d18g7r2mfy8mll.cloudfront.net",
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  }, JSON.stringify({ role: "faculty" }));
  assert.equal(foreign.status, 403);
  assert.match(foreign.body, /Cross-origin requests are not allowed/);

  const preflight = await request(port, "OPTIONS", "/api/session", {
    Host: "d18g7r2mfy8mll.cloudfront.net",
    Origin: "https://d18g7r2mfy8mll.cloudfront.net",
    "Access-Control-Request-Method": "POST",
  });
  assert.equal(preflight.status, 204);

  const foreignPreflight = await request(port, "OPTIONS", "/api/session", {
    Host: "d18g7r2mfy8mll.cloudfront.net",
    Origin: "https://evil.example",
  });
  assert.equal(foreignPreflight.status, 403);
});
