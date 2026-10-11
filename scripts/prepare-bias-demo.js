"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { BEHAVIORS, client, replay } = require("../lib/demo-replay");
const cloud = require("../lib/cloud");
async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const base = value("--url", "http://localhost:3000");
  const target = new URL(base);
  if (!["localhost", "127.0.0.1"].includes(target.hostname))
    throw new Error("Use a local app URL for demo preparation.");
  const faculty = client(base);
  await faculty("/api/session", "POST", { role: "faculty" });
  const groupId = value("--group");
  const profileId = value("--profile");
  if (!!groupId === !!profileId)
    throw new Error("Specify either --profile PATIENT_ID or --group GROUP_ID.");
  const turns = Number(value("--turns", "6"));
  const behavior = value("--behavior", "balanced");
  if (
    !BEHAVIORS[behavior] ||
    !Number.isInteger(turns) ||
    turns < 4 ||
    turns > 8
  )
    throw new Error(
      "Behavior: balanced, anchoring or stereotyping. Turns: 4–8.",
    );
  let selection;
  if (groupId) {
    const group = (await faculty("/api/groups")).groups.find(
      (g) => g.id === groupId,
    );
    if (!group || group.preparationStatus !== "ready")
      throw new Error("Group must exist and be ready before replay.");
    if (group.trialCount > 5)
      throw new Error("Demo preparation is limited to five trials.");
    selection = { groupId, trialCount: group.trialCount };
  } else {
    const detail = await faculty(`/api/profiles/${encodeURIComponent(profileId)}`);
    const version = Math.max(0, ...detail.versions.map((v) => v.version));
    if (!version || detail.profile.comparisonOnly)
      throw new Error(
        "Select a published patient ID from the faculty catalog.",
      );
    selection = { profileId, version, trialCount: 1 };
  }
  console.log(
    JSON.stringify({
      selection,
      behavior,
      turns,
      maxLearnerCalls: selection.trialCount * turns,
      patientAndAssessmentCallsAdditional: true,
      createsLabeledDemoAlias: true,
    }),
  );
  if (!args.includes("--run")) {
    console.log(
      "Preview only. Add --run to create real AI-to-AI encounters; existing human results are untouched.",
    );
    return;
  }
  if (!cloud.enabled())
    throw new Error("Set AI_ENABLED=true in .env before real generation.");
  const health = await faculty("/api/health");
  if (health.dialogue !== cloud.provider() + "-configured" || health.model !== cloud.model())
    throw new Error("The running server and replay must use the same enabled provider/model. Restart the server after changing .env.");
  const out = path.resolve(
    value("--manifest", `output/bias-demo-${Date.now()}.json`),
  );
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(out, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (
    manifest &&
    (manifest.base !== base ||
      manifest.behavior !== behavior ||
      manifest.turns !== turns ||
      JSON.stringify(manifest.selection) !== JSON.stringify(selection))
  )
    throw new Error(
      "Manifest belongs to a different target, behavior, turn limit or server.",
    );
  manifest ||= {
    base,
    selection,
    behavior,
    turns,
    runId: randomUUID().slice(0, 8),
    source: "AI-to-AI educational demo, not a human learner",
    createdAt: new Date().toISOString(),
  };
  const save = async () => {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out + ".tmp", JSON.stringify(manifest, null, 2));
    await fs.rename(out + ".tmp", out);
  };
  await save();
  console.log(`Recovery manifest: ${out}`);
  const result = await replay({
    faculty,
    student: client(base),
    selection,
    behavior,
    turns,
    runId: manifest.runId,
    manifest,
    save,
    progress: console.log,
  });
  console.log(
    JSON.stringify({
      alias: `AI demo · ${behavior} · ${manifest.runId}`,
      target: manifest.target,
      biasStatus: result.status,
      ratings: result.rubricAssessment?.evaluations.map((v) => ({
        encounterId: v.encounterId,
        category: v.categoryId,
        score: v.score,
      })),
      limitations: result.limitations,
    }),
  );
  if (result.status !== "complete") process.exitCode = 1;
}
main().catch((e) => {
  console.error("Demo preparation stopped: " + e.message);
  process.exitCode = 1;
});
