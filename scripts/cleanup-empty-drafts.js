"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path");
const { emptyDraftIds } = require("../lib/cleanup");
(async () => {
  try {
    process.loadEnvFile();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const dir = path.resolve(process.env.VIRTUSP_DATA_DIR || "data");
  const statePath = path.join(dir, "state.json");
  const snapshot = await fs.readFile(statePath, "utf8");
  const ids = emptyDraftIds(JSON.parse(snapshot));
  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify({ emptyDraftCount: ids.length, ids, dryRun: true }),
    );
    return;
  }
  // Run while the app is stopped, so an active in-memory state cannot overwrite cleanup.
  const net = require("node:net");
  const running = await new Promise((resolve) => {
    const socket = net.connect({
      host: "127.0.0.1",
      port: Number(process.env.PORT || 3000),
    });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (running) throw new Error("Stop the local app before applying cleanup.");
  const backup = path.resolve(
    "tmp",
    "empty-draft-backup-" + Date.now() + ".json",
  );
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, snapshot, { flag: "wx" });
  const store = await new (require("../lib/store").Store)(dir).init();
  const eligible = new Set(emptyDraftIds(store.state));
  const removed = ids.filter((id) => eligible.has(id));
  removed.forEach((id) => delete store.state.drafts[id]);
  await store.save();
  await store.flush();
  console.log(
    JSON.stringify({
      removed: removed.length,
      backup,
      cloud: store.sync.status,
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
