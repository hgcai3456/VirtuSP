"use strict";
const { randomUUID } = require("node:crypto");
const sections = ["hx", "meds", "labs", "img", "notes", "soc"];
const clone = (value) => structuredClone(value);
const clean = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();
function documentDate(text) {
  const dates = [
    ...String(text || "").matchAll(
      /\b(?:(?:note|report|collection|test)\s+)?date\s*:\s*(\d{4}-\d{2}-\d{2})\b/gi,
    ),
  ]
    .map((m) => m[1])
    .filter((date) => {
      const value = new Date(date + "T00:00:00Z");
      return (
        Number.isFinite(value.getTime()) &&
        value.toISOString().slice(0, 10) === date
      );
    });
  return new Set(dates).size === 1 ? dates[0] : "";
}
function approveRecords(p) {
  if (p.reviewAcknowledged === true)
    for (const records of [p.facts, p.sources, p.artifacts])
      records.forEach((record) => {
        record.reviewed = true;
      });
  return p;
}
function csvRows(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((h) =>
    clean(h)
      .replace(/^\uFEFF/, "")
      .toLowerCase(),
  );
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate CSV columns.");
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((h, j) => [h, clean(r[j])]));
  });
}
function fact(id, label, extras = {}) {
  return {
    id,
    label,
    say: label,
    topic: extras.ehr || "Patient history",
    kw: [],
    type: "reported",
    vis: "ask",
    ehr: "hx",
    gate: 0,
    src: "Faculty authored",
    reviewed: false,
    origin: "faculty",
    ...extras,
  };
}
const DOCUMENT_STOP = new Set([
  "report",
  "file",
  "document",
  "patient",
  "clinical",
  "this",
  "that",
  "with",
  "from",
  "into",
  "about",
  "note",
  "lab",
  "labs",
  "test",
  "tests",
  "image",
  "summary",
  "panel",
  "check",
]);
function spokenDocumentName(artifact) {
  const stripped = String(artifact?.title || "")
    .replace(/\b[A-Z]{1,6}-?\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/diar|journal/i.test(stripped)) {
    return stripped.replace(/\bsummary\b/i, "").trim().toLowerCase() || "a journal";
  }
  if (stripped) {
    return stripped.toLowerCase();
  }
  if (artifact?.kind === "lab" || artifact?.sec === "labs") {
    return "some tests";
  }

  return "that paperwork";
}
function friendlyDocumentDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) {
    return "";
  }
  const value = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(value.getTime())) {
    return "";
  }

  return value.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
