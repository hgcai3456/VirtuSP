"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const sections = [
  ["ov", "Overview"],
  ["hx", "History"],
  ["meds", "Medications"],
  ["labs", "Labs"],
  ["img", "Imaging"],
  ["notes", "Notes"],
  ["soc", "Social"],
];
const domainNames = [
  "Opening and purpose",
  "Rapport, respect, and empathy",
  "Information gathering",
  "Listening and response to cues",
  "Explanation and shared decisions",
  "Clinical reasoning and synthesis",
  "Professionalism, safety, and closure",
];
let loginStudent = "",
  newStudentAlias = "",
  demoSession = null,
  students = [],
  groups = [],
  assignments = [],
  facultyResults = [],
  selectedStudent = "",
  selectedGroup = "",
  selectedEvidenceId = "";
let list = [],
  history = [],
  profile = null,
  patientDialog = null,
  enc = null,
  issues = [],
  versions = [],
  health = {},
  tab = "studio",
  section = "ov",
  message = "",
  dirty = false,
  busy = false,
  muted = false,
  recognition = null,
  audio = null,
  audioUrl = null,
  speechGeneration = 0,
  listening = false,
  micRestartTimer = null,
  repView = "summary",
  wordingPending = false,
  expandedDocId = "",
  paused = false,
  patientSpeaking = false,
  holdMic = false,
  liveText = "",
  silenceTimer = null,
  audioCtx = null,
  mediaSource = null,
  mouthRaf = 0,
  mouthTimer = 0,
  mouthLevel = 0,
  ignoreMicUntil = 0,
  talkVideoUrl = "",
  talkVideoPoll = 0,
  talkDrawRaf = 0,
  visemes = [],
  faceAnchors = null,
  voiceDisplay = { state: "ready", text: "Ready for your question" };
const wordingTried = new Set();
const SILENCE_MS = 3000;
const liveSupported = () =>
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const reducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const formMemory = {
  handoff: "",
  careplan: "",
  note: "",
  question: "",
};
async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    if (data.issues) issues = data.issues;
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: r.status,
      issues: data.issues,
    });
  }
  return data;
}
function value(path) {
  return path.split(".").reduce((obj, key) => obj?.[key], profile);
}
function control(
  label,
  path,
  { type = "text", options = null, list = false, rows = false } = {},
) {
  let v = value(path);
  if (list) v = (v || []).join(", ");
  if (rows)
    v = (v || [])
      .map((r) => [r.name, r.value, r.unit, r.ref].join(" | "))
      .join("\n");
  const id = "field-" + path.replace(/\./g, "-");
  const attr = `id="${id}" data-path="${esc(path)}" ${list ? 'data-list="true"' : ""} ${rows ? 'data-rows="true"' : ""}`;
  let input;
  if (options)
    input = `<select ${attr}>${options
      .map((o) => {
        const [val, text] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(text)}</option>`;
      })
      .join("")}</select>`;
  else if (type === "textarea")
    input = `<textarea ${attr} rows="3">${esc(v)}</textarea>`;
  else if (type === "checkbox")
    input = `<input ${attr} type="checkbox" ${v ? "checked" : ""}>`;
  else input = `<input ${attr} type="${type}" value="${esc(v)}">`;
  return `<div class="field ${type === "checkbox" ? "checkfield" : ""}"><label for="${id}">${esc(label)}</label>${input}</div>`;
}
const button = (text, action, extra = "", cls = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${extra} ${busy ? "disabled" : ""}>${text}</button>`;
const micIcon =
  '<svg class="mic-glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
