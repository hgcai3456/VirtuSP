"use strict";
// Turns faculty-supplied case files (any mix of PDF, Word, text, CSV, JSON,
// images, or a whole folder of them) into draft patient profiles. Carried over
// from the earlier prototype, where it handled the organizer's roster and
// portraits well; the output is reshaped to this app's profile format. Drafts
// are never published here: faculty review them in Patient Studio.
// Needs ANTHROPIC_API_KEY (Claude API); it does not run on Bedrock.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const SECTIONS = ["hx", "meds", "labs", "img", "notes", "soc"];
const SECTION_NAME = {
  hx: "History",
  meds: "Medications",
  labs: "Laboratory results",
  img: "Imaging",
  notes: "Clinical notes",
  soc: "Social history",
};
const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const TEXT_EXT = [
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".rtf",
  ".boxnote",
];
const MAX_TEXT = 200000;
const MAX_IMAGES = 12;
const DRAFTED = "AI draft (unverified)";

const systemFor = (
  GROUNDING,
) => `You convert teaching-case material into a virtual standardized patient for a simulator that trains healthcare students to interview. Faculty hand you whatever they have: persona sheets, case write-ups, sample encounter transcripts, learning objectives, prompts written for another simulator, lab tables, images of reports. Read all of it and produce one patient profile.

How the simulator uses what you write:
- patientFacts are things the patient knows and can say. Each has "say": the patient's own first-person spoken words, in the voice the source material gives them. Students are graded on which of these they elicit, so split the case into separate facts a student would have to ask about separately (chief complaint, timeline, each relevant symptom, medications and how they are really taken, allergies, family and social history, the patient's worries and understanding). Cover the history a thorough student would take; a rich source should yield a rich fact list.
- Every fact also has "topic": a short neutral name for what it is about, such as "Smoking history" or "Inhaler use", which must not give away the answer. Students see topics for things they missed.
- A guarded patient fact is one the patient holds back until the student shows empathy: something embarrassing, stigmatized, or that they fear being judged for. Give it a short in-character "deflect" line. Mark facts guarded only where the source supports it.
- chartFacts are things in the medical record that the patient does not say, such as clinician notes, medication lists, vitals, and exam findings. They appear in the chart section you assign when the student opens it or asks about it.
- labs are structured results with units and reference ranges.
- A discrepancy is a deliberate conflict between what the patient says and what the chart shows, which the student is meant to notice and reconcile. Report one only if the source material contains or clearly intends one; point followUpFactIndex at the guarded patient fact that reveals the truth, if there is one.
- objectives are the faculty learning objectives, each tied to how it is scored: "fact" (the student elicited the listed patient facts), "review" (the student opened the listed chart sections), "mm" (the student reconciled the discrepancy), "emp" (empathic, open-ended communication), "ho" (a structured handoff). Use the source's own objectives where it gives them, and weight them to total 100.
- intro is the first thing the patient says aloud when the student walks in: one short greeting in the patient's own voice and manner, with no clinical summary. personality, emotion and style are short descriptions for the actor playing the patient.
- gender is the patient's gender exactly as the source states it (for example "female" or "male"); leave it empty if the source does not say. It selects the patient's speaking voice.
- ethnicity is the patient's ethnicity exactly as the source states it; leave it empty if the source does not say.
- dob is the patient's date of birth as YYYY-MM-DD, only if the source states it; never work it out from the age. Leave it empty otherwise.
- hints are three to five opening questions shown to the student as buttons and sent to the patient word for word when clicked, so write each as a question in the student's voice, not as advice.
- keywords and unlockKeywords are lowercase word stems a student's question would contain when asking about that item, for example "allerg", "smok", "breath".

${GROUNDING}

If the material describes several patients, build the one named in the faculty note, or the first if none is named, and say so in warnings. For each attached image that is a clinical artifact (ECG, imaging, a scanned report), add an imageArtifacts entry using its exact file name; describe only what the source text or the image itself supports. Use empty strings and empty arrays for anything that does not apply.`;

