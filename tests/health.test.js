"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");
const { openDb } = require("../lib/db");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "virtusp-health-"));

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: urlPath },
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
  });
}

test("liveness stays up and readiness follows the ground-truth database", async (t) => {
  const dbPath = path.join(dir, "health.sqlite");
  const db = openDb(dbPath);
  const app = await createApp({ dataDir: dir, db });
  const server = app.server;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      db.close();
    } catch {
      // The failure case already closed it.
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const live = await request(port, "/api/live");
  assert.equal(live.status, 200);
  assert.deepEqual(JSON.parse(live.body), { ok: true });
  assert.equal(live.headers["cache-control"], "no-store");

  const timeout = db.prepare("PRAGMA busy_timeout").get().timeout;
  const ready = await request(port, "/api/ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(JSON.parse(ready.body), {
    ok: true,
    checks: { database: "up" },
  });
  assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, timeout);

  const health = await request(port, "/api/health");
  const body = JSON.parse(health.body);
  assert.equal(health.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.checks.database, "up");
  assert.equal(typeof body.journals, "number");
  assert.equal(typeof body.medical_data, "number");
  assert.equal(typeof body.dialogue, "string");
  assert.equal(health.headers["cache-control"], "no-store");

  db.close();
  const down = await request(port, "/api/ready");
  assert.equal(down.status, 503);
  assert.deepEqual(JSON.parse(down.body), {
    ok: false,
    checks: { database: "down" },
  });
  assert.doesNotMatch(down.body, /health\.sqlite|SQLITE/);

  const status = await request(port, "/api/health");
  const failed = JSON.parse(status.body);
  assert.equal(status.status, 503);
  assert.equal(failed.ok, false);
  assert.equal(failed.checks.database, "down");
  assert.equal(failed.journals, undefined);
  assert.equal(typeof failed.dialogue, "string");
  assert.doesNotMatch(status.body, /health\.sqlite|SQLITE/);

  const stillLive = await request(port, "/api/live");
  assert.equal(stillLive.status, 200);
  assert.deepEqual(JSON.parse(stillLive.body), { ok: true });
});
