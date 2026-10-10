"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { patientRecords, profileDocuments } = require("../lib/corpus");
const datasets = require("../corpus/datasets.json");
const root = path.resolve(__dirname, "../corpus/downloads");
async function bytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 20 * 1024 * 1024)
    throw new Error("Unexpected source file size.");
  return body;
}
async function install(dataset) {
  const directory = path.join(root, dataset.id),
    raw = path.join(directory, "raw");
  const url = "https://huggingface.co/datasets/" + dataset.repository;
  const metadata = JSON.parse(
    await bytes(
      `https://huggingface.co/api/datasets/${dataset.repository}/revision/${dataset.revision}`,
    ),
  );
  if (metadata.sha !== dataset.revision)
    throw new Error("Source revision mismatch.");
  const files = metadata.siblings
    .map((f) => f.rfilename)
    .filter((name) => dataset.formats.includes(path.extname(name)));
  const results = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, files.length) }, async () => {
      while (index < files.length) {
        const name = files[index++];
        const target = path.resolve(raw, name);
        if (!target.startsWith(raw + path.sep))
          throw new Error("Invalid upstream path.");
        const content = await bytes(
          `${url}/resolve/${dataset.revision}/${name.split("/").map(encodeURIComponent).join("/")}`,
        );
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
        results.push({
          file: name,
          bytes: content.length,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      }
    }),
  );
  const manifest = {
    ...dataset,
    url,
    downloadedAt: new Date().toISOString(),
    files: results.sort((a, b) => a.file.localeCompare(b.file)),
  };
  if (dataset.id === "virtual-patient-profiles-sample") {
    const patients = patientRecords(
      await fs.readFile(path.join(raw, "patients.jsonl"), "utf8"),
    );
    const normalized = path.join(directory, "normalized");
    await fs.mkdir(normalized, { recursive: true });
    await fs.writeFile(
      path.join(normalized, "patients.json"),
      JSON.stringify(patients, null, 2) + "\n",
    );
    await fs.writeFile(
      path.join(normalized, "patients.jsonl"),
      patients.map((p) => JSON.stringify(p)).join("\n") + "\n",
    );
    manifest.patients = patients.map((p) => {
      const name = p.patient_overview.name;
      return {
        name,
        age: p.patient_overview.age,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      };
    });
    for (let i = 0; i < patients.length; i++) {
      const folder = path.join(directory, "studio", manifest.patients[i].slug);
      await fs.mkdir(folder, { recursive: true });
      for (const [name, text] of Object.entries(
        profileDocuments(patients[i], manifest),
      ))
        await fs.writeFile(path.join(folder, name), text);
    }
    manifest.patientCount = patients.length;
  } else {
    manifest.conversationFileCount = files.filter((name) =>
      name.endsWith(".txt"),
    ).length;
    manifest.lineCount = 0;
    for (const name of files.filter((name) => name.endsWith(".txt")))
      manifest.lineCount += (await fs.readFile(path.join(raw, name), "utf8"))
        .split(/\r?\n/)
        .filter(Boolean).length;
  }
  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      dataset: dataset.repository,
      revision: dataset.revision,
      files: files.length,
      bytes: results.reduce((sum, f) => sum + f.bytes, 0),
      patientCount: manifest.patientCount,
      conversationFiles: manifest.conversationFileCount,
      localPath: directory,
    }),
  );
}
(async () => {
  for (const dataset of datasets) await install(dataset);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