const FROM_FILES = `Clinical validity matters more than completeness. Take every clinical detail from the source material: do not invent diagnoses, medications, doses, values, dates or findings to fill gaps, and keep history, medications, diagnoses, labs and artifacts consistent with one another. Where the source is silent or contradicts itself, leave the item out and add a plain-language entry to "warnings" telling the faculty reviewer what is missing or inconsistent. You may write natural patient wording, an opening line, suggested first questions and tips, since those are presentation, not clinical fact. Set fromSource to true on every fact.`;

const FROM_ROSTER = `The source here is one row of a faculty roster: a short persona, not a full case. Faculty want a complete, playable encounter built around it, which they will then review and correct. Keep everything the row states exactly as given, and let its notes define the teaching purpose of the case. Then add the further history a student would need to take: the reason for this visit, timeline, relevant symptoms, how medications are actually taken, allergies, family and social history, and the patient's worries and understanding. Choose details that are clinically plausible for this persona, consistent with one another, and no more dramatic than the teaching purpose needs. Set fromSource to true only on facts the row states and false on every fact you added, so faculty can see at a glance what to confirm. Measurements and lab values are different: include only the numbers the row gives, and list in "warnings" the results a faculty member would probably want to add. Where the notes say the patient avoids, hides or is uncomfortable with a topic, make that a guarded fact. If the row gives no learning objectives, derive them from its notes.`;

const str = { type: "string" };
const strs = { type: "array", items: str };
const ints = { type: "array", items: { type: "integer" } };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const SCHEMA = obj({
  name: str,
  age: { type: "integer" },
  gender: str,
  ethnicity: str,
  dob: str,
  intro: str,
  personality: str,
  emotion: str,
  style: str,
  complaint: str,
  history: str,
  diagnosis: str,
  medications: str,
  allergies: str,
  hints: strs,
  patientFacts: {
    type: "array",
    items: obj({
      label: str,
      topic: str,
      say: str,
      section: { type: "string", enum: ["hx", "meds", "soc"] },
      guarded: { type: "boolean" },
      deflect: str,
      keywords: strs,
      fromSource: { type: "boolean" },
    }),
  },
  chartFacts: {
    type: "array",
    items: obj({
      label: str,
      topic: str,
      section: { type: "string", enum: SECTIONS },
      source: str,
      authorRole: str,
      keywords: strs,
      fromSource: { type: "boolean" },
    }),
  },
  labs: {
    type: "array",
    items: obj({
      name: str,
      value: str,
      unit: str,
      ref: str,
      flag: { type: "string", enum: ["low", "high", "normal"] },
      date: str,
    }),
  },
  discrepancy: obj({
    present: { type: "boolean" },
    patientFactIndex: { type: "integer" },
    chartFactIndex: { type: "integer" },
    followUpFactIndex: { type: "integer" },
    keywords: strs,
  }),
  objectives: {
    type: "array",
    items: obj({
      text: str,
      weight: { type: "integer" },
      type: { type: "string", enum: ["fact", "review", "mm", "emp", "ho"] },
      patientFactIndexes: ints,
      sections: strs,
      tip: str,
    }),
  },
  imageArtifacts: {
    type: "array",
    items: obj({
      fileName: str,
      kind: {
        type: "string",
        enum: ["ecg", "ct", "xray", "lab", "note", "other"],
      },
      title: str,
      date: str,
      finding: str,
      unlockKeywords: strs,
    }),
  },
  warnings: strs,
});

let client = null;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw Object.assign(
      new Error(
        "Importing files needs the Claude API key (ANTHROPIC_API_KEY in .env).",
      ),
      { status: 503 },
    );
  const Anthropic = require("@anthropic-ai/sdk");
  client ||= new Anthropic();
  return client;
}
const model = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const baseName = (file) => path.basename(String(file.name || "file"));
const extOf = (file) => path.extname(baseName(file)).toLowerCase();
const bytesOf = (file) => Buffer.from(String(file.data || ""), "base64");

