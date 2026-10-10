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
  callAnimation = 0,
  callVideoUrl = null,
  portraitToken = 0,
  portraitImage = null,
  portraitUrl = "",
  studentStream = null,
  studentCameraTried = false,
  studentCameraRequest = 0,
  studentCameraNote = "",
  listening = false,
  micRestartTimer = null,
  repView = "summary",
  expandedDocId = "",
  voiceDisplay = { state: "ready", text: "Ready for your question" };
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
  const [patients, past, status] = await Promise.all([
    api("/api/profiles"),
    api("/api/encounters"),
    api("/api/health"),
  ]);
  list = patients.profiles;
  history = past.encounters;
  health = status;
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
 <div class="patient-grid">${preferred.map((p) => card(p)).join("")}</div>
 </div>`;
}
function editor() {
  const group = (key, title, count, content) =>
    `<details class="editor-group" data-detail="${key}"><summary>${title}<span class="chip">${count}</span></summary>${content}</details>`;
  const facts = profile.facts
    .map(
      (
        f,
        i,
      ) => `<details class="card-edit" data-detail="fact-${esc(f.id)}"><summary>${esc(f.label || "New finding")}</summary>
    ${control("Finding", `facts.${i}.label`)}${control("Patient wording", `facts.${i}.say`, { type: "textarea" })}
    <details class="advanced"><summary>Disclosure and clinical settings</summary><div class="fields">
    ${control("Patient knowledge", `facts.${i}.vis`, {
      options: [
        ["ask", "Patient knows"],
        ["chart", "Chart only"],
      ],
    })}
    ${control("Question topic", `facts.${i}.topic`)}${control("Chart section", `facts.${i}.ehr`, { options: sections.slice(1) })}
    ${control("Release section", `facts.${i}.sec`, { options: [["", "Not a chart finding"], ...sections.slice(1)] })}
    ${control("Provenance", `facts.${i}.type`, { options: ["reported", "documented", "confirmed", "unknown"] })}
    ${control("Source", `facts.${i}.src`)}${control("Question keywords", `facts.${i}.kw`, { list: true })}
    ${control("Trust gate (0-3)", `facts.${i}.gate`, { type: "number" })}${control("Guarded reply", `facts.${i}.deflect`)}
    ${control("Units", `facts.${i}.unit`)}${control("Interpretation context", `facts.${i}.ref`)}${control("Measurement date", `facts.${i}.date`, { type: "date" })}
    ${control("Measurement", `facts.${i}.lab`, {
      options: [
        ["false", "No"],
        ["true", "Yes"],
      ],
    })}
    ${control("Medication identifier", `facts.${i}.drug`)}${control("Allergy identifier", `facts.${i}.allergyDrug`)}${control("Handoff key", `facts.${i}.k`)}${control("Fact ID", `facts.${i}.id`)}
    </div></details>${button("Remove", "remove-fact", `data-index="${i}"`)}</details>`,
    )
    .join("");
  const sources = profile.sources
    .map(
      (
        source,
        i,
      ) => `<details class="card-edit" data-detail="source-${esc(source.id)}"><summary>${esc(source.title || "New source")}</summary>
    ${control("Title", `sources.${i}.title`)}${control("Excerpt", `sources.${i}.excerpt`, { type: "textarea" })}
    <details class="advanced"><summary>Reference settings</summary>${control("Reference URL", `sources.${i}.url`)}${control("Source ID", `sources.${i}.id`)}</details>
    ${source.fileId ? `<a href="/api/files/${esc(source.fileId)}" target="_blank" rel="noopener">View original</a>` : ""}
    ${safeLink(source.url) ? `<a href="${safeLink(source.url)}" target="_blank" rel="noopener">Open reference</a>` : ""}${button("Remove", "remove-source", `data-index="${i}"`)}</details>`,
    )
    .join("");
  const artifacts = profile.artifacts
    .map(
      (
        a,
        i,
      ) => `<details class="card-edit" data-detail="artifact-${esc(a.id)}"><summary>${esc(a.title || "New report")}<span class="muted">${esc(a.date || "Date unspecified")}</span></summary>
    <div class="fields">${control("Title", `artifacts.${i}.title`)}${control("Date (optional)", `artifacts.${i}.date`, { type: "date" })}</div>
    <details class="advanced"><summary>Report and release settings</summary><div class="fields">
    ${control("Chart section", `artifacts.${i}.sec`, { options: sections.slice(1) })}${control("Format", `artifacts.${i}.kind`, { options: ["lab", "note", "ecg", "ct", "image", "report"] })}
    ${control("Release when", `artifacts.${i}.release`, {
      options: [
        ["section", "Chart section opens"],
        ["question", "Matching question"],
        ["both", "Section or question"],
      ],
    })}
    ${control("Release keywords", `artifacts.${i}.unlock`, { list: true })}${control("Linked findings", `artifacts.${i}.facts`, { list: true })}
    ${control("Source", `artifacts.${i}.src`)}${control("Report ID", `artifacts.${i}.id`)}</div>
    ${control("Report text", `artifacts.${i}.text`, { type: "textarea" })}${control("Lab rows: test | value | unit | reference", `artifacts.${i}.rows`, { type: "textarea", rows: true })}</details>
    ${a.fileId ? `<a href="/api/files/${esc(a.fileId)}" target="_blank" rel="noopener">View report</a>` : ""}${button("Remove", "remove-artifact", `data-index="${i}"`)}</details>`,
    )
    .join("");
  const objectives = profile.obj
    .map(
      (
        o,
        i,
      ) => `<details class="card-edit" data-detail="objective-${esc(o.id)}"><summary>${esc(o.t || "New objective")}</summary>
    ${control("Objective", `obj.${i}.t`)}${control("Coaching", `obj.${i}.tip`)}
    <details class="advanced"><summary>Assessment settings</summary><div class="fields">
    ${control("Weight", `obj.${i}.w`, { type: "number" })}${control(
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
    )}
    ${control("Finding IDs", `obj.${i}.f`, { list: true })}${control("Chart sections", `obj.${i}.s`, { list: true })}${control("Objective ID", `obj.${i}.id`)}</div></details>${button("Remove", "remove-objective", `data-index="${i}"`)}</details>`,
    )
    .join("");
  return `<div class="editor"><p class="muted" id="save-status">${dirty ? "Unsaved changes" : "Draft"}</p>
    ${["Omar Sinclair", "Yvette Armstrong"].includes(profile.name) && profile.facts.some((f) => f.id === "case-notes") ? button("Prepare organizer case", "prepare") : ""}
    <div class="fields identity-fields">${control("Name", "name")}${control("Age", "age", { type: "number" })}</div>
    ${
      profile.facts.length
        ? `<div class="profile-preview">${profile.facts
            .slice(0, 4)
            .map(
              (f) =>
                `<p><b>${esc(f.label)}</b> ${esc(f.vis === "ask" ? f.say : f.label)}<span class="chip">${f.vis === "ask" ? "Patient knows" : "Chart"}</span></p>`,
            )
            .join(
              "",
            )}${profile.facts.length > 4 ? `<p class="muted">+${profile.facts.length - 4} more findings below</p>` : ""}</div>`
        : ""
    }
    ${group("facts", "History & findings", profile.facts.length, facts + button("Add finding", "add-fact"))}
    ${group("artifacts", "Clinical reports", profile.artifacts.length, artifacts + button("Add report", "add-artifact"))}
    ${group("objectives", "Learning objectives", profile.obj.length, objectives + button("Add objective", "add-objective"))}
    ${group("sources", "Documents & references", profile.sources.length, sources + button("Add source", "add-source") + button("Add teaching references", "references"))}
    <details class="editor-group" data-detail="character"><summary>Patient character</summary><div class="fields">${control("Opening line", "intro")}${control("Personality", "personality")}${control("Communication style", "style")}${control("Emotional state", "emotion")}</div></details>
    <details class="editor-group" data-detail="advanced"><summary>Advanced scenario settings</summary>
    ${profile.mm ? `<div class="fields">${control("Patient statement ID", "mm.a")}${control("Chart finding ID", "mm.b")}${control("Follow-up ID", "mm.fu")}${control("Reconciliation keywords", "mm.kw", { list: true })}</div>${button("Remove discrepancy", "remove-mm")}` : button("Add intentional discrepancy", "add-mm")}
    ${control("Applicable rubric domains (1-7)", "rubricApplicable", { list: true })}${control("Case-specific rubric", "caseRubric", { options: [["", "Automatic (by patient age)"], ["none", "None"], ...(health.caseRubrics || []).map((r) => [r.id, r.title])] })}</details>
    ${profile.missing?.length ? `<details class="editor-group" data-detail="missing"><summary>Unspecified information <span class="chip">${profile.missing.length}</span></summary><ul>${profile.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></details>` : ""}
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
  if (restore) ({ profile, versions, issues, dirty } = patientDialog.previous);
  patientDialog = null;
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
    tab = "studio";
    message = publish
      ? `${profile.name} published. Start a visit from the patient card.`
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
function callStorageKey(id) {
  return "virtusp-call-" + id;
}
const connectedCalls = new Set();
function rememberCall(id) {
  connectedCalls.add(id);
  try {
    sessionStorage.setItem(callStorageKey(id), "live");
  } catch {
    /* The in-memory set keeps this page on the call. */
  }
}
function callIsLive() {
  if (!enc || enc.status !== "active") return false;
  if (connectedCalls.has(enc.id)) return true;
  try {
    if (sessionStorage.getItem(callStorageKey(enc.id)) === "live") {
      connectedCalls.add(enc.id);
      return true;
    }
  } catch {
    /* Private mode can block storage. */
  }
  return false;
}
function encounter() {
  if (!enc)
    return `<div class="pn"><h1>Start an encounter</h1><p class="muted">Only published versions can be launched.</p><div class="patient-grid">${list
      .filter((p) => p.version)
      .map((p) => card(p, false))
      .join("")}</div></div>`;
  const live = callIsLive();
  const waiting = enc.status === "active" && !live;
  const locked = busy || enc.status !== "active" || waiting;
  const first = esc(enc.name.split(" ")[0]);
  const emergency = enc.emergency
    ? `<div class="emergency" role="alert"><b>911 emergency services</b><p>${esc(enc.emergency.text)}</p></div>`
    : "";
  const incoming = waiting
    ? `<div class="incoming-call" role="region" aria-label="Incoming video call"><div><p class="panel-kicker">Patient calling</p><h2>${esc(enc.name)} is calling</h2><p class="muted">Answer to turn the camera on, talk, and see ${first}'s face.</p></div>${button("Answer", "answer-call", "", "pri")}</div>`
    : "";
  const stage = live ? "video-call camera-on" : waiting ? "ringing" : "";
  return `<div class="grid enc-grid"><section class="pn enc-talk"><div class="panel-kicker">${enc.status === "complete" ? "Completed video call" : "Video call"}</div>${emergency}${incoming}<div class="av-frame ${stage}" id="avf"><img class="av-still patient-photo" src="${esc(enc.imageUrl)}" alt="${esc(enc.name)}"><canvas id="patient-call" class="patient-call" width="640" height="480" aria-hidden="true"></canvas><video id="patient-video" class="patient-video" playsinline></video>${live ? `<div class="self-view" id="self-view"><video id="student-camera" class="self-camera" muted autoplay playsinline></video><span class="self-label" id="self-label">You</span></div>` : ""}<span class="av-live">Camera on</span><div class="voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div><h1>${esc(enc.name)}, ${enc.age}</h1><div id="voice-status" role="status">${esc(readyStatus())}</div><div class="row voice-controls">${button("Tap to talk", "mic")}${button(muted ? "Unmute" : "Mute", "mute")}${button("Pause audio", "pause")}${live && !studentStream ? button("Turn your camera on", "student-camera") : ""}</div><form id="question-form"><label for="question">${waiting ? "Answer the video call to talk" : "Ask the patient"}</label><div class="row"><input id="question" maxlength="2000" placeholder="${waiting ? "The camera turns on when you answer" : "Type a question or use the microphone"}" ${locked ? "disabled" : ""} autocomplete="off"><button class="btn pri" type="submit" ${locked ? "disabled" : ""}>${busy ? "Thinking…" : "Send"}</button></div></form><div class="tr" id="transcript" aria-live="polite">${enc.transcript.map((t) => `<article class="bubble ${t.role === "student" ? "student" : "patient"}" id="${esc(t.id)}"><b>${t.role === "student" ? "You" : first}</b><p>${esc(t.text)}</p>${t.role === "patient" ? `<span class="chip">${esc(t.provider)}${t.factIds?.length ? " · " + esc(t.factIds.join(", ")) : ""}</span>` : ""}</article>`).join("")}</div><div class="row">${enc.status === "active" ? button("Finish & get feedback", "complete", "", "pri") : button("View feedback", "nav", `data-tab="rep"`)}</div></section>
 <section class="pn ehr-panel"><div class="ehr-head"><div><div class="panel-kicker">Dynamic clinical record</div><h2>Chart · ${esc(enc.name)}</h2></div></div>${conversationFiles()}<div class="tabs">${sections.map(([s, name]) => button(name, "section", `data-section="${s}"`, section === s ? "on" : "")).join("")}</div>${chart()}${docLightbox()}</section></div>`;
}
function isVisualDoc(a) {
  return ["ecg", "ct", "image"].includes(a.kind);
}
function artifactBody(a, expanded = false) {
  const visual = a.fileUrl && isVisualDoc(a);
  return `${a.rows?.length ? `<table class="lab-table"><thead><tr><th>Test</th><th>Result</th><th>Reference</th></tr></thead><tbody>${a.rows.map((r) => `<tr class="${esc(r.flag || "")}"><td>${esc(r.name)}</td><td>${esc(r.value)} ${esc(r.unit)}</td><td>${esc(r.ref)}</td></tr>`).join("")}</tbody></table>` : ""}${a.text ? `<p>${esc(a.text)}</p>` : ""}${visual ? `<img class="art-img${expanded ? " expanded" : ""}" src="${esc(a.fileUrl)}" alt="${esc(a.title)}">` : ""}${!visual && a.fileUrl ? `<iframe class="art-frame" title="${esc(a.title)}" src="${esc(a.fileUrl)}"></iframe>` : ""}`;
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
  const tag = (o) =>
    o ? ` <span class="chip">Objective: ${esc(o)}</span>` : "";
  const elicited = f.elicited.length
    ? f.elicited
        .map(
          (x) =>
            `<li>${esc(x.label)} <span class="muted">· ${x.source === "chart" ? "from the chart" : x.turn ? "question " + x.turn : "from the patient"}</span>${tag(x.objective)}${evidence(x.evidence)}</li>`,
        )
        .join("")
    : '<li class="muted">No findings were elicited.</li>';
  const missed = f.missed.length
    ? f.missed
        .map(
          (x) =>
            `<li>${esc(x.topic)} <span class="muted">· ${x.source === "chart" ? "in the chart" + (x.section ? " (" + esc(x.section) + ")" : "") : x.heldBack ? "asked, but the patient held it back" : "not asked"}</span>${tag(x.objective)}${x.evidence.length ? evidence(x.evidence) : ""}</li>`,
        )
        .join("")
    : '<li class="ok">Every authored finding was reached.</li>';
  const reports = f.reports.length
    ? `<h3>Reports</h3><ul class="plain">${f.reports.map((r) => `<li>${esc(r.title)} <span class="muted">· ${esc(r.section)} · ${esc(r.status)}</span></li>`).join("")}</ul>`
    : "";
  return `<h2>Learning objectives${c.objectivePercent == null ? "" : ` · ${c.objectivePercent}% complete`}</h2>${a.objectives.map((o) => `<article class="obj-card"><h3>${esc(o.title)} · ${o.earned}/${o.weight}</h3><div class="meter" role="img" aria-label="${Math.round(o.credit * 100)}% complete"><i style="width:${Math.round(o.credit * 100)}%"></i></div>${o.credit < 1 && o.next ? `<p>Next attempt: ${esc(o.next)}</p>` : ""}${evidence(o.evidence)}</article>`).join("")}
  <h2>Findings · ${f.elicited.length} of ${f.total} reached</h2><p class="muted">Findings you did not reach are named by topic only, so the next attempt is still yours to work out.</p>
  <div class="fb-grid"><section class="obj-card"><h3>Elicited</h3><ul class="plain">${elicited}</ul></section><section class="obj-card"><h3>Not reached</h3><ul class="plain">${missed}</ul>${reports}</section></div>`;
}
function flowView(a, c) {
  const marks = { strength: "Went well", improve: "To improve", note: "Note" };
  const observations = c.flow.observations
    .map(
      (o) =>
        `<li class="obs ${o.kind}"><b>${marks[o.kind]}</b> ${esc(o.text)}${o.evidence.length ? evidence(o.evidence) : ""}</li>`,
    )
    .join("");
  return `${rewritesView(c)}<h2>How the interview went</h2><p class="muted">${esc(c.notice)}</p><section class="obj-card"><ul class="plain">${observations}</ul></section>${transcriptView(a, c)}`;
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
  <h2>Evidence from the encounter</h2>${["strengths", "gaps", "concerns"].map((k) => `<h3>${esc(fields[k])}</h3>${a[k].length ? a[k].map((n) => `<p>${esc(n.text)}</p>${evidence(n.evidence)}`).join("") : '<p class="muted">None identified by this assessment.</p>'}`).join("")}
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
  if (!enc) return '<div class="pn"><h1>No active encounter</h1></div>';
  if (!enc.assessment)
    return `<div class="pn"><h1>Encounter feedback</h1><p>Finish the encounter to assess the complete evidence.</p>${button("Finish & get feedback", "complete", "", "pri")}</div>`;
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
  ${body}
  <div class="row rep-actions">${button("Try this patient again", "retry", "", "pri")}${button("All attempts", "nav", `data-tab="history"`)}<a class="btn" href="/api/encounters/${esc(enc.id)}/export">Download record</a></div>
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
  if (!c.rewrites?.length)
    return c.rewriteFailure
      ? `<p class="muted">Wording suggestions were unavailable for this attempt.</p>`
      : "";
  return `<section class="obj-card"><h2>Try wording it this way</h2><p class="muted">Model suggestions for questions you actually asked${c.rewriteModel ? " · " + esc(c.rewriteModel) : ""}. They change wording only and are not part of any rating.</p><ul class="plain">${c.rewrites.map((r) => `<li><div class="muted">Question ${r.turn} · ${esc(r.issue)}</div><div class="reword"><div><b>You asked</b> ${esc(r.question)}</div><div><b>Instead</b> ${esc(r.rewrite)}</div></div><div class="muted">${esc(r.why)} <a class="turn-link" href="#turn-${r.turn}">Show in transcript</a></div></li>`).join("")}</ul></section>`;
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
      `${d.domain}. ${d.name}${d.score === null ? "" : " · " + d.score + "/4"}`,
    );
  for (const s of a.strengths) cite(s.evidence, "Strength");
  for (const g of a.gaps) cite(g.evidence, "Missed opportunity");
  for (const x of a.concerns) cite(x.evidence, "Concern");
  const steps = new Map(
    (c?.flow.steps || [])
      .filter((s) => s.kind === "question")
      .map((s) => [s.eventId, s]),
  );
  let n = 0;
  const rows = enc.transcript
    .map((t) => {
      if (t.role !== "student")
        return `<div class="bubble patient"><b>${esc(enc.name.split(" ")[0])}</b><p>${esc(t.text)}</p></div>`;
      n++;
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
            : "No new finding";
      const credit = s?.credited.length
        ? ` · counts toward: ${s.credited.map(esc).join("; ")}`
        : "";
      const refs = [...(cited.get(n) || [])];
      return `<div class="turn" id="turn-${n}"><div class="bubble student"><b>Question ${n}</b><p>${esc(t.text)}</p></div><div class="turn-notes">${tags.map((x) => `<span class="chip">${x}</span>`).join(" ")} <span class="muted">${result}${credit}</span>${refs.length ? `<div class="muted">Cited in: ${refs.map(esc).join(" · ")}</div>` : ""}</div></div>`;
    })
    .join("");
  return `<h2>Annotated transcript</h2><p class="muted">Every question with what it achieved and where the feedback above refers to it. Question tags come from automated classification.</p><section class="obj-card annotated">${rows}</section>`;
}
function past() {
  return `<div class="pn"><h1>Encounter history</h1><p class="muted">Each attempt retains its patient version, transcript and assessment.</p><div class="history-list">${history.map((e) => `<article class="fx"><h2>${esc(e.name)} · v${e.version}</h2><p>${esc(new Date(e.createdAt).toLocaleString())} · ${e.turns} questions · ${e.status}${e.status === "complete" && e.objectivePercent != null ? ` · objectives ${e.objectivePercent}% · findings ${e.findingsElicited}/${e.findingsTotal} · rubric ${e.provisional ? "provisional" : e.total + "/" + e.denominator}` : ""}</p>${button(e.status === "complete" ? "View feedback" : "Resume encounter", "resume", `data-id="${esc(e.id)}"`)} <a href="/api/encounters/${esc(e.id)}/export">Download record</a></article>`).join("") || "<p>No encounters yet.</p>"}</div></div>`;
}
function render() {
  const focusId = document.activeElement?.id;
  const dialogScroll = $(".patient-form-body")?.scrollTop || 0;
  if (patientDialog && $("#patient-dialog")?.dataset.profileId === profile.id)
    for (const detail of document.querySelectorAll(
      "#patient-dialog details[data-detail]",
    ))
      patientDialog.openSections[detail.dataset.detail] = detail.open;
  const navs = [
    ["studio", "Patient Studio"],
    ["enc", "Encounter"],
    ["team", "Team"],
    ["rep", "Assessment"],
    ["history", "History"],
  ];
  $("#nav").innerHTML = navs
    .map(([k, name]) =>
      button(name, "nav", `data-tab="${k}"`, tab === k ? "on" : ""),
    )
    .join("");
  $("#mode").textContent =
    health.dialogue === "local"
      ? "Local fallback"
      : `Bedrock configured · ${health.region}`;
  $("#themeBtn").textContent = "Theme";
  $("#app").innerHTML =
    `<div class="app-status"><span>${esc(storageText())}</span><span>${busy ? "Working…" : dirty ? "Unsaved draft changes" : ""}</span></div><div class="toast ${message ? "" : "hidden"}" role="status">${esc(message)}</div>` +
    { studio, enc: encounter, team, rep: assessment, history: past }[tab]() +
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
    else $("#patient-upload")?.focus();
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
  if (voiceDisplay.state === "ready") voiceDisplay.text = readyStatus();
  voiceState(voiceDisplay.state, voiceDisplay.text);
  updateMicButton();
  syncVideoCall();
}
function stopAudio() {
  speechGeneration++;
  listening = false;
  clearTimeout(micRestartTimer);
  try {
    recognition?.abort();
  } catch {
    /* A disconnected recognizer is already stopped. */
  }
  recognition = null;
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  window.speechSynthesis?.cancel();
  stopTalkingCall();
  $("#avf")?.classList.remove("speaking", "listening");
  voiceState("ready", readyStatus());
  updateMicButton();
}
function readyStatus() {
  if (!enc) return "Ready for your question";
  if (enc.status === "complete") return "Call ended";
  if (!callIsLive()) return "Incoming video call";
  return "Camera on · ready for your question";
}
function voiceState(state, text) {
  voiceDisplay = { state, text };
  $("#avf")?.classList.toggle("speaking", state === "speaking");
  $("#avf")?.classList.toggle("listening", state === "listening");
  if ($("#voice-status")) $("#voice-status").textContent = text;
}
function stopTalkingCall() {
  portraitToken++;
  if (typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(callAnimation);
  callAnimation = 0;
  const frame = $("#avf");
  const video = $("#patient-video");
  if (video?.getAttribute("src")) {
    try {
      video.pause();
    } catch {
      /* jsdom has no media playback. */
    }
    video.removeAttribute("src");
  }
  if (callVideoUrl) {
    URL.revokeObjectURL(callVideoUrl);
    callVideoUrl = null;
  }
  frame?.classList.remove("generated-video");
  if (callIsLive()) {
    frame?.classList.add("video-call", "camera-on");
    startIdlePortrait();
    return;
  }
  frame?.classList.remove("video-call", "camera-on", "face-ready");
}
function mouthOpen(text, elapsed) {
  const syllables = Math.max(
    3,
    (String(text || "").match(/[aeiou]/gi) || []).length,
  );
  const cycle = Math.max(0.16, 2.4 / syllables);
  const phase = (elapsed % cycle) / cycle;
  const shape = phase < 0.35 ? phase / 0.35 : 1 - (phase - 0.35) / 0.65;

  return Math.max(0, shape);
}
function paintCall(image, open, shift = 0) {
  const canvas = $("#patient-call");
  const ctx = canvas?.getContext?.("2d");
  if (!ctx || !image?.width) return;
  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2 + shift;
  const breathe = 1 + Math.max(0, open) * 0.015;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(
    image,
    dx - ((breathe - 1) * dw) / 2,
    dy - ((breathe - 1) * dh) / 2,
    dw * breathe,
    dh * breathe,
  );
}
function ensurePortrait(done) {
  const url = enc?.imageUrl;
  if (!url) return;
  if (portraitUrl === url && portraitImage?.width) {
    done(portraitImage);
    return;
  }
  const image = new Image();
  image.onload = () => {
    if (enc?.imageUrl !== url) return;
    portraitUrl = url;
    portraitImage = image;
    done(image);
  };
  image.onerror = () => {};
  image.src = url;
}
function runPortrait(token, sample) {
  ensurePortrait((image) => {
    if (token !== portraitToken) return;
    const frame = $("#avf");
    const canvas = $("#patient-call");
    if (!frame || !canvas || typeof CanvasRenderingContext2D !== "function")
      return;
    if (!canvas.getContext?.("2d")) return;
    frame.classList.add("video-call", "camera-on");
    const started = performance.now();
    const draw = () => {
      if (token !== portraitToken || !$("#patient-call")) return;
      const elapsed = (performance.now() - started) / 1000;
      const pose = sample(elapsed);
      paintCall(image, pose.open, pose.shift || 0);
      frame.classList.add("face-ready");
      if (typeof requestAnimationFrame !== "function") return;
      callAnimation = requestAnimationFrame(draw);
    };
    if (typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(callAnimation);
    draw();
  });
}
function startIdlePortrait() {
  if (!callIsLive()) return;
  const token = ++portraitToken;
  runPortrait(token, (elapsed) => ({
    open: 0,
    shift: Math.sin(elapsed * 0.8) * 1.5,
  }));
}
function startTalkingCall(turn, generation) {
  const canvas = $("#patient-call");
  if (typeof CanvasRenderingContext2D !== "function" || !canvas || !turn?.text)
    return;
  if (!canvas.getContext?.("2d")) return;
  const token = ++portraitToken;
  runPortrait(token, (elapsed) => {
    if (generation !== speechGeneration) return { open: 0, shift: 0 };
    const open = mouthOpen(turn.text, elapsed);
    return { open, shift: Math.sin(elapsed * 10) * (2 + open * 4) };
  });
  if (health.speech === "elevenlabs-configured")
    pollTalkingVideo(turn, generation);
}
function syncVideoCall() {
  if (tab === "enc" && callIsLive()) {
    const turn = [...(enc?.transcript || [])]
      .reverse()
      .find((item) => item.role === "patient");
    if (
      (voiceDisplay.state === "speaking" ||
        voiceDisplay.state === "thinking") &&
      turn
    )
      startTalkingCall(turn, speechGeneration);
    else startIdlePortrait();
    attachStudentCamera();
    if (!studentStream) startStudentCamera();
    return;
  }
  portraitToken++;
  if (typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(callAnimation);
  callAnimation = 0;
}
function attachStudentCamera() {
  const video = $("#student-camera");
  const label = $("#self-label");
  const retry = $('[data-action="student-camera"]');
  if (retry) retry.hidden = !!studentStream;
  if (!video || !label) return;
  if (studentStream) {
    if (video.srcObject !== studentStream) video.srcObject = studentStream;
    video.hidden = false;
    label.textContent = "You · Camera on";
    return;
  }
  video.hidden = true;
  label.textContent = studentCameraNote || "You";
}
function startStudentCamera() {
  if (studentStream || studentCameraTried) {
    attachStudentCamera();
    return;
  }
  studentCameraTried = true;
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia) {
    studentCameraNote = "Your camera is unavailable";
    attachStudentCamera();
    return;
  }
  const request = ++studentCameraRequest;
  devices
    .getUserMedia({ video: { facingMode: "user" }, audio: false })
    .catch(() => devices.getUserMedia({ video: true, audio: false }))
    .then(
      (stream) => {
        if (request !== studentCameraRequest || !callIsLive()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        studentStream = stream;
        studentCameraNote = "";
        attachStudentCamera();
      },
      () => {
        if (request !== studentCameraRequest) return;
        studentCameraNote = "Your camera is off";
        attachStudentCamera();
      },
    );
}
function stopStudentCamera() {
  studentCameraRequest++;
  studentStream?.getTracks().forEach((track) => track.stop());
  studentStream = null;
  studentCameraNote = "";
}
async function pollTalkingVideo(turn, generation) {
  try {
    const started = await fetch(
      `/api/encounters/${enc.id}/talking-video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: turn.id }),
      },
    );
    if (!started.ok && started.status !== 202) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (generation !== speechGeneration) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (generation !== speechGeneration) return;
      const response = await fetch(
        `/api/encounters/${enc.id}/talking-video?turnId=${encodeURIComponent(turn.id)}`,
      );
      if (response.status === 501 || response.status === 503) return;
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("video")
      ) {
        const blob = await response.blob();
        if (generation !== speechGeneration) return;
        callVideoUrl = URL.createObjectURL(blob);
        const video = $("#patient-video");
        if (!video) return;
        video.src = callVideoUrl;
        video.muted = false;
        $("#avf")?.classList.add("video-call", "generated-video");
        try {
          await video.play();
          if (audio) audio.pause();
          window.speechSynthesis?.cancel();
        } catch {
          video.muted = true;
          try {
            await video.play();
          } catch {
            $("#avf")?.classList.remove("generated-video");
          }
        }
        video.onended = () => {
          if (generation !== speechGeneration) return;
          $("#avf")?.classList.remove("generated-video");
          voiceState("ready", readyStatus());
          if (callIsLive()) startIdlePortrait();
        };
        return;
      }
    }
  } catch {
    /* The live portrait keeps moving if a generated clip is unavailable. */
  }
}
async function speak(turn) {
  stopAudio();
  const generation = speechGeneration;
  const updateVoice = (state, text) => {
    if (generation === speechGeneration) voiceState(state, text);
  };
  if (muted || tab !== "enc") return;
  startTalkingCall(turn, generation);
  if (health.speech === "elevenlabs-configured")
    try {
      voiceState("thinking", "Preparing patient voice…");
      const response = await fetch(`/api/encounters/${enc.id}/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: turn.id }),
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (generation !== speechGeneration) return;
      audioUrl = URL.createObjectURL(blob);
      audio = new Audio(audioUrl);
      audio.onplay = () =>
        updateVoice("speaking", "Video visit · patient speaking");
      audio.onended = () => {
        updateVoice("ready", readyStatus());
        if (!$("#avf")?.classList.contains("generated-video")) stopTalkingCall();
      };
      audio.onerror = () =>
        updateVoice("ready", "Audio unavailable; transcript remains available");
      await audio.play();
      return;
    } catch {
      if (generation !== speechGeneration) return;
      voiceState("ready", "Cloud speech unavailable · browser voice fallback");
    }
  if ("speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.onstart = () =>
      updateVoice("speaking", "Video visit · patient speaking");
    utter.onend = () => {
      updateVoice("ready", readyStatus());
      if (!$("#avf")?.classList.contains("generated-video")) stopTalkingCall();
    };
    utter.onerror = () =>
      updateVoice("ready", "Audio unavailable; use the transcript");
    speechSynthesis.speak(utter);
  }
}
async function mutate(action, payload) {
  const r = await api(`/api/encounters/${enc.id}/${action}`, "POST", payload);
  enc = r.encounter;
  health.storage = r.storage;
}
async function question(text) {
  if (busy || !text.trim() || enc?.status !== "active" || !callIsLive()) return;
  stopAudio();
  busy = true;
  message = "";
  render();
  let delivered = false;
  try {
    await mutate("turn", { question: text, requestId: crypto.randomUUID() });
    formMemory.question = "";
    delivered = true;
  } catch (e) {
    message = e.message;
  } finally {
    busy = false;
    render();
  }
  if (delivered && enc?.transcript.at(-1)?.role === "patient")
    speak(enc.transcript.at(-1));
}
function updateMicButton() {
  const button = $('[data-action="mic"]');
  if (!button) return;
  button.textContent = recognition?.sendOnEnd
    ? "Finishing…"
    : listening
      ? "Stop & send"
      : "Tap to talk";
  button.setAttribute("aria-pressed", String(listening));
  button.disabled =
    busy ||
    !!recognition?.sendOnEnd ||
    enc?.status !== "active" ||
    !callIsLive();
}
function mic() {
  if (busy || enc?.status !== "active" || !callIsLive()) return;
  if (listening && recognition) {
    listening = false;
    recognition.sendOnEnd = true;
    clearTimeout(micRestartTimer);
    updateMicButton();
    voiceState("thinking", "Finishing your question…");
    try {
      recognition.stop();
    } catch {
      recognition.onend();
    }
    return;
  }
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    message = "Microphone recognition is unavailable. Type your question.";
    render();
    return;
  }
  stopAudio();
  const generation = speechGeneration;
  const rec = new Rec();
  recognition = rec;
  listening = true;
  let prefix = formMemory.question.trim(),
    restarts = 0,
    fatalError = false;
  const current = () =>
    generation === speechGeneration &&
    tab === "enc" &&
    enc?.status === "active" &&
    recognition === rec;
  const fail = (error) => {
    fatalError = true;
    listening = false;
    rec.sendOnEnd = false;
    updateMicButton();
    const reason =
      error === "not-allowed" || error === "service-not-allowed"
        ? "Microphone permission was denied. Allow microphone access for this site in your browser, then tap again."
        : `Microphone unavailable (${error}). Your text is kept; type or try again.`;
    message = reason;
    voiceState("ready", reason);
  };
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onstart = () => {
    if (current())
      voiceState("listening", "Listening… Tap Stop & send when finished.");
  };
  rec.onresult = (e) => {
    if (
      generation !== speechGeneration ||
      tab !== "enc" ||
      enc?.status !== "active" ||
      recognition !== rec
    )
      return;
    const text = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(" ")
      .trim();
    formMemory.question = [prefix, text].filter(Boolean).join(" ");
    if ($("#question")) $("#question").value = formMemory.question;
    restarts = 0;
  };
  rec.onerror = (e) => {
    if (!current()) return;
    if (e.error !== "no-speech") fail(e.error);
  };
  rec.onend = () => {
    if (!current()) return;
    if (fatalError) {
      recognition = null;
      return;
    }
    if (rec.sendOnEnd) {
      recognition = null;
      updateMicButton();
      const text = formMemory.question.trim();
      if (text) question(text);
      else
        voiceState(
          "ready",
          "No speech captured. Tap to talk again or type your question.",
        );
      return;
    }
    if (listening && restarts++ < 3) {
      prefix = formMemory.question.trim();
      micRestartTimer = setTimeout(() => {
        if (!current() || !listening) return;
        try {
          rec.start();
        } catch (e) {
          fail(e.name || "start failed");
          recognition = null;
        }
      }, 250);
      return;
    }
    listening = false;
    recognition = null;
    updateMicButton();
    voiceState(
      "ready",
      "Microphone paused after silence. Your text is kept; tap again or Send.",
    );
  };
  updateMicButton();
  voiceState("listening", "Starting microphone…");
  try {
    rec.start();
  } catch (e) {
    fail(e.name || "start failed");
    recognition = null;
  }
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
document.addEventListener("input", (e) => {
  const t = e.target;
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
  if (!t || busy) return;
  const a = t.dataset.action;
  try {
    if (a === "browse-patient") {
      $("#patient-upload")?.click();
      return; // Keep the input mounted while the system file picker is open.
    }
    message = "";
    if (a === "rep-view") repView = t.dataset.view;
    if (a === "nav") {
      if (tab === "studio" && dirty) await save();
      stopAudio();
      tab = t.dataset.tab;
      if (tab === "history") await refresh();
    }
    if (a === "pick") {
      if (dirty) await save();
      await pick(t.dataset.id);
      tab = "studio";
      openPatientDialog("edit");
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
      return;
    }
    if (a === "launch") {
      if (dirty) await save();
      stopAudio();
      formMemory.question = "";
      const r = await api("/api/encounters", "POST", {
        profileId: t.dataset.id,
        version: Number(t.dataset.version),
      });
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
      render();
      return;
    }
    if (a === "answer-call") {
      if (!enc || enc.status !== "active") return;
      rememberCall(enc.id);
      stopStudentCamera();
      studentCameraTried = false;
      const opening = [...enc.transcript]
        .reverse()
        .find((turn) => turn.role === "patient");
      render();
      if (opening) speak(opening);
      return;
    }
    if (a === "student-camera") {
      stopStudentCamera();
      studentCameraTried = false;
      studentCameraNote = "";
      startStudentCamera();
      return;
    }
    if (a === "resume") {
      stopAudio();
      formMemory.question = "";
      enc = (await api("/api/encounters/" + t.dataset.id)).encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      tab = enc.status === "complete" ? "rep" : "enc";
      repView = "summary";
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
      stopStudentCamera();
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
    if (a === "mic") {
      mic();
      return;
    }
    if (a === "mute") {
      muted = !muted;
      stopAudio();
    }
    if (a === "pause") stopAudio();
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
    if (/^(add-|remove-)/.test(a) || a === "references") {
      dirty = true;
      profile.reviewAcknowledged = false;
    }
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
    await refresh();
    const selected = list.find((p) => p.name === "Omar Sinclair") || list[0];
    if (selected) await pick(selected.id);
    const id = localStorage.getItem("virtusp-active-v2");
    if (id)
      try {
        enc = (await api("/api/encounters/" + id)).encounter;
      } catch {
        localStorage.removeItem("virtusp-active-v2");
      }
    render();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="pn"><h1>Server unavailable</h1><p>${esc(e.message)}</p><p>Start this app with npm start; static-only hosting cannot run encounters.</p><button class="btn" onclick="location.reload()">Retry</button></div>`;
  }
}
boot();
