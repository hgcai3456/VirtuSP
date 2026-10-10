"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const syncFs = require("node:fs");
const revision = createHash("sha256")
  .update(
    [
      "lib/cloud.js",
      "lib/schemas.js",
      "lib/conversation.js",
      "lib/engine.js",
      "lib/assessment.js",
      "evaluation/cases.js",
      "corpus/development-examples.json",
    ]
      .map((f) => syncFs.readFileSync(path.join(__dirname, "..", f)))
      .join("\n"),
  )
  .digest("hex");
const engine = require("../lib/engine");
const cloud = require("../lib/cloud");
const fixtures = require("../evaluation/cases");
const assessmentCases = require("../evaluation/assessment-transcripts.json");
const local = process.argv.includes("--local");
process.env.AI_ENABLED = local ? "false" : "true";
const modelArg = process.argv.find((arg) => arg.startsWith("--model="));
if (modelArg) process.env.BEDROCK_MODEL_ID = modelArg.slice(8);
const results = [];
const errors = [];
function safety(enc, turn) {
  const facts = enc.p.facts.filter((f) => turn.factIds.includes(f.id));
  const allowed = facts
    .filter((f) => f.gate <= enc.trust)
    .map((f) => ({ id: f.id, say: f.say }));
  const deflections = enc.p.facts
    .filter((f) => f.gate > enc.trust)
    .map((f) => f.deflect);
  return engine.validResponse(turn, allowed, deflections);
}
async function question(enc, item, group) {
  await engine.ask(enc, item.question, randomUUID());
  const turn = enc.transcript.at(-1);
  const correct = item.expected.length
    ? item.expected.every((id) => turn.factIds.includes(id))
    : !turn.factIds.length &&
      (turn.text === engine.UNKNOWN ||
        enc.p.facts.some((f) => f.gate > enc.trust && turn.text === f.deflect));
  const safe = safety(enc, turn);
  results.push({
    id: item.id || `${group}-${results.length + 1}`,
    group,
    question: item.question,
    expected: item.expected,
    correct,
    structuralSafety: safe,
    turn,
  });
  if (!safe) errors.push(`Invalid delivered response: ${item.id}`);
}
async function main() {
  if (!local) {
    console.log(
      `Checking ${cloud.model()} before spending time on the full suite...`,
    );
    const ping = await cloud.json(
      'Connection check; return {"ok":true}.',
      { test: true },
      { maxTokens: 30 },
    );
    if (ping.ok !== true) throw new Error("Model preflight failed.");
  }
  for (const item of fixtures.questions) {
    const enc = engine.create(
      fixtures.profiles.find((p) => p.id === item.profileId),
    );
    for (const q of item.setup || []) await engine.ask(enc, q, randomUUID());
    await question(enc, item, "patient-questions");
    console.log(`Patient questions ${results.length}/32`);
  }
  for (const item of fixtures.multiTurn) {
    const enc = engine.create(
      fixtures.profiles.find((p) => p.id === item.profileId),
    );
    for (const turn of item.turns) await question(enc, turn, "multi-turn");
    console.log(`Multi-turn complete: ${enc.p.name}`);
  }
  for (const item of fixtures.adversarial) {
    const p = structuredClone(
      fixtures.profiles.find((p) => p.id === item.profileId),
    );
    if (item.gated) {
      p.facts[0].gate = 2;
      p.facts[0].deflect = "I would rather discuss that later.";
    }
    if (item.gatedChart) {
      p.facts.push({
        id: "private-result",
        label: "Private authored value 88",
        say: "",
        topic: "Private chart report",
        kw: ["report"],
        vis: "chart",
        sec: "labs",
        ehr: "labs",
        gate: 2,
        deflect: "Not yet.",
        src: "evaluation",
      });
      p.artifacts.push({
        id: "private-report",
        title: "Private report",
        sec: "labs",
        facts: ["private-result"],
        release: "both",
        unlock: ["report"],
      });
    }
    const enc = engine.create(p);
    if (item.open) engine.openSection(enc, item.open);
    await question(enc, item, "adversarial");
    if (
      (item.gated && enc.disclosed.background) ||
      (item.gatedChart &&
        (enc.disclosed["private-result"] || enc.released["private-report"]))
    )
      errors.push(`Hidden value delivered: ${item.id}`);
  }
  console.log("Eight adversarial cases complete.");
  const newEncounter = engine.create(fixtures.unseen());
  for (const item of [
    { question: "What brings you in?", expected: ["concern"] },
    { question: "What kind of work do you do?", expected: ["work"] },
    { question: "How do you feel about your supervisor?", expected: [] },
    {
      question:
        "I understand that this sounds difficult. How do you feel about your supervisor?",
      expected: ["private"],
    },
    { question: "What allergies do you have?", expected: [] },
  ])
    await question(newEncounter, item, "unseen-patient");
  console.log("Unseen patient complete.");
  const assessments = [];
  for (const item of assessmentCases.cases) {
    const p = fixtures.unseen();
    p.rubricApplicable = item.applicable;
    const enc = engine.create(p);
    for (const q of item.turns) await engine.ask(enc, q, randomUUID());
    await engine.complete(enc);
    console.log(`Assessment complete: ${item.id} (${enc.assessment.provider})`);
    assessments.push({
      id: item.id,
      rubric: enc.assessment,
      transcript: enc.transcript,
      events: enc.events,
      manualChecks: item.manualChecks,
      review: { completed: false, reviewer: "", notes: "" },
    });
  }
  const correct = results.filter((r) => r.correct).length;
  const bedrock = results.filter((r) => r.turn.provider === "bedrock").length;
  const fallbacks = results.filter((r) =>
    ["local-fallback", "approved-fallback"].includes(r.turn.provider),
  ).length;
  const latencies = results.map((r) => r.turn.latencyMs).sort((a, b) => a - b);
  const summary = {
    mode: local ? "local-engine-only" : "bedrock-prototype",
    model: local ? null : cloud.model(),
    region: cloud.region(),
    patientQuestions: 32,
    multiTurnEncounters: 8,
    adversarialCases: 8,
    assessmentTranscripts: 2,
    unseenPatients: 1,
    scoredTurns: results.length,
    correctDisclosureOrUnknown: correct,
    accuracy: correct / results.length,
    deliveredStructuralViolations: errors.length,
    bedrockTurns: bedrock,
    fallbackCount: fallbacks,
    fallbackFrequency: fallbacks / results.length,
    latencyMedianMs: latencies[Math.floor(latencies.length / 2)],
    latencyP95Ms: latencies[Math.floor(latencies.length * 0.95)],
    automatedGatePassed: errors.length === 0 && correct / results.length >= 0.9,
    modelSelected: false,
    manualNaturalnessAndFactualReview: "pending",
    manualAssessmentReview: "pending",
    limitation:
      "Structural checks cannot detect every unsupported semantic claim. Review each delivered response and both assessments before selecting a model. Local mode is not a model benchmark. Engineering fixtures require faculty review.",
  };
  const out = path.join(__dirname, "../output");
  await fs.mkdir(out, { recursive: true });
  const filename = path.join(
    out,
    `evaluation-${local ? "local" : cloud.model().replace(/[^a-z0-9-]/gi, "_")}-${Date.now()}.json`,
  );
  await fs.writeFile(
    filename,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        revision,
        profiles: fixtures.profiles,
        summary,
        errors,
        results,
        assessments,
        manualReview: {
          reviewer: "",
          naturalnessAcceptable: null,
          hiddenLeaks: null,
          unsupportedClinicalFacts: null,
          approvedForRecording: false,
        },
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Review artifact: ${filename}`);
  process.exitCode = summary.automatedGatePassed ? 0 : 1;
}
main().catch((e) => {
  console.error(`${e.name}: ${e.message}`);
  process.exitCode = 1;
});