// Reads the uploaded files into model input. Images are kept so a clinical
// artifact the model identifies can be attached to the chart.
async function readFiles(files) {
  const blocks = [];
  const images = {};
  const skipped = [];
  let textBudget = MAX_TEXT;
  let imageCount = 0;
  for (const file of files) {
    const name = baseName(file);
    const ext = extOf(file);
    const data = bytesOf(file);
    let text = null;
    if (!data.length) {
      skipped.push(name + " (empty)");
    } else if (ext === ".pdf") {
      blocks.push({
        type: "document",
        title: name,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: data.toString("base64"),
        },
      });
    } else if (IMAGE_TYPES[ext]) {
      if (imageCount >= MAX_IMAGES) {
        skipped.push(name + " (more than " + MAX_IMAGES + " images)");
        continue;
      }
      imageCount += 1;
      images[name.toLowerCase()] = { name, type: IMAGE_TYPES[ext], data };
      blocks.push({ type: "text", text: "Image file: " + name });
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: IMAGE_TYPES[ext],
          data: data.toString("base64"),
        },
      });
    } else if (ext === ".docx") {
      try {
        text = (await require("mammoth").extractRawText({ buffer: data }))
          .value;
      } catch {
        skipped.push(name + " (could not read Word file)");
      }
    } else if (TEXT_EXT.includes(ext) || !data.subarray(0, 4000).includes(0)) {
      text = data.toString("utf8");
    } else {
      skipped.push(
        name + " (unsupported type; save it as PDF, Word, text or CSV)",
      );
    }
    if (text !== null) {
      if (text.length > textBudget) {
        skipped.push(name + " (too long; only the first part was read)");
        text = text.slice(0, textBudget);
      }
      textBudget -= text.length;
      if (text.trim())
        blocks.push({ type: "text", text: "File: " + name + "\n\n" + text });
    }
  }
  return { blocks, images, skipped };
}

// Stored as 'female', 'male', or the source's own wording for anything else.
function normalGender(value) {
  const g = String(value == null ? "" : value)
    .toLowerCase()
    .trim();
  if (/^(f|female|woman|girl)$/.test(g)) return "female";
  if (/^(m|male|man|boy)$/.test(g)) return "male";
  return g.slice(0, 40);
}

