"use strict";
const fs = require("node:fs/promises"), path = require("node:path");
const { mergeBundle } = require("../lib/shared-demo");
async function main() {
  try { process.loadEnvFile(); } catch(e) { if(e.code !== "ENOENT") throw e; }
  const arg = process.argv.slice(2);
  if (arg.length && !(arg.length === 2 && arg[0] === "--data-dir")) throw new Error("Usage: npm run demo:sync -- [--data-dir directory]");
  const dir = path.resolve(arg[1] || process.env.VIRTUSP_DATA_DIR || "data");
  // An offline merge must not race the running app's JSON writer.
  try {
    const response = await fetch(`http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}/api/health`, {signal:AbortSignal.timeout(700)});
    if (response.ok) throw Object.assign(new Error("Stop node server.js before syncing demo cases, then start it again."), {running:true});
  } catch(e) { if(e.running) throw e; }
  const target = path.join(dir,"state.json");
  const original = await fs.readFile(target,"utf8").catch(e => { if(e.code === "ENOENT") throw new Error("Run npm start once to create the local store, then stop it and retry."); throw e; });
  const result = mergeBundle(JSON.parse(original), require("../corpus/shared-demo.json"));
  const backup = path.join(dir,`state.before-demo-sync-${Date.now()}.json`);
  await fs.writeFile(backup, original, {flag:"wx"});
  const temporary = path.join(dir,`state.demo-sync-${Date.now()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(result.state,null,2));
  await fs.rename(temporary,target);
  console.log(JSON.stringify({backup, ...result.report},null,2));
  console.log("Synthetic cases synced. Existing attempts, histories, identities and older releases are preserved. Restart npm start.");
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode=1; });
