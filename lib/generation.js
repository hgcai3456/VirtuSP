"use strict";
const { randomUUID } = require("node:crypto");
const profiles = require("./profiles");
const cloud = require("./cloud");
const text = (value) => (typeof value === "string" ? value.trim() : "");
function measurementLabel(f) {
  return `${text(f.test)}: ${text(f.value)} ${text(f.unit)}${text(f.ref) ? " · Context: " + text(f.ref) : ""}${text(f.date) ? " · Date: " + text(f.date) : ""}`;
}
function refreshReports(p) {
  if (p.provenance?.kind !== "ai-synthetic") return p;
  for (const f of p.facts)
    if (f.lab && f.generationId && text(f.value)) f.label = measurementLabel(f);
  for (const a of p.artifacts.filter((a) => a.origin === "ai-synthetic")) {
    const facts = p.facts.filter((f) => a.facts.includes(f.id));
    a.text = facts
      .filter((f) => !f.lab)
      .map((f) => f.label)
      .join("\n");
    a.rows = facts
      .filter((f) => f.lab)
      .map((f) => ({ name: f.test, value: f.value, unit: f.unit, ref: f.ref }));
  }
  return p;
}
function invalid(message, details) {
  return Object.assign(new Error(message), { status: 422, details });
}
function linked(ids, facts) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.some(
      (id) =>
        typeof id !== "string" || !facts.some((f) => f.generationId === id),
    )
  )
    throw invalid(
      "The generated case has an incomplete report or objective. Generate again.",
    );
  return [...new Set(ids)].map((id) =>
    facts.find((f) => f.generationId === id),
  );
}
function normalize(result, input) {
  const d = result.draft;
  if (
    !d ||
    !text(d.name) ||
    !text(d.summary) ||
    !text(d.personality) ||
    !text(d.style) ||
    !text(d.intro) ||
    !text(d.emotion) ||
    !Array.isArray(d.facts) ||
    d.facts.length < 16 ||
    d.facts.length > 40 ||
    !Array.isArray(d.objectives) ||
    d.objectives.length < 3 ||
    d.objectives.length > 6
  )
    throw invalid(
      "The AI returned an incomplete case. Generate again; your prompt and files are preserved.",
    );
  if (result.review?.supported !== true)
    throw invalid(
      "The generated case did not pass consistency review. Try generating again or refine your brief.",
      result.review?.reason,
    );
  const p = profiles.blank();
  for (const key of [
    "name",
    "gender",
    "ethnicity",
    "summary",
    "intro",
    "personality",
    "style",
    "emotion",
  ])
    p[key] = text(d[key]);
  p.age = d.age;
  p.origin = "ai-synthetic";
  p.provenance = {
    preparation:
      "AI-generated synthetic teaching case; faculty review required. Uploaded originals are preserved; added case details are fictional.",
    kind: "ai-synthetic",
    model: cloud.model(),
    generatedAt: p.createdAt,
    random: input.random,
    consistencyReview: result.review,
  };
  p.sources = [
    {
      id: "synthetic-case",
      title: "AI-generated synthetic case (not a clinical reference)",
      excerpt: JSON.stringify(d),
      origin: "ai-synthetic",
      reviewed: false,
    },
    ...(input.description
      ? [
          {
            id: "faculty-brief",
            title: "Faculty generation brief",
            excerpt: input.description,
            role: "case",
            reviewed: false,
          },
        ]
      : []),
    ...input.sources.map((s) => ({ ...s, reviewed: false })),
  ];
  p.facts = d.facts.map((f, i) => {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(f?.id || "") ||
      d.facts.some((other, j) => j !== i && other.id === f.id)
    )
      throw invalid(
        "The generated case contains an invalid or duplicate finding reference.",
      );
    if (!f || !["supplied", "synthetic"].includes(f.origin))
      throw invalid(
        "The generated case did not identify the source of a finding.",
      );
    const source = p.sources.find((s) => s.id === f.src);
    if (
      f.origin === "supplied" &&
      (!source ||
        source.role === "reference" ||
        !["case", "clinical"].includes(source.role) ||
        !text(f.quote) ||
        !source.excerpt?.includes(f.quote))
    )
      throw invalid(
        "A generated finding cites text that is not in your case documents. Generate again.",
      );
    if (
      f.origin === "synthetic" &&
      (f.src !== "synthetic-case" || text(f.quote))
    )
      throw invalid(
        "An AI-added finding was incorrectly attributed to supplied material.",
      );
    if (source?.role === "clinical" && (f.vis !== "chart" || f.gate !== 0))
      throw invalid(
        "A supplied clinical record was incorrectly made patient-known. Generate again.",
      );
    if (
      f.lab &&
      (!text(f.test) ||
        !text(f.value) ||
        !text(f.label).includes(text(f.value)))
    )
      throw invalid(
        "A generated lab row does not match its clinical finding. Generate again.",
      );
    const label = f.lab ? measurementLabel(f) : text(f.label);
    const fact = profiles.fact("ai-fact-" + i, label, {
      say: text(f.say),
      topic: text(f.topic),
      kw: f.kw,
      vis: f.vis,
      ehr: f.ehr,
      ...(f.vis === "chart" ? { sec: f.ehr } : {}),
      gate: f.gate,
      deflect: text(f.deflect),
      src: f.src,
      type: f.vis === "chart" ? "documented" : "reported",
      origin: f.origin === "supplied" ? "supplied" : "ai-synthetic",
      generationId: f.id,
      sourceQuote: text(f.quote),
      lab: f.lab === true,
      test: text(f.test),
      value: text(f.value),
      unit: text(f.unit),
      ref: text(f.ref),
      date: text(f.date),
    });
    return fact;
  });
  const reportNames = {
    hx: "Clinical history and examination",
    meds: "Medication record",
    labs: "Laboratory report",
    img: "Written imaging report",
    notes: "Clinical notes",
    soc: "Social history record",
  };
  p.artifacts = profiles.sections.flatMap((sec) => {
    const facts = p.facts.filter((f) => f.vis === "chart" && f.ehr === sec);
    if (!facts.length) return [];
    const dates = [...new Set(facts.map((f) => f.date).filter(Boolean))];
    return [
      {
        id: "ai-report-" + sec,
        title: reportNames[sec] + " · Synthetic teaching report",
        src: "synthetic-case",
        sec,
        kind: sec === "labs" ? "lab" : "report",
        date: dates.length === 1 ? dates[0] : "",
        release: "both",
        unlock: [
          ...new Set([
            sec === "labs"
              ? "lab results"
              : sec === "img"
                ? "imaging results"
                : reportNames[sec].toLowerCase(),
            ...facts.flatMap((f) => f.kw || []),
          ]),
        ],
        facts: facts.map((f) => f.id),
        reviewed: false,
        origin: "ai-synthetic",
        // The displayed report is derived from its linked facts, never a second source of values.
        text: facts
          .filter((f) => !f.lab)
          .map((f) => f.label)
          .join("\n"),
        rows: facts
          .filter((f) => f.lab)
          .map((f) => ({
            name: f.test,
            value: f.value,
            unit: f.unit,
            ref: f.ref,
          })),
      },
    ];
  });
  if (!p.artifacts.length)
    throw invalid(
      "The generated case is missing chart findings. Generate again.",
    );
  for (const s of input.sources.filter((s) => s.role === "clinical")) {
    const facts = p.facts.filter((f) => f.src === s.id && f.vis === "chart");
    if (facts.length)
      p.artifacts.push({
        id: "original-" + s.fileId,
        title: s.title,
        src: s.id,
        fileId: s.fileId,
        kind: "report",
        sec:
          new Set(facts.map((f) => f.ehr)).size === 1
            ? facts[0].ehr
            : s.section,
        date: profiles.documentDate(s.excerpt),
        release: "section",
        unlock: [],
        facts: facts.map((f) => f.id),
        rows: [],
        reviewed: false,
        origin: "supplied",
      });
  }
  p.obj = d.objectives.map((o, i) => ({
    id: "ai-objective-" + i,
    t: text(o.title),
    ty: "fact",
    w:
      Math.floor(100 / d.objectives.length) +
      (i === 0 ? 100 % d.objectives.length : 0),
    f: linked(o.factIds, p.facts).map((f) => f.id),
    tip: text(o.tip),
  }));
  p.missing = Array.isArray(d.missing)
    ? d.missing.map(text).filter(Boolean)
    : [];
  const issues = profiles.validate({ ...p, reviewAcknowledged: true });
  if (issues.some((i) => i.severity === "error"))
    throw invalid(
      "The generated case has incomplete scenario settings. Generate again; no patient has been created.",
      issues
        .filter((i) => i.severity === "error")
        .map((i) =>
          i.message.replace(
            /ai-fact-(\d+)/g,
            (_, n) => d.facts[Number(n)]?.id || "finding",
          ),
        )
        .join(" "),
    );
  return p;
}
async function generate(store, request) {
  if (!cloud.enabled())
    throw Object.assign(
      new Error(
        "Enable Bedrock (AI_ENABLED=true) to generate a patient. Manual patient creation is still available.",
      ),
      { status: 503 },
    );
  if (
    request.description !== undefined &&
    typeof request.description !== "string"
  )
    throw invalid("Enter your case brief as text.");
  if (request.random !== undefined && typeof request.random !== "boolean")
    throw invalid("Choose Generate patient or Random patient.");
  const description = text(request.description);
  if (description.length > 8000)
    throw invalid("Keep the case brief under 8,000 characters.");
  if (!Array.isArray(request.files || []))
    throw invalid("Uploaded files must be a list.");
  const seen = new Set();
  const sources = (request.files || []).map((entry) => {
    const file = store.state.files[entry?.id];
    if (
      !file ||
      seen.has(file.id) ||
      !["case", "clinical", "reference"].includes(entry.role)
    )
      throw invalid("Select each uploaded file once with its purpose.");
    seen.add(file.id);
    return {
      id: "upload-" + file.id,
      title: file.name,
      excerpt: file.excerpt,
      fileId: file.id,
      role: entry.role,
      section: profiles.sections.includes(entry.section)
        ? entry.section
        : "notes",
    };
  });
  if (
    sources.reduce((n, s) => n + (s.excerpt?.length || 0), description.length) >
    48000
  )
    throw invalid(
      "Use a shorter case package (up to 48,000 extracted characters).",
    );
  if (request.random === true && (description || sources.length))
    throw invalid("Random generation does not use a brief or attachments.");
  if (
    request.random !== true &&
    !description &&
    !sources.some((s) => text(s.excerpt))
  )
    throw invalid(
      "Type or dictate a short brief, upload a text PDF/TXT, or choose Random patient. Image files are preserved but are not read by this generator.",
    );
  const input = {
    description,
    random: request.random === true,
    seed: randomUUID(),
    today: new Date().toISOString().slice(0, 10),
    sources,
  };
  let result = await cloud.generateSynthetic(input),
    p;
  try {
    p = normalize(result, input);
  } catch (error) {
    if (error.status !== 422) throw error;
    // One bounded repair pass saves faculty from fixing model-format omissions manually.
    result = await cloud.generateSynthetic({
      ...input,
      previousDraft: result.draft,
      correction: error.details || error.message,
    });
    p = normalize(result, input);
  }
  return {
    profile: p,
    provider: "bedrock-synthetic",
    warning:
      "AI-generated synthetic case. Review before publication; consistency checks do not certify clinical accuracy.",
    unreadFiles: sources.filter((s) => !text(s.excerpt)).map((s) => s.title),
  };
}
module.exports = { generate, normalize, refreshReports };