// Shapes the model's draft into this app's profile. `saveFile` stores an
// image and returns its file id.
async function buildProfile(out, images, saveFile, sourceText) {
  const arr = (v) =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
  const txt = (v) => (v == null ? "" : String(v).trim());
  const words = (list) => [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean),
    ),
  ];
  const warnings = (Array.isArray(out.warnings) ? out.warnings : [])
    .map(txt)
    .filter(Boolean);
  const facts = [];
  const reviewed = { reviewed: false, origin: "imported" };

  const patientFacts = arr(out.patientFacts).filter(
    (f) => txt(f.label) || txt(f.say),
  );
  const patientIds = patientFacts.map((f, i) => {
    const section = ["hx", "meds", "soc"].includes(f.section)
      ? f.section
      : "hx";
    const label = txt(f.label) || txt(f.say);
    facts.push({
      id: "p" + (i + 1),
      label,
      say: txt(f.say) || label,
      topic: txt(f.topic) || SECTION_NAME[section],
      kw: words(f.keywords),
      type: "reported",
      vis: "ask",
      ehr: section,
      gate: f.guarded ? 1 : 0,
      ...(f.guarded
        ? { deflect: txt(f.deflect) || "I'd rather not get into that." }
        : {}),
      src: f.fromSource === false ? DRAFTED : "Imported case",
      ...reviewed,
    });
    return "p" + (i + 1);
  });

  const chartIds = arr(out.chartFacts)
    .filter((f) => txt(f.label))
    .map((f, i) => {
      const section = SECTIONS.includes(f.section) ? f.section : "notes";
      facts.push({
        id: "c" + (i + 1),
        label: txt(f.label),
        say: txt(f.label),
        topic: txt(f.topic) || SECTION_NAME[section],
        kw: words(f.keywords),
        type: "documented",
        vis: "chart",
        sec: section,
        ehr: section,
        gate: 0,
        role: txt(f.authorRole) || "Clinician",
        src:
          f.fromSource === false ? DRAFTED : txt(f.source) || "Imported case",
        ...reviewed,
      });
      return "c" + (i + 1);
    });

  const artifacts = [];
  // A lab row needs a name and a value to be shown.
  const labs = arr(out.labs).filter((l) => txt(l.name) && txt(l.value));
  const labIds = labs.map((l, i) => {
    const name = txt(l.name);
    facts.push({
      id: "l" + (i + 1),
      label:
        `${name} ${txt(l.value)} ${txt(l.unit)} (ref ${txt(l.ref) || "—"})${txt(l.date) ? ", " + txt(l.date) : ""}`.replace(
          /\s+/g,
          " ",
        ),
      say: name,
      topic: name,
      kw: ["lab", "result", name.toLowerCase()],
      type: "confirmed",
      vis: "chart",
      sec: "labs",
      ehr: "labs",
      gate: 0,
      lab: true,
      unit: txt(l.unit),
      ref: txt(l.ref),
      date: txt(l.date),
      role: "Lab",
      src: "Laboratory report",
      ...reviewed,
    });
    return "l" + (i + 1);
  });
  if (labs.length)
    artifacts.push({
      id: "a-lab",
      kind: "lab",
      title: "Laboratory report",
      date: txt(labs.find((l) => txt(l.date))?.date),
      src: "Laboratory report",
      sec: "labs",
      release: "both",
      unlock: words([
        "lab",
        "result",
        "blood work",
        "test",
        ...labs.map((l) => l.name),
      ]),
      facts: labIds,
      rows: labs.map((l) => ({
        name: txt(l.name),
        value: txt(l.value),
        unit: txt(l.unit),
        ref: txt(l.ref),
        flag: l.flag === "normal" ? "" : txt(l.flag),
      })),
      reviewed: false,
    });

  let imageIndex = 0;
  for (const a of arr(out.imageArtifacts)) {
    const image = images[path.basename(String(a.fileName)).toLowerCase()];
    if (!image) continue;
    imageIndex += 1;
    const kind = ["ecg", "ct", "xray", "lab", "note", "other"].includes(a.kind)
      ? a.kind
      : "other";
    const sec = kind === "lab" ? "labs" : kind === "note" ? "notes" : "img";
    const id = "i" + imageIndex;
    const title = txt(a.title) || "Clinical artifact";
    const unlock = words(a.unlockKeywords);
    facts.push({
      id,
      label: `${title}${txt(a.date) ? " " + txt(a.date) : ""}${txt(a.finding) ? ": " + txt(a.finding) : ""}`,
      say: title,
      topic: title,
      kw: unlock,
      type: "confirmed",
      vis: "chart",
      sec,
      ehr: sec,
      gate: 0,
      role: sec === "img" ? "Imaging" : "Clinician",
      src: title,
      ...reviewed,
    });
    artifacts.push({
      id: "a-" + id,
      kind,
      title,
      date: txt(a.date),
      src: title,
      sec,
      release: unlock.length ? "both" : "section",
      unlock,
      facts: [id],
      fileId: await saveFile(image),
      reviewed: false,
    });
  }

  let mm;
  const d = out.discrepancy || {};
  if (d.present && patientIds[d.patientFactIndex] && chartIds[d.chartFactIndex])
    mm = {
      a: patientIds[d.patientFactIndex],
      b: chartIds[d.chartFactIndex],
      fu: patientIds[d.followUpFactIndex] || patientIds[d.patientFactIndex],
      kw: [...words(d.keywords), "discrep"],
    };

  let objectives = arr(out.objectives)
    .filter((o) => txt(o.text))
    .map((o, i) => {
      const f = (
        Array.isArray(o.patientFactIndexes) ? o.patientFactIndexes : []
      )
        .map((n) => patientIds[n])
        .filter(Boolean);
      const s = (Array.isArray(o.sections) ? o.sections : []).filter((x) =>
        SECTIONS.includes(x),
      );
      let ty = o.type;
      if (ty === "mm" && !mm) ty = f.length ? "fact" : "emp";
      if (ty === "fact" && !f.length) ty = s.length ? "review" : "emp";
      if (ty === "review" && !s.length) s.push("labs");
      if (!["fact", "review", "mm", "emp", "ho"].includes(ty)) ty = "emp";
      return {
        id: "o" + (i + 1),
        t: txt(o.text),
        w: Math.max(0, Number(o.weight) || 0),
        ty,
        ...(ty === "fact" ? { f: [...new Set(f)] } : {}),
        ...(ty === "review" ? { s: [...new Set(s)] } : {}),
        tip: txt(o.tip) || "Ask about this directly and follow up.",
      };
    });
  if (!objectives.length) {
    objectives = [
      {
        id: "o1",
        t: "Gather the chief complaint and history",
        w: 100,
        ty: patientIds.length ? "fact" : "emp",
        ...(patientIds.length ? { f: [patientIds[0]] } : {}),
        tip: "Start with why they came in.",
      },
    ];
    warnings.push(
      "No learning objectives were found in the files, so a placeholder objective was added.",
    );
  }
  // Weights are whole numbers that total exactly 100.
  const total = objectives.reduce((sum, o) => sum + o.w, 0);
  let left = 100;
  objectives.forEach((o, i) => {
    const share = total ? (o.w / total) * 100 : 100 / objectives.length;
    o.w =
      i === objectives.length - 1
        ? left
        : Math.max(
            1,
            Math.min(left - (objectives.length - 1 - i), Math.round(share)),
          );
    left -= o.w;
  });

  if (!patientIds.length)
    warnings.push(
      "No patient history could be extracted. Check that the files contain a case description.",
    );
  if (facts.some((f) => f.src === DRAFTED))
    warnings.push(
      'Facts marked "AI draft (unverified)" were added to fill out the case and are not in your source. Confirm or remove each one.',
    );

  const name = txt(out.name) || "Imported Patient";
  const age =
    Number.isInteger(out.age) && out.age > 0 && out.age <= 120 ? out.age : null;
  const summary = [
    ["Chief complaint", out.complaint],
    ["History", out.history],
    ["Diagnosis", out.diagnosis],
    ["Medications", out.medications],
    ["Allergies", out.allergies],
  ]
    .filter(([, v]) => txt(v))
    .map(([k, v]) => `${k}: ${txt(v)}`)
    .join("\n");
  return {
    id: randomUUID(),
    name,
    age,
    gender: normalGender(out.gender),
    ethnicity: txt(out.ethnicity).slice(0, 80),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(txt(out.dob)) ? { dob: txt(out.dob) } : {}),
    intro: txt(out.intro) || `Hi, I'm ${name.split(" ")[0]}.`,
    personality: txt(out.personality),
    style: txt(out.style),
    emotion: txt(out.emotion),
    caseRubric: "",
    origin: "imported",
    // Shown on the chart's Overview tab: why the patient is here, in a line.
    overview: { reason: txt(out.complaint).slice(0, 240) },
    facts: facts.slice(0, 150),
    artifacts,
    sources: [
      {
        id: "import-source",
        title: "Imported case material",
        excerpt: (sourceText + (summary ? "\n\n" + summary : "")).slice(
          0,
          10000,
        ),
        reviewed: false,
      },
    ],
    obj: objectives,
    ...(mm ? { mm } : {}),
    hints: (Array.isArray(out.hints) ? out.hints : [])
      .map(txt)
      .filter(Boolean)
      .slice(0, 6),
    rubricApplicable: [1, 2, 3, 4, 5, 6, 7],
    reviewAcknowledged: false,
    missing: warnings,
    createdAt: new Date().toISOString(),
  };
}

// Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text).replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === "," || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

// A roster is a CSV with one patient per row: a name column and at least two rows.
function readRoster(file) {
  const ext = extOf(file);
  if (ext !== ".csv" && ext !== ".tsv") return null;
  const rows = parseCsv(bytesOf(file).toString("utf8"));
  const header = (rows[0] || []).map((h) => h.trim());
  const nameCol = header.findIndex(
    (h) => /name/i.test(h) && !/file|test|lab|drug|med/i.test(h),
  );
  if (nameCol < 0 || rows.length < 3) return null;
  const idCol = header.findIndex((h) => /uuid|(^|[^a-z])id$/i.test(h));
  const genderCol = header.findIndex((h) => /^(gender|sex)$/i.test(h));
  const ethnicityCol = header.findIndex((h) => /ethnic|race/i.test(h));
  const strip = (v) =>
    String(v || "")
      .trim()
      .replace(/^"+|"+$/g, "")
      .trim();
  const cell = (r, i) => (i >= 0 ? strip(r[i]) : "");
  return rows
    .slice(1)
    .map((r) => {
      const fields = {};
      header.forEach((h, i) => {
        // Quotes left over from over-quoted exports, and storage links, are noise to the model.
        const v = strip(r[i]);
        if (v && !/^s3:\/\//i.test(v)) fields[h] = v;
      });
      return {
        name: cell(r, nameCol),
        id: cell(r, idCol),
        gender: normalGender(cell(r, genderCol)),
        ethnicity: cell(r, ethnicityCol),
        fields,
      };
    })
    .filter((p) => p.name);
}

// Portrait files are named after the patient ("Walter Greene Patient.png").
// Surnames are matched first because first names get misspelled.
function matchPortrait(patientName, imageFiles) {
  const parts = patientName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const has = (file, word) => baseName(file).toLowerCase().includes(word);
  const last = parts[parts.length - 1];
  return (
    imageFiles.find((f) => parts.every((w) => has(f, w))) ||
    imageFiles.find((f) => last && has(f, last)) ||
    null
  );
}

async function draft(grounding, blocks, note) {
  const content = blocks.concat({
    type: "text",
    text:
      (note ? "Faculty note:\n" + note + "\n\n" : "") +
      "Build the patient profile from the material above. Reply with one JSON object and nothing else (no code fence, no commentary), matching this JSON Schema:\n" +
      JSON.stringify(SCHEMA),
  });
  const modelId = model();
  const response = await claude()
    .beta.messages.stream(
      {
        model: modelId,
        max_tokens: 32000,
        ...(/claude-(?:opus-5|fable-5)/.test(modelId)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
          : {}),
        system: systemFor(grounding),
        output_config: { effort: "medium" },
        messages: [{ role: "user", content }],
      },
      { maxRetries: 5 },
    )
    .finalMessage();
  if (response.stop_reason === "refusal") return { error: "refusal" };
  if (response.stop_reason === "max_tokens") return { error: "too_large" };
  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return {
      out: JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)),
    };
  } catch {
    return { error: "bad_output" };
  }
}

