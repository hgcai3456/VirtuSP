"use strict";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const engine = require("../lib/engine"),
  fixtures = require("../evaluation/cases"),
  cases = require("../evaluation/assessment-transcripts.json");
async function main() {
  const from = process.argv.find((a) => a.startsWith("--from="))?.slice(7);
  if (!from)
    throw new Error(
      "Pass --from=output/evaluation-<model>-<timestamp>.json to reassess its two recorded reference transcripts.",
    );
  const source = JSON.parse(await fs.readFile(from, "utf8"));
  if (!Array.isArray(source.assessments) || source.assessments.length !== 2)
    throw new Error("Expected two recorded evaluation assessments.");
  process.env.AI_ENABLED = "true";
  process.env.BEDROCK_MODEL_ID =
    process.argv.find((a) => a.startsWith("--model="))?.slice(8) ||
    source.summary.model;
  const results = [];
  for (const saved of source.assessments) {
    const reference = cases.cases.find((c) => c.id === saved.id);
    if (!reference) throw new Error("Unknown reference transcript.");
    const p = fixtures.unseen();
    p.rubricApplicable = reference.applicable;
    const enc = engine.create(p);
    enc.events = saved.events;
    enc.transcript = saved.transcript;
    enc.status = "active";
    enc.disclosed = Object.fromEntries(
      enc.events
        .filter((e) => e.type === "disclose")
        .map((e) => [e.factId, { eventId: e.id, at: e.at, via: e.via }]),
    );
    enc.reviewedSections = [
      ...new Set(
        enc.events
          .filter((e) => e.type === "review" && e.section)
          .map((e) => e.section),
      ),
    ];
    await engine.complete(enc);
    results.push({
      id: saved.id,
      rubric: enc.assessment,
      events: enc.events,
      transcript: enc.transcript,
      manualChecks: reference.manualChecks,
      review: { completed: false, reviewer: "", notes: "" },
    });
    console.log(
      JSON.stringify({
        id: saved.id,
        provider: enc.assessment.provider,
        failure: enc.assessment.failure,
        total: enc.assessment.total,
        denominator: enc.assessment.denominator,
        na: enc.assessment.na,
        reviewRequired: enc.assessment.reviewRequired,
      }),
    );
  }
  const files = [
    "lib/cloud.js",
    "lib/schemas.js",
    "lib/assessment.js",
    "lib/engine.js",
    "evaluation/cases.js",
  ];
  const revision = createHash("sha256")
    .update(
      (
        await Promise.all(
          files.map((f) => fs.readFile(path.join(__dirname, "..", f), "utf8")),
        )
      ).join("\n"),
    )
    .digest("hex");
  const filename = path.join(
    __dirname,
    "../output",
    `assessment-${process.env.BEDROCK_MODEL_ID.replace(/[^a-z0-9-]/gi, "_")}-${Date.now()}.json`,
  );
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(
    filename,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: path.basename(from),
        sourceRevision: source.revision,
        revision,
        model: process.env.BEDROCK_MODEL_ID,
        assessments: results,
        limitation:
          "Reassessment of development regression transcripts, not a fresh held-out dialogue run. Faculty review remains required.",
      },
      null,
      2,
    ),
  );
  console.log(filename);
  if (results.some((r) => r.rubric.provider !== "bedrock"))
    process.exitCode = 1;
}
main().catch((e) => {
  console.error(`${e.name}: ${e.message}`);
  process.exitCode = 1;
});
