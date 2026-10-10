"use strict";
// Uses real Bedrock but never writes to the active patient library or S3.
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const generation = require("../lib/generation");
const profiles = require("../lib/profiles");
const cloud = require("../lib/cloud");
const cases = [
  {
    label: "brief",
    input: {
      description:
        "An adult with high cholesterol who is worried about starting medication.",
    },
  },
  { label: "random", input: { random: true } },
  {
    label: "documents",
    input: {
      description:
        "Create an extensive fictional encounter around this brief. Keep the documented omissions unknown.",
      files: [{ id: "smoke-case", role: "case" }],
    },
  },
];
(async () => {
  const store = {
    state: {
      files: {
        "smoke-case": {
          id: "smoke-case",
          name: "synthetic-brief.txt",
          type: "text/plain",
          excerpt:
            "Fictional case brief. Name: Jamie Ellis. Age: 47. Concern: trouble sleeping for three weeks. Allergy history is unspecified. Current medication list is unspecified.",
        },
      },
    },
  };
  const output = path.resolve("tmp/generation-smoke");
  await fs.mkdir(output, { recursive: true });
  for (const c of cases.filter(
    (c) => !process.argv[2] || c.label === process.argv[2],
  )) {
    const start = Date.now();
    // Preserve the provider draft on failure for local diagnosis without exposing credentials.
    const original = cloud.generateSynthetic;
    cloud.generateSynthetic = async (input) => {
      const result = await original(input);
      await fs.writeFile(
        path.join(output, c.label + "-provider.json"),
        JSON.stringify({ input, result }, null, 2),
      );
      return result;
    };
    try {
      const result = await generation.generate(store, c.input);
      if (c.label === "documents") {
        assert.equal(result.profile.name, "Jamie Ellis");
        assert.equal(result.profile.age, 47);
        for (const term of ["allergy", "medication"])
          assert.ok(
            result.profile.facts.some(
              (f) =>
                f.origin === "supplied" &&
                new RegExp(term, "i").test(f.label) &&
                /unspecified|not specified|unknown/i.test(f.label),
            ),
          );
      }
      await fs.writeFile(
        path.join(output, c.label + ".json"),
        JSON.stringify(result, null, 2),
      );
      const issues = profiles.validate({
        ...result.profile,
        reviewAcknowledged: true,
      });
      console.log(
        JSON.stringify({
          case: c.label,
          seconds: Math.round((Date.now() - start) / 1000),
          facts: result.profile.facts.length,
          reports: result.profile.artifacts.length,
          objectives: result.profile.obj.length,
          publicationErrors: issues.filter((i) => i.severity === "error")
            .length,
          provider: result.provider,
        }),
      );
    } finally {
      cloud.generateSynthetic = original;
    }
  }
})().catch((e) => {
  console.error(e.code || e.name, e.message);
  process.exitCode = 1;
});