function micCopy() {
  if (paused)
    return { label: "Paused", hint: "Tap to resume the conversation" };
  if (busy) return { label: "Thinking", hint: "The patient is responding" };
  if (patientSpeaking)
    return { label: "Speaking", hint: "Tap the photo if you need to pause" };
  if (listening)
    return {
      label: "Listening",
      hint: "Pause 3 seconds when you are done",
    };

  return { label: "Live", hint: "Tap to start the conversation" };
}
function playMedia(el) {
  try {
    const playing = el?.play?.();
    if (playing && typeof playing.catch === "function") {
      playing.catch(() => {});
    }
  } catch {
    /* jsdom and some browsers have no media playback. */
  }
}
function packagedVisitVideo(enc) {
  if (enc?.commonPresentation) return "";
  if (enc?.videoUrl) return enc.videoUrl;
  const id = String(enc?.profileId || "").toLowerCase();
  const name = String(enc?.name || "").toLowerCase();
  const files = {
    nisha: "/video/nisha.mp4",
    yvette: "/video/yvette.mp4",
    omar: "/video/omar.mp4",
    dominic: "/video/dominic.mp4",
    wyatt: "/video/wyatt.mp4",
    walter: "/video/walter.mp4",
    vadko: "/video/vadko.mp4",
    mramirez: "/video/mramirez.mp4",
  };
  if (files[id]) return files[id];
  if (name.includes("nisha")) return files.nisha;
  if (name.includes("yvette")) return files.yvette;
  if (name.includes("omar")) return files.omar;
  if (name.includes("dominic")) return files.dominic;
  if (name.includes("wyatt")) return files.wyatt;
  if (name.includes("walter")) return files.walter;
  if (name.includes("vladko") || name.includes("vadko")) return files.vadko;
  if (name.includes("ramirez")) return files.mramirez;

  return "";
}
function micControl() {
  if (enc?.status === "complete") return "";
  if (!liveSupported())
    return '<p class="mic-hint">Live voice needs Chrome or Edge. Type your question below.</p>';
  const on = listening && !paused;
  const waiting = (busy || patientSpeaking) && !on && !paused;
  const copy = micCopy();

  return `<button type="button" class="mic-btn ${paused ? "paused" : on ? "on" : waiting ? "wait" : ""}" data-action="toggle-pause" aria-pressed="${on}" aria-label="${esc(copy.label)}">${micIcon}<span class="mic-copy"><strong>${esc(copy.label)}</strong><span class="mic-hint">${esc(copy.hint)}</span></span></button>`;
}
function safeLink(url) {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? esc(u.href) : "";
  } catch {
    return "";
  }
}
function storageText() {
  const s = health.storage || {};
  return s.status === "synced"
    ? "AWS copy saved"
    : s.status === "pending"
      ? "AWS save pending"
      : s.status === "failed"
        ? "AWS save failed · local copy saved"
        : "Local recovery storage";
}
async function refresh() {
  const [patients, past, status, people, catalog, tasks] = await Promise.all([
    api("/api/profiles"),
    api("/api/encounters"),
    api("/api/health"),
    api("/api/students"),
    api("/api/groups"),
    api("/api/assignments"),
  ]);
  list = patients.profiles;
  history = past.encounters;
  health = status;
  students = people.students;
  groups = catalog.groups;
  assignments = tasks.assignments;
  selectedStudent ||= students[0]?.id || "";
  selectedGroup ||= groups[0]?.id || "";
  if (demoSession.role === "faculty")
    facultyResults = (await api("/api/faculty-results")).students;
}
async function pick(id) {
  const r = await api("/api/profiles/" + id);
  profile = r.profile;
  issues = r.issues;
  versions = r.versions;
  dirty = false;
}
async function save() {
  if (!profile || patientDialog?.mode === "new") return;
  const r = await api("/api/profiles/" + profile.id, "PUT", { profile });
  issues = r.issues;
  dirty = false;
  await refresh();
}
function card(p, faculty = true) {
  return `<article class="patient-card ${p.id === profile?.id ? "selected" : ""}"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy"><h3>${esc(p.name)}</h3><p>${p.age == null ? "Age unspecified" : esc(p.age) + " years"} · ${esc(p.origin || "")}</p><span class="chip">${p.version ? "Published v" + p.version : "Faculty draft"}</span><div class="row">${faculty ? button("Edit", "pick", `data-id="${esc(p.id)}"`) : ""}${p.version ? button("Start visit", "launch", `data-id="${esc(p.id)}" data-version="${p.version}"`, "pri") : ""}</div></article>`;
}
function studio() {
  if (demoSession?.role === "student")
    return `<div class="pn"><div class="panel-kicker">Individual simulation</div><h1>Choose a patient</h1><p class="muted">Start a visit and receive your assessment when you finish.</p><div class="patient-grid">${list.map((p) => card(p, false)).join("") || "<p>No published practice patients are available yet.</p>"}</div></div>`;
  const preferred = [...list].sort(
    (a, b) =>
      (b.id === profile?.id) - (a.id === profile?.id) ||
      (a.name === "Omar Sinclair"
        ? -2
        : a.name === "Yvette Armstrong"
          ? -1
          : 0) -
        (b.name === "Omar Sinclair"
          ? -2
          : b.name === "Yvette Armstrong"
            ? -1
            : 0),
  );
  return `<div class="pn studio"><div class="studio-head"><div><div class="panel-kicker">Faculty workspace</div><h1>Patient Studio</h1><p class="muted">Create a patient, review the evidence, publish a reusable encounter.</p></div><div class="row">${button("New patient", "new", "", "pri")}<label class="btn file-label">Import faculty CSV<input id="csv-import" type="file" accept=".csv,text/csv" hidden></label></div></div>
 ${studioGroups()}
 <div class="patient-grid">${preferred.map((p) => card(p)).join("")}</div>
 </div>`;
}
function studioGroups() {
  const group = groups.find((g) => g.id === selectedGroup) || groups[0];
  return `<section class="studio-group-panel" aria-labelledby="studio-groups-title"><div><h2 id="studio-groups-title">Assign a patient group</h2><p class="muted">Give a student a prepared test with multiple patient trials.</p></div>${group ? `<div class="row"><label for="studio-group">Patient group</label><select id="studio-group">${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === group.id ? "selected" : ""}>${esc(g.title)} · ${g.trialCount} patients</option>`).join("")}</select>${button("Assign a group", "nav", 'data-tab="tests"', "pri")}${button("Student results", "nav", 'data-tab="results"')}</div><p class="group-preparation">${group.preparationStatus === "ready" ? "Choose a student and assign the prepared group." : group.preparationStatus === "clinical-mismatch" ? "The cases have different clinical settings. Review and republish both before assigning." : "This custom group needs published cases before assignment."}</p>` : `<p>No prepared groups are available.</p>`}</section>`;
}
function recordSelect(label, path, options) {
  const selected = value(path) || [];
  const id = "field-" + path.replace(/\./g, "-");
  return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-path="${esc(path)}" data-selection="true" multiple size="3">${options.map(([id, text]) => `<option value="${esc(id)}" ${selected.includes(id) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></div>`;
}
function editor() {
  const group = (key, title, content) =>
    `<details class="editor-group" data-detail="${key}"><summary>${title}</summary>${content}</details>`;
  const factOptions = profile.facts.map((f) => [f.id, f.topic || f.label]);
  const facts = profile.facts
    .map(
      (f, i) =>
        `<div class="clinical-row" data-fact-index="${i}"><div class="clinical-main">${control("Finding", `facts.${i}.label`)}${control(
          "Available through",
          `facts.${i}.vis`,
          {
            options: [
              ["ask", "Patient interview"],
              ["chart", "Chart only"],
            ],
          },
        )}${button("Remove", "remove-fact", `data-index="${i}"`)}</div>${f.vis === "ask" ? `<div class="patient-phrasing">${control("Patient wording", `facts.${i}.say`, { type: "textarea" })}</div>` : ""}</div>`,
    )
    .join("");
  const sources = profile.sources
    .map(
      (r, i) =>
        `<div class="clinical-row">${control("Document or reference title", `sources.${i}.title`)}${control("Selected evidence", `sources.${i}.excerpt`, { type: "textarea" })}${control("Reference link (optional)", `sources.${i}.url`)}${r.fileId ? `<a href="/api/files/${esc(r.fileId)}" target="_blank" rel="noopener">View original</a>` : ""}${button("Remove", "remove-source", `data-index="${i}"`)}</div>`,
    )
    .join("");
  const artifacts = profile.artifacts
    .map(
      (a, i) =>
        `<div class="clinical-row"><div class="fields">${control("Report title", `artifacts.${i}.title`)}${control("Date (optional)", `artifacts.${i}.date`, { type: "date" })}${control("Chart section", `artifacts.${i}.sec`, { options: sections.slice(1) })}</div>${control("Report text", `artifacts.${i}.text`, { type: "textarea" })}${a.fileId ? `<a href="/api/files/${esc(a.fileId)}" target="_blank" rel="noopener">View report</a>` : ""}${button("Remove", "remove-artifact", `data-index="${i}"`)}</div>`,
    )
    .join("");
  const objectives = profile.obj
    .map(
      (o, i) =>
        `<div class="clinical-row"><div class="fields">${control("Objective", `obj.${i}.t`)}${control("Weight", `obj.${i}.w`, { type: "number" })}${control(
          "Evidence",
          `obj.${i}.ty`,
          {
            options: [
              ["fact", "Findings elicited"],
              ["review", "Records reviewed"],
              ["mm", "Discrepancy reconciled"],
              ["emp", "Communication"],
              ["ho", "SBAR handoff"],
            ],
          },
        )}</div>${control("Coaching", `obj.${i}.tip`)}${o.ty === "fact" ? recordSelect("Relevant findings", `obj.${i}.f`, factOptions) : ""}${o.ty === "review" ? recordSelect("Relevant chart sections", `obj.${i}.s`, sections.slice(1)) : ""}${button("Remove", "remove-objective", `data-index="${i}"`)}</div>`,
    )
    .join("");
  const disclosure = profile.facts
    .map(
      (f, i) =>
        `<div class="clinical-row"><b>${esc(f.topic || f.label || "New finding")}</b><div class="fields">${control("Question topic", `facts.${i}.topic`)}${control("Chart section", `facts.${i}.ehr`, { options: sections.slice(1) })}${control("Release section", `facts.${i}.sec`, { options: [["", "No chart release"], ...sections.slice(1)] })}${control("Source", `facts.${i}.src`, { options: [...new Set([f.src, "Faculty authored", ...profile.sources.map((r) => r.id)])].filter(Boolean).map((id) => [id, profile.sources.find((r) => r.id === id)?.title || id]) })}${control(
          "Disclosure",
          `facts.${i}.gate`,
          {
            options: [
              [0, "On a relevant question"],
              [1, "After initial rapport"],
              [2, "After further rapport"],
              [3, "After sustained rapport"],
            ],
          },
        )}${control("Guarded reply", `facts.${i}.deflect`)}${control("Provenance", `facts.${i}.type`, { options: ["reported", "documented", "confirmed", "unknown"] })}${control("Units (when supplied)", `facts.${i}.unit`)}${control("Measurement date", `facts.${i}.date`, { type: "date" })}${control("Interpretation context", `facts.${i}.ref`)}</div></div>`,
    )
    .join("");
  const releases = profile.artifacts
    .map(
      (a, i) =>
        `<div class="clinical-row"><b>${esc(a.title || "New report")}</b><div class="fields">${control(
          "Release when",
          `artifacts.${i}.release`,
          {
            options: [
              ["section", "Chart section opens"],
              ["question", "Matching question"],
              ["both", "Section or question"],
            ],
          },
        )}${control("Release phrases", `artifacts.${i}.unlock`, { list: true })}${control("Source", `artifacts.${i}.src`, { options: [...new Set([a.src, "Faculty authored", ...profile.sources.map((r) => r.id)])].filter(Boolean).map((id) => [id, profile.sources.find((r) => r.id === id)?.title || id]) })}</div>${recordSelect("Linked findings", `artifacts.${i}.facts`, factOptions)}${control("Lab rows: test | value | unit | reference", `artifacts.${i}.rows`, { type: "textarea", rows: true })}</div>`,
    )
    .join("");
  return `<div class="editor"><p class="muted">Only a name, at least one patient-known finding and your review acknowledgment are needed. Leave unsupplied details blank; optional objectives and documents can be added later.</p><p class="muted" id="save-status">${dirty ? "Unsaved changes" : "Draft"}</p>
  ${["Omar Sinclair", "Yvette Armstrong"].includes(profile.name) && profile.facts.some((f) => f.id === "case-notes") ? button("Prepare organizer case", "prepare") : ""}
  <section class="patient-category"><h2>Patient information and character</h2><div class="fields">${control("Name", "name")}${control("Age (optional)", "age", { type: "number" })}${control("Gender (optional)", "gender")}${control("Self-described ethnicity (optional)", "ethnicity")}${control("Opening line", "intro")}${control("Personality", "personality")}${control("Communication style", "style")}${control("Emotional state", "emotion")}</div>${profile.provenance ? `<p class="muted">${esc(profile.provenance.preparation)}</p>` : ""}</section>
  ${group("facts", "History and clinical information", `<p class="muted">Patient wording is approved phrasing for a finding; dialogue may paraphrase it.</p>${facts}${button("Add finding", "add-fact")}`)}
  ${group("sources", "Documents and references", `${sources}${button("Add source", "add-source")}${button("Add teaching references", "references")}<h3>Chart reports</h3>${artifacts}${button("Add report", "add-artifact")}`)}
  ${group("objectives", "Learning objectives", objectives + button("Add objective", "add-objective"))}
  ${group("advanced", "Advanced scenario settings", `<h3>Disclosure rules</h3>${disclosure}<h3>Report release rules</h3>${releases}${profile.mm ? `<div class="fields">${control("Patient statement", "mm.a", { options: factOptions })}${control("Chart finding", "mm.b", { options: factOptions })}${control("Follow-up finding", "mm.fu", { options: factOptions })}${control("Reconciliation phrases", "mm.kw", { list: true })}</div>${button("Remove discrepancy", "remove-mm")}` : button("Add intentional discrepancy", "add-mm")}${control("Observable rubric domains (1–7)", "rubricApplicable", { list: true })}${control("Case-specific rubric", "caseRubric", { options: [["", "Automatic (by age)"], ["none", "None"], ...(health.caseRubrics || []).map((r) => [r.id, r.title])] })}${profile.missing?.length ? `<h3>Unspecified information</h3><ul>${profile.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}`)}
  <div class="review-box">${control("I reviewed this synthetic case and approve its accuracy, consistency and disclosure rules for student use.", "reviewAcknowledged", { type: "checkbox" })}</div></div>`;
}
function openPatientDialog(mode, selected = profile) {
  patientDialog = {
    mode,
    previous: { profile, versions, issues, dirty },
    files: [],
    description: "",
    notice: "",
    validationError: null,
    openSections: {},
  };
  profile =
    mode === "new"
      ? {
          id: crypto.randomUUID(),
          name: "",
          age: null,
          intro: "Hello.",
          personality: "",
          style: "",
          emotion: "",
          origin: "faculty",
          facts: [],
          sources: [],
          artifacts: [],
          obj: [],
          hints: [],
          missing: [],
          rubricApplicable: [1, 2, 3, 4, 5, 6, 7],
          reviewAcknowledged: false,
          createdAt: new Date().toISOString(),
        }
      : structuredClone(selected);
  versions = mode === "new" ? [] : versions;
  issues = [];
  dirty = false;
  if (mode === "edit") {
    patientDialog.description =
      profile.sources.find((s) => s.id === "description")?.excerpt || "";
    patientDialog.files = profile.sources
      .filter((s) => s.fileId)
      .map((s) => {
        const artifact = profile.artifacts.find((a) => a.fileId === s.fileId);
        return {
          id: s.fileId,
          name: s.title,
          excerpt: s.excerpt,
          role: artifact ? "clinical" : s.role || "case",
          section: artifact?.sec || "notes",
        };
      });
  }
}
function closePatientDialog(restore = true) {
  const returnTab = patientDialog?.returnTab;
  if (restore) ({ profile, versions, issues, dirty } = patientDialog.previous);
  patientDialog = null;
  if (restore && returnTab) tab = returnTab;
}
function syncDialogAttachments() {
  for (const file of patientDialog.files) {
    let source = profile.sources.find((s) => s.fileId === file.id);
    if (!source) {
      source = {
        id: "upload-" + file.id,
        title: file.name,
        excerpt: file.excerpt || "",
        fileId: file.id,
        reviewed: false,
      };
      profile.sources.push(source);
    }
    source.role = file.role;
    const report = profile.artifacts.find((a) => a.fileId === file.id);
    if (file.role === "clinical") {
      if (report) report.sec = file.section;
      else
        profile.artifacts.push({
          id: "report-" + file.id,
          title: file.name,
          src: source.id,
          fileId: file.id,
          kind: "report",
          sec: file.section,
          date: file.date || "",
          release: "section",
          unlock: [],
          facts: profile.facts
            .filter((f) => f.src === source.id && f.vis === "chart")
            .map((f) => f.id),
          rows: [],
          reviewed: false,
        });
    } else if (report)
      profile.artifacts = profile.artifacts.filter((a) => a !== report);
  }
}
function patientForm() {
  if (!patientDialog) return "";
  const d = patientDialog,
    isNew = d.mode === "new";
  return `<dialog id="patient-dialog" class="patient-dialog" aria-labelledby="patient-dialog-title"><form id="patient-form">
    <div class="patient-dialog-head"><div><div class="panel-kicker">Faculty workspace</div><h1 id="patient-dialog-title">${isNew ? "New patient" : "Edit patient"}</h1></div>${button("Cancel", "close-patient")}</div>
    <div class="patient-form-body"><fieldset ${busy ? "disabled" : ""}>
    <section class="form-section" id="patient-upload-area"><h2>Case documents</h2>
      <div class="upload-zone" id="patient-drop-zone"><button type="button" class="upload-browse" data-action="browse-patient" aria-describedby="patient-upload-hint" ${busy ? "disabled" : ""}><span class="upload-icon" aria-hidden="true">↑</span><strong>${busy ? "Uploading files…" : "Drop files here"}</strong><span class="upload-prompt">or click to browse</span><span id="patient-upload-hint" class="upload-hint">PDF, TXT, PNG or JPG · Multiple files · 5 MB each</span></button><input id="patient-upload" type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg" hidden ${busy ? "disabled" : ""}></div>
      ${d.files
        .map(
          (f, i) =>
            `<div class="uploaded-document"><div><b>${esc(f.name)}</b><p class="muted">${f.excerpt?.trim() ? "Text extracted" : "No selectable text; enter details manually. OCR is planned."} · <a href="/api/files/${esc(f.id)}" target="_blank" rel="noopener">View original</a></p></div><div class="file-purpose" role="group" aria-label="Purpose of ${esc(f.name)}">${[
              ["case", "Case brief"],
              ["clinical", "Chart report"],
              ["reference", "Reference"],
            ]
              .map(([v, label]) =>
                button(
                  label,
                  "file-purpose",
                  `data-index="${i}" data-role="${v}" aria-pressed="${f.role === v}"`,
                  f.role === v ? "on" : "",
                ),
              )
              .join("")}</div>${
              f.role === "clinical"
                ? `<details data-detail="upload-${esc(f.id)}"><summary>Chart settings</summary><label>Chart section<select data-upload-index="${i}" data-upload-key="section">${sections
                    .slice(1)
                    .map(
                      ([v, label]) =>
                        `<option value="${v}" ${f.section === v ? "selected" : ""}>${label}</option>`,
                    )
                    .join("")}</select></label></details>`
                : ""
            }${button("Remove", "remove-upload", `data-index="${i}"`)}</div>`,
        )
        .join("")}
      <label for="patient-description">Additional patient details (optional)</label><textarea id="patient-description" rows="2" placeholder="Describe the case or add missing details.">${esc(d.description)}</textarea>
      ${button(busy ? "Extracting…" : "Extract & fill form", "parse-patient", "", "pri")}<p class="muted">Text PDFs supported; scans need transcription. Extraction replaces the fields below.</p>
    </section>
    <section class="form-section"><h2>Patient details</h2>${editor()}</section>
    </fieldset></div>
    <div class="patient-dialog-footer"><p class="form-notice ${d.notice ? "" : "hidden"}" role="status">${esc(d.notice)}</p><div class="row">${button("Save draft", "save-patient")}${button(isNew ? "Create & publish patient" : "Publish version", "submit-patient", "", "pri")}</div></div>
  </form></dialog>${d.validationError ? `<dialog id="publication-error" class="submission-error" role="alertdialog" aria-labelledby="publication-error-title" aria-describedby="publication-error-message"><h2 id="publication-error-title">Before publishing</h2><p id="publication-error-message">${esc(d.validationError.text)}</p>${button("Back to form", "dismiss-publication-error", "", "pri")}</dialog>` : ""}`;
}
async function parsePatient() {
  const d = patientDialog;
  busy = true;
  d.notice = "Extracting explicit patient details and checking their support…";
  render();
  try {
    const r = await api("/api/generate", "POST", {
      description: d.description,
      files: d.files.map(({ id, role, section }) => ({ id, role, section })),
      preview: true,
    });
    if (r.draftError) throw new Error(r.warning);
    // Previewing must never create a library entry or change an existing identity.
    profile = { ...r.profile, id: profile.id, createdAt: profile.createdAt };
    dirty = true;
    d.notice =
      r.provider === "bedrock-draft"
        ? "Details filled. Review and publish."
        : r.warning;
  } catch (e) {
    d.notice = e.message;
  } finally {
    busy = false;
    render();
  }
}
async function submitPatient(publish) {
  const d = patientDialog;
  busy = true;
  d.notice = publish
    ? "Saving the reviewed patient and publishing…"
    : "Saving draft…";
  render();
  try {
    const id = profile.id;
    if (d.mode === "new")
      await api("/api/profiles", "POST", { profile, publish });
    else {
      await api("/api/profiles/" + id, "PUT", { profile });
      if (publish) await api("/api/profiles/" + id + "/publish", "POST", {});
    }
    closePatientDialog(false);
    await refresh();
    await pick(id);
    tab = d.returnTab || "studio";
    message = publish
      ? `${profile.name} published.${profile.comparisonOnly ? " Prepared-group status updated." : " Start a visit from the patient card."}`
      : `${profile.name || "Untitled patient"} saved as a draft.`;
  } catch (e) {
    if (patientDialog) {
      patientDialog.notice = "";
      patientDialog.validationError = publicationError(e);
    } else message = e.message;
  } finally {
    busy = false;
    render();
    if (!patientDialog)
      $('[data-action="pick"][data-id="' + profile.id + '"]')?.focus();
  }
}
function publicationError(error) {
  const text =
    error.issues?.find((i) => i.severity === "error")?.message || error.message;
  if (
    /faculty review|review this fact|verify artifact|review of the complete/i.test(
      text,
    )
  )
    return {
      text: "Confirm faculty review to publish this patient.",
      field: "field-reviewAcknowledged",
    };
  if (/name and an age/.test(text))
    return {
      text: "Enter a patient name and an age from 0 to 120.",
      field: "field-name",
    };
  for (const key of ["facts", "artifacts", "sources", "obj"]) {
    const index = profile[key].findIndex((r) => text.startsWith(r.id + ":"));
    if (index < 0) continue;
    const record = profile[key][index];
    const label = record.label || record.title || record.t || "this item";
    return {
      text: `${label}: ${text.slice(record.id.length + 1).trim()}`,
      field: `field-${key}-${index}-${key === "facts" ? "label" : key === "obj" ? "t" : "title"}`,
    };
  }
  return { text, field: null };
}
function dismissPublicationError() {
  const field = patientDialog.validationError?.field;
  patientDialog.validationError = null;
  render();
  const target = field && document.getElementById(field);
  if (target) {
    let ancestor = target.parentElement;
    while (ancestor && ancestor.id !== "patient-dialog") {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    target.focus();
    target.scrollIntoView?.({ block: "nearest" });
  }
}
function encounter() {
  if (demoSession?.role === "faculty" && enc?.studentId) return assessment();
  if (!enc)
    return `<div class="pn"><h1>Start an encounter</h1><p class="muted">Only published versions can be launched.</p><div class="patient-grid">${list
      .filter((p) => p.version)
      .map((p) => card(p, false))
      .join("")}</div></div>`;
  const clip = packagedVisitVideo(enc);
  return `<div class="grid enc-grid"><section class="pn enc-talk"><div class="panel-kicker">${enc.status === "complete" ? "Completed encounter" : "Student encounter"}</div><div class="av-frame${paused ? " paused" : ""}" id="avf"${enc.status === "active" ? ' data-action="toggle-pause" role="button" tabindex="0" title="Tap to pause or resume"' : ""}><canvas class="av-still av-talk${clip ? " hidden" : ""}" id="av-talk" aria-hidden="true"></canvas><video class="av-still patient-video${clip ? "" : " hidden"}" id="av-video" muted playsinline loop preload="auto"${clip ? ` src="${esc(clip)}"` : ""}></video><img class="av-still patient-photo hidden" src="${esc(enc.imageUrl)}" alt="${esc(enc.name)}"><div class="av-jaw" aria-hidden="true"></div><div class="av-blink" aria-hidden="true"></div><div class="voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="av-pause"><span>Paused · tap to resume</span></div></div><h1>${esc(enc.name)}${enc.age == null ? "" : ", " + esc(enc.age)}</h1>${enc.ethnicity ? `<p class="muted">Self-described ethnicity: ${esc(enc.ethnicity)}</p>` : ""}${enc.groupProgress ? `<p class="chip">Trial ${enc.groupProgress.trial} of ${enc.groupProgress.total} · ${esc(enc.groupProgress.title)}</p>` : ""}<div id="voice-status" role="status">${enc.status === "complete" ? "Encounter complete" : "Ready for your question"}</div><div class="voice-controls">${micControl()}<div class="row voice-secondary">${button(muted ? "Unmute" : "Mute", "mute")}</div></div><form id="question-form"><label for="question">Ask the patient</label><div class="row"><input id="question" maxlength="2000" placeholder="Type a question or use the microphone" ${busy || enc.status === "complete" ? "disabled" : ""} autocomplete="off"><button class="btn pri" type="submit" ${busy || enc.status === "complete" ? "disabled" : ""}>${busy ? "Thinking…" : "Send"}</button></div></form><div class="tr" id="transcript" aria-live="polite">${enc.transcript.map((t) => `<article class="bubble ${t.role === "student" ? "student" : "patient"}" id="${esc(t.id)}"><b>${t.role === "student" ? "You" : esc(enc.name.split(" ")[0])}</b><p>${esc(t.text)}</p>${t.role === "patient" ? `<span class="chip">${esc(t.provider)}${t.factIds?.length ? " · " + esc(t.factIds.join(", ")) : ""}</span>` : ""}</article>`).join("")}</div><div class="row">${enc.status === "active" ? button("Finish & get feedback", "complete", "", "pri") : button("View feedback", "nav", `data-tab="rep"`)}</div></section>
 <section class="pn ehr-panel"><div class="ehr-head"><div><div class="panel-kicker">Dynamic clinical record</div><h2>Chart · ${esc(enc.name)}</h2></div></div>${conversationFiles()}<div class="tabs">${sections.map(([s, name]) => button(name, "section", `data-section="${s}"`, section === s ? "on" : "")).join("")}</div>${chart()}${docLightbox()}</section></div>`;
}
function isVisualDoc(a) {
  return ["ecg", "ct", "image"].includes(a.kind);
}
function artifactBody(a, expanded = false) {
  const visual = a.fileUrl && isVisualDoc(a);
  return `${a.rows?.length ? `<table class="lab-table"><thead><tr><th>Test</th><th>Result</th><th>Reference</th></tr></thead><tbody>${a.rows.map((r) => `<tr class="${esc(r.flag || "")}"><td>${esc(r.name)}</td><td>${esc(r.value)} ${esc(r.unit || "(units unspecified)")}</td><td>${esc(r.ref || "Not specified")}</td></tr>`).join("")}</tbody></table>` : ""}${a.text ? `<p>${esc(a.text)}</p>` : ""}${visual ? `<img class="art-img${expanded ? " expanded" : ""}" src="${esc(a.fileUrl)}" alt="${esc(a.title)}">` : ""}${!visual && a.fileUrl ? `<iframe class="art-frame" title="${esc(a.title)}" src="${esc(a.fileUrl)}"></iframe>` : ""}`;
}
function artifactCard(a) {
  if (!a.released) return "";

  return `<article class="art released open ${a.justReleased ? "just-in" : ""}"><div class="art-head"><h3>${esc(a.title)}</h3>${button("Expand", "expand-doc", `data-id="${esc(a.id)}"`)}</div><p class="chip">${esc(a.src || "Chart")} · ${esc(a.date || "Date unspecified")}</p>${artifactBody(a)}${a.reviewed ? '<span class="ok">Review recorded</span>' : button("Mark reviewed", "review", `data-id="${esc(a.id)}"`)}</article>`;
}
function conversationFiles() {
  const released = enc.artifacts.filter((a) => a.released);
  if (!released.length) return "";

  return `<div class="convo-files"><div class="ehr-head"><div><div class="panel-kicker">From this conversation</div><h3>Documents</h3></div></div>${released.map(artifactCard).join("")}</div>`;
}
function chart() {
  const facts = enc.disclosed.filter(
    (f) => section === "ov" || f.ehr === section,
  );

  return `${facts.map((f) => `<article class="fx"><b>${esc(f.label)}</b></article>`).join("")}
 ${!facts.length ? '<div class="empty">Nothing in this section yet.</div>' : ""}
 ${section !== "ov" && facts.length && !enc.reviewedSections.includes(section) ? button("Record review of these findings", "review-section", `data-section="${section}"`) : ""}`;
}
function docLightbox() {
  const a = enc.artifacts.find((d) => d.id === expandedDocId && d.released);
  if (!a) return "";

  return `<div class="doc-lightbox" data-action="close-doc" role="dialog" aria-modal="true" aria-label="${esc(a.title)}"><div class="doc-sheet" data-action="noop"><div class="art-head"><h3>${esc(a.title)}</h3>${button("Close", "close-doc")}</div>${artifactBody(a, true)}</div></div>`;
}
function team() {
  if (!enc) return '<div class="pn"><h1>Launch an encounter first</h1></div>';
  return `<div class="grid"><div class="pn"><h1>Team record</h1><label for="team-role">Current role</label><select id="team-role"><option>${esc(enc.role)}</option>${[
    "Primary care physician",
    "Dietitian",
    "Nurse",
    "Pharmacist",
    "Specialist",
  ]
    .filter((r) => r !== enc.role)
    .map((r) => `<option>${r}</option>`)
    .join(
      "",
    )}</select><h3>Document findings or reconcile a discrepancy</h3><textarea data-memory="note" id="note" rows="4">${esc(formMemory.note)}</textarea>${button("Save clinical note", "note")}<h3>SBAR handoff</h3><textarea data-memory="handoff" id="handoff" rows="7" placeholder="S: Situation\nB: Background\nA: Assessment and uncertainty\nR: Recommendation / next steps">${esc(formMemory.handoff)}</textarea>${button("Submit handoff", "handoff", "", "pri")}<h3>Care plan</h3><input id="careplan" data-memory="careplan" value="${esc(formMemory.careplan)}" placeholder="Record an educational next step">${button("Add plan item", "plan")}</div><div class="pn"><h2>Saved clinical claims</h2>${enc.notes.map((n) => `<article class="fx"><p>${esc(n.text)}</p><span class="chip">${esc(n.role)} · ${esc(n.at)}${n.addressesMismatch ? " · addresses authored discrepancy" : ""}</span></article>`).join("")}${enc.handoff ? `<h3>Submitted SBAR</h3><pre>${esc(enc.handoff.text)}</pre>` : ""}${enc.plan.map((p) => `<p>${esc(p.text)} <span class="chip">${esc(p.role)}</span></p>`).join("")}<p class="muted">Student notes remain student claims. They do not rewrite approved patient facts.</p></div></div>`;
}
function attempts() {
  // Completed attempts on this patient, oldest first, from the encounter log.
  return history
    .filter((e) => e.profileId === enc.profileId && e.status === "complete")
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
}
function duration() {
  if (!enc.completedAt || !enc.createdAt) return "";
  const minutes = Math.max(
    1,
    Math.round((new Date(enc.completedAt) - new Date(enc.createdAt)) / 60000),
  );
  return ` · ${minutes} min`;
}
function sinceLast() {
  // Change from the previous completed attempt on this patient, if any.
  const all = attempts();
  const index = all.findIndex((e) => e.id === enc.id);
  const now = all[index],
    before = all[index - 1];
  if (
    !before ||
    now?.objectivePercent == null ||
    before.objectivePercent == null
  )
    return "";
  const change = (value, unit) =>
    value === 0
      ? "no change"
      : (value > 0 ? "+" : "−") + Math.abs(value) + unit;
  const parts = [
    "objectives " +
      change(now.objectivePercent - before.objectivePercent, " points"),
    "findings " + change(now.findingsElicited - before.findingsElicited, ""),
  ];
  if (!now.provisional && !before.provisional)
    parts.push("rubric " + change(now.total - before.total, ""));
  return `<p><b>Since your last attempt:</b> ${parts.join(" · ")}</p>`;
}
function progress() {
  const all = attempts();
  const index = all.findIndex((e) => e.id === enc.id);
  if (index < 0 || all.length < 2) return "";
  const score = (e) =>
    e.total == null
      ? "–"
      : e.provisional
        ? "provisional"
        : `${e.total}/${e.denominator}`;
  return `<section class="obj-card"><h2>Your attempts with this patient</h2><div class="sc"><table><tr><th>Attempt</th><th>Date</th><th>Questions</th><th>Findings</th><th>Objectives</th><th>Rubric</th></tr>${all.map((e, i) => `<tr class="${e.id === enc.id ? "current" : ""}"><td>${i + 1}${e.id === enc.id ? " (this one)" : ""}</td><td>${esc(new Date(e.completedAt).toLocaleString())}</td><td>${e.turns}</td><td>${e.findingsTotal == null ? "–" : `${e.findingsElicited}/${e.findingsTotal}`}</td><td>${e.objectivePercent == null ? "–" : e.objectivePercent + "%"}</td><td>${score(e)}</td></tr>`).join("")}</table></div></section>`;
}
function findingsView(a, c) {
  const f = c.findings;
  const dash = '<span class="muted">–</span>';
  const objectives = a.objectives
    .map((o) => {
      const pct = Math.round(o.credit * 100);
      return `<tr><td><b>${esc(o.title)}</b></td><td><div class="progress"><div class="meter" role="img" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div><span>${o.earned}/${o.weight}</span></div></td><td>${turnLinks(o.evidence)}</td><td>${o.credit < 1 && o.next ? esc(o.next) : o.credit >= 1 ? '<span class="ok">Complete</span>' : dash}</td></tr>`;
    })
    .join("");
  const elicited = f.elicited
    .map(
      (x) =>
        `<tr><td>${esc(x.label)}</td><td>${x.source === "chart" ? "Chart" : x.turn ? `<a class="turn-link" href="#turn-${x.turn}">Q${x.turn}</a>` : "Patient"}</td><td>${x.objective ? esc(x.objective) : dash}</td></tr>`,
    )
    .join("");
  const missed = f.missed
    .map(
      (x) =>
        `<tr><td>${esc(x.topic)}</td><td>${x.source === "chart" ? "In the chart" + (x.section ? " · " + esc(x.section) : "") : x.heldBack ? `Asked, but the patient held it back ${turnLinks(x.evidence)}` : "Not asked"}</td><td>${x.objective ? esc(x.objective) : dash}</td></tr>`,
    )
    .join("");
  const reports = f.reports.length
    ? `<h3>Reports</h3><div class="sc"><table class="fb-table"><thead><tr><th>Report</th><th>Chart section</th><th>Status</th></tr></thead><tbody>${f.reports.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.section)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>`
    : "";
  return `<h2>Learning objectives${c.objectivePercent == null ? "" : ` · ${c.objectivePercent}% complete`}</h2>
  ${!a.objectives.length ? '<p class="muted">No case-specific objectives authored. See your standard rubric assessment.</p>' : ""}<div class="sc"><table class="fb-table objectives"><thead><tr><th>Objective</th><th>Progress</th><th>Where</th><th>Next attempt</th></tr></thead><tbody>${objectives}</tbody></table></div>
  <h2>Findings · ${f.elicited.length} of ${f.total} reached</h2>
  <h3>Elicited</h3><div class="sc"><table class="fb-table findings"><thead><tr><th>Finding</th><th>Where</th><th>Objective</th></tr></thead><tbody>${elicited || `<tr><td colspan="3" class="muted">No findings were elicited.</td></tr>`}</tbody></table></div>
  <h3>Not reached</h3><p class="muted">Named by topic only, so the next attempt is still yours to work out.</p><div class="sc"><table class="fb-table findings"><thead><tr><th>Topic</th><th>Status</th><th>Objective</th></tr></thead><tbody>${missed || `<tr><td colspan="3" class="ok">Every authored finding was reached.</td></tr>`}</tbody></table></div>
  ${reports}`;
}
// Question numbers an evidence list refers to, as links into the transcript table.
function turnLinks(ids) {
  const turns = turnIndex();
  const numbers = [...new Set((ids || []).map((id) => turns.get(id)))]
    .filter(Boolean)
    .sort((a, b) => a - b);
  return numbers.length
    ? numbers
        .map((n) => `<a class="turn-link" href="#turn-${n}">Q${n}</a>`)
        .join(" ")
    : '<span class="muted">–</span>';
}
function flowView(a, c) {
  const marks = { strength: "Went well", improve: "To improve", note: "Note" };
  // The aspect of the interview each observation is about.
  const area = (text) =>
    /held back|not ready to share/.test(text)
      ? "Sensitive topic"
      : /first question/.test(text)
        ? "Opening"
        : /open-ended/.test(text)
          ? "Open questions"
          : /judgmental/.test(text)
            ? "Wording"
            : /perspective|feelings/.test(text)
              ? "Empathy"
              : /chart/.test(text)
                ? "Chart review"
                : /new finding/.test(text)
                  ? "Efficiency"
                  : "Interview";
  const rows = c.flow.observations
    .map(
      (o) =>
        `<tr><td><b>${area(o.text)}</b></td><td><span class="chip status-${o.kind}">${marks[o.kind]}</span></td><td>${esc(o.text)}</td><td>${turnLinks(o.evidence)}</td></tr>`,
    )
    .join("");
  return `${rewritesView(c)}<h2>How the interview went</h2><p class="muted">${esc(c.notice)}</p><div class="sc"><table class="fb-table"><thead><tr><th>Area</th><th>Result</th><th>What was observed</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table></div>${transcriptView(a, c)}`;
}
function caseRubricView(r) {
  if (!r) return "";
  const marks = {
    met: "Met",
    partly: "Partly met",
    not_met: "Not met",
    not_observable: "Not observable",
    not_scored: "Not scored",
  };
  const scored = r.total != null;
  return `<h2>Case rubric · ${esc(r.title)}${scored ? ` · ${r.total} / ${r.max}` : ""}</h2><p class="muted">${esc([r.course, r.session].filter(Boolean).join(" · "))}</p><p>${esc(r.notice)}${scored && r.max !== r.fullPoints ? ` Scored out of ${r.max} because part of the ${r.fullPoints}-point rubric could not be observed.` : ""}</p>${r.failure ? `<p class="warn">Model scoring was unavailable for this checklist (${esc(r.failure)}). The criteria are listed for faculty scoring.</p>` : ""}${r.sections.map((sec) => `<section class="obj-card"><h3>${esc(sec.title)} · ${scored ? `${sec.earned} / ${sec.available}` : `${sec.points} points`}</h3><ul class="plain">${sec.criteria.map((cr) => `<li><span class="chip status-${cr.status}">${marks[cr.status]}</span> ${esc(cr.text)} <span class="muted">· ${cr.earned == null ? cr.points : cr.earned + " / " + cr.points} pts</span>${cr.reason ? `<div class="muted">${esc(cr.reason)}</div>` : ""}${cr.evidence.length ? evidence(cr.evidence) : ""}</li>`).join("")}</ul></section>`).join("")}<p class="muted">${esc(r.pointsNote)}${r.model ? " Scored by " + esc(r.model) + "." : ""}</p>`;
}
function rubricView(a) {
  // One line per domain; the detail opens on demand.
  const domain = (d) =>
    `<details class="domain-row"><summary><span class="rating">${d.score === null ? "N/A" : d.score + " / 4"}</span><span><b>${d.domain}. ${esc(d.name)}</b>${d.label ? ` · ${esc(d.label)}` : ""}<span class="muted why">${esc(d.reason)}</span></span></summary><div class="domain-detail">${d.descriptor ? `<p class="level"><b>Rubric level${d.score === null ? "" : " " + d.score}:</b> ${esc(d.descriptor)}</p>` : ""}${d.nextLevel ? `<p class="level"><b>To reach ${d.nextLevel.score} (${esc(d.nextLevel.label)}):</b> ${esc(d.nextLevel.descriptor)}</p>` : ""}<p><b>Next attempt:</b> ${esc(d.next)}</p>${d.triggersReview && d.score === 1 ? '<p class="warn">A score of 1 in this domain triggers faculty review.</p>' : ""}${evidence(d.evidence)}${d.levels ? `<details class="evidence"><summary>All four levels</summary>${d.levels.map((l) => `<p><b>${l.score} ${esc(l.label)}</b> ${esc(l.descriptor)}</p>`).join("")}</details>` : ""}</div></details>`;
  const fields = a.rubric?.evidenceFields || {
    strengths: "Strengths demonstrated",
    gaps: "Missed opportunities",
    concerns: "Safety or accuracy concerns",
  };
  const intro = a.rubric
    ? `<p><b>Total: ${a.total} / ${a.denominator}${a.denominator === a.rubric.maxTotal ? "" : ` (of a possible ${a.rubric.maxTotal})`} · N/A domains: ${a.na}</b></p><p class="muted">${esc(a.rubric.interpretation)}</p><details class="evidence"><summary>How this rubric is scored</summary><p>${esc(a.rubric.instructions)}</p><div class="sc"><table><tr><th>Score</th><th>Label</th><th>Meaning</th></tr>${a.rubric.scale.map((r) => `<tr><td>${r.score}</td><td>${esc(r.label)}</td><td>${esc(r.meaning)}</td></tr>`).join("")}<tr><td>N/A</td><td>${esc(a.rubric.notApplicable.label)}</td><td>${esc(a.rubric.notApplicable.meaning)}</td></tr></table></div></details>`
    : "";
  return `<h2>${esc(a.rubric?.title || "Patient Encounter Performance Rubric")}</h2>${intro}<section class="obj-card domain-list">${a.domains.map(domain).join("")}</section>
  <h2>Evidence from the encounter</h2><div class="sc"><table class="fb-table evidence-notes"><thead><tr><th>Type</th><th>Note</th><th>Where</th></tr></thead><tbody>${["strengths", "gaps", "concerns"].map((k) => (a[k].length ? a[k].map((n, i) => `<tr>${i === 0 ? `<td rowspan="${a[k].length}"><span class="chip status-${k === "strengths" ? "strength" : "improve"}">${esc(fields[k])}</span></td>` : ""}<td>${esc(n.text)}</td><td>${turnLinks(n.evidence)}</td></tr>`).join("") : `<tr><td><span class="chip">${esc(fields[k])}</span></td><td class="muted">None identified by this assessment.</td><td><span class="muted">–</span></td></tr>`)).join("")}</tbody></table></div>
  ${caseRubricView(a.caseRubric)}`;
}
function summaryView(a, c) {
  // The three most useful things, then a short balance of what worked and what did not.
  const steps = c?.nextSteps || [];
  const good = [
      ...a.strengths.map((s) => s.text),
      ...(c?.flow.observations || [])
        .filter((o) => o.kind === "strength")
        .map((o) => o.text),
    ].slice(0, 3),
    work = [
      ...a.gaps.map((s) => s.text),
      ...(c?.flow.observations || [])
        .filter((o) => o.kind === "improve")
        .map((o) => o.text),
    ].slice(0, 3);
  const list = (items, empty) =>
    items.length
      ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
      : `<p class="muted">${empty}</p>`;
  return `<section class="obj-card plan"><h2>Focus for your next attempt</h2>${
    steps.length
      ? `<ol>${steps
          .slice(0, 3)
          .map((s) => `<li>${esc(s.text)}</li>`)
          .join("")}</ol>`
      : '<p class="ok">All learning objectives were met. Try again with fewer questions, or a different patient.</p>'
  }</section>
  <div class="fb-grid"><section class="obj-card"><h3>What went well</h3>${list(good, "Nothing recorded yet.")}</section><section class="obj-card"><h3>What to work on</h3>${list(work, "Nothing flagged.")}</section></div>
  ${progress()}`;
}
// Names the domains that actually triggered review. The rubric sets this rule
// for clinical reasoning and for professionalism/safety only.
function reviewNotice(a) {
  if (!a.reviewRequired) return "";
  const rule = a.rubric?.reviewDomains || [6, 7];
  const hit = a.domains.filter((d) => rule.includes(d.domain) && d.score === 1);
  const names = hit.map((d) => `${d.domain}. ${d.name}`);
  const listed =
    names.length > 1
      ? names.slice(0, -1).join(", ") + " and " + names.at(-1)
      : names[0];
  return `<p class="warn"><b>Faculty review required.</b> ${esc(listed)} ${hit.length > 1 ? "were" : "was"} rated 1. The rubric asks for review whenever clinical reasoning or professionalism and safety is rated 1, even if the total is high. A 1 in other domains does not trigger it.</p>`;
}
function assessment() {
  if (enc?.feedbackHeld)
    return `<div class="pn"><h1>Trial saved</h1><p>Standard feedback becomes available after every trial in this group is complete.</p>${button("Continue to next patient", "next-test", `data-id="${esc(enc.attemptId)}"`, "pri")}</div>`;
  if (!enc) return '<div class="pn"><h1>No active encounter</h1></div>';
  if (!enc.assessment)
    return `<div class="pn"><h1>Encounter feedback</h1><p>${demoSession.role === "faculty" && enc.studentId ? "The student is still completing this encounter." : "Finish the encounter to assess the complete evidence."}</p>${demoSession.role === "faculty" && enc.studentId ? biasEvidenceView() : button("Finish & get feedback", "complete", "", "pri")}</div>`;
  const a = enc.assessment,
    c = a.coaching,
    provisional = a.provider === "local-provisional";
  const views = [
    ["summary", "Summary"],
    ...(c ? [["findings", "Objectives & findings"]] : []),
    ...(c ? [["interview", "Interview"]] : []),
    ["rubric", a.caseRubric ? "Rubrics" : "Rubric"],
  ];
  if (!views.some(([k]) => k === repView)) repView = "summary";
  const body =
    repView === "findings"
      ? findingsView(a, c)
      : repView === "interview"
        ? flowView(a, c)
        : repView === "rubric"
          ? rubricView(a)
          : summaryView(a, c);
  const caseScore =
    a.caseRubric?.total != null
      ? `<div><div class="score-num">${a.caseRubric.total}/${a.caseRubric.max}</div><div class="muted">case rubric</div></div>`
      : "";
  return `<div class="pn"><div class="panel-kicker">Encounter feedback</div><h1>${esc(enc.name)} · feedback on this attempt</h1>
  <div class="score-hero"><div><div class="score-num">${a.total}/${a.denominator}</div><div class="muted">rubric${provisional ? " (provisional)" : ""}</div></div>${c?.objectivePercent == null ? "" : `<div><div class="score-num">${c.objectivePercent}%</div><div class="muted">learning objectives</div></div>`}${caseScore}<div><p>${c ? `${c.findings.elicited.length} of ${c.findings.total} findings reached · ${c.flow.questions} questions asked` : ""}${duration()}</p>${sinceLast()}<p class="muted">${esc(a.notice)}</p></div></div>
  ${provisional ? '<div class="warn">Model assessment is unavailable, so the rubric ratings are provisional placeholders for faculty review, not a measured performance grade. Objectives, findings and the interview review come from the recorded encounter and are not affected.</div>' : ""}${reviewNotice(a)}
  <div class="rep-tabs" role="tablist">${views.map(([k, name]) => button(name, "rep-view", `data-view="${k}" role="tab" aria-selected="${repView === k}"`, repView === k ? "on" : "")).join("")}</div>
  ${biasEvidenceView()}${body}
  ${demoSession?.role === "faculty" ? biasPanel(enc.biasAnalysis, "encounter", enc.id, enc.status === "complete") : ""}
  <div class="row rep-actions">${enc.attemptId ? button("Assigned tests", "nav", 'data-tab="tests"', "pri") : button("Try this patient again", "retry", "", "pri")}${button("All attempts", "nav", `data-tab="history"`)}<a class="btn" href="/api/encounters/${esc(enc.id)}/export">Download record</a></div>
  <p class="muted small">${a.na} N/A domains · ${esc(a.provider)}${a.model ? " · " + esc(a.model) : ""}${a.revised ? " · revised once after automated review" : ""}${a.failure ? " · fallback: " + esc(a.failure) : ""}</p></div>`;
}
function turnIndex() {
  // Event ID → the question number it belongs to (0 before the first question).
  let n = 0;
  const map = new Map();
  for (const e of enc.events) {
    if (e.type === "student") n++;
    map.set(e.id, n);
  }
  return map;
}
function evidence(ids) {
  const turns = turnIndex();
  const kinds = {
    student: "You asked",
    patient: "The patient replied",
    disclose: "Finding shared",
    gate: "The patient held a topic back",
    open: "Chart opened",
    review: "Chart reviewed",
    release: "Report released",
    reconcile: "Clinical note recorded",
    handoff: "Handoff submitted",
    start: "Encounter started",
    complete: "Encounter completed",
  };
  return `<details class="evidence"><summary>Evidence (${ids.length})</summary>${
    ids.length
      ? ids
          .map((id) => {
            const e = enc.events.find((e) => e.id === id);
            if (!e) return `<p>${esc(id)}</p>`;
            const n = turns.get(id);
            const detail =
              e.type === "communication"
                ? [
                    e.openQuestion && "open question",
                    e.empathy && "acknowledged the patient's perspective",
                    e.judgmental && "judgmental wording",
                  ]
                    .filter(Boolean)
                    .join(", ") || "no tag"
                : e.type === "gate"
                  ? ""
                  : e.text || "";
            return `<p><b>${n ? "Question " + n : "Start"} · ${esc(kinds[e.type] || (e.type === "communication" ? "Automated question tag" : e.type))}</b> ${esc(detail)}${n ? ` <a class="turn-link" href="#turn-${n}">Show in transcript</a>` : ""}</p>`;
          })
          .join("")
      : "<p>No observed evidence cited.</p>"
  }</details>`;
}
function rewritesView(c) {
  if (wordingPending)
    return `<section class="obj-card"><h2>Try wording it this way</h2><p class="muted">Preparing wording suggestions for this visit…</p></section>`;
  if (!c.rewrites?.length)
    return c.rewriteFailure
      ? `<p class="muted">Wording suggestions were unavailable for this attempt.</p>`
      : "";
  // Older saved visits stored the reason in other fields.
  const reason = (r) =>
    r.reason ||
    (r.reasoning ? r.reasoning.asked + " " + r.reasoning.better : r.why || "");
  return `<section class="obj-card"><h2>Try wording it this way</h2><p class="muted">Model suggestions for questions you actually asked. They change wording only and are not part of any rating.</p><ul class="plain">${c.rewrites.map((r) => `<li><div class="muted">Question ${r.turn} · ${esc(r.issue)} <a class="turn-link" href="#turn-${r.turn}">Show in transcript</a></div><div class="reword"><div><b>You asked</b><span>${esc(r.question)}</span></div><div><b>Instead</b><span>${esc(r.rewrite)}</span></div>${reason(r) ? `<div><b>Why</b><span>${esc(reason(r))}</span></div>` : ""}</div></li>`).join("")}</ul></section>`;
}
// A visit finished before wording suggestions (or their reasons) existed gets
// them once, the first time its feedback is opened with a model available.
async function ensureWording() {
  const c = enc?.assessment?.coaching;
  if (
    !c ||
    wordingPending ||
    health.dialogue === "local" ||
    wordingTried.has(enc.id) ||
    (c.wordingAt && (c.rewrites || []).every((r) => r.reason))
  )
    return;
  const id = enc.id;
  wordingTried.add(id);
  wordingPending = true;
  render();
  try {
    const r = await api(`/api/encounters/${id}/coaching`, "POST", {});
    if (enc?.id === id) enc = r.encounter;
  } catch {
    // The visit keeps whatever feedback it already had.
  } finally {
    wordingPending = false;
    render();
  }
}
function transcriptView(a, c) {
  const turns = turnIndex();
  // Which rubric domains and feedback items cite each question.
  const cited = new Map();
  const cite = (ids, label) => {
    for (const id of ids || []) {
      const n = turns.get(id);
      if (!n) continue;
      if (!cited.has(n)) cited.set(n, new Set());
      cited.get(n).add(label);
    }
  };
  for (const d of a.domains)
    cite(
      d.evidence,
      `${d.domain}. ${d.name}${d.score === null ? "" : " (" + d.score + "/4)"}`,
    );
  const notes = new Map();
  const noteOn = (items, kind, label) => {
    for (const item of items)
      for (const id of item.evidence || []) {
        const n = turns.get(id);
        if (!n) continue;
        if (!notes.has(n)) notes.set(n, []);
        if (!notes.get(n).some((x) => x.text === item.text))
          notes.get(n).push({ kind, label, text: item.text });
      }
  };
  noteOn(a.strengths, "strength", "Strength");
  noteOn(a.gaps, "improve", "Missed opportunity");
  noteOn(a.concerns, "improve", "Concern");
  const steps = new Map(
    (c?.flow.steps || [])
      .filter((s) => s.kind === "question")
      .map((s) => [s.eventId, s]),
  );
  // Pair each question with the patient's reply that followed it.
  const rows = [];
  let n = 0;
  enc.transcript.forEach((t, i) => {
    if (t.role !== "student") return;
    n++;
    const reply = enc.transcript[i + 1];
    const s = steps.get(t.id);
    const tags = s
      ? [
          s.open && "open question",
          s.empathy && "acknowledged perspective",
          s.judgmental && "judgmental wording",
        ].filter(Boolean)
      : [];
    const result = !s
      ? ""
      : s.gained.length
        ? `<span class="ok">New: ${s.gained.map(esc).join("; ")}</span>`
        : s.heldBack
          ? "The patient held this back"
          : '<span class="muted">No new finding</span>';
    // Visits completed before objective credit was recorded have no such field.
    const credited = s?.credited || [];
    const refs = [...(cited.get(n) || [])];
    rows.push(
      `<tr class="turn" id="turn-${n}"><td><div class="exchange"><b>Q${n} · You</b><span>${esc(t.text)}${tags.length ? `<div>${tags.map((x) => `<span class="chip">${x}</span>`).join(" ")}</div>` : ""}</span><b>${esc(enc.name.split(" ")[0])}</b><span>${reply?.role === "patient" ? esc(reply.text) : '<span class="muted">–</span>'}</span></div></td><td>${result}${credited.length ? `<div class="muted">Counts toward: ${credited.map(esc).join("; ")}</div>` : ""}</td><td>${refs.length ? `<div class="cite-group"><b>Rubric domains</b>${refs.map((r) => `<div>${esc(r)}</div>`).join("")}</div>` : ""}${(notes.get(n) || []).map((x) => `<div class="cite-note"><span class="chip status-${x.kind}">${x.label}</span> ${esc(x.text)}</div>`).join("")}${refs.length || notes.get(n)?.length ? "" : '<span class="muted">–</span>'}</td></tr>`,
    );
  });
  return `<h2>Annotated transcript</h2><p class="muted">Each question, the reply, what it achieved and where the feedback refers to it. Question tags come from automated classification.</p><div class="sc"><table class="fb-table annotated"><thead><tr><th>Question and reply</th><th>What it achieved</th><th>Cited in feedback</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="3" class="muted">No questions were asked.</td></tr>'}</tbody></table></div>`;
}
function past() {
  return `<div class="pn"><h1>Encounter history</h1><div class="history-list">${history.map((e) => `<article class="fx"><h2>${esc(e.name)} · v${e.version}</h2><p>${esc(e.status)} · ${e.turns} questions${e.feedbackHeld ? " · Feedback held until all trials finish" : e.total != null ? ` · rubric ${e.total}/${e.denominator}` : ""}</p>${button(e.status === "complete" ? "View encounter" : "Resume encounter", "resume", `data-id="${esc(e.id)}"`)} <a href="/api/encounters/${esc(e.id)}/export">Download record</a></article>`).join("") || "<p>No encounters yet.</p>"}</div></div>`;
}
function rolePicker() {
  return `<div class="pn role-picker"><div class="panel-kicker">VirtuSP demo</div><h1>Choose your workspace</h1><p>Faculty prepares patients and reviews student results. Students practice and complete assigned tests.</p><div class="role-grid"><section><h2>Faculty</h2>${button("Enter Faculty", "choose-role", 'data-role="faculty"', "pri")}</section><section><h2>Student</h2><label for="demo-student">Demo student</label><select id="demo-student">${students.map((s) => `<option value="${esc(s.id)}" ${s.id === loginStudent ? "selected" : ""}>${esc(s.alias)}</option>`).join("")}</select>${button("Enter Student", "choose-role", 'data-role="student"', "pri")}</section></div><p class="muted">Local demonstration identities; no passwords.</p></div>`;
}
function assignmentCards(items) {
  return items
    .map(
      (a) =>
        `<article class="group-card assignment-card"><div><h2>${esc(a.title)}</h2><p class="muted">${a.attempt ? `${a.attempt.completed}/${a.attempt.trials.length} trials complete` : `${a.cases.length} patient trials`}</p></div>${button(a.attempt?.status === "complete" ? "View results" : a.attempt ? "Resume assessment" : "Start assessment", "start-test", `data-id="${esc(a.id)}"`, "pri")}</article>`,
    )
    .join("");
}
function studentHome() {
  const alias =
    students.find((s) => s.id === demoSession.studentId)?.alias || "Student";
  const assigned = assignments.filter((a) => a.origin !== "open");
  return `<section class="pn student-assignments"><div class="workspace-heading"><div><div class="panel-kicker">Student workspace · ${esc(alias)}</div><h1>My assigned assessments</h1></div>${button("Select open assessments", "nav", 'data-tab="open-assessments"')}</div>${assignmentCards(assigned) || '<div class="empty-assignments"><h2>No assessments assigned yet</h2><p class="muted">You can choose an open assessment to begin practicing.</p></div>'}${history.length ? button("View my attempts", "nav", 'data-tab="history"') : ""}</section>`;
}
function openAssessments() {
  const alias =
    students.find((s) => s.id === demoSession.studentId)?.alias || "Student";
  return `<section class="student-home" aria-labelledby="simulation-choice"><div class="panel-kicker">Student workspace · ${esc(alias)}</div><h1 id="simulation-choice">Select open assessments</h1><p class="muted">Practice with one patient or complete a group of patient trials.</p><div class="simulation-choices"><button type="button" class="simulation-choice" data-action="nav" data-tab="studio"><span class="choice-symbol" aria-hidden="true">01</span><span class="choice-title">Individual patient</span><span class="choice-description">Choose a published patient from Patient Studio. Receive feedback after the visit.</span><span class="choice-cta">Choose a patient →</span></button><button type="button" class="simulation-choice" data-action="nav" data-tab="tests"><span class="choice-symbol" aria-hidden="true">02</span><span class="choice-title">Patient group</span><span class="choice-description">Choose an open group of patient trials. Complete every trial to unlock feedback.</span><span class="choice-cta">Choose a group →</span></button></div>${history.length ? button("View my attempts", "nav", 'data-tab="history"') : ""}</section>`;
}
function studentGroups() {
  const available = groups.filter(
    (g) => g.availableToAll && g.preparationStatus === "ready",
  );
  return `<div class="pn"><div class="panel-kicker">Open assessments</div><h1>Choose a patient group</h1><p class="muted">Complete all patient trials to unlock your assessment.</p>${
    available
      .map((g) => {
        const assignment = assignments.find((a) => a.groupId === g.id);
        return `<article class="group-card"><h2>${esc(g.title)}</h2><p>${esc(g.purpose)}</p><p class="muted">${assignment?.attempt ? `${assignment.attempt.completed}/${assignment.attempt.trials.length} trials complete` : `${g.trialCount} patient trials`}</p>${button(assignment?.attempt?.status === "complete" ? "View results" : assignment?.attempt ? "Resume assessment" : "Start group", assignment ? "start-test" : "start-available", `data-id="${esc(assignment?.id || g.id)}"`, "pri")}</article>`;
      })
      .join("") || "<p>No open group assessments are available yet.</p>"
  }</div>`;
}
function groupBuilder() {
  return `<details class="group-builder"><summary>Create a patient group</summary><p class="muted">Select published cases. Practice groups can combine different conditions; demographic comparisons require matching clinical settings.</p><label for="group-title">Group name</label><input id="group-title" maxlength="120"><label for="group-purpose">Purpose (optional)</label><input id="group-purpose" maxlength="1000"><label for="group-kind">Group type</label><select id="group-kind"><option value="practice">Practice</option><option value="comparison">Demographic comparison</option></select><fieldset><legend>Patients (select at least two)</legend>${list
    .filter((p) => p.version)
    .map(
      (p) =>
        `<label><input type="checkbox" name="group-patient" value="${esc(p.id)}"> ${esc(p.name)}</label>`,
    )
    .join(
      "",
    )}</fieldset><label><input id="group-available" type="checkbox"> Include in open assessments</label>${button("Create group", "create-group", "", "pri")}</details>`;
}
function testCatalog() {
  if (demoSession.role === "student") return studentGroups();
  return `<div class="pn"><h1>Assign a patient group</h1><p class="muted">Choose a student, then assign a prepared assessment.</p><div class="row assignment-target"><label for="assign-student">Student</label><select id="assign-student">${students.map((s) => `<option value="${esc(s.id)}" ${s.id === selectedStudent ? "selected" : ""}>${esc(s.alias)}</option>`).join("")}</select></div>${groups.map((g) => `<article class="group-card faculty-group"><div class="workspace-heading"><div><h2>${esc(g.title)}</h2><p class="muted">${g.trialCount} patient trials · ${g.preparationStatus === "ready" ? "Ready to assign" : g.preparationStatus === "clinical-mismatch" ? "Cases need matching clinical settings" : "Publish the selected cases first"}</p></div>${button("Assign group", "assign-group", `data-id="${esc(g.id)}" ${g.preparationStatus !== "ready" ? 'disabled title="Publish matching cases before assigning"' : ""}`, "pri")}</div><p>${esc(g.purpose)}</p><details class="group-details"><summary>Group details and settings</summary><p>${esc(g.differences)}</p><p class="muted">${esc(g.provenance)}</p><label class="open-assessment-setting"><input type="checkbox" data-group-open="${esc(g.id)}" ${g.availableToAll ? "checked" : ""}> Include in open assessments</label><p class="muted">Students can choose this group without a faculty assignment.</p><div class="row">${g.cases.map((c) => button(`Edit ${c.name}`, "pick", `data-id="${esc(c.profileId)}"`)).join("")}</div><p class="muted">${esc(g.limitations)}</p><p class="muted">${esc(g.sourceNote)}</p></details></article>`).join("")}${groupBuilder()}<details class="student-management"><summary>Manage demo students</summary><div class="row"><label for="new-student-alias">New alias</label><input id="new-student-alias" maxlength="80" value="${esc(newStudentAlias)}">${button("Add student", "add-student")}</div></details><h2>Assigned assessments</h2>${
    assignments
      .filter((a) => a.origin !== "open")
      .map(
        (a) =>
          `<p>${esc(students.find((s) => s.id === a.studentId)?.alias)} · ${esc(a.title)} · ${a.attempt ? `${a.attempt.completed}/${a.attempt.trials.length} trials complete` : "Not started"}</p>`,
      )
      .join("") || "<p>No assessments assigned yet.</p>"
  }</div>`;
}
function biasPanel(result, type, id, ready) {
  const r = result || { status: "pending", findings: [], limitations: [] };
  const scored = r.rubricAssessment;
  const citations = (refs) =>
    refs
      .map(
        (ref) =>
          `<div class="bias-citation">${ref.quote ? `<q>${esc(ref.quote)}</q> ` : ""}${button("View cited event", "bias-evidence", `data-id="${esc(ref.encounterId)}" data-event="${esc(ref.eventId)}"`)}</div>`,
      )
      .join("");
  const tables = scored
    ? scored.encounters
        .map(
          (e) =>
            `<h4>${esc(e.name)} · version ${esc(e.version)}</h4><div class="bias-table-wrap"><table class="bias-rubric"><thead><tr><th>Category</th><th>Performance</th><th>Evidence and coaching</th></tr></thead><tbody>${scored.evaluations
              .filter((v) => v.encounterId === e.id)
              .map(
                (v) =>
                  `<tr><th scope="row">${esc(scored.rubric.categories.find((c) => c.id === v.categoryId)?.name || v.categoryId)}</th><td>${v.score === null ? "Not observable" : `${v.score} · ${esc(scored.rubric.scale[v.score])}`}</td><td><p>${esc(v.reason)}</p>${citations(v.evidence)}${v.coaching ? `<p class="muted">Next time: ${esc(v.coaching)}</p>` : ""}</td></tr>`,
              )
              .join("")}</tbody></table></div>`,
        )
        .join("")
    : "";
  const findings = scored ? scored.comparisons : r.findings;
  return `<section class="bias-panel"><h3>Bias assessment · Faculty review</h3><p>${r.status === "pending" ? "Awaiting analysis" : r.status === "unavailable" ? "Analysis unavailable" : "Analysis complete"}</p>${ready ? button(r.status === "complete" ? "Recheck bias assessment" : "Run bias assessment", "analyze-bias", `data-type="${esc(type)}" data-id="${esc(id)}"`, "pri") : '<p class="muted">Available after this encounter or all group trials finish.</p>'} <a href="/api/bias/rubric/file" target="_blank" rel="noopener">View source rubric</a><p class="muted">Five separate performance ratings: 1 Unsatisfactory to 4 Exemplary. Higher is stronger performance. No combined bias score.</p>${tables}${findings.length ? `<h4>Possible bias indicators for faculty review</h4>${findings.map((f) => `<p>${esc(f.text)}</p>${citations(f.evidence)}`).join("")}` : r.status === "complete" ? "<p>No additional indicators reported; this does not establish absence of bias.</p>" : ""}<details><summary>Limits of this analysis</summary>${r.limitations.map((l) => `<p class="muted">${esc(l)}</p>`).join("")}<p class="muted">Separate from the student's seven-domain assessment. Encounter differences alone do not establish bias.</p></details></section>`;
}
function biasEvidenceView() {
  if (demoSession?.role !== "faculty" || !selectedEvidenceId) return "";
  const event = enc?.events.find((e) => e.id === selectedEvidenceId);
  if (!event) return "";
  const turn = enc.transcript.find((t) => t.id === event.id);
  return `<section class="bias-panel cited-event"><h2>Cited encounter event</h2><p>${esc(event.type)} · ${esc(new Date(event.at).toLocaleString())}</p><p>${esc(turn?.text || event.text || "Recorded encounter action")}</p><p class="muted">${esc(event.id)}</p></section>`;
}
function resultsPage() {
  return `<div class="pn"><h1>Student results</h1>${facultyResults.map((s) => `<section class="student-results"><h2>${esc(s.alias)}</h2>${s.attempts.map((a) => `<article class="group-card"><h3>${esc(a.title)} · ${a.completed}/${a.trials.length} trials</h3>${a.trials.map((t, i) => `<p>Trial ${i + 1}: ${esc(t.name)} · ${esc(t.status)} ${t.encounterId ? button("View trial", "resume", `data-id="${esc(t.encounterId)}"`) : ""}</p>`).join("")}${biasPanel(a.biasAnalysis, "attempt", a.id, a.status === "complete")}</article>`).join("")}${s.encounters.map((e) => `<article class="result-row"><h3>${esc(e.name)} · ${esc(e.status)}</h3><p>${e.total == null ? "Assessment pending" : `Rubric ${e.total}/${e.denominator}${e.provisional ? " · provisional" : ""}`} · ${e.turns} questions</p>${button("View assessment & evidence", "resume", `data-id="${esc(e.id)}"`)}${biasPanel(e.biasAnalysis, "encounter", e.id, e.status === "complete")}</article>`).join("") || "<p>No encounters yet.</p>"}</section>`).join("")}</div>`;
}
function render() {
  if (!demoSession) {
    $("#nav").innerHTML = "";
    $("#mode").textContent = "Local demo";
    $("#app").innerHTML = rolePicker();
    return;
  }
  if (
    demoSession.role === "student" &&
    ["student-home", "open-assessments"].includes(tab)
  ) {
    $("#nav").innerHTML =
      (tab === "open-assessments"
        ? button("My assignments", "nav", 'data-tab="student-home"')
        : "") + button("Switch workspace", "switch-role");
    $("#mode").textContent = "Student";
    $("#app").innerHTML =
      `<div class="toast ${message ? "" : "hidden"}" role="status">${esc(message)}</div>` +
      (tab === "student-home" ? studentHome() : openAssessments());
    return;
  }
  const focusId = document.activeElement?.id;
  const dialogScroll = $(".patient-form-body")?.scrollTop || 0;
  if (patientDialog && $("#patient-dialog")?.dataset.profileId === profile.id)
    for (const detail of document.querySelectorAll(
      "#patient-dialog details[data-detail]",
    ))
      patientDialog.openSections[detail.dataset.detail] = detail.open;
  const navs = [
    ...(demoSession.role === "student"
      ? [
          ["student-home", "My assignments"],
          ["open-assessments", "Open assessments"],
        ]
      : []),
    [
      "studio",
      demoSession.role === "student" ? "Individual patients" : "Patient Studio",
    ],
    ["enc", "Encounter"],
    ["team", "Team"],
    ["rep", "Assessment"],
    ["history", "History"],
    [
      "tests",
      demoSession.role === "faculty" ? "Prepared groups" : "Patient groups",
    ],
    ...(demoSession.role === "faculty" ? [["results", "Student results"]] : []),
  ];
  $("#nav").innerHTML =
    navs
      .map(([k, name]) =>
        button(name, "nav", `data-tab="${k}"`, tab === k ? "on" : ""),
      )
      .join("") +
    button(
      demoSession.role === "faculty"
        ? "Faculty · switch"
        : `${students.find((s) => s.id === demoSession.studentId)?.alias || "Student"} · switch`,
      "switch-role",
    );
  $("#mode").textContent =
    health.dialogue === "local"
      ? "Local fallback"
      : `Bedrock configured · ${health.region}`;
  $("#themeBtn").textContent = "Theme";
  $("#app").innerHTML =
    `<div class="app-status"><span>${esc(storageText())}</span><span>${busy ? "Working…" : dirty ? "Unsaved draft changes" : ""}</span></div><div class="toast ${message ? "" : "hidden"}" role="status">${esc(message)}</div>` +
    {
      studio,
      "student-home": studentHome,
      "open-assessments": openAssessments,
      enc: encounter,
      team,
      rep: assessment,
      history: past,
      tests: testCatalog,
      results: resultsPage,
    }[tab]() +
    patientForm();
  if (patientDialog) {
    const dialog = $("#patient-dialog");
    dialog.dataset.profileId = profile.id;
    for (const detail of dialog.querySelectorAll("details[data-detail]"))
      detail.open = patientDialog.openSections[detail.dataset.detail] === true;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    $(".patient-form-body").scrollTop = dialogScroll;
    const focus = focusId && document.getElementById(focusId);
    if (focus && dialog.contains(focus)) focus.focus();
    else $("#patient-description")?.focus();
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!busy) {
        closePatientDialog();
        render();
        $('[data-action="new"]')?.focus();
      }
    });
    if (patientDialog.validationError) {
      const errorDialog = $("#publication-error");
      if (errorDialog.showModal) errorDialog.showModal();
      else errorDialog.setAttribute("open", "");
      errorDialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        dismissPublicationError();
      });
      const field =
        patientDialog.validationError.field &&
        document.getElementById(patientDialog.validationError.field);
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("invalid-field");
      }
      $('[data-action="dismiss-publication-error"]')?.focus();
    }
  }
  if ($("#question")) {
    $("#question").value = formMemory.question;
    $("#question").dataset.memory = "question";
  }
  if (tab === "enc") $("#transcript")?.scrollTo(0, 1e9);
  voiceState(voiceDisplay.state, voiceDisplay.text);
  setFaceAnchor();
  initTalkAvatar();
  attachTalkVideo();
  updateMicButton();
  syncLive();
}
function resetTalkVideo() {
  clearInterval(talkVideoPoll);
  talkVideoPoll = 0;
  if (talkVideoUrl) URL.revokeObjectURL(talkVideoUrl);
  talkVideoUrl = "";
  stopTalkAvatar();
}
function avatarSeed(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}
function avatarLook(p) {
  const n = avatarSeed((p?.profileId || "") + "|" + (p?.name || ""));
  const female = String(p?.gender || "")
    .toLowerCase()
    .startsWith("f");
  const age = Number(p?.age);
  const skins = ["#f3d0b5", "#e2b896", "#c68642", "#8d5524", "#f1c27d"];
  const hairs = female
    ? ["#1b120c", "#4a2c1a", "#6b4423", "#2e1a12", "#3d2b1f"]
    : ["#1a1a1a", "#2c241b", "#3b2f2f", "#4a3728", "#111111"];

  return {
    female,
    older: Number.isFinite(age) && age >= 60,
    skin: skins[n % skins.length],
    hair: hairs[(n >> 3) % hairs.length],
    shirt: ["#2f5d62", "#3d4f7a", "#5a3e36", "#355c4a"][(n >> 6) % 4],
    sway: 0.45 + (n % 8) / 18,
  };
}
function talkCanvas(canvas) {
  try {
    return canvas.getContext?.("2d") || null;
  } catch {
    return null;
  }
}
function drawTalkingPerson(canvas, p, mouth) {
  const ctx = talkCanvas(canvas);
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const look = avatarLook(p);
  const t = Date.now() / 1000;
  const idle = Math.sin(t * look.sway) * 5;
  const nod = patientSpeaking ? Math.sin(t * 8.5) * 3 : idle * 0.25;
  const open = Math.max(patientSpeaking ? 0.12 : 0.04, Number(mouth) || 0);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#dfe8ea");
  bg.addColorStop(1, "#9fb3b0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h * 0.52 + nod);
  ctx.rotate((idle * Math.PI) / 880);
  ctx.fillStyle = look.shirt;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.4, w * 0.44, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.fillRect(-w * 0.07, h * 0.02, w * 0.14, h * 0.16);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.08, w * 0.19, h * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.22, w * 0.2, h * 0.14, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (look.female) {
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, 0.02 * h, w * 0.07, h * 0.2, 0.25, 0, Math.PI * 2);
    ctx.ellipse(w * 0.2, 0.02 * h, w * 0.07, h * 0.2, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  const blink = Math.sin(t * 0.85) > 0.96 ? 0.12 : 1;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(
    -w * 0.06,
    -h * 0.12,
    w * 0.032,
    h * 0.018 * blink,
    0,
    0,
    Math.PI * 2,
  );
  ctx.ellipse(
    w * 0.06,
    -h * 0.12,
    w * 0.032,
    h * 0.018 * blink,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#24180f";
  ctx.beginPath();
  ctx.arc(-w * 0.06, -h * 0.12, w * 0.012, 0, Math.PI * 2);
  ctx.arc(w * 0.06, -h * 0.12, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = look.hair;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, -h * 0.165);
  ctx.lineTo(-w * 0.028, -h * 0.155);
  ctx.moveTo(w * 0.028, -h * 0.155);
  ctx.lineTo(w * 0.1, -h * 0.165);
  ctx.stroke();
  ctx.strokeStyle = "rgba(80,40,30,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.1);
  ctx.lineTo(-w * 0.01, -h * 0.018);
  ctx.lineTo(w * 0.016, -h * 0.018);
  ctx.stroke();
  ctx.fillStyle = "#7a3038";
  ctx.beginPath();
  ctx.ellipse(
    0,
    h * 0.045,
    w * 0.058,
    h * 0.012 + open * h * 0.05,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#2c0c10";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.05, w * 0.04, open * h * 0.032, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function stopTalkAvatar() {
  if (!talkDrawRaf) return;
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(talkDrawRaf);
  } else {
    clearTimeout(talkDrawRaf);
  }
  talkDrawRaf = 0;
}
function initTalkAvatar() {
  const canvas = $("#av-talk");
  if (!canvas || !enc) return;
  if (talkVideoUrl || packagedVisitVideo(enc)) {
    canvas.classList.add("hidden");
    stopTalkAvatar();

    return;
  }
  if (!talkCanvas(canvas)) {
    $("#avf .patient-photo")?.classList.remove("hidden");

    return;
  }
  canvas.classList.remove("hidden");
  canvas.width = 640;
  canvas.height = 520;
  $("#avf .patient-photo")?.classList.add("hidden");
  $("#avf")?.classList.add("has-video");
  stopTalkAvatar();
  const frame =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 40);
  const tick = () => {
    drawTalkingPerson(canvas, enc, mouthLevel);
    talkDrawRaf = frame(tick);
  };
  talkDrawRaf = frame(tick);
}
function attachTalkVideo() {
  const v = $("#av-video");
  const clip = talkVideoUrl || packagedVisitVideo(enc);
  if (!v || !clip) return;
  if (!v.src || !String(v.src).includes(clip.replace(/^\//, ""))) v.src = clip;
  v.classList.remove("hidden");
  $("#av-talk")?.classList.add("hidden");
  $("#avf")?.classList.add("has-video");
  $("#avf .patient-photo")?.classList.add("hidden");
  v.playbackRate = patientSpeaking ? 1 : 0.55;
  v.muted = true;
  v.loop = true;
  playMedia(v);
}
async function warmTalkVideo() {
  if (enc?.commonPresentation) return;
  if (packagedVisitVideo(enc)) {
    attachTalkVideo();

    return;
  }
  if (
    !enc ||
    enc.status !== "active" ||
    health.speech !== "elevenlabs-configured"
  )
    return;
  const id = enc.id;
  const tryLoad = async () => {
    if (!enc || enc.id !== id || tab !== "enc") return;
    try {
      const r = await fetch(`/api/encounters/${id}/talking-video`);
      if (r.status !== 200) return;
      const blob = await r.blob();
      if (talkVideoUrl) URL.revokeObjectURL(talkVideoUrl);
      talkVideoUrl = URL.createObjectURL(blob);
      attachTalkVideo();
      clearInterval(talkVideoPoll);
      talkVideoPoll = 0;
    } catch {
      /* Photo visemes remain until a clip is ready. */
    }
  };
  await tryLoad();
  if (talkVideoUrl || talkVideoPoll) return;
  talkVideoPoll = setInterval(tryLoad, 8000);
}
function setMouth(level) {
  mouthLevel = level;
  $("#avf")?.style.setProperty("--mouth", level.toFixed(3));
}
function stopMouth() {
  if (mouthRaf) {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(mouthRaf);
    } else {
      clearTimeout(mouthRaf);
    }
  }
  mouthRaf = 0;
  clearInterval(mouthTimer);
  mouthTimer = 0;
  setMouth(0);
}
function stopPatientAudio() {
  speechGeneration++;
  patientSpeaking = false;
  stopMouth();
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  if (mediaSource) {
    try {
      mediaSource.disconnect();
    } catch {
      /* Already disconnected. */
    }
    mediaSource = null;
  }
  window.speechSynthesis?.cancel();
  $("#avf")?.classList.remove("speaking");
}
function stopLive() {
  listening = false;
  clearTimeout(micRestartTimer);
  clearTimeout(silenceTimer);
  liveText = "";
  const rec = recognition;
  recognition = null;
  try {
    rec?.abort();
  } catch {
    /* A disconnected recognizer is already stopped. */
  }
  $("#avf")?.classList.remove("listening");
}
function stopAudio() {
  stopPatientAudio();
  stopLive();
  voiceState(
    "ready",
    enc?.status === "complete"
      ? "Encounter complete"
      : "Ready for your question",
  );
  updateMicButton();
}
function voiceState(state, text) {
  voiceDisplay = { state, text };
  $("#avf")?.classList.toggle("speaking", state === "speaking");
  $("#avf")?.classList.toggle("listening", state === "listening");
  if ($("#voice-status")) $("#voice-status").textContent = text;
}
function visemesFromText(text) {
  const seq = [];
  for (const ch of String(text || "").toLowerCase()) {
    if ("aeiou".includes(ch)) seq.push(ch === "o" || ch === "a" ? 0.92 : 0.7);
    else if ("mbp".includes(ch)) seq.push(0.04);
    else if ("w".includes(ch)) seq.push(0.35);
    else if (/\s/.test(ch)) seq.push(0.08);
    else seq.push(0.28);
  }

  return seq.length ? seq : [0.45, 0.2, 0.65, 0.18];
}
function startVisemes(generation, el) {
  if (reducedMotion) return;
  const seq = visemes.length ? visemes : visemesFromText("aa ee oo");
  const frame =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 32);
  const tick = () => {
    if (generation !== speechGeneration || !patientSpeaking) return;
    const duration = el?.duration;
    const t =
      el && Number.isFinite(duration) && duration > 0
        ? el.currentTime / duration
        : (Date.now() % 900) / 900;
    const i = Math.min(seq.length - 1, Math.floor(t * seq.length));
    const target = seq[i];
    mouthLevel += (target - mouthLevel) * 0.35;
    setMouth(mouthLevel);
    mouthRaf = frame(tick);
  };
  mouthRaf = frame(tick);
}
function pulseTalkVideo(speaking) {
  const v = $("#av-video");
  if (!v || v.classList.contains("hidden") || !v.src) return;
  v.playbackRate = speaking ? 1 : 0.55;
  playMedia(v);
}
async function speak(turn) {
  stopPatientAudio();
  if (muted || tab !== "enc" || !turn) {
    holdMic = false;
    ignoreMicUntil = Date.now() + 250;
    syncLive();

    return;
  }
  const generation = speechGeneration;
  patientSpeaking = true;
  holdMic = true;
  visemes = visemesFromText(turn.text);
  stopLive();
  const settle = (state, text) => {
    if (generation !== speechGeneration) return;
    patientSpeaking = false;
    holdMic = false;
    ignoreMicUntil = Date.now() + 280;
    stopMouth();
    pulseTalkVideo(false);
    voiceState(state, text);
    updateMicButton();
    syncLive();
  };
  if (health.speech === "elevenlabs-configured") {
    voiceState("thinking", "Preparing patient voice…");
    audio = new Audio(`/api/encounters/${enc.id}/speech/${turn.id}/stream`);
    audio.preload = "auto";
    audio.onplay = () => {
      if (generation !== speechGeneration) return;
      voiceState("speaking", "Patient speaking · ElevenLabs");
      pulseTalkVideo(true);
      startVisemes(generation, audio);
    };
    audio.onended = () => settle("listening", "Listening…");
    audio.onerror = () =>
      settle("ready", "Audio unavailable; transcript remains available");
    try {
      await audio.play();

      return;
    } catch {
      if (generation !== speechGeneration) return;
      stopMouth();
      voiceState("ready", "Cloud speech unavailable · browser voice fallback");
    }
  }
  if ("speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.onstart = () => {
      if (generation !== speechGeneration) return;
      voiceState("speaking", "Patient speaking · browser voice");
      pulseTalkVideo(true);
      startVisemes(generation);
    };
    utter.onend = () => settle("listening", "Listening…");
    utter.onerror = () =>
      settle("ready", "Audio unavailable; use the transcript");
    speechSynthesis.speak(utter);

    return;
  }
  patientSpeaking = false;
  holdMic = false;
  syncLive();
}
async function mutate(action, payload) {
  const r = await api(`/api/encounters/${enc.id}/${action}`, "POST", payload);
  enc = r.encounter;
  health.storage = r.storage;
}
async function question(text) {
  if (busy || !text.trim() || enc?.status !== "active") return;
  stopPatientAudio();
  holdMic = true;
  busy = true;
  message = "";
  liveText = "";
  stopLive();
  voiceState("thinking", "The patient is answering…");
  updateMicButton();
  let delivered = false;
  try {
    await mutate("turn", { question: text, requestId: crypto.randomUUID() });
    formMemory.question = "";
    delivered = true;
  } catch (e) {
    message = e.message;
  }
  busy = false;
  render();
  if (delivered && enc?.transcript.at(-1)?.role === "patient")
    speak(enc.transcript.at(-1));
  else {
    holdMic = false;
    syncLive();
  }
}
function updateMicButton() {
  const button = $('.mic-btn[data-action="toggle-pause"]');
  if (!button) return;
  const on = listening && !paused;
  const waiting = (busy || patientSpeaking) && !on && !paused;
  const copy = micCopy();
  button.classList.toggle("on", on);
  button.classList.toggle("wait", waiting);
  button.classList.toggle("paused", paused);
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", copy.label);
  const strong = button.querySelector(".mic-copy strong");
  const hint = button.querySelector(".mic-hint");
  if (strong) strong.textContent = copy.label;
  if (hint) hint.textContent = copy.hint;
}
function setFaceAnchor() {
  const avf = $("#avf");
  if (!avf || !enc) return;
  const file = (enc.imageUrl || "").split("/").pop();
  const anchor = (faceAnchors &&
    (faceAnchors[file] || faceAnchors.default)) || {
    mouthTop: 0.66,
    mouthHeight: 0.2,
  };
  avf.style.setProperty("--mouth-top", anchor.mouthTop);
  avf.style.setProperty("--mouth-h", anchor.mouthHeight);
}
function togglePause() {
  if (!enc || enc.status !== "active") return;
  paused = !paused;
  if (paused) {
    stopPatientAudio();
    stopLive();
    voiceState("ready", "Paused · tap the patient to resume.");
  } else {
    voiceState("ready", "Resuming the conversation…");
  }
  $("#avf")?.classList.toggle("paused", paused);
  updateMicButton();
  syncLive();
}
function micIsHeld() {
  return (
    holdMic || patientSpeaking || busy || paused || Date.now() < ignoreMicUntil
  );
}
function syncLive() {
  if (tab !== "enc" || !enc || enc.status !== "active" || !liveSupported()) {
    if (listening) stopLive();

    return;
  }
  if (holdMic || patientSpeaking || busy || paused) {
    if (listening) stopLive();

    return;
  }
  if (Date.now() < ignoreMicUntil) {
    clearTimeout(micRestartTimer);
    micRestartTimer = setTimeout(syncLive, ignoreMicUntil - Date.now() + 20);

    return;
  }
  if (listening || recognition) return;

  startLive();
}
function startLive() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return;
  const rec = new Rec();
  recognition = rec;
  listening = true;
  const prefix = liveText.trim();
  const live = () =>
    tab === "enc" &&
    enc?.status === "active" &&
    !micIsHeld() &&
    recognition === rec;
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onstart = () => {
    if (live())
      voiceState(
        "listening",
        "Listening… I'll answer after you pause 3 seconds.",
      );
  };
  rec.onresult = (e) => {
    if (!live()) return;
    const heard = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    liveText = [prefix, heard].filter(Boolean).join(" ").trim();
    if ($("#question")) $("#question").value = liveText;
    formMemory.question = liveText;
    const words = liveText.split(/\s+/).filter(Boolean).length;
    clearTimeout(silenceTimer);
    if (!words) return;
    silenceTimer = setTimeout(commitUtterance, SILENCE_MS);
  };
  rec.onerror = (e) => {
    if (!live() || e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      paused = true;
      stopLive();
      message =
        "Microphone permission denied. Allow mic access, then tap the patient to resume.";
      voiceState("ready", "Paused · microphone access needed.");
      updateMicButton();
    }
  };
  rec.onend = () => {
    if (recognition !== rec) return;
    recognition = null;
    listening = false;
    if (!micIsHeld() && tab === "enc" && enc?.status === "active")
      micRestartTimer = setTimeout(syncLive, 120);
  };
  try {
    rec.start();
  } catch {
    recognition = null;
    listening = false;
  }
  updateMicButton();
}
function commitUtterance() {
  clearTimeout(silenceTimer);
  const text = liveText.trim();
  liveText = "";
  if (!text || busy || enc?.status !== "active" || patientSpeaking) return;
  if ($("#question")) $("#question").value = "";
  question(text);
}
async function upload(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error("Upload files up to 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const type =
    file.type ||
    (/\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.png$/i.test(file.name)
        ? "image/png"
        : /\.jpe?g$/i.test(file.name)
          ? "image/jpeg"
          : "text/plain");
  return (
    await api("/api/files", "POST", {
      name: file.name,
      type,
      data: btoa(binary),
    })
  ).file;
}
async function addPatientFiles(files) {
  if (!patientDialog || busy || !files.length) return;
  busy = true;
  patientDialog.notice = "Uploading and extracting document text…";
  render();
  try {
    // Validate the batch before uploading; browse and drop use the same path.
    for (const file of files) {
      if (!/\.(pdf|txt|png|jpe?g)$/i.test(file.name))
        throw new Error("Choose PDF, TXT, PNG or JPG files.");
      if (file.size > 5 * 1024 * 1024)
        throw new Error(`${file.name}: upload files up to 5 MB.`);
    }
    for (const file of files)
      patientDialog.files.push({
        ...(await upload(file)),
        role: "case",
        section: "notes",
      });
    patientDialog.notice =
      "Choose each document’s purpose, then Extract & fill form.";
  } catch (error) {
    patientDialog.notice = error.message;
  } finally {
    // A partially uploaded batch remains attached if a later file fails.
    syncDialogAttachments();
    profile.reviewAcknowledged = false;
    dirty = true;
    busy = false;
    render();
  }
}
for (const type of ["dragenter", "dragover", "dragleave", "drop"])
  document.addEventListener(
    type,
    (e) => {
      if (!patientDialog) return;
      // Prevent file drops elsewhere in the form from navigating away.
      if (type === "dragover" || type === "drop") e.preventDefault();
      const zone = $("#patient-drop-zone");
      if (!zone) return;
      // Accept files throughout the document section, including its heading,
      // nested button contents and previously uploaded cards.
      const area = $("#patient-upload-area");
      const inside = area?.contains(e.target);
      if (type === "dragenter" || type === "dragover") {
        zone.classList.toggle("drag-active", inside && !busy);
        if (e.dataTransfer)
          e.dataTransfer.dropEffect = inside && !busy ? "copy" : "none";
      }
      if (type === "dragleave" && !area?.contains(e.relatedTarget))
        zone.classList.remove("drag-active");
      if (type === "drop") {
        zone.classList.remove("drag-active");
        if (!inside || busy) return;
        let files = Array.from(e.dataTransfer?.files || []);
        if (!files.length)
          files = Array.from(e.dataTransfer?.items || [])
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (files.length) addPatientFiles(files);
        else {
          patientDialog.notice =
            "Drag files from File Explorer, or click the upload area to browse.";
          render();
        }
      }
    },
    true,
  );
document.addEventListener("input", async (e) => {
  const t = e.target;
  if (t.id === "demo-student") loginStudent = t.value;
  if (t.id === "assign-student") selectedStudent = t.value;
  if (t.id === "studio-group") {
    selectedGroup = t.value;
    render();
  }
  if (t.dataset.groupOpen) {
    try {
      await api(`/api/groups/${t.dataset.groupOpen}`, "PUT", {
        availableToAll: t.checked,
      });
      const group = groups.find((g) => g.id === t.dataset.groupOpen);
      if (group) group.availableToAll = t.checked;
    } catch (error) {
      t.checked = !t.checked;
      message = error.message;
      $(".toast").textContent = message;
      $(".toast").classList.remove("hidden");
    }
    return;
  }
  if (t.id === "new-student-alias") newStudentAlias = t.value;
  if (t.id === "patient-description") {
    patientDialog.description = t.value;
    dirty = true;
    return;
  }
  if (t.dataset.memory) {
    formMemory[t.dataset.memory] = t.value;
    return;
  }
  if (t.dataset.path) {
    const keys = t.dataset.path.split(".");
    let obj = profile;
    for (const key of keys.slice(0, -1)) obj = obj[key];
    let v =
      t.type === "checkbox"
        ? t.checked
        : t.type === "number"
          ? t.value === ""
            ? null
            : Number(t.value)
          : t.value;
    if (t.dataset.list)
      v = t.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (t.dataset.selection)
      v = Array.from(t.selectedOptions).map((o) => o.value);
    if (keys.at(-1) === "gate") v = Number(v);
    if (t.dataset.rows)
      v = t.value
        .split("\n")
        .filter((s) => s.trim())
        .map((line) => {
          const [name, value, unit, ref] = line.split("|").map((s) => s.trim());
          return { name, value, unit, ref };
        });
    if (t.dataset.path === "rubricApplicable") v = v.map(Number);
    if (keys.at(-1) === "lab") v = v === "true";
    obj[keys.at(-1)] = v;
    if (keys.at(-1) === "vis" && keys[0] === "facts") {
      if (v === "chart") obj.sec ||= obj.ehr || "hx";
      render();
    }
    if (t.dataset.path === "reviewAcknowledged") {
      for (const records of [profile.facts, profile.sources, profile.artifacts])
        records.forEach((r) => (r.reviewed = v));
    }
    if (t.dataset.path !== "reviewAcknowledged") {
      profile.reviewAcknowledged = false;
      if (
        ["facts", "sources", "artifacts"].includes(keys[0]) &&
        keys.at(-1) !== "reviewed"
      ) {
        obj.reviewed = false;
        const reviewControl = $(
          "#field-" + keys.slice(0, 2).join("-") + "-reviewed",
        );
        if (reviewControl) reviewControl.checked = false;
      }
      const acknowledgment = $("#field-reviewAcknowledged");
      if (acknowledgment) acknowledgment.checked = false;
    }
    dirty = true;
  }
  if ($("#save-status"))
    $("#save-status").textContent =
      "Unsaved changes · Save draft before leaving the editor.";
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "patient-form") {
    e.preventDefault();
    if (!busy) submitPatient(true);
  }
  if (e.target.id === "question-form") {
    e.preventDefault();
    question($("#question").value);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.dataset.uploadIndex !== undefined) {
      patientDialog.files[Number(e.target.dataset.uploadIndex)][
        e.target.dataset.uploadKey
      ] = e.target.value;
      syncDialogAttachments();
      profile.reviewAcknowledged = false;
      dirty = true;
      render();
    }
    if (e.target.id === "patient-upload") {
      await addPatientFiles(Array.from(e.target.files || []));
    }
    if (e.target.id === "csv-import") {
      const r = await api("/api/import", "POST", {
        csv: await e.target.files[0].text(),
      });
      message = `Imported ${r.added.length} drafts; skipped ${r.skipped.length} existing IDs.`;
      await refresh();
      render();
    }
    if (e.target.id === "team-role") {
      await mutate("role", { role: e.target.value });
      render();
    }
  } catch (err) {
    busy = false;
    if (patientDialog) patientDialog.notice = err.message;
    else message = err.message;
    render();
  }
});
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action;
  if (busy && a !== "toggle-pause") return;
  try {
    if (a === "browse-patient") {
      $("#patient-upload")?.click();
      return; // Keep the input mounted while the system file picker is open.
    }
    message = "";
    if (
      [
        "choose-role",
        "switch-role",
        "assign-group",
        "start-test",
        "start-available",
        "next-test",
        "add-student",
        "bias-evidence",
        "analyze-bias",
      ].includes(a)
    ) {
      busy = true;
      render();
    }
    if (a === "choose-role") {
      const r = await api("/api/session", "POST", {
        role: t.dataset.role,
        studentId: loginStudent || students[0]?.id,
      });
      demoSession = r.session;
      tab = demoSession.role === "student" ? "student-home" : "studio";
      await refresh();
      busy = false;
      render();
      return;
    }
    if (a === "switch-role") {
      stopAudio();
      await api("/api/session", "DELETE");
      demoSession = null;
      enc = null;
      profile = null;
      patientDialog = null;
      history = [];
      list = [];
      facultyResults = [];
      groups = [];
      assignments = [];
      issues = [];
      versions = [];
      health = {};
      newStudentAlias = "";
      selectedEvidenceId = "";
      dirty = false;
      tab = "studio";
      repView = "summary";
      expandedDocId = "";
      message = "";
      for (const k of Object.keys(formMemory)) formMemory[k] = "";
      localStorage.removeItem("virtusp-active-v2");
      busy = false;
      render();
      return;
    }
    if (a === "create-group") {
      const payload = {
        title: $("#group-title").value,
        purpose: $("#group-purpose").value,
        kind: $("#group-kind").value,
        availableToAll: $("#group-available").checked,
        profileIds: Array.from(
          document.querySelectorAll('[name="group-patient"]:checked'),
        ).map((el) => el.value),
      };
      // Preserve the form on failure; only redraw after the request succeeds.
      busy = true;
      try {
        await api("/api/groups", "POST", payload);
        await refresh();
        message = "Patient group created.";
      } catch (error) {
        busy = false;
        message = error.message;
        $(".toast").textContent = message;
        $(".toast").classList.remove("hidden");
        return;
      }
    }
    if (a === "add-student") {
      const alias = newStudentAlias;
      await api("/api/students", "POST", { alias });
      newStudentAlias = "";
      await refresh();
    }
    if (a === "assign-group") {
      selectedGroup = t.dataset.id;
      await api("/api/assignments", "POST", {
        groupId: selectedGroup,
        studentId: selectedStudent,
      });
      await refresh();
      message = "Group assigned.";
    }
    if (a === "start-test" || a === "start-available") {
      const route = a === "start-available" ? "groups" : "assignments";
      const r = await api(`/api/${route}/${t.dataset.id}/start`, "POST", {});
      if (r.attempt.status === "complete") {
        tab = "history";
        await refresh();
      } else {
        const n = await api(`/api/attempts/${r.attempt.id}/next`, "POST", {});
        enc = n.encounter;
        localStorage.setItem("virtusp-active-v2", enc.id);
        section = "ov";
        tab = "enc";
      }
    }
    if (a === "next-test") {
      const r = await api(`/api/attempts/${t.dataset.id}/next`, "POST", {});
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
    }
    if (a === "analyze-bias") {
      const result = await api(
        `/api/bias/${t.dataset.type}/${t.dataset.id}/analyze`,
        "POST",
        {},
      );
      await refresh();
      if (enc) enc = (await api(`/api/encounters/${enc.id}`)).encounter;
      message =
        result.biasAnalysis.status === "complete"
          ? "Faculty bias assessment ready."
          : "Bias assessment unavailable. See the analysis limits and retry.";
    }
    if (a === "bias-evidence") {
      enc = (await api(`/api/encounters/${t.dataset.id}`)).encounter;
      selectedEvidenceId = t.dataset.event;
      tab = "rep";
      repView = "interview";
      busy = false;
      render();
      $(".cited-event")?.scrollIntoView?.({ block: "center" });
      return;
    }
    if (a === "rep-view") {
      repView = t.dataset.view;
      if (repView === "interview") ensureWording();
    }
    if (a === "nav") {
      if (tab === "studio" && dirty) await save();
      stopAudio();
      tab = t.dataset.tab;
      if (
        [
          "student-home",
          "open-assessments",
          "history",
          "tests",
          "results",
        ].includes(tab)
      )
        await refresh();
    }
    if (a === "pick") {
      if (dirty) await save();
      await pick(t.dataset.id);
      const returnTab = tab;
      tab = "studio";
      openPatientDialog("edit");
      patientDialog.returnTab = returnTab;
    }
    if (a === "new") {
      if (dirty) await save();
      tab = "studio";
      openPatientDialog("new");
    }
    if (a === "close-patient") {
      closePatientDialog();
      render();
      $('[data-action="new"]')?.focus();
      return;
    }
    if (a === "dismiss-publication-error") {
      dismissPublicationError();
      return;
    }
    if (a === "file-purpose") {
      patientDialog.files[Number(t.dataset.index)].role = t.dataset.role;
      syncDialogAttachments();
      profile.reviewAcknowledged = false;
      dirty = true;
    }
    if (a === "parse-patient") {
      await parsePatient();
      return;
    }
    if (a === "save-patient" || a === "submit-patient") {
      await submitPatient(a === "submit-patient");
      return;
    }
    if (a === "remove-upload") {
      const [file] = patientDialog.files.splice(Number(t.dataset.index), 1);
      const sources = profile.sources
        .filter((s) => s.fileId === file.id)
        .map((s) => s.id);
      profile.sources = profile.sources.filter((s) => s.fileId !== file.id);
      profile.artifacts = profile.artifacts.filter((a) => a.fileId !== file.id);
      profile.facts = profile.facts.filter((f) => !sources.includes(f.src));
      patientDialog.notice =
        "File removed from extraction. Extract again to rebuild the form without it.";
    }
    if (a === "prepare") {
      await save();
      await api("/api/profiles/" + profile.id + "/prepare", "POST", {});
      await pick(profile.id);
      message =
        "Organizer facts organized into reviewable suggestions. Missing details remain unspecified.";
    }
    if (a === "retry") {
      stopAudio();
      const r = await api("/api/encounters", "POST", {
        profileId: enc.profileId,
        version: enc.version,
      });
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
      await refresh();
      render();
      speak(enc.transcript.at(-1));
      return;
    }
    if (a === "launch") {
      if (dirty) await save();
      stopAudio();
      paused = false;
      formMemory.question = "";
      const r = await api("/api/encounters", "POST", {
        profileId: t.dataset.id,
        version: Number(t.dataset.version),
      });
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
      resetTalkVideo();
      render();
      warmTalkVideo();
      speak(enc.transcript.at(-1));
      return;
    }
    if (a === "resume") {
      stopAudio();
      paused = false;
      formMemory.question = "";
      enc = (await api("/api/encounters/" + t.dataset.id)).encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      selectedEvidenceId = "";
      tab =
        enc.status === "complete" ||
        (demoSession.role === "faculty" && enc.studentId)
          ? "rep"
          : "enc";
      repView = "summary";
      resetTalkVideo();
      if (tab === "enc") warmTalkVideo();
    }
    if (a === "section") {
      if (enc.status === "active")
        await mutate("open", { section: t.dataset.section });
      section = t.dataset.section;
    }
    if (a === "expand-doc") expandedDocId = t.dataset.id;
    if (a === "close-doc") expandedDocId = "";
    if (a === "review") await mutate("review", { artifactId: t.dataset.id });
    if (a === "review-section")
      await mutate("review", { section: t.dataset.section });
    if (a === "note") {
      await mutate("note", { text: formMemory.note });
      formMemory.note = "";
    }
    if (a === "handoff") await mutate("handoff", { text: formMemory.handoff });
    if (a === "plan") {
      await mutate("plan", { text: formMemory.careplan });
      formMemory.careplan = "";
    }
    if (a === "complete") {
      stopAudio();
      busy = true;
      message =
        "Completing the encounter and preparing evidence-linked feedback…";
      render();
      await mutate("complete", {});
      repView = "summary";
      await refresh();
      busy = false;
      tab = "rep";
      message = "Encounter saved.";
    }
    if (a === "toggle-pause") {
      togglePause();
      return;
    }
    if (a === "mute") {
      muted = !muted;
      stopPatientAudio();
      voiceState(
        "ready",
        muted ? "Audio muted · the patient still listens." : "Listening…",
      );
      updateMicButton();
      return;
    }
    if (a === "add-fact")
      profile.facts.push({
        id: "fact-" + crypto.randomUUID(),
        label: "",
        say: "",
        topic: "",
        kw: [],
        type: "reported",
        vis: "ask",
        ehr: "hx",
        gate: 0,
        src: "Faculty authored",
        origin: "faculty",
        reviewed: false,
      });
    if (a === "add-source")
      profile.sources.push({
        id: "source-" + crypto.randomUUID(),
        title: "",
        excerpt: "",
        reviewed: false,
      });
    if (a === "references") {
      const r = await api("/api/references");
      for (const source of r.sources)
        if (!profile.sources.some((s) => s.id === source.id))
          profile.sources.push(source);
      message =
        "Selected teaching summaries added for review. They do not add patient-specific facts.";
    }
    if (a === "add-artifact")
      profile.artifacts.push({
        id: "report-" + crypto.randomUUID(),
        title: "",
        kind: "lab",
        src: "",
        date: "",
        sec: "labs",
        release: "section",
        unlock: [],
        facts: [],
        rows: [],
        reviewed: false,
      });
    if (a === "add-objective")
      profile.obj.push({
        id: "objective-" + crypto.randomUUID(),
        t: "",
        ty: "fact",
        w: 0,
        f: [],
        s: [],
        tip: "",
      });
    if (a === "add-mm") profile.mm = { a: "", b: "", fu: "", kw: [] };
    if (a === "remove-mm") delete profile.mm;
    for (const [action, key] of [
      ["remove-fact", "facts"],
      ["remove-source", "sources"],
      ["remove-artifact", "artifacts"],
      ["remove-objective", "obj"],
    ])
      if (a === action) profile[key].splice(Number(t.dataset.index), 1);
    if (
      [
        "add-fact",
        "add-source",
        "add-artifact",
        "add-objective",
        "add-mm",
        "remove-fact",
        "remove-source",
        "remove-artifact",
        "remove-objective",
        "remove-mm",
        "references",
      ].includes(a)
    ) {
      dirty = true;
      profile.reviewAcknowledged = false;
    }
    busy = false;
    render();
  } catch (err) {
    busy = false;
    if (patientDialog) patientDialog.notice = err.message;
    else message = err.message;
    render();
  }
});
function toggleTheme() {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("virtusp-theme", theme);
}
document.addEventListener("click", (e) => {
  const link = e.target.closest(".turn-link");
  if (!link || !enc?.assessment) return;
  e.preventDefault();
  repView = "interview";
  render();
  const turn = document.querySelector(link.getAttribute("href"));
  if (!turn) return;
  turn.classList.add("flash");
  turn.scrollIntoView?.({ block: "center" });
});
document.addEventListener("keydown", (e) => {
  if (tab !== "enc" || !enc || enc.status !== "active") return;
  if (e.target.matches?.("input, textarea, select")) return;
  if (e.code === "Space" || e.key === "Escape") {
    e.preventDefault();
    togglePause();
  }
});
window.addEventListener("beforeunload", (e) => {
  stopAudio();
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function boot() {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem("virtusp-theme") || "light";
    try {
      faceAnchors = await (await fetch("/img/faces.json")).json();
    } catch {
      faceAnchors = null;
    }
    students = (await api("/api/students")).students;
    demoSession = (await api("/api/session")).session;
    if (!demoSession) {
      render();
      return;
    }
    await refresh();
    if (demoSession.role === "student") tab = "student-home";
    const selected = list.find((p) => p.name === "Omar Sinclair") || list[0];
    if (selected && demoSession.role === "faculty") await pick(selected.id);
    const id = localStorage.getItem("virtusp-active-v2");
    if (id)
      try {
        enc = (await api("/api/encounters/" + id)).encounter;
      } catch {
        localStorage.removeItem("virtusp-active-v2");
      }
    render();
    if (enc?.status === "active") warmTalkVideo();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="pn"><h1>Server unavailable</h1><p>${esc(e.message)}</p><p>Start this app with npm start; static-only hosting cannot run encounters.</p><button class="btn" onclick="location.reload()">Retry</button></div>`;
  }
}
boot();