// One patient per roster row, four at a time. `known` holds the ids already in
// the library: those keep their case and only take the roster's gender,
// ethnicity and portrait, unless a redraft was asked for.
async function importRoster(
  patients,
  files,
  rosterFile,
  note,
  saveFile,
  known,
  progress,
) {
  const isImage = (f) => IMAGE_TYPES[extOf(f)];
  const imageFiles = files.filter(isImage);
  const portraitFor = async (patient, used) => {
    const file = matchPortrait(patient.name, imageFiles);
    if (!file) return null;
    used.add(file);
    return saveFile({
      name: baseName(file),
      type: IMAGE_TYPES[extOf(file)],
      data: bytesOf(file),
    });
  };
  const used = new Set();
  const profiles = [];
  const skipped = [];
  const updates = [];
  const fresh = [];
  for (const patient of patients) {
    if (!known.has(patient.id)) {
      fresh.push(patient);
      continue;
    }
    updates.push({
      id: patient.id,
      name: patient.name,
      gender: patient.gender,
      ethnicity: patient.ethnicity,
      portraitFileId: await portraitFor(patient, used),
    });
  }
  const queue = fresh.slice(0, 30);
  if (fresh.length > queue.length)
    skipped.push(
      `${fresh.length - queue.length} roster rows (only the first ${queue.length} are imported at once)`,
    );
  progress({ total: queue.length, kept: updates.length });
  const worker = async () => {
    while (queue.length) {
      const patient = queue.shift();
      progress({ started: patient.name });
      try {
        const row = JSON.stringify(patient.fields, null, 1);
        const res = await draft(
          FROM_ROSTER,
          [{ type: "text", text: "Faculty roster row:\n" + row }],
          note,
        );
        if (res.error) {
          skipped.push(
            `${patient.name} (${res.error === "refusal" ? "the model declined this row" : "could not be drafted, try again"})`,
          );
          progress({ failed: patient.name });
          continue;
        }
        res.out.name = patient.name;
        if (patient.gender) res.out.gender = patient.gender;
        if (patient.ethnicity) res.out.ethnicity = patient.ethnicity;
        const profile = await buildProfile(
          res.out,
          {},
          saveFile,
          "Faculty roster row:\n" + row,
        );
        if (/^[a-zA-Z0-9_-]{4,80}$/.test(patient.id)) profile.id = patient.id;
        profile.original = patient.fields;
        const portrait = await portraitFor(patient, used);
        if (portrait) profile.portraitFileId = portrait;
        profiles.push(profile);
        progress({ finished: patient.name });
      } catch (err) {
        if (err.status === 401 || err.status === 503) throw err;
        console.error("Roster row failed:", patient.name, err.message);
        skipped.push(patient.name + " (could not be drafted, try again)");
        progress({ failed: patient.name });
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const f of files)
    if (f !== rosterFile && !used.has(f))
      skipped.push(
        baseName(f) +
          (isImage(f)
            ? " (no roster patient matches this image name)"
            : " (not used: patients were built from the roster rows)"),
      );
  const order = patients.map((p) => p.name);
  profiles.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return profiles.length || updates.length
    ? { profiles, updates, skipped }
    : { error: "no_content", skipped };
}

// body: { files: [{ name, data(base64) }], note, redraft }.
// known: ids already in the library. saveFile(image) stores bytes, returns id.
async function importCase(body, { known, saveFile, progress = () => {} }) {
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 60);
  const note = String(body.note || "")
    .slice(0, 4000)
    .trim();
  claude();
  for (const file of files) {
    const patients = readRoster(file);
    if (patients && patients.length)
      return importRoster(
        patients,
        files,
        file,
        note,
        saveFile,
        body.redraft ? new Set() : known,
        progress,
      );
  }
  const { blocks, images, skipped } = await readFiles(files);
  if (!blocks.length && !note) return { error: "no_content", skipped };
  progress({ total: 1, kept: 0 });
  progress({ started: "the patient" });
  const res = await draft(FROM_FILES, blocks, note);
  if (res.error) return { error: res.error, skipped };
  progress({ finished: res.out.name || "the patient" });
  const names = files.map(baseName).join(", ");
  return {
    profiles: [
      await buildProfile(
        res.out,
        images,
        saveFile,
        "Imported from: " + (names || "faculty note"),
      ),
    ],
    updates: [],
    skipped,
  };
}

const ERRORS = {
  no_content: "Nothing readable was found in those files.",
  too_large:
    "The case material was too long to convert in one go. Import fewer files at a time.",
  refusal: "The model declined to process this material.",
  bad_output: "The draft came back malformed. Try the import again.",
};

module.exports = { importCase, readRoster, buildProfile, normalGender, ERRORS };
