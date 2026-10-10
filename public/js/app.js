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
  speechGeneration = 0;
const formMemory = { description: "", handoff: "", careplan: "", note: "" };
async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    if (data.issues) issues = data.issues;
    throw new Error(data.error || "Request failed");
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
  if (!profile) return;
  const r = await api("/api/profiles/" + profile.id, "PUT", { profile });
  issues = r.issues;
  dirty = false;
  await refresh();
}
function card(p, faculty = true) {
  return `<article class="patient-card ${p.id === profile?.id ? "selected" : ""}"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy"><h3>${esc(p.name)}</h3><p>${p.age} years · ${esc(p.origin || "")}</p><span class="chip">${p.version ? "Published v" + p.version : "Faculty draft"}</span><div class="row">${faculty ? button("Edit", "pick", `data-id="${esc(p.id)}"`) : ""}${p.version ? button("Start visit", "launch", `data-id="${esc(p.id)}" data-version="${p.version}"`, "pri") : ""}</div></article>`;
}
function studio() {
  const preferred = [...list].sort(
    (a, b) =>
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
 <details class="draft-generator"><summary>Create from a description</summary><label for="description">Describe the synthetic patient using explicit facts. The selected patient's sources are included for drafting.</label><textarea id="description" data-memory="description" rows="4" placeholder="Name, age, concerns, patient-known history, chart records, objectives…">${esc(formMemory.description)}</textarea>${button(health.dialogue === "local" ? "Preserve description as draft" : "Generate a reviewable draft", "generate", "", "pri")}<p class="muted">Generated content requires review. Missing details stay unspecified.</p></details>
 ${profile ? editor() : ""}</div>`;
}
function editor() {
  return `<div class="editor"><div class="studio-head"><div><h2>Edit ${esc(profile.name)}</h2><span class="chip">Draft · published versions ${versions.map((v) => v.version).join(", ") || "none"}</span></div><div class="row">${button("Save & check", "save")} ${button("Publish version", "publish", "", "pri")}</div></div>
 ${["Omar Sinclair", "Yvette Armstrong"].includes(profile.name) && profile.facts.some((f) => f.id === "case-notes") ? button("Prepare organizer teaching suggestions", "prepare") : ""}
 <p class="muted" id="save-status">${dirty ? "Unsaved changes" : "Saved draft"} · Published versions and active encounters remain fixed.</p>
 ${profile.missing?.length ? `<details><summary>Imported omissions and review notes (${profile.missing.length})</summary><ul>${profile.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><p class="muted">An omission may remain unspecified. Do not convert it to a negative finding.</p></details>` : ""}
 <div class="fields">${control("Name", "name")}${control("Age", "age", { type: "number" })}${control("Opening line", "intro")}${control("Personality", "personality")}${control("Communication style", "style")}${control("Authored emotional state", "emotion")}${control("ElevenLabs voice ID (optional)", "voiceId")}${control("Image S3 URI (optional)", "image")}</div>
 <h3>Clinical facts</h3><p class="muted">These are the authoritative records. Editing them changes the next published encounter directly. Neutral topic descriptions help question matching without exposing hidden values.</p>
 ${profile.facts
   .map(
     (f, i) =>
       `<details class="card-edit" ${profile.facts.length < 4 ? "open" : ""}><summary>${esc(f.label || "New fact")} <span class="chip">${esc(f.origin || "faculty")} · ${f.reviewed ? "reviewed" : "review required"}</span></summary><div class="fields">${control("Stable fact ID", `facts.${i}.id`)}${control("Clinical finding / chart text", `facts.${i}.label`)}${control("Neutral question topic", `facts.${i}.topic`)}${control(
         "Visibility",
         `facts.${i}.vis`,
         {
           options: [
             ["ask", "Patient knows"],
             ["chart", "Chart only"],
           ],
         },
       )}${control("Chart category", `facts.${i}.ehr`, { options: sections.slice(1) })}${control("Section that releases chart fact", `facts.${i}.sec`, { options: [["", "Not a chart fact"], ...sections.slice(1)] })}${control("Provenance status", `facts.${i}.type`, { options: ["reported", "documented", "confirmed", "unknown"] })}${control("Source ID or report reference", `facts.${i}.src`)}${control("Question keywords", `facts.${i}.kw`, { list: true })}${control("Trust gate (0–3)", `facts.${i}.gate`, { type: "number" })}${control("Approved deflection", `facts.${i}.deflect`)}${control("Match key for handoff", `facts.${i}.k`)}${control("Measurement units", `facts.${i}.unit`)}${control("Reference / interpretation context", `facts.${i}.ref`)}${control("Measurement date", `facts.${i}.date`, { type: "date" })}${control("Medication identifier (if applicable)", `facts.${i}.drug`)}${control("Allergy medication identifier", `facts.${i}.allergyDrug`)}${control("Measurement", `facts.${i}.lab`, { type: "checkbox" })}${control("I reviewed this fact", `facts.${i}.reviewed`, { type: "checkbox" })}</div>${control("Patient response / approved fallback", `facts.${i}.say`, { type: "textarea" })}${button("Remove fact", "remove-fact", `data-index="${i}"`)}</details>`,
   )
   .join("")}
 ${button("Add fact", "add-fact")}
 <h3>Teaching sources</h3><p class="muted">References support review and coaching. Their contents are treated as evidence, not instructions.</p>
 ${profile.sources.map((s, i) => `<details class="card-edit"><summary>${esc(s.title)} · ${s.reviewed ? "reviewed" : "review required"}</summary><div class="fields">${control("Source ID", `sources.${i}.id`)}${control("Title", `sources.${i}.title`)}${control("Reference URL", `sources.${i}.url`)}${control("I reviewed this source", `sources.${i}.reviewed`, { type: "checkbox" })}</div>${control("Relevant source excerpt", `sources.${i}.excerpt`, { type: "textarea" })}${s.fileId ? `<a href="/api/files/${esc(s.fileId)}" target="_blank" rel="noopener">Open uploaded source</a>` : ""}${safeLink(s.url) ? ` <a href="${safeLink(s.url)}" target="_blank" rel="noopener">Open reference</a>` : ""}${button("Remove source", "remove-source", `data-index="${i}"`)}</details>`).join("")}
 <div class="row">${button("Add source", "add-source")}${button("Add reference links", "references")}<label class="btn file-label">Upload PDF / TXT source<input type="file" id="source-upload" accept=".pdf,.txt,application/pdf,text/plain" hidden></label></div>
 <h3>Clinical artifacts</h3>${profile.artifacts
   .map(
     (a, i) =>
       `<details class="card-edit"><summary>${esc(a.title)} · ${a.reviewed ? "reviewed" : "review required"}</summary><div class="fields">${control("Artifact ID", `artifacts.${i}.id`)}${control("Title", `artifacts.${i}.title`)}${control("Source / report ID", `artifacts.${i}.src`)}${control("Date", `artifacts.${i}.date`, { type: "date" })}${control("Category", `artifacts.${i}.sec`, { options: sections.slice(1) })}${control("Format", `artifacts.${i}.kind`, { options: ["lab", "note", "ecg", "ct", "image", "report"] })}${control(
         "Release when",
         `artifacts.${i}.release`,
         {
           options: [
             ["both", "Section opened OR matching question"],
             ["section", "Section opened"],
             ["question", "Matching question only"],
           ],
         },
       )}${control("Question release keywords", `artifacts.${i}.unlock`, { list: true })}${control("Linked fact IDs", `artifacts.${i}.facts`, { list: true })}${control("Artifact agrees with approved facts", `artifacts.${i}.reviewed`, { type: "checkbox" })}</div>${control("Report text", `artifacts.${i}.text`, { type: "textarea" })}${control("Lab rows: test | value | unit | reference", `artifacts.${i}.rows`, { type: "textarea", rows: true })}${a.fileId ? `<a href="/api/files/${esc(a.fileId)}" target="_blank" rel="noopener">Open attachment</a>` : ""}${button("Remove artifact", "remove-artifact", `data-index="${i}"`)}</details>`,
   )
   .join("")}
 <div class="row">${button("Add structured report", "add-artifact")}<label class="btn file-label">Attach PDF / PNG / JPG<input type="file" id="artifact-upload" accept=".pdf,.png,.jpg,.jpeg" hidden></label></div>
 <h3>Learning objectives</h3>${profile.obj
   .map(
     (o, i) =>
       `<details class="card-edit"><summary>${esc(o.t)} · ${o.w} weight</summary><div class="fields">${control("Objective ID", `obj.${i}.id`)}${control("Objective", `obj.${i}.t`)}${control("Weight", `obj.${i}.w`, { type: "number" })}${control(
         "Evidence type",
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
       )}${control("Fact IDs", `obj.${i}.f`, { list: true })}${control("Review sections", `obj.${i}.s`, { list: true })}${control("Next attempt coaching", `obj.${i}.tip`)}</div>${button("Remove objective", "remove-objective", `data-index="${i}"`)}</details>`,
   )
   .join("")}${button("Add objective", "add-objective")}
 <details class="card-edit"><summary>Intentional discrepancy (optional)</summary>${profile.mm ? `<div class="fields">${control("Patient statement fact ID", "mm.a")}${control("Chart record fact ID", "mm.b")}${control("Follow-up fact ID", "mm.fu")}${control("Reconciliation keywords", "mm.kw", { list: true })}</div>${button("Remove discrepancy", "remove-mm")}` : button("Define discrepancy", "add-mm")}</details>
 <h3>Observable rubric domains</h3><div class="domain-picks">${domainNames.map((name, i) => `<label><input type="checkbox" data-domain="${i + 1}" ${profile.rubricApplicable.includes(i + 1) ? "checked" : ""}>${i + 1}. ${name}</label>`).join("")}</div>
 <div class="review-box">${control("I reviewed the complete profile, sources and report consistency", "reviewAcknowledged", { type: "checkbox" })}${button("Mark all individual records reviewed", "review-all")}<p class="muted">Use this only after reviewing every record above. This records your approval; it does not certify clinical correctness.</p></div>
 ${issues.length ? `<details class="issues" open><summary>Publication checks (${issues.filter((i) => i.severity === "error").length} errors)</summary>${issues.map((i) => `<p class="issue ${i.severity === "error" ? "err" : "warn"}">${esc(i.message)}</p>`).join("")}</details>` : ""}</div>`;
}
function encounter() {
  if (!enc)
    return `<div class="pn"><h1>Start an encounter</h1><p class="muted">Only published versions can be launched.</p><div class="patient-grid">${list
      .filter((p) => p.version)
      .map((p) => card(p, false))
      .join("")}</div></div>`;
  return `<div class="grid enc-grid"><section class="pn enc-talk"><div class="panel-kicker">${enc.status === "complete" ? "Completed encounter" : "Student encounter"}</div><div class="av-frame" id="avf"><img class="av-still" src="${esc(enc.imageUrl)}" alt="${esc(enc.name)}"><div class="voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div><h1>${esc(enc.name)}, ${enc.age}</h1><div id="voice-status" role="status">${enc.status === "complete" ? "Encounter complete" : "Ready for your question"}</div><div class="row voice-controls">${button("Tap to talk", "mic")}${button(muted ? "Unmute" : "Mute", "mute")}${button("Pause audio", "pause")}</div><form id="question-form"><label for="question">Ask the patient</label><div class="row"><input id="question" maxlength="2000" placeholder="Type a question or use the microphone" ${busy || enc.status === "complete" ? "disabled" : ""} autocomplete="off"><button class="btn pri" type="submit" ${busy || enc.status === "complete" ? "disabled" : ""}>${busy ? "Thinking…" : "Send"}</button></div></form><div class="tr" id="transcript" aria-live="polite">${enc.transcript.map((t) => `<article class="bubble ${t.role === "student" ? "student" : "patient"}" id="${esc(t.id)}"><b>${t.role === "student" ? "You" : esc(enc.name.split(" ")[0])}</b><p>${esc(t.text)}</p>${t.role === "patient" ? `<span class="chip">${esc(t.provider)}${t.factIds?.length ? " · " + esc(t.factIds.join(", ")) : ""}</span>` : ""}</article>`).join("")}</div><div class="row">${enc.status === "active" ? button("Finish & get feedback", "complete", "", "pri") : button("View feedback", "nav", `data-tab="rep"`)}</div></section>
 <section class="pn ehr-panel"><div class="ehr-head"><div><div class="panel-kicker">Dynamic clinical record</div><h2>Chart · ${esc(enc.name)}</h2></div><span class="chip">Profile v${enc.version}</span></div><div class="tabs">${sections.map(([s, name]) => button(name, "section", `data-section="${s}"`, section === s ? "on" : "")).join("")}</div>${chart()}<details><summary>Encounter provenance</summary><p class="muted">${esc(enc.id)} · Released findings stay distinct from patient reports. Opening a report does not count as reviewing it.</p><div class="audit-list">${enc.events
   .filter((e) => ["release", "disclose", "review", "gate"].includes(e.type))
   .map(
     (e) =>
       `<p>${esc(e.type)} · ${esc(e.id.split("-E").at(-1))} · ${esc(e.text)}</p>`,
   )
   .join("")}</div></details></section></div>`;
}
function chart() {
  const facts = enc.disclosed.filter(
      (f) => section === "ov" || f.ehr === section,
    ),
    arts = enc.artifacts.filter((a) => section === "ov" || a.sec === section);
  return `<p class="chip">${enc.disclosed.length} findings released · ${enc.artifacts.filter((a) => a.released).length} reports released · ${enc.artifacts.filter((a) => a.reviewed).length} reviewed</p>
 ${arts.map((a) => `<article class="art ${a.released ? "released" : "locked"}"><h3>${esc(a.title)}</h3>${a.released ? `<p class="chip">${esc(a.src)} · ${esc(a.date)} · synthetic</p>${a.rows?.length ? `<table class="lab-table"><thead><tr><th>Test</th><th>Result</th><th>Reference</th></tr></thead><tbody>${a.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.value)} ${esc(r.unit)}</td><td>${esc(r.ref)}</td></tr>`).join("")}</tbody></table>` : ""}${a.text ? `<p>${esc(a.text)}</p>` : ""}${a.img ? `<img class="art-img" src="${esc(a.img)}" alt="${esc(a.title)}">` : ""}${a.fileUrl ? `<a href="${esc(a.fileUrl)}" target="_blank" rel="noopener">Open attached report</a>` : ""}<div>${a.reviewed ? '<span class="ok">Review recorded</span>' : button("Mark reviewed", "review", `data-id="${esc(a.id)}"`)}</div>` : '<p class="muted">Not released yet. Follow the authored questions or chart workflow.</p>'}</article>`).join("")}
 ${facts.map((f) => `<article class="fx"><b>${esc(f.label)}</b><span class="st ${esc(f.type)}">${esc(f.type)}</span><p class="chip">${esc(f.src)} · ${esc(f.provenance.eventId.split("-E").at(-1))} · ${esc(f.provenance.via)}</p></article>`).join("")}
 ${!facts.length && !arts.length ? '<div class="empty">No information has been released in this section.</div>' : ""}
 ${section !== "ov" && facts.length && !enc.reviewedSections.includes(section) ? button("Record review of these findings", "review-section", `data-section="${section}"`) : ""}`;
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
function assessment() {
  if (!enc) return '<div class="pn"><h1>No active encounter</h1></div>';
  if (!enc.assessment)
    return `<div class="pn"><h1>Encounter feedback</h1><p>Finish the encounter to assess the complete evidence.</p>${button("Finish & get feedback", "complete", "", "pri")}</div>`;
  const a = enc.assessment;
  return `<div class="pn"><div class="panel-kicker">Encounter feedback</div><h1>Patient Encounter Performance Rubric</h1><div class="score-hero"><div class="score-num">${a.total}/${a.denominator}</div><div><p>${esc(a.notice)}</p><span class="chip">${a.na} N/A domains · ${esc(a.provider)}${a.model ? " · " + esc(a.model) : ""}</span></div></div>${a.provider === "local-provisional" ? '<div class="warn">Cloud assessment is unavailable. Ratings below are provisional placeholders for faculty review, not a measured performance grade.</div>' : ""}${a.failure ? `<p class="muted">Provider fallback: ${esc(a.failure)}</p>` : ""}${a.reviewRequired ? '<p class="warn">Faculty review required: domain 6 or 7 has a rating of 1.</p>' : ""}<div class="rubric-grid">${a.domains.map((d) => `<article class="obj-card"><span class="rating">${d.score === null ? "N/A" : d.score + " / 4"}</span><h2>${d.domain}. ${esc(d.name)}</h2><p>${esc(d.reason)}</p><p class="muted">Next attempt: ${esc(d.next)}</p>${evidence(d.evidence)}</article>`).join("")}</div>${["strengths", "gaps", "concerns"].map((k) => `<h2>${{ strengths: "Strengths demonstrated", gaps: "Missed opportunities", concerns: "Safety or accuracy concerns" }[k]}</h2>${a[k].length ? a[k].map((n) => `<p>${esc(n.text)}</p>${evidence(n.evidence)}`).join("") : '<p class="muted">None identified by this assessment.</p>'}`).join("")}<h2>Faculty objective completion</h2>${a.objectives.map((o) => `<article class="obj-card"><h3>${esc(o.title)} · ${o.earned}/${o.weight}</h3>${evidence(o.evidence)}${o.credit < 1 ? `<p>Next attempt: ${esc(o.next)}</p>` : ""}</article>`).join("")}<a class="btn" href="/api/encounters/${esc(enc.id)}/export">Download encounter and assessment</a></div>`;
}
function evidence(ids) {
  return `<details class="evidence"><summary>Evidence (${ids.length})</summary>${
    ids.length
      ? ids
          .map((id) => {
            const e = enc.events.find((e) => e.id === id);
            return `<p><b>${esc(id.split("-E").at(-1))} · ${esc(e?.type)}</b> ${esc(e?.text || JSON.stringify(e))}</p>`;
          })
          .join("")
      : "<p>No observed evidence cited.</p>"
  }</details>`;
}
function past() {
  return `<div class="pn"><h1>Encounter history</h1><p class="muted">Each attempt retains its patient version, transcript and assessment.</p><div class="history-list">${history.map((e) => `<article class="fx"><h2>${esc(e.name)} · v${e.version}</h2><p>${esc(new Date(e.createdAt).toLocaleString())} · ${e.turns} questions · ${e.status}</p>${button(e.status === "complete" ? "View feedback" : "Resume encounter", "resume", `data-id="${esc(e.id)}"`)} <a href="/api/encounters/${esc(e.id)}/export">Download record</a></article>`).join("") || "<p>No encounters yet.</p>"}</div></div>`;
}
function render() {
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
    { studio, enc: encounter, team, rep: assessment, history: past }[tab]();
  if (tab === "enc") $("#transcript")?.scrollTo(0, 1e9);
}
function stopAudio() {
  speechGeneration++;
  recognition?.abort();
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
  $("#avf")?.classList.remove("speaking", "listening");
}
function voiceState(state, text) {
  $("#avf")?.classList.toggle("speaking", state === "speaking");
  $("#avf")?.classList.toggle("listening", state === "listening");
  if ($("#voice-status")) $("#voice-status").textContent = text;
}
async function speak(turn) {
  stopAudio();
  const generation = speechGeneration;
  if (muted || tab !== "enc") return;
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
        voiceState("speaking", "Patient speaking · ElevenLabs");
      audio.onended = () => voiceState("ready", "Ready for your question");
      audio.onerror = () =>
        voiceState("ready", "Audio unavailable; transcript remains available");
      await audio.play();
      return;
    } catch {
      if (generation !== speechGeneration) return;
      voiceState("ready", "Cloud speech unavailable · browser voice fallback");
    }
  if ("speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.onstart = () =>
      voiceState("speaking", "Patient speaking · browser voice");
    utter.onend = () => voiceState("ready", "Ready for your question");
    utter.onerror = () =>
      voiceState("ready", "Audio unavailable; use the transcript");
    speechSynthesis.speak(utter);
  }
}
async function mutate(action, payload) {
  const r = await api(`/api/encounters/${enc.id}/${action}`, "POST", payload);
  enc = r.encounter;
  health.storage = r.storage;
}
async function question(text) {
  if (busy || !text.trim() || enc?.status !== "active") return;
  stopAudio();
  busy = true;
  message = "";
  render();
  let delivered = false;
  try {
    await mutate("turn", { question: text, requestId: crypto.randomUUID() });
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
function mic() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    message = "Microphone recognition is unavailable. Type your question.";
    render();
    return;
  }
  stopAudio();
  recognition = new Rec();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  voiceState("listening", "Listening…");
  recognition.onresult = (e) => {
    const result = e.results[e.results.length - 1];
    if ($("#question")) $("#question").value = result[0].transcript;
    if (result.isFinal) {
      const text = result[0].transcript;
      recognition?.stop();
      recognition = null;
      question(text);
    }
  };
  recognition.onerror = (e) =>
    voiceState(
      "ready",
      "Microphone unavailable: " + e.error + ". Type your question.",
    );
  recognition.onend = () => voiceState("ready", "Ready for your question");
  recognition.start();
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
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.memory) {
    formMemory[t.dataset.memory] = t.value;
    return;
  }
  if (t.dataset.domain) {
    const n = Number(t.dataset.domain);
    profile.rubricApplicable = t.checked
      ? [...new Set([...profile.rubricApplicable, n])]
      : profile.rubricApplicable.filter((d) => d !== n);
    profile.reviewAcknowledged = false;
    dirty = true;
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
    obj[keys.at(-1)] = v;
    if (t.dataset.path !== "reviewAcknowledged") {
      profile.reviewAcknowledged = false;
      if (
        ["facts", "sources", "artifacts"].includes(keys[0]) &&
        keys.at(-1) !== "reviewed"
      )
        obj.reviewed = false;
      const acknowledgment = $("#field-reviewAcknowledged");
      if (acknowledgment) acknowledgment.checked = false;
    }
    dirty = true;
  }
  if ($("#save-status"))
    $("#save-status").textContent =
      "Unsaved changes · Save & check before leaving the editor.";
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "question-form") {
    e.preventDefault();
    question($("#question").value);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "csv-import") {
      const r = await api("/api/import", "POST", {
        csv: await e.target.files[0].text(),
      });
      message = `Imported ${r.added.length} drafts; skipped ${r.skipped.length} existing IDs.`;
      await refresh();
      render();
    }
    if (["source-upload", "artifact-upload"].includes(e.target.id)) {
      const source = e.target.id === "source-upload";
      busy = true;
      const file = await upload(e.target.files[0]);
      if (source)
        profile.sources.push({
          id: "source-" + crypto.randomUUID(),
          title: file.name,
          excerpt:
            file.excerpt || "Scanned/image source: add a manual excerpt.",
          fileId: file.id,
          reviewed: false,
        });
      else
        profile.artifacts.push({
          id: "artifact-" + crypto.randomUUID(),
          title: file.name,
          kind: "report",
          src: "Faculty attachment",
          date: "",
          sec: "labs",
          release: "section",
          unlock: [],
          facts: [],
          fileId: file.id,
          text: file.type === "application/pdf" ? "" : undefined,
          reviewed: false,
        });
      dirty = true;
      message =
        "Attachment uploaded. Map it to facts and review before publishing.";
      busy = false;
      render();
    }
    if (e.target.id === "team-role") {
      await mutate("role", { role: e.target.value });
      render();
    }
  } catch (err) {
    busy = false;
    message = err.message;
    render();
  }
});
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t || busy) return;
  const a = t.dataset.action;
  try {
    message = "";
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
    }
    if (a === "new") {
      if (dirty) await save();
      const r = await api("/api/profiles", "POST", {});
      await refresh();
      await pick(r.profile.id);
      tab = "studio";
    }
    if (a === "save") {
      await save();
      message = "Draft saved. Publication checks updated.";
    }
    if (a === "prepare") {
      await save();
      await api("/api/profiles/" + profile.id + "/prepare", "POST", {});
      await pick(profile.id);
      message =
        "Organizer facts organized into reviewable suggestions. Missing details remain unspecified.";
    }
    if (a === "publish") {
      await save();
      const r = await api(
        "/api/profiles/" + profile.id + "/publish",
        "POST",
        {},
      );
      message = `Published immutable version ${r.version}. Ready to start.`;
      await refresh();
      await pick(profile.id);
    }
    if (a === "generate") {
      if (dirty) await save();
      busy = true;
      render();
      const r = await api("/api/generate", "POST", {
        description: formMemory.description,
        profileId: profile?.id,
      });
      await refresh();
      await pick(r.profile.id);
      message = r.warning;
      busy = false;
    }
    if (a === "launch") {
      if (dirty) await save();
      stopAudio();
      const r = await api("/api/encounters", "POST", {
        profileId: t.dataset.id,
        version: Number(t.dataset.version),
      });
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
      render();
      speak(enc.transcript.at(-1));
      return;
    }
    if (a === "resume") {
      stopAudio();
      enc = (await api("/api/encounters/" + t.dataset.id)).encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      tab = enc.status === "complete" ? "rep" : "enc";
    }
    if (a === "section") {
      if (enc.status === "active")
        await mutate("open", { section: t.dataset.section });
      section = t.dataset.section;
    }
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
    if (a === "review-all") {
      profile.facts.forEach((f) => (f.reviewed = true));
      profile.sources.forEach((s) => (s.reviewed = true));
      profile.artifacts.forEach((a) => (a.reviewed = true));
      message =
        "Individual records marked reviewed. Complete the whole-profile acknowledgment before publishing.";
    }
    if (/^(add-|remove-)/.test(a) || ["review-all", "references"].includes(a)) {
      dirty = true;
      profile.reviewAcknowledged = false;
    }
    render();
  } catch (err) {
    busy = false;
    message = err.message;
    render();
  }
});
function toggleTheme() {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("virtusp-theme", theme);
}
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