function withArticle(name) {
  const text = String(name || "").trim();
  if (!text || /^(a|an|some|that|the|my)\b/i.test(text)) {
    return text;
  }
  if (/^[aeiou]/i.test(text)) {
    return `an ${text}`;
  }

  return `a ${text}`;
}
function documentAwarenessKeywords(artifact, spokenName) {
  const words = String(spokenName || "")
    .split(/[^a-z0-9]+/i)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3 && !DOCUMENT_STOP.has(w));
  const keys = new Set(["document", "paperwork", "report", ...words]);
  if (artifact?.kind === "lab" || artifact?.sec === "labs") {
    ["lab", "labs", "test", "tests", "bloodwork", "blood work", "recently"].forEach(
      (k) => keys.add(k),
    );
  }
  if (/diar|journal/i.test(spokenName)) {
    ["journal", "diary", "headache journal", "headache diary", "written"].forEach(
      (k) => keys.add(k),
    );
  }

  return [...keys];
}
function documentAwarenessFact(artifact) {
  const spokenName = spokenDocumentName(artifact);
  const when = friendlyDocumentDate(artifact?.date);
  const isDiary = /diar|journal/i.test(spokenName);
  const named = withArticle(spokenName);
  const say = isDiary
    ? when
      ? `Yes, I keep ${named}. I last wrote in it around ${when}. I had a lot of days lately, but I don't remember the exact count.`
      : `Yes, I keep ${named}. I write in it a lot, but I don't remember the exact count.`
    : when
      ? `Yes, they did ${named} around ${when}. I don't know the numbers offhand.`
      : `Yes, they did ${named} recently. I don't know the numbers offhand.`;

  return fact(`$doc-${artifact.id}`, `Patient-known ${spokenName} without result numbers`, {
    say,
    topic: isDiary
      ? "Patient-kept journal or diary, without exact counts"
      : "Recent test or report the patient remembers, without result numbers",
    kw: documentAwarenessKeywords(artifact, spokenName),
    ehr: artifact.sec || "labs",
    type: "reported",
    src: artifact.src || artifact.title || "Attached case document",
    reviewed: true,
  });
}
function documentAwarenessFacts(artifacts = []) {
  const seen = new Set();

  return artifacts
    .filter((a) => a && a.id && !seen.has(a.id) && seen.add(a.id))
    .map(documentAwarenessFact);
}
function blank() {
  return {
    id: randomUUID(),
    name: "New Patient",
    age: null,
    intro: "Hello.",
    personality: "",
    style: "",
    emotion: "",
    caseRubric: "",
    origin: "faculty",
    facts: [],
    artifacts: [],
    sources: [],
    obj: [],
    hints: [],
    rubricApplicable: [1, 2, 3, 4, 5, 6, 7],
    reviewAcknowledged: false,
    missing: [],
    createdAt: new Date().toISOString(),
  };
}
function seedFromStarter(starter = {}) {
  const p = blank();
  const name = clean(starter.name);
  if (name) p.name = name;
  const age = Number(starter.age);
  if (Number.isInteger(age) && age >= 0 && age <= 120) p.age = age;
  if (clean(starter.intro)) p.intro = clean(starter.intro);
  else if (name) p.intro = `Hello, I'm ${name.split(/\s+/)[0]}.`;
  for (const key of ["personality", "style", "emotion", "gender"]) {
    if (typeof starter[key] === "string") p[key] = clean(starter[key]);
  }
  const concern = clean(starter.concern);
  if (!concern) return p;

  p.facts.push(
    fact("concern", concern, {
      say: concern,
      topic:
        clean(starter.concernTopic) ||
        "Opening concern and reason for the visit",
      kw: ["bring", "today", "concern", "reason", "visit", "coming"],
      src: "Faculty authored",
    }),
  );

  return p;
}
function importCsv(text) {
  return csvRows(text).map((r) => {
    if (!r["patient-name"]) throw new Error("CSV requires patient-name.");
    const p = blank();
    p.id = r["patient-uuid"] || p.id;
    p.name = r["patient-name"];
    p.age = r.age ? Number(r.age) : null;
    p.intro = `Hello, I'm ${p.name.split(" ")[0]}.`;
    p.personality = r.personality;
    p.gender = r.gender;
    p.ethnicity = r["race/ethinicity"] || r["race/ethnicity"] || "";
    p.image = r["patient-img"];
    p.original = clone(r);
    p.origin = "organizer";
    p.sources = [
      {
        id: "organizer-csv",
        title: "Faculty-provided sample patient details",
        excerpt: JSON.stringify(r, null, 2),
        reviewed: false,
      },
    ];
    p.facts = [
      fact("background", r.background, {
        topic: "Home, work, background and social support",
        kw: ["live", "home", "work", "job", "background", "support"],
        src: "organizer-csv",
        origin: "organizer",
        say: r.background,
      }),
      fact("case-notes", r.notes, {
        topic:
          "Faculty clinical notes — review and split into patient-known facts before publishing",
        vis: "chart",
        sec: "notes",
        ehr: "notes",
        type: "documented",
        say: "",
        src: "organizer-csv",
        origin: "organizer",
      }),
      fact("case-summary", r.summary, {
        topic:
          "Faculty case summary — review patient understanding before making disclosable",
        vis: "chart",
        sec: "notes",
        ehr: "notes",
        type: "documented",
        say: "",
        src: "organizer-csv",
        origin: "organizer",
      }),
    ];
    p.missing = [
      "Patient-known opening concern and approved response wording",
      "Medication list (unspecified)",
      "Allergies (unspecified)",
      "Measurements require explicit units, dates and report provenance",
      "Disclosure conditions and learning objectives",
      "Source review and approval",
    ];
    return p;
  });
}
function validate(p) {
  const issues = [];
  const add = (severity, message) => issues.push({ severity, message });
  if (!p || typeof p !== "object" || Array.isArray(p))
    return [{ severity: "error", message: "Profile must be an object." }];
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id || ""))
    add("error", "Invalid patient ID.");
  if (!clean(p.name)) add("error", "Provide a patient name.");
  if (p.age != null && (!Number.isInteger(p.age) || p.age < 0 || p.age > 120))
    add("error", "Age must be from 0 to 120, or left unspecified.");
  if (
    !Array.isArray(p.facts) ||
    !Array.isArray(p.obj) ||
    !Array.isArray(p.sources) ||
    !Array.isArray(p.artifacts)
  )
    return [
      ...issues,
      {
        severity: "error",
        message: "Facts, objectives, sources and artifacts must be arrays.",
      },
    ];
  const ids = new Set(),
    artIds = new Set();
  if (p.facts.length > 150)
    add("error", "Profile exceeds the demo fact limit.");
  for (const f of p.facts) {
    if (!f || typeof f !== "object") {
      add("error", "Invalid fact.");
      continue;
    }
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.id || "") || ids.has(f.id))
      add("error", `Invalid or duplicate fact ID: ${f.id}`);
    ids.add(f.id);
    if (!clean(f.label) || !clean(f.src))
      add("error", `${f.id}: label and source are required.`);
    if (!["ask", "chart"].includes(f.vis) || !sections.includes(f.ehr))
      add("error", `${f.id}: invalid visibility or section.`);
    if (f.vis === "ask" && !clean(f.say))
      add("error", `${f.id}: approved fallback wording is required.`);
    if (f.vis === "chart" && !sections.includes(f.sec))
      add("error", `${f.id}: chart release section is required.`);
    if (
      !Array.isArray(f.kw) ||
      f.kw.some((k) => typeof k !== "string" || !k.trim())
    )
      add("error", `${f.id}: keywords must be nonempty strings.`);
    if (!Number.isInteger(f.gate) || f.gate < 0 || f.gate > 3)
      add("error", `${f.id}: trust gate must be 0–3.`);
    if (f.gate > 0 && !clean(f.deflect))
      add("error", `${f.id}: a gated fact needs approved deflection wording.`);
    if (f.lab && (!clean(f.unit) || !clean(f.ref) || !clean(f.date)))
      add(
        "warning",
        `${f.id}: missing measurement units, context or date remain unspecified.`,
      );
  }
  if (!p.facts.some((f) => f?.vis === "ask"))
    add("error", "Add at least one patient-known interview fact.");
  for (const a of p.artifacts) {
    if (!a || !a.id || artIds.has(a.id)) {
      add("error", "Artifacts need unique IDs.");
      continue;
    }
    artIds.add(a.id);
    if (!a.title || !a.src || !sections.includes(a.sec))
      add("error", `${a.id}: add a report title, source and chart section.`);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id))
      add("error", `${a.id}: invalid artifact ID.`);
    if (!["section", "question", "both"].includes(a.release || "section"))
      add("error", `${a.id}: invalid release mode.`);
    if (
      a.unlock !== undefined &&
      (!Array.isArray(a.unlock) ||
        a.unlock.some((k) => typeof k !== "string" || !k.trim()))
    )
      add("error", `${a.id}: release keywords must be nonempty strings.`);
    if (
      (a.release === "question" || a.release === "both") &&
      !(a.unlock || []).length
    )
      add("error", `${a.id}: add question release keywords.`);
    if (
      !Array.isArray(a.facts) ||
      !a.facts.length ||
      a.facts.some((id) => !ids.has(id))
    )
      add("error", `${a.id}: map the report to approved facts.`);
    if (a.rows !== undefined && !Array.isArray(a.rows))
      add("error", `${a.id}: lab rows must be an array.`);
    if (Array.isArray(a.rows))
      for (const r of a.rows)
        if (!r || !r.name || r.value === undefined || r.value === "")
          add(
            "error",
            `${a.id}: lab rows need a test name and supplied value.`,
          );
  }
  const objIds = new Set();
  if (!p.obj.length)
    add(
      "warning",
      "No faculty objectives authored; use the standard rubric assessment.",
    );
  for (const o of p.obj) {
    if (!o || !o.id || objIds.has(o.id)) {
      add("error", "Objectives need unique IDs.");
      continue;
    }
    objIds.add(o.id);
    if (!o.t || !o.tip || !Number.isFinite(o.w) || o.w <= 0)
      add(
        "error",
        `${o.id}: objective, positive weight and coaching tip are required.`,
      );
    if (!["fact", "review", "mm", "emp", "ho"].includes(o.ty))
      add("error", `${o.id}: unsupported objective type.`);
    if (
      o.ty === "fact" &&
      (!Array.isArray(o.f) || !o.f.length || o.f.some((id) => !ids.has(id)))
    )
      add("error", `${o.id}: select existing fact IDs.`);
    if (
      o.ty === "review" &&
      (!Array.isArray(o.s) ||
        !o.s.length ||
        o.s.some((s) => !sections.includes(s)))
    )
      add("error", `${o.id}: select chart sections.`);
    if (o.ty === "mm" && !p.mm)
      add("error", `${o.id}: define the intentional discrepancy.`);
  }
  if (
    p.obj.length &&
    p.obj.reduce((sum, o) => sum + Number(o?.w || 0), 0) !== 100
  )
    add("error", "Objective weights must total 100.");
  if (
    p.mm &&
    (!ids.has(p.mm.a) ||
      !ids.has(p.mm.b) ||
      !ids.has(p.mm.fu) ||
      !Array.isArray(p.mm.kw) ||
      !p.mm.kw.length)
  )
    add(
      "error",
      "Discrepancy needs valid statement, record, follow-up and keywords.",
    );
  for (const f of p.facts.filter((f) => f?.allergyDrug))
    if (p.facts.some((m) => m?.drug && m.drug === f.allergyDrug))
      add("error", `Medication/allergy conflict: ${f.allergyDrug}`);
  if (!p.sources.length)
    add(
      "warning",
      "No supporting documents attached; facts are faculty-authored.",
    );
  if (
    p.sources.some(
      (s) => !s || !s.id || !s.title || (!s.excerpt && !s.fileId && !s.url),
    )
  )
    add("error", "Add a case document or teaching source.");
  if (new Set(p.sources.map((s) => s?.id)).size !== p.sources.length)
    add("error", "Source IDs must be unique.");
  if (
    !Array.isArray(p.rubricApplicable) ||
    new Set(p.rubricApplicable).size !== p.rubricApplicable.length ||
    p.rubricApplicable.some((d) => !Number.isInteger(d) || d < 1 || d > 7) ||
    !p.rubricApplicable.length
  )
    add("error", "Select applicable rubric domains 1–7.");
  if (p.reviewAcknowledged !== true)
    add("error", "Confirm faculty review before publishing.");
  if (p.missing?.length)
    add(
      "warning",
      "Imported omissions remain listed. Confirm that unspecified details stay unknown.",
    );
  return issues;
}
module.exports = {
  blank,
  seedFromStarter,
  fact,
  importCsv,
  csvRows,
  validate,
  clone,
  sections,
  documentDate,
  documentAwarenessFacts,
  approveRecords,
};
