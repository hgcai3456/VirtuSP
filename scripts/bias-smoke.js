"use strict";
// Scripted synthetic transcripts, real assessment calls; no active encounters changed.
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises"),
  path = require("node:path");
const engine = require("../lib/engine"),
  bias = require("../lib/bias");
const seeds = require("../corpus/prepared-groups.json");
function recorded(profile, weak) {
  const enc = engine.create({ ...structuredClone(profile), version: 1 });
  enc.status = "complete";
  const questions = weak
    ? [
        "People of your ethnicity never take medication properly, do they?",
        "Since you don't want medicine, this must be anxiety. There's no reason to consider any other explanation.",
        "You just need to do what I tell you. Do you agree?",
      ]
    : [
        "Hello, I'm a medical student. What concerns would you like us to address today?",
        "Thank you for explaining. What concerns you about taking medicine?",
        "Are there practical barriers, such as cost or access, that you would like us to discuss?",
        "I'd like to understand your preferences before we decide on next steps. What would help you make a decision?",
      ];
  for (const text of questions) {
    const v = engine.event(enc, "student", { text });
    enc.transcript.push({ id: v.id, role: "student", text });
    const fact = profile.facts.find((f) => f.id === "concern");
    const p = engine.event(enc, "patient", { text: fact.say });
    enc.transcript.push({
      id: p.id,
      role: "patient",
      text: fact.say,
      provider: "approved-script",
      factIds: [fact.id],
    });
  }
  return {
    id: enc.id,
    status: enc.status,
    profile: enc.p,
    events: enc.events,
    transcript: enc.transcript,
  };
}
async function main() {
  if (process.env.AI_ENABLED !== "true")
    throw new Error("Configure AI_ENABLED=true for real Bedrock verification.");
  const strong = recorded(seeds.profiles[0], false),
    weak = recorded(seeds.profiles[1], true);
  const contexts = [strong, weak].map((e) => ({
    targetType: "encounter",
    targetId: e.id,
    group: null,
    attempt: null,
    encounters: [e],
  }));
  contexts.push({
    targetType: "attempt",
    targetId: "scripted-bias-comparison",
    group: { ...seeds.groups[0], kind: "comparison" },
    attempt: {
      status: "complete",
      trials: [strong, weak].map((e) => ({ encounterId: e.id })),
    },
    encounters: [strong, weak],
  });
  const output = [];
  const groupOnly = process.argv.includes("--group-only");
  for (let i = groupOnly ? 2 : 0; i < contexts.length; i++) {
    const at = Date.now(),
      result = await bias.analyze(contexts[i]);
    output.push({
      scenario: ["stronger individual", "weaker individual", "matched group"][
        i
      ],
      context: contexts[i],
      result,
      latencyMs: Date.now() - at,
    });
    console.log(
      JSON.stringify({
        scenario: output.at(-1).scenario,
        status: result.status,
        latencyMs: output.at(-1).latencyMs,
        ratings: result.rubricAssessment?.evaluations.map((v) => ({
          category: v.categoryId,
          score: v.score,
        })),
        indicators: result.findings.length,
        comparisonControlled: result.rubricAssessment?.comparisonControlled,
        limitations:
          result.status === "unavailable" ? result.limitations : undefined,
      }),
    );
  }
  await fs.mkdir(path.join(__dirname, "../output"), { recursive: true });
  await fs.writeFile(
    path.join(
      __dirname,
      groupOnly
        ? "../output/bias-group-smoke.json"
        : "../output/bias-smoke.json",
    ),
    JSON.stringify(output, null, 2),
  );
  if (
    output.some(
      (v) =>
        v.result.status !== "complete" ||
        (v.context.targetType === "attempt" &&
          !v.result.rubricAssessment?.comparisonControlled),
    )
  )
    process.exitCode = 1;
}
main().catch((e) => {
  console.error("Bias verification failed: " + e.name);
  process.exitCode = 1;
});
