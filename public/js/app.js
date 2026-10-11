"use strict";
const $ = (s) => document.querySelector(s);
function pageTop() {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
const teaching = window.VirtuCatalog;
let catalogObjective = "",
  catalogDiscipline = "";
function catalogMatches(item) {
  return teaching.matches(
    item.catalog || { objectives: [], disciplines: [] },
    catalogObjective,
    catalogDiscipline,
  );
}
function catalogPicker() {
  return `<section class="catalog-picker" aria-labelledby="catalog-title"><h2 id="catalog-title">What would you like to practice?</h2><p class="muted">Choose a learning objective, then select a matching simulation.</p><div class="objective-choices" role="group" aria-label="Learning objective">${[{ id: "", label: "All objectives" }, ...teaching.objectives].map((o) => button(o.label, "filter-objective", `data-objective="${o.id}" aria-pressed="${catalogObjective === o.id}"`, catalogObjective === o.id ? "pri" : "")).join("")}</div><div class="catalog-options"><label for="catalog-discipline">Learner discipline (optional)<select id="catalog-discipline"><option value="">All disciplines</option>${teaching.disciplines.map((d) => `<option value="${d.id}" ${catalogDiscipline === d.id ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select></label>${catalogObjective || catalogDiscipline ? button("Clear filters", "clear-catalog") : ""}<span class="muted">This filters scenarios; it does not change the assessment rubric.</span></div></section>`;
}
function catalogFields(selected, scope = "profile") {
  return `<div class="catalog-fields">${[
    ["objectives", "Learning objective categories", teaching.objectives],
    [
      "disciplines",
      "Appropriate learner disciplines (optional)",
      teaching.disciplines,
    ],
  ]
    .map(
      ([key, label, options]) =>
        `<fieldset><legend>${label}</legend>${options.map((o) => `<label class="catalog-check"><input type="checkbox" data-catalog-field="${key}" data-catalog-scope="${scope}" value="${o.id}" ${selected[key].includes(o.id) ? "checked" : ""}>${esc(o.label)}</label>`).join("")}</fieldset>`,
    )
    .join("")}</div>`;
}
async function changeDiscipline(discipline) {
  if (demoSession?.role === "student") {
    const result = await api("/api/student-preferences", "PUT", { discipline });
    catalogDiscipline = result.preferences.discipline;
  } else catalogDiscipline = discipline;
}
const appHeader = $("body > header");
// The menu is a side panel on a wide screen once a workspace is chosen; the
// workspace picker itself keeps the plain top bar.
const sideMenu = () =>
  document.body.classList.contains("has-menu") &&
  !!window.matchMedia?.("(min-width: 1000px)").matches;
function updateHeaderHeight() {
  document.documentElement.style.setProperty(
    "--app-header-height",
    sideMenu()
      ? "0px"
      : `${Math.ceil(appHeader.getBoundingClientRect().height)}px`,
  );
}
window
  .matchMedia?.("(min-width: 1000px)")
  .addEventListener?.("change", updateHeaderHeight);
updateHeaderHeight();
// The pinned patient banner changes height with zoom and wrapping, so what
// sits below it is offset by its measured height, not a fixed number.
function updateBannerHeight() {
  const banner = $(".pt-banner");
  document.documentElement.style.setProperty(
    "--pt-banner-height",
    `${banner ? Math.ceil(banner.getBoundingClientRect().height) : 0}px`,
  );
}
if (typeof MutationObserver !== "undefined")
  new MutationObserver(updateBannerHeight).observe($("#app"), {
    childList: true,
  });
window.addEventListener("resize", updateBannerHeight);
if (typeof ResizeObserver !== "undefined")
  new ResizeObserver(updateHeaderHeight).observe(appHeader);
else window.addEventListener("resize", updateHeaderHeight);
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
  selectedEvidenceId = "",
  insightsData = null,
  boardStudent = "",
  boardFocus = "",
  boardDraft = null,
  visitModal = "";
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
  importing = false,
  importReport = null,
  importNote = "",
  importRedraft = false,
  deleteAsk = "",
  dirty = false,
  busy = false,
  muted = false,
  recognition = null,
  audio = null,
  audioUrl = null,
  speechGeneration = 0,
  callAnimation = 0,
  interviewTimer = 0,
  callVideoUrl = null,
  portraitToken = 0,
  portraitImage = null,
  portraitUrl = "",
  studentStream = null,
  studentCameraTried = false,
  studentCameraRequest = 0,
  studentCameraNote = "",
  cameraState = "off",
  patientVolume = 1,
  lastLatencyMs = null,
  selectedCameraId = "",
  cameraDevices = [],
  faceWatch = 0,
  faceModel = null,
  faceBroken = false,
  faceMachine = null,
  facePublic = "CAMERA_OFF",
  bargeTimer = 0,
  bargeContext = null,
  bargeSource = null,
  bargeArmedAt = 0,
  captionsOn = true,
  turnStartedAt = 0,
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
  utteranceStarted = 0,
  emptyListens = 0,
  interviewClosing = false,
  speechWatch = 0,
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
const SILENCE_MS = 700;
const MAX_UTTERANCE_MS = 20000;
const EMPTY_LISTEN_LIMIT = 3;
let draftRecognition = null,
  draftDictating = false;
const liveSupported = () =>
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const reducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const formMemory = {
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
  {
    type = "text",
    options = null,
    list = false,
    rows = false,
    readOnly = false,
  } = {},
) {
  let v = value(path);
  if (list) v = (v || []).join(", ");
  if (rows)
    v = (v || [])
      .map((r) => [r.name, r.value, r.unit, r.ref].join(" | "))
      .join("\n");
  const id = "field-" + path.replace(/\./g, "-");
  const attr = `id="${id}" data-path="${esc(path)}" ${readOnly ? "readonly" : ""} ${list ? 'data-list="true"' : ""} ${rows ? 'data-rows="true"' : ""}`;
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
const aiSparkle =
  '<svg class="ai-sparkle" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3ZM20 1l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/></svg>';
const aiActions = new Set([
  "new-ai",
  "generate-ai",
  "random-ai",
  "regenerate-ai",
  "parse-patient",
  "analyze-bias",
]);
const button = (text, action, extra = "", cls = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${extra} ${busy ? "disabled" : ""}>${aiActions.has(action) ? aiSparkle : ""}${text}</button>`;
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
      hint: "Speak, then pause when you finish",
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
async function refresh() {
  if (!demoSession) {
    health = await api("/api/health");
    return;
  }
  const [patients, past, status, people, catalog, tasks, ownInsights] =
    await Promise.all([
      api("/api/profiles"),
      api("/api/encounters"),
      api("/api/health"),
      api("/api/students"),
      api("/api/groups"),
      api("/api/assignments"),
      demoSession.role === "student"
        ? api("/api/insights").catch(() => null)
        : Promise.resolve(null),
    ]);
  list = patients.profiles;
  history = past.encounters;
  health = status;
  students = people.students;
  groups = catalog.groups;
  assignments = tasks.assignments;
  selectedStudent ||= students[0]?.id || "";
  selectedGroup ||= groups[0]?.id || "";
  if (demoSession?.role === "faculty") {
    facultyResults = (await api("/api/faculty-results")).students;
  } else {
    insightsData = ownInsights;
  }
}
async function pick(id) {
  const r = await api("/api/profiles/" + id);
  profile = r.profile;
  issues = r.issues;
  versions = r.versions;
  dirty = false;
}
async function save() {
  if (!profile || (patientDialog && patientDialog.mode !== "edit")) return;
  const r = await api("/api/profiles/" + profile.id, "PUT", { profile });
  issues = r.issues;
  dirty = false;
  await refresh();
}
function assignmentControl(kind, id, ready = true) {
  if (!ready)
    return `<p class="muted">${kind === "group" ? "Publish compatible cases" : "Publish this patient"} before assigning.</p>`;
  return `<section class="simulation-assignment" data-simulation="${esc(id)}" aria-label="Assign ${esc(kind === "group" ? "group" : "patient")} simulation"><label>Assign to<select data-assignment-student><option value="">Select a student</option>${students.map((s) => `<option value="${esc(s.id)}" ${s.id === selectedStudent ? "selected" : ""}>${esc(s.alias)}</option>`).join("")}</select></label>${button("Assign", "assign-simulation", `data-kind="${kind}" data-id="${esc(id)}"`, "pri")}</section>`;
}
// ---- Importing case files or a whole folder, and deleting a patient.
const IMPORT_TYPES = [
  "pdf",
  "docx",
  "txt",
  "md",
  "csv",
  "tsv",
  "json",
  "html",
  "htm",
  "xml",
  "rtf",
  "boxnote",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
];
// Sends the chosen files to the server, where the Claude API drafts one
// patient, or one per row of a roster CSV. Results arrive as unpublished drafts.
async function importFiles(fileList) {
  const all = [...(fileList || [])];
  if (!all.length || importing) return;
  const skipped = [];
  let total = 0;
  const picked = all.filter((file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!IMPORT_TYPES.includes(ext))
      skipped.push(`${file.name} (unsupported type)`);
    else if (file.size > 8000000)
      skipped.push(`${file.name} (larger than 8 MB)`);
    else if (total + file.size > 60000000)
      skipped.push(`${file.name} (the selection is over 60 MB in total)`);
    else {
      total += file.size;
      return true;
    }
    return false;
  });
  if (!picked.length) {
    importReport = { error: "None of those files can be imported.", skipped };
    render();
    return;
  }
  importing = true;
  busy = true;
  importReport = null;
  message = `Reading ${picked.length} file${picked.length > 1 ? "s" : ""} and drafting. One patient takes about a minute; a roster of several can take a few minutes. Keep this tab open…`;
  render();
  try {
    const files = await Promise.all(
      picked.slice(0, 60).map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                data: String(reader.result).split(",")[1] || "",
              });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    );
    let { job } = await api("/api/import-files", "POST", {
      files,
      note: importNote,
      redraft: importRedraft,
    });
    message = "";
    render();
    while (job.status !== "done") {
      showImportProgress(job);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      job = (await api("/api/import-files/" + job.id)).job;
    }
    if (job.error)
      throw Object.assign(new Error(job.error), {
        skipped: job.result?.skipped,
      });
    const r = job.result;
    importReport = { ...r, skipped: [...skipped, ...(r.skipped || [])] };
    const made = r.added.length + r.replaced.length;
    message = made
      ? `Drafted ${made} patient${made > 1 ? "s" : ""}. Review each one, then publish.`
      : r.updated.length
        ? `Refreshed roster details for ${r.updated.length} existing patient${r.updated.length > 1 ? "s" : ""}.`
        : "Nothing was imported.";
    await refresh();
  } catch (err) {
    importReport = {
      error: err.message,
      skipped: [...skipped, ...(err.skipped || [])],
    };
    message = "";
  }
  importing = false;
  busy = false;
  render();
}
// Live status while the server drafts: a bar, a count and who is in progress.
function showImportProgress(job) {
  const box = $("#import-progress");
  if (!box) return;
  const seconds = Math.round((Date.now() - job.startedAt) / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const done = job.finished.length + job.failed.length;
  const headline =
    job.total == null
      ? "Reading the files…"
      : job.total === 0
        ? "Refreshing roster details…"
        : `Drafting ${job.total === 1 ? "the patient" : `patients: ${done} of ${job.total} done`}`;
  const detail = [
    job.finished.length ? "Done: " + job.finished.join(", ") : "",
    job.working.length ? "Working on: " + job.working.join(", ") : "",
    job.failed.length ? "Could not draft: " + job.failed.join(", ") : "",
  ]
    .filter(Boolean)
    .map((line) => `<span>${esc(line)}</span>`)
    .join("");
  box.hidden = false;
  box.innerHTML = `<div class="import-status"><b>${esc(headline)}</b><span class="muted">${clock} elapsed · a patient usually takes 1 to 2 minutes</span></div><div class="meter ${job.total ? "" : "indeterminate"}" role="progressbar" aria-valuemin="0" aria-valuemax="${job.total || 1}" aria-valuenow="${done}"><i style="width:${job.total ? Math.max(4, (done / job.total) * 100) : 100}%"></i></div><div class="import-detail muted small">${detail}</div>`;
}
// Folders and files dropped on Patient Studio are read recursively.
async function droppedFiles(dataTransfer) {
  const walk = (entry) =>
    new Promise((resolve) => {
      if (entry.isFile)
        entry.file(
          (f) => resolve([f]),
          () => resolve([]),
        );
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        const found = [];
        const more = () =>
          reader.readEntries(
            async (batch) => {
              if (!batch.length) return resolve(found);
              for (const child of batch) found.push(...(await walk(child)));
              more();
            },
            () => resolve(found),
          );
        more();
      } else resolve([]);
    });
  const entries = [...(dataTransfer.items || [])]
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);
  return entries.length
    ? (await Promise.all(entries.map(walk))).flat()
    : [...dataTransfer.files];
}
function importPanel() {
  const r = importReport;
  const drafts = list.filter((p) => !p.version).length;
  const names = (items) => items.map((i) => esc(i.name)).join(", ");
  const notes = (items) =>
    items
      .filter((i) => i.warnings?.length)
      .map(
        (i) =>
          `<details class="evidence"><summary>${esc(i.name)}: ${i.warnings.length} note${i.warnings.length > 1 ? "s" : ""} to review</summary><ul>${i.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>`,
      )
      .join("");
  const report = !r
    ? ""
    : `<div class="import-report ${r.error ? "is-error" : ""}" role="status">${
        r.error
          ? `<p><b>Import failed.</b> ${esc(r.error)}</p>`
          : `${r.added.length ? `<p><b>Drafted:</b> ${names(r.added)}</p>` : ""}${r.replaced.length ? `<p><b>Redrafted:</b> ${names(r.replaced)}</p>` : ""}${r.updated.length ? `<p><b>Already in the library, roster details refreshed:</b> ${names(r.updated)}. Tick "Redraft" to rebuild their cases.</p>` : ""}${notes([...r.added, ...r.replaced])}`
      }${r.skipped?.length ? `<details class="evidence"><summary>Skipped ${r.skipped.length} file${r.skipped.length > 1 ? "s" : ""}</summary><ul>${r.skipped.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}${button("Dismiss", "import-dismiss")}</div>`;
  // Nothing to show until there is something to act on: an import running,
  // a result to read, or drafts waiting to be published.
  if (!importing && !r && !drafts) return "";
  return `<section class="import-panel" id="import-drop">${drafts ? `<div class="row draft-bar"><span><b>${drafts} draft${drafts > 1 ? "s" : ""}</b> not published yet. Students can only start published patients.</span>${button(drafts > 1 ? `Publish all ${drafts} drafts` : "Publish the draft", "publish-drafts", "", "pri")}</div>` : ""}<div id="import-progress" class="import-progress" role="status" aria-live="polite" ${importing ? "" : "hidden"}>${importing ? '<div class="import-status"><b>Sending the files…</b></div><div class="meter indeterminate"><i style="width:100%"></i></div>' : ""}</div>${report}<details class="evidence import-options" ${importNote || importRedraft ? "open" : ""}><summary>Import options</summary><div class="import-row"><div class="field"><label for="import-note">Note for the importer (optional)</label><input id="import-note" maxlength="4000" value="${esc(importNote)}" placeholder="e.g. Build the patient named Maria; focus on medication adherence"></div><label class="check"><input type="checkbox" id="import-redraft" ${importRedraft ? "checked" : ""}> Redraft patients already in the library</label></div><p class="muted small">Import files, import a folder, or drop either on this page. PDF, Word, text, CSV and images are read. A roster CSV makes one patient per row and matches portraits by name. Imports arrive as drafts for you to review and publish.</p></details></section>`;
}
function card(p, faculty = true) {
  const remove =
    faculty && p.deletable
      ? deleteAsk === p.id
        ? `<div class="card-confirm" role="alertdialog" aria-label="Delete ${esc(p.name)}"><p><b>Delete ${esc(p.name)}?</b></p><p class="muted small">Past visits and their feedback are kept.</p><div class="row">${button("Delete", "delete-confirm", `data-id="${esc(p.id)}"`, "danger")}${button("Cancel", "delete-cancel")}</div></div>`
        : `<button type="button" class="card-delete" data-action="delete-ask" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}" title="Delete this patient" ${busy ? "disabled" : ""}>×</button>`
      : "";
  return `<article class="patient-card ${p.id === profile?.id ? "selected" : ""}">${remove}<span class="patient-photo-well"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy"></span><h3 class="patient-name">${esc(p.name)} <span class="patient-age">${p.age == null ? "Age unspecified" : esc(p.age) + " years"}</span></h3>${faculty && !p.version ? '<p class="patient-kind">Draft</p>' : ""}<div class="row patient-actions">${faculty ? button("Edit", "pick", `data-id="${esc(p.id)}"`) : ""}${p.version ? button(faculty ? "Start assessment" : "Start open assessment", "launch", `data-id="${esc(p.id)}" data-version="${p.version}"`, "pri") : faculty ? button("Publish", "publish-draft", `data-id="${esc(p.id)}" title="Confirm your review and publish, so it can be assigned and started"`, "pri") : ""}</div>${faculty ? assignmentControl("individual", p.id, !!p.version) : ""}</article>`;
}

function caseNames(cases) {
  return `<p class="group-patients"><strong>Patients:</strong> ${(cases || []).map((c) => esc(c.name || "Patient")).join(" · ")}</p>`;
}

function studio() {
  if (demoSession?.role === "student")
    return `<div class="pn"><div class="panel-kicker">Individual simulation</div><h1>Choose a patient</h1>${catalogPicker()}<p class="muted">Start a visit and receive your assessment when you finish.</p><div class="patient-grid">${
      list
        .filter(catalogMatches)
        .map((p) => card(p, false))
        .join("") ||
      '<p class="catalog-empty">No individual patients match. Clear filters to see all published cases.</p>'
    }</div></div>`;
  const preferred = list
    .filter(catalogMatches)
    .sort(
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
  return `<div class="pn studio"><div class="studio-head"><div><div class="panel-kicker">Faculty workspace</div><h1>Patient Studio</h1><p class="muted">Create a patient, review the evidence, publish a reusable encounter.</p></div><div class="row">${button("AI Generate a new Patient", "new-ai", "", "pri")}${button("New patient", "new")}${button(importing ? "Importing…" : "Import files", "import-files")}${button("Import folder", "import-folder")}<input id="files-import" type="file" multiple hidden><input id="folder-import" type="file" webkitdirectory hidden></div></div>${importPanel()}
 ${catalogPicker()}<h2 class="catalog-heading">Select an AI patient</h2><div class="patient-grid">${preferred.map((p) => card(p)).join("") || '<p class="catalog-empty">No individual patients match. Clear filters to see all cases.</p>'}</div>
 ${studioGroups()}
 </div>`;
}
function groupCards(faculty = false) {
  return (
    groups
      .filter(
        (g) =>
          (faculty || g.preparationStatus === "ready") && catalogMatches(g),
      )
      .sort((a, b) => (b.kind === "comparison") - (a.kind === "comparison"))
      .map((g) => {
        const assignment = assignments.find((a) => a.groupId === g.id);
        return `<article class="group-card faculty-group"><h3>${esc(g.title)}</h3><p class="patient-kind">${g.trialCount} patients</p>${caseNames(g.cases)}${faculty ? `<p>${esc(g.purpose)}</p>` : ""}${faculty ? assignmentControl("group", g.id, g.preparationStatus === "ready") : button(assignment?.attempt?.status === "complete" ? "View results" : assignment?.attempt ? "Resume assessment" : "Start group assessment", assignment ? "start-test" : "start-available", `data-id="${esc(assignment?.id || g.id)}"`, "pri")}${faculty ? `<details class="group-details"><summary>About this assessment</summary><p>${esc(g.differences)}</p><p class="muted">${esc(g.limitations)}</p></details>` : ""}</article>`;
      })
      .join("") ||
    `<p class="catalog-empty">${catalogObjective || catalogDiscipline ? "No groups match. Clear filters to see all assessments." : "No ready group assessments yet."}</p>`
  );
}
function studioGroups() {
  return `<section class="group-catalog"><h2 class="catalog-heading">Multi-patient assessment</h2><p class="muted">Similar conditions, different demographics and backgrounds. Complete every trial for group feedback.</p>${groupCards(true)}</section>`;
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
        `<div class="clinical-row" data-fact-index="${i}"><div class="clinical-main">${control("Finding", `facts.${i}.label`, { readOnly: f.lab && !!f.generationId })}${control(
          "Available through",
          `facts.${i}.vis`,
          {
            options: [
              ["ask", "Patient interview"],
              ["chart", "Chart only"],
            ],
          },
        )}${button("Remove", "remove-fact", `data-index="${i}"`)}</div>${f.lab && f.generationId ? `<div class="fields">${control("Test", `facts.${i}.test`)}${control("Value", `facts.${i}.value`)}${control("Units", `facts.${i}.unit`)}</div>` : ""}${f.vis === "ask" ? `<div class="patient-phrasing">${control("Patient wording", `facts.${i}.say`, { type: "textarea" })}</div>` : ""}${f.origin === "document-suggestion" ? control("I edited this document draft and approve its wording and disclosure.", `facts.${i}.awarenessApproved`, { type: "checkbox" }) : ""}</div>`,
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
  <section class="patient-category"><h2>Learning goal first</h2><p class="muted">Categorize the teaching goals so learners can find this case. Leave disciplines unchecked to make it suitable for any learner. These tags do not change grading or clinical facts.</p>${catalogFields(teaching.forProfile(profile))}</section>
  ${["Omar Sinclair", "Yvette Armstrong"].includes(profile.name) && profile.facts.some((f) => f.id === "case-notes") ? button("Prepare case", "prepare") : ""}
  <section class="patient-category"><h2>Patient information and character</h2><div class="fields">${control("Name", "name")}${control("Age (optional)", "age", { type: "number" })}${control("Gender (optional)", "gender")}${control("Self-described ethnicity (optional)", "ethnicity")}${control("Case description (faculty only)", "summary", { type: "textarea" })}${control("Opening line", "intro")}${control("Personality", "personality")}${control("Communication style", "style")}${control("Emotional state", "emotion")}</div>${profile.provenance ? `<p class="muted">${esc(profile.provenance.preparation)}</p>` : ""}</section>
  ${group("facts", "History and clinical information", `<p class="muted">Patient wording is approved phrasing for a finding; dialogue may paraphrase it.</p>${facts}${button("Add finding", "add-fact")}`)}
  ${group("sources", "Documents and references", `${sources}${profile.originalRoster ? `<details><summary>Complete saved case source</summary><pre class="case-source">${esc(JSON.stringify(profile.originalRoster, null, 2))}</pre><p class="muted">Source context remains separate from the approved encounter findings and disclosure rules.</p></details>` : ""}${button("Add source", "add-source")}${button("Add teaching references", "references")}<h3>Chart reports</h3>${artifacts}${button("Add report", "add-artifact")}`)}
  ${group("objectives", "Learning objectives", objectives + button("Add objective", "add-objective"))}
  ${group("advanced", "Advanced scenario settings", `<h3>Disclosure rules</h3>${control("Rapport phrases that may open guarded findings", "rapport", { list: true })}<p class="muted">Use a full phrase of at least 12 characters. Thank you, sorry, or I understand do not open guarded findings unless that exact longer phrase is listed here. Each phrase counts once.</p>${disclosure}<h3>Report release rules</h3>${releases}${profile.mm ? `<div class="fields">${control("Patient statement", "mm.a", { options: factOptions })}${control("Chart finding", "mm.b", { options: factOptions })}${control("Follow-up finding", "mm.fu", { options: factOptions })}${control("Reconciliation phrases", "mm.kw", { list: true })}</div>${button("Remove discrepancy", "remove-mm")}` : button("Add intentional discrepancy", "add-mm")}${control("Observable rubric domains (1–7)", "rubricApplicable", { list: true })}${control("Case-specific rubric", "caseRubric", { options: [["", "General rubric only"], ["none", "General rubric only"], ...(health.caseRubrics || []).map((r) => [r.id, r.title])] })}${(() => { const age = profile.age === "" || profile.age == null ? NaN : Number(profile.age); const match = (health.caseRubrics || []).find((r) => r.appliesTo && Number.isFinite(age) && (r.appliesTo.maxAge == null || age <= r.appliesTo.maxAge) && (r.appliesTo.minAge == null || age >= r.appliesTo.minAge)); return match && profile.caseRubric !== match.id ? `<p class="muted">Age ${esc(age)} matches “${esc(match.title)}” as a suggestion only. It is not applied until you select it.</p>` : ""; })()}${profile.pathologySample ? `<h3>Pathology sample comparison</h3><p class="muted">${esc(profile.pathologySample.summary)}</p>` : ""}${profile.missing?.length ? `<h3>Unspecified information</h3><ul>${profile.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}`)}
  <div class="review-box">${control("I reviewed this synthetic case and approve its accuracy, consistency and disclosure rules for student use.", "reviewAcknowledged", { type: "checkbox" })}</div></div>`;
}
function openPatientDialog(mode, selected = profile) {
  stopDraftDictation();
  patientDialog = {
    mode,
    previous: { profile, versions, issues, dirty },
    files: [],
    description: "",
    notice: "",
    validationError: null,
    openSections: {},
    learningObjective: catalogObjective,
  };
  profile =
    mode !== "edit"
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
  versions = mode !== "edit" ? [] : versions;
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
  stopDraftDictation();
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
function patientDocuments(d) {
  return `<section class="form-section" id="patient-upload-area"><h2>${d.mode === "ai" ? "Optional documents" : "Case documents"}</h2>
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
        .join("")}</section>`;
}
function draftSpeechButton() {
  const el = $('[data-action="dictate-patient"]');
  if (!el) return;
  el.textContent = draftDictating ? "Stop dictation" : "Dictate brief";
  el.setAttribute("aria-pressed", String(draftDictating));
}
function stopDraftDictation() {
  const rec = draftRecognition;
  draftRecognition = null;
  draftDictating = false;
  if (rec) {
    rec.onresult = rec.onerror = rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* Recognition may already have ended. */
    }
  }
  draftSpeechButton();
}
function dictatePatient() {
  if (draftDictating) {
    stopDraftDictation();
    return;
  }
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !patientDialog) return;
  stopAudio();
  const d = patientDialog;
  const before = d.description.trim();
  const rec = new Recognition();
  draftRecognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (event) => {
    if (patientDialog !== d || draftRecognition !== rec) return;
    const spoken = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join(" ");
    d.description = [before, spoken].filter(Boolean).join(" ");
    const box = $("#patient-description");
    if (box) box.value = d.description;
    dirty = true;
  };
  rec.onerror = (event) => {
    if (draftRecognition !== rec) return;
    stopDraftDictation();
    d.notice =
      event.error === "not-allowed"
        ? "Microphone permission was denied. Type your brief instead."
        : "Dictation stopped. Your text is preserved; you can type or retry.";
    render();
  };
  rec.onend = () => {
    if (draftRecognition !== rec) return;
    draftRecognition = null;
    draftDictating = false;
    draftSpeechButton();
  };
  try {
    rec.start();
    draftDictating = true;
    draftSpeechButton();
  } catch {
    stopDraftDictation();
    d.notice = "Dictation could not start. Type your brief instead.";
    render();
  }
}
function aiCaseReview() {
  const groupFacts = (title, sections) => {
    const facts = profile.facts.filter((f) => sections.includes(f.ehr));
    return facts.length
      ? `<details class="ai-review-section"><summary>${title} · ${facts.length} findings</summary><ul>${facts.map((f) => `<li><span class="ai-origin">${f.origin === "supplied" ? "From supplied material" : "AI-authored"}${f.vis === "chart" ? " · Chart only" : ""}${f.gate ? " · Guarded" : ""}</span>${esc(f.label)}</li>`).join("")}</ul></details>`
      : "";
  };
  return `<section class="ai-case-preview"><span class="chip">AI-generated synthetic teaching case</span><h2>${esc(profile.name)}${profile.age == null ? "" : ", " + profile.age}</h2><p>${esc([profile.gender, profile.ethnicity].filter(Boolean).join(" · "))}</p><p class="ai-case-summary">${esc(profile.summary)}</p><p><b>Character:</b> ${esc(profile.personality)} ${esc(profile.style)} ${esc(profile.emotion)}</p><p><b>Opening:</b> ${esc(profile.intro)}</p><div class="ai-case-counts">${profile.facts.length} findings · ${profile.artifacts.length} reports · ${profile.obj.length} objectives</div>
  ${groupFacts("History and patient perspective", ["hx", "soc"])}${groupFacts("Medications and clinical findings", ["meds", "labs", "img", "notes"])}
  <details class="ai-review-section"><summary>Reports and learning objectives</summary>${profile.artifacts.map((a) => `<h3>${esc(a.title)}</h3>${artifactBody(a)}${a.fileId ? `<a href="/api/files/${esc(a.fileId)}" target="_blank" rel="noopener">View supplied original</a>` : ""}`).join("")}<h3>Learning objectives</h3><ul>${profile.obj.map((o) => `<li>${esc(o.t)}</li>`).join("")}</ul></details>
  <details class="ai-review-section"><summary>Sources and intentionally unspecified details</summary><ul>${profile.sources.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ul>${profile.missing.map((m) => `<p>${esc(m)}</p>`).join("")}</details>
  ${button("Edit patient details", "edit-ai-details")}
  <div class="review-box">${control("I reviewed this synthetic case and approve its accuracy, consistency and disclosure rules for student use.", "reviewAcknowledged", { type: "checkbox" })}</div></section>`;
}
function refreshGeneratedReports() {
  if (profile.provenance?.kind !== "ai-synthetic") return;
  for (const f of profile.facts) {
    if (f.lab && f.generationId && f.value) {
      f.label = `${f.test}: ${f.value} ${f.unit || ""}${f.ref ? " · Context: " + f.ref : ""}${f.date ? " · Date: " + f.date : ""}`;
      const field = document.getElementById(
        "field-facts-" + profile.facts.indexOf(f) + "-label",
      );
      if (field) field.value = f.label;
    }
  }
  for (const a of profile.artifacts.filter(
    (a) => a.origin === "ai-synthetic",
  )) {
    const facts = profile.facts.filter((f) => a.facts.includes(f.id));
    a.text = facts
      .filter((f) => !f.lab)
      .map((f) => f.label)
      .join("\n");
    a.rows = facts
      .filter((f) => f.lab)
      .map((f) => ({ name: f.test, value: f.value, unit: f.unit, ref: f.ref }));
  }
}
function aiPatientForm() {
  const d = patientDialog;
  return `<dialog id="patient-dialog" class="patient-dialog ai-patient-dialog" aria-labelledby="patient-dialog-title"><form id="patient-form"><div class="patient-dialog-head"><div><div class="panel-kicker">Faculty workspace</div><h1 id="patient-dialog-title">AI Generate a new Patient</h1></div>${button("Cancel", "close-patient")}</div><div class="patient-form-body"><fieldset ${busy ? "disabled" : ""}>
  ${!d.generated ? `<section class="form-section"><label for="ai-objective">What should the learner practice? (optional)</label><select id="ai-objective"><option value="">Choose a learning objective</option>${teaching.objectives.map((o) => `<option value="${o.id}" ${d.learningObjective === o.id ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select><p class="muted">A learning objective helps AI design a focused case. Briefs and random generation still work without one.</p></section>` : ""}
  ${!d.generated ? `<section class="form-section ai-brief"><h2>What kind of patient would you like?</h2><label for="patient-description">A short brief is enough</label><textarea id="patient-description" rows="4" maxlength="8000" placeholder="For example: an adult with high cholesterol who is worried about starting medication.">${esc(d.description)}</textarea><div class="row">${button(draftDictating ? "Stop dictation" : "Dictate brief", "dictate-patient", `aria-pressed="${draftDictating}" ${liveSupported() ? "" : "disabled"}`)}${!liveSupported() ? '<span class="muted">Dictation is available in supported Chrome/Edge browsers.</span>' : ""}</div><p class="muted">AI builds the history, character, clinical findings, chart reports and learning objectives. Added details are fictional.</p></section>${patientDocuments(d)}` : d.editGenerated ? editor() + button("Back to summary", "edit-ai-details") : aiCaseReview()}
  </fieldset></div><div class="patient-dialog-footer"><p class="form-notice ${d.notice ? "" : "hidden"}" role="status">${esc(d.notice)}</p><div class="row">${d.generated ? `${button("Change brief", "change-ai-brief")}${button("Regenerate", "regenerate-ai")}${button("Save draft", "save-patient")}${button("Create & publish patient", "submit-patient", "", "pri")}` : `${d.hasGenerated ? button("Back to generated case", "back-ai-review") : ""}${button("Random patient", "random-ai")}${button(busy ? "Generating…" : "Generate patient", "generate-ai", "", "pri")}`}</div></div></form></dialog>${d.validationError ? `<dialog id="publication-error" class="submission-error" role="alertdialog" aria-labelledby="publication-error-title" aria-describedby="publication-error-message"><h2 id="publication-error-title">Before publishing</h2><p id="publication-error-message">${esc(d.validationError.text)}</p>${button("Back to form", "dismiss-publication-error", "", "pri")}</dialog>` : ""}`;
}
async function generatePatient(random = false) {
  stopDraftDictation();
  const d = patientDialog;
  busy = true;
  d.notice =
    "Generating a complete synthetic case and checking consistency. This can take a couple of minutes…";
  render();
  try {
    const r = await api("/api/generate-synthetic", "POST", {
      description: random ? "" : d.description,
      files: random
        ? []
        : d.files.map(({ id, role, section }) => ({ id, role, section })),
      random,
      learningObjective: d.learningObjective || "",
    });
    profile = { ...r.profile, id: profile.id, createdAt: profile.createdAt };
    profile.reviewAcknowledged = false;
    d.generated = true;
    d.hasGenerated = true;
    d.editGenerated = false;
    d.lastRandom = random;
    if (random) {
      d.description = "";
      d.files = [];
    }
    d.notice =
      "Case ready. Review the findings and publish, or save a draft." +
      (r.unreadFiles?.length
        ? ` Not read by AI: ${r.unreadFiles.join(", ")}. Originals remain attached.`
        : "");
    dirty = true;
  } catch (error) {
    d.notice = error.message;
  } finally {
    busy = false;
    render();
  }
}
function patientForm() {
  if (!patientDialog) return "";
  if (patientDialog.mode === "ai") return aiPatientForm();
  const d = patientDialog,
    isNew = d.mode === "new";
  return `<dialog id="patient-dialog" class="patient-dialog" aria-labelledby="patient-dialog-title"><form id="patient-form">
    <div class="patient-dialog-head"><div><div class="panel-kicker">Faculty workspace</div><h1 id="patient-dialog-title">${isNew ? "New patient" : "Edit patient"}</h1></div>${button("Cancel", "close-patient")}</div>
    <div class="patient-form-body"><fieldset ${busy ? "disabled" : ""}>
    ${patientDocuments(d)}
    <section class="form-section">
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
    profile = {
      ...r.profile,
      id: profile.id,
      createdAt: profile.createdAt,
      ...(profile.catalog ? { catalog: profile.catalog } : {}),
    };
    dirty = true;
    d.notice =
      /-draft$/.test(r.provider) && r.provider !== "local-organizer"
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
    if (d.mode !== "edit")
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
  return !!(enc && enc.status === "active");
}
function formatVisitClock(from, to = Date.now()) {
  const start = new Date(from).getTime();
  if (!Number.isFinite(start)) return "00:00";
  const total = Math.max(0, Math.floor((to - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours) return `${hours}:${pad(minutes)}:${pad(seconds)}`;

  return `${pad(minutes)}:${pad(seconds)}`;
}
let visitTimer = 0;
function startVisitTimer() {
  stopVisitTimer();
  if (!enc?.createdAt || enc.status !== "active") return;
  const tick = () => {
    const el = $("#visit-timer");
    if (el) el.textContent = formatVisitClock(enc.createdAt);
  };
  tick();
  visitTimer = setInterval(tick, 1000);
}
function stopVisitTimer() {
  clearInterval(visitTimer);
  visitTimer = 0;
}
function leaveVisit() {
  stopVisitTimer();
  stopStudentCamera();
}
function joinVisit() {
  if (tab !== "enc" || !enc || enc.status !== "active") return;
  rememberCall(enc.id);
  paused = false;
  $("#avf")?.classList.add("video-call", "camera-on");
  if (!studentStream) {
    studentCameraTried = false;
    startStudentCamera();
  }
  startPresenceCoach();
  startVisitTimer();
  warmTalkVideo();
}
function syncVisitMedia() {
  if (tab === "enc" && enc?.status === "active") {
    joinVisit();
    return;
  }
  leaveVisit();
}
function clockText(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours) return hours + ":" + String(minutes).padStart(2, "0") + ":" + ss;
  return minutes + ":" + ss;
}
function interviewAnchor() {
  if (!enc) return null;
  if (enc.interviewStartedAt) return enc.interviewStartedAt;
  if (enc.status === "complete") return enc.createdAt || null;
  return null;
}
function interviewElapsedMs() {
  if (enc?.status === "complete" && Number.isFinite(enc.durationMs))
    return enc.durationMs;
  const started = interviewAnchor();
  if (!started) return 0;
  const end = enc.completedAt ? Date.parse(enc.completedAt) : Date.now();
  const elapsed = end - Date.parse(started);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}
function interviewTimerMarkup() {
  if (!interviewAnchor()) return "";
  if (enc.status === "active" && !callIsLive()) return "";
  const label = enc.status === "complete" ? "Appointment" : "Interview";
  return `<p class="interview-timer${enc.status === "complete" ? " done" : ""}" id="interview-timer" role="timer" aria-label="${label} duration">${label} ${clockText(interviewElapsedMs())}</p>`;
}
function stopInterviewTimer() {
  if (interviewTimer) clearInterval(interviewTimer);
  interviewTimer = 0;
}
function paintInterviewTimer() {
  const node = document.getElementById("interview-timer");
  if (!node || !enc) return;
  const label = enc.status === "complete" ? "Appointment" : "Interview";
  node.textContent = label + " " + clockText(interviewElapsedMs());
  maybeCloseInterview();
}
function clearSpeechWatch() {
  if (speechWatch) clearTimeout(speechWatch);
  speechWatch = 0;
}
function releaseStuckSpeech(generation) {
  if (generation !== speechGeneration || !patientSpeaking) return;
  patientSpeaking = false;
  holdMic = false;
  ignoreMicUntil = Date.now() + 280;
  stopMouth();
  pulseTalkVideo(false);
  try {
    audio?.pause();
  } catch {
    /* Already stopped. */
  }
  window.speechSynthesis?.cancel();
  voiceState("ready", "Speech timed out. The transcript is saved.");
  updateMicButton();
  syncLive();
}
function armSpeechWatch(generation, ms) {
  clearSpeechWatch();
  speechWatch = setTimeout(() => {
    speechWatch = 0;
    releaseStuckSpeech(generation);
  }, ms);
}
async function finishEncounter(notice) {
  if (!enc || enc.status !== "active" || interviewClosing) return;
  interviewClosing = true;
  logMedia("ENCOUNTER_ENDED", {});
  stopAudio();
  stopStudentCamera();
  busy = true;
  message =
    notice ||
    "Completing the encounter and preparing evidence-linked feedback…";
  render();
  try {
    await mutate("complete", {});
    repView = "summary";
    await refresh();
    tab = "rep";
    message = notice || "Encounter saved.";
  } catch (err) {
    message = err.message;
  } finally {
    interviewClosing = false;
    busy = false;
    render();
  }
}
function maybeCloseInterview() {
  if (interviewClosing || busy || enc?.status !== "active" || !callIsLive())
    return;
  const limit = Number(enc.interviewLimitMs) || 20 * 60 * 1000;
  if (!interviewAnchor() || interviewElapsedMs() < limit) return;
  const recorded = (enc.transcript || []).some((turn) => turn.role === "student");
  finishEncounter(
    recorded
      ? "The 20 minute limit ended this interview and saved the visit."
      : "The 20 minute limit ended this interview. No student questions were recorded.",
  );
}
function syncInterviewTimer() {
  stopInterviewTimer();
  if (!document.getElementById("interview-timer") || enc?.status !== "active")
    return;
  paintInterviewTimer();
  interviewTimer = setInterval(paintInterviewTimer, 1000);
  if (typeof interviewTimer.unref === "function") interviewTimer.unref();
}
function encounter() {
  if (demoSession?.role === "faculty" && enc?.studentId) return assessment();
  if (!enc)
    return `<div class="pn"><h1>Start an encounter</h1><p class="muted">Only published versions can be launched.</p><div class="patient-grid">${list
      .filter((p) => p.version)
      .map((p) => card(p, false))
      .join("")}</div></div>`;
  const live = callIsLive();
  const locked = busy || enc.status !== "active";
  const first = esc(enc.name.split(" ")[0]);
  const emergency = enc.emergency
    ? `<div class="emergency" role="alert"><b>911 emergency services</b><p>${esc(enc.emergency.text)}</p></div>`
    : "";
  const clip = packagedVisitVideo(enc);
  const stage = `${live ? " video-call camera-on" : ""}${paused ? " paused" : ""}`;
  const selfView = live
    ? `<div class="self-view" id="self-view"><video id="student-camera" class="self-camera" muted autoplay playsinline></video></div>`
    : "";
  return `${emergency}${patientBanner()}<div class="grid enc-grid"><section class="pn enc-talk"><div class="av-frame${stage}" id="avf"${enc.status === "active" ? ' data-action="toggle-pause" role="button" tabindex="0" title="Tap to pause or resume"' : ""}><canvas class="av-still av-talk${clip ? " hidden" : ""}" id="av-talk" aria-hidden="true"></canvas><video class="av-still patient-video${clip ? "" : " hidden"}" id="av-video" muted playsinline loop preload="auto"${clip ? ` src="${esc(clip)}"` : ""}></video><img class="av-still patient-photo" src="${esc(enc.imageUrl)}" alt="${esc(enc.name)}"><canvas id="patient-call" class="patient-call" width="640" height="480" aria-hidden="true"></canvas>${selfView}<div class="av-jaw" aria-hidden="true"></div><div class="av-blink" aria-hidden="true"></div><div class="av-pause"><span>Paused · tap to resume</span></div></div><div id="voice-status" role="status">${readyStatus()}</div><div class="voice-controls">${micControl()}<div class="row voice-secondary">${button(muted ? "Unmute" : "Mute", "mute")}${live && !studentStream ? button("Turn your camera on", "student-camera") : ""}</div></div><form id="question-form"><label for="question">Ask the patient</label><div class="row"><input id="question" maxlength="2000" placeholder="Type a question or use the microphone" ${locked ? "disabled" : ""} autocomplete="off"><button class="btn pri" type="submit" ${locked ? "disabled" : ""}>${busy ? "Thinking…" : "Send"}</button></div></form><div class="tr" id="transcript" aria-live="polite">${enc.transcript.map((t) => `<article class="bubble ${t.role === "student" ? "student" : "patient"}" id="${esc(t.id)}"><b>${t.role === "student" ? "You" : first}</b><p>${esc(t.text)}</p></article>`).join("")}</div></section>
 <section class="pn ehr-panel"><div class="panel-kicker">Clinical record · ${esc((sections.find(([s]) => s === section) || sections[0])[1])}</div>${conversationFiles()}${chart()}${docLightbox()}</section></div>`;
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

  return `<article class="art released open ${a.justReleased ? "just-in" : ""}"><div class="art-head"><h3>${esc(a.title)}</h3>${button("Expand", "expand-doc", `data-id="${esc(a.id)}"`)}</div><p class="chip">Clinical record · ${esc(a.date || "Date unspecified")}</p>${artifactBody(a)}</article>`;
}
function conversationFiles() {
  const released = enc.artifacts.filter(
    (a) => a.released && (section === "ov" || a.sec === section),
  );
  if (!released.length) return "";

  return `<div class="convo-files"><div class="ehr-head"><div><div class="panel-kicker">From this conversation</div><h3>Documents</h3></div></div>${released.map(artifactCard).join("")}</div>`;
}
// The strip across the top of a visit: who the patient is, the state of the
// visit, and the chart sections as tabs.
function patientBanner() {
  const age = (dob) => {
    const born = new Date(dob + "T00:00:00");
    const now = new Date();
    return (
      now.getFullYear() -
      born.getFullYear() -
      (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())
        ? 1
        : 0)
    );
  };
  const dob = enc.overview?.dob;
  const facts = [
    dob
      ? [
          "DOB",
          `${new Date(dob + "T00:00:00").toLocaleDateString()} (${age(dob)} y)`,
        ]
      : ["Age", enc.age == null ? "Not recorded" : enc.age + " years"],
    ["Gender", enc.gender || "Not recorded"],
    ...(enc.overview?.ethnicity || enc.ethnicity
      ? [["Ethnicity", enc.overview?.ethnicity || enc.ethnicity]]
      : []),
    [
      "Patient ID",
      String(enc.profileId || "")
        .slice(0, 8)
        .toUpperCase(),
    ],
    [
      "Visit",
      `${enc.status === "complete" ? "Completed" : "In progress"} · ${new Date(enc.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    ],
  ];
  const clock = enc.createdAt
    ? `<p class="visit-timer" id="visit-timer">${esc(enc.status === "complete" && enc.completedAt ? formatVisitClock(enc.createdAt, new Date(enc.completedAt).getTime()) : formatVisitClock(enc.createdAt))}</p>`
    : "";
  return `<section class="pn pt-banner" aria-label="Patient"><div class="pt-banner-main"><img class="pt-photo" src="${esc(enc.imageUrl)}" alt=""><div class="pt-banner-id"><h1>${esc(enc.name)}</h1><dl class="pt-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div><div class="pt-banner-actions">${clock}${enc.groupProgress ? `<span class="chip">Trial ${enc.groupProgress.trial} of ${enc.groupProgress.total} · ${esc(enc.groupProgress.title)}</span>` : ""}${enc.status === "active" ? button("Finish & get feedback", "complete", "", "pri") : button("View feedback", "nav", `data-tab="rep"`)}</div></div><nav class="tabs ehr-tabs" aria-label="Patient chart sections">${sections.map(([s, name]) => button(name, "section", `data-section="${s}" aria-pressed="${section === s}"`, section === s ? "on" : "")).join("")}</nav></section>`;
}
function chart() {
  // Overview is a summary; each finding is filed under its own chart section,
  // as in the earlier prototype, instead of everything listed on one tab.
  if (section === "ov") {
    const released = enc.artifacts.filter((d) => d.released).length;
    const who = [
      enc.age == null ? "" : enc.age + " years old",
      enc.gender,
      enc.overview?.ethnicity,
    ]
      .filter(Boolean)
      .join(" · ");
    const found = enc.disclosed.length;
    return `${enc.overview?.reason ? `<div class="ehr-banner"><p class="ehr-reason"><b>Reason for visit:</b> ${esc(enc.overview.reason)}</p></div>` : ""}<p class="muted small">${found ? `${found} finding${found > 1 ? "s" : ""} released so far` : "No findings released yet"}${enc.artifacts.length ? ` · ${released} of ${enc.artifacts.length} documents` : ""}. Findings are filed under the tabs above as you ask about them or open the chart.</p>`;
  }
  const facts = enc.disclosed.filter(
    (f) => f.ehr === section || f.releaseSection === section,
  );
  const row = (f) => {
    const from = String(f.provenance?.via || "").startsWith("section ")
      ? "From the chart"
      : "From the conversation";
    const source =
      f.src && !/unverified/i.test(f.src) ? " · " + esc(f.src) : "";
    const at = f.provenance?.at
      ? " · " +
        esc(
          new Date(f.provenance.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      : "";
    return `<article class="fx chart-fact"><b>${esc(f.label)}</b>${f.type ? `<span class="st ${esc(f.type)}">${esc(f.type)}</span>` : ""}${f.wording && !f.label.includes(f.wording) ? `<p>${esc(f.wording)}</p>` : ""}<div class="chip">${from}${source}${at}</div></article>`;
  };

  return `${facts.map(row).join("")}
 ${!facts.length && !enc.artifacts.some((a) => a.released && (section === "ov" || a.sec === section)) ? '<div class="empty">No released findings in this section yet.</div>' : ""}
 `;
}
function docLightbox() {
  const a = enc.artifacts.find((d) => d.id === expandedDocId && d.released);
  if (!a) return "";

  return `<div class="doc-lightbox" data-action="close-doc" role="dialog" aria-modal="true" aria-label="${esc(a.title)}"><div class="doc-sheet" data-action="noop"><div class="art-head"><h3>${esc(a.title)}</h3>${button("Close", "close-doc")}</div>${artifactBody(a, true)}</div></div>`;
}
function attempts() {
  // Completed attempts on this patient, oldest first, from the encounter log.
  return history
    .filter((e) => e.profileId === enc.profileId && e.status === "complete")
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
}
function presenceReview() {
  const flags = enc?.presence?.flags || [];
  if (!flags.length) {
    return `<section class="obj-card presence-review"><h2>Body language</h2><p class="muted">Nothing noted on this visit.</p></section>`;
  }

  return `<section class="obj-card presence-review"><h2>Body language</h2><ul>${flags
    .map((f) => `<li>${esc(f.label)}</li>`)
    .join("")}</ul></section>`;
}
function duration() {
  if (enc.duration) return ` · appointment ${enc.duration}`;
  if (!enc.completedAt || !enc.createdAt) return "";
  return ` · ${formatVisitClock(enc.createdAt, new Date(enc.completedAt).getTime())}`;
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
  return `<section class="obj-card"><h2>Your attempts with this patient</h2><div class="sc"><table><tr><th>Attempt</th><th>Date</th><th>Appointment</th><th>Questions</th><th>Findings</th><th>Objectives</th><th>Rubric</th></tr>${all.map((e, i) => `<tr class="${e.id === enc.id ? "current" : ""}"><td>${i + 1}${e.id === enc.id ? " (this one)" : ""}</td><td>${esc(new Date(e.completedAt).toLocaleString())}</td><td>${esc(e.duration || "–")}</td><td>${e.turns}</td><td>${e.findingsTotal == null ? "–" : `${e.findingsElicited}/${e.findingsTotal}`}</td><td>${e.objectivePercent == null ? "–" : e.objectivePercent + "%"}</td><td>${score(e)}</td></tr>`).join("")}</table></div></section>`;
}
function findingsView(a, c) {
  const f = c.findings;
  const dash = '<span class="muted">–</span>';
  const objectives = a.objectives
    .map((o) => {
      const pct = Math.round(o.credit * 100);
      return `<tr><td><b>${esc(o.title)}</b></td><td><div class="progress"><div class="meter" role="img" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div><span>${o.earned}/${o.weight}</span></div></td><td>${turnLinks(o.evidence)}${o.observation ? `<small class="muted">${esc(o.observation)}</small>` : ""}</td><td>${o.credit < 1 && o.next ? esc(o.next) : o.credit >= 1 ? '<span class="ok">Complete</span>' : dash}</td></tr>`;
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
const scoreTone = (score) =>
  score === null
    ? "bg-muted"
    : ["bg-risk", "bg-amber", "bg-teal", "bg-good"][score - 1] || "bg-muted";
// Total, radar and a key to the four score levels, above the domain list.
function rubricOverview(a) {
  const levels = [4, 3, 2, 1]
    .map((score) => ({
      score,
      label:
        a.rubric?.scale?.find((r) => r.score === score)?.label ||
        a.domains.find((d) => d.score === score)?.label,
    }))
    .filter((l) => l.label);
  // The chart with the total and the scoring guide under it; this card sits
  // beside the domain list.
  const chart = `<div class="rubric-radar">${radar(a.domains.map((d) => ({ domain: d.domain, name: d.name, mean: d.score })))}<div class="rubric-total"><span class="rating">${a.total}/${a.denominator}</span><span class="muted">${a.rubric && a.denominator !== a.rubric.maxTotal ? `of a possible ${a.rubric.maxTotal} · ` : ""}N/A domains: ${a.na}</span></div><div class="meter" role="img" aria-label="${a.total} of ${a.denominator}"><i style="width:${a.denominator ? (a.total / a.denominator) * 100 : 0}%"></i></div>${a.rubric ? "" : `<div class="level-counts">${levels.map((l) => `<span class="level-count ${scoreTone(l.score)}"><b>${l.score}</b> ${esc(l.label)}</span>`).join("")}</div>`}</div>`;
  const guide = a.rubric
    ? `<details class="evidence rubric-guide"><summary>How this rubric is scored</summary><p>${esc(a.rubric.instructions)}</p><table class="fb-table"><thead><tr><th>Score</th><th>Label</th><th>Meaning</th></tr></thead><tbody>${a.rubric.scale.map((r) => `<tr class="${scoreTone(r.score)}"><td><b class="score-key">${r.score}</b></td><td>${esc(r.label)}</td><td>${esc(r.meaning)}</td></tr>`).join("")}<tr class="bg-muted"><td><b class="score-key">N/A</b></td><td>${esc(a.rubric.notApplicable.label)}</td><td>${esc(a.rubric.notApplicable.meaning)}</td></tr></tbody></table><p class="muted small">${esc(a.rubric.interpretation)}</p></details>`
    : "";
  return `<aside class="obj-card rubric-top">${chart}${guide}</aside>`;
}
function rubricView(a) {
  // One line per domain; the detail opens on demand.
  const domain = (d) =>
    `<details class="domain-row ${scoreTone(d.score)}" ${demoSession?.role === "faculty" ? "open" : ""}><summary><span class="rating">${d.score === null ? "N/A" : d.score + "/4"}</span><span class="domain-main"><span class="domain-title"><b>${d.domain}. ${esc(d.name)}</b>${d.label ? `<span class="level-chip">${esc(d.label)}</span>` : ""}</span><span class="muted why">${esc(d.reason)}</span></span><span class="domain-more" aria-hidden="true">Details</span></summary><div class="domain-detail">${d.descriptor ? `<p class="level"><b>Rubric level${d.score === null ? "" : " " + d.score}:</b> ${esc(d.descriptor)}</p>` : ""}${d.nextLevel ? `<p class="level"><b>To reach ${d.nextLevel.score} (${esc(d.nextLevel.label)}):</b> ${esc(d.nextLevel.descriptor)}</p>` : ""}<p><b>Next attempt:</b> ${esc(d.next)}</p>${d.triggersReview && d.score === 1 ? '<p class="warn">A score of 1 in this domain triggers faculty review.</p>' : ""}${evidence(d.evidence)}${d.levels ? `<details class="evidence"><summary>All four levels</summary>${d.levels.map((l) => `<p><b>${l.score} ${esc(l.label)}</b> ${esc(l.descriptor)}</p>`).join("")}</details>` : ""}</div></details>`;
  const fields = a.rubric?.evidenceFields || {
    strengths: "Strengths demonstrated",
    gaps: "Missed opportunities",
    concerns: "Safety or accuracy concerns",
  };
  return `<h2>${esc(a.rubric?.title || "Patient Encounter Performance Rubric")}</h2><div class="rubric-split">${rubricOverview(a)}<section class="obj-card domain-list">${a.domains.map(domain).join("")}</section></div>
  <h2>Evidence from the encounter</h2><div class="sc"><table class="fb-table evidence-notes"><thead><tr><th>Type</th><th>Note</th><th>Where</th></tr></thead><tbody>${["strengths", "gaps", "concerns"].map((k) => (a[k].length ? a[k].map((n, i) => `<tr>${i === 0 ? `<td rowspan="${a[k].length}"><span class="chip status-${k === "strengths" ? "strength" : "improve"}">${esc(fields[k])}</span></td>` : ""}<td>${esc(n.text)}</td><td>${turnLinks(n.evidence)}</td></tr>`).join("") : `<tr><td><span class="chip">${esc(fields[k])}</span></td><td class="muted">None identified by this assessment.</td><td><span class="muted">–</span></td></tr>`)).join("")}</tbody></table></div>
  ${caseRubricView(a.caseRubric)}${demoSession?.role === "faculty" ? `<details class="evidence"><summary>Record a demo review</summary><p class="muted">Saves a demo-alias note on one domain. This is not an institutional identity or a validated grade. The original model draft is kept.</p><div class="fields"><label>Domain<input id="review-domain" type="number" min="1" max="7" value="1"></label><label>Status<select id="review-status"><option value="not_assessed">not assessed</option><option value="not_applicable">not applicable</option><option value="assessed">assessed</option></select></label><label>Score<input id="review-score" type="number" min="1" max="4" value="1"></label></div><label>Reason<textarea id="review-reason" rows="2">Not observed in the recorded encounter.</textarea></label>${button("Save review", "save-review")}</details>` : ""}`;
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
// Shown on Assessment when there is no visit at all yet.
function noVisit(title) {
  return `<div class="pn"><h1>${title}</h1><p class="muted">This page shows one visit at a time, and no visit has been started yet.</p><div class="row">${button(demoSession?.role === "faculty" ? "Go to Patient Studio" : "Choose a patient", "nav", 'data-tab="studio"', "pri")}</div></div>`;
}
// Which visit Assessment is showing, with every other visit a click away.
function visitSwitcher() {
  if (!enc || history.length < 2) return "";
  const who = (e) =>
    e.studentId
      ? students.find((s) => s.id === e.studentId)?.alias || "Student"
      : "Faculty";
  const label = (e) =>
    `${e.name} · ${e.createdAt ? new Date(e.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""} · ${who(e)} · ${e.status === "complete" ? "completed" : "in progress"}`;
  const visits = [...history].sort(
    (x, y) => new Date(y.createdAt || 0) - new Date(x.createdAt || 0),
  );
  return `<div class="visit-switch"><label for="visit-switch">Visit</label><select id="visit-switch">${visits.some((e) => e.id === enc.id) ? "" : `<option value="${esc(enc.id)}" selected>${esc(enc.name)} · current</option>`}${visits.map((e) => `<option value="${esc(e.id)}" ${e.id === enc.id ? "selected" : ""}>${esc(label(e))}</option>`).join("")}</select></div>`;
}
// Opens the most recent visit when Assessment is chosen with none open.
async function openLatestVisit(completedFirst) {
  if (!history.length) await refresh();
  const visits = [...history].sort(
    (x, y) => new Date(y.createdAt || 0) - new Date(x.createdAt || 0),
  );
  const pick =
    (completedFirst && visits.find((e) => e.status === "complete")) ||
    visits[0];
  if (pick) enc = (await api("/api/encounters/" + pick.id)).encounter;
}
function assessment() {
  if (enc?.assessment?.pending) watchAssessment();
  if (enc?.feedbackHeld)
    return `<div class="pn"><h1>Trial saved</h1><p>Standard feedback becomes available after every trial in this group is complete.</p>${button("Continue to next patient", "next-test", `data-id="${esc(enc.attemptId)}"`, "pri")}</div>`;
  if (!enc) return noVisit("Encounter feedback");
  if (!enc.assessment)
    return `<div class="pn">${visitSwitcher()}<h1>Encounter feedback</h1><p>${demoSession.role === "faculty" && enc.studentId ? "The student is still completing this encounter." : "Finish the encounter to assess the complete evidence."}</p>${demoSession.role === "faculty" && enc.studentId ? biasEvidenceView() : button("Finish & get feedback", "complete", "", "pri")}</div>`;
  const a = enc.assessment,
    c = a.coaching,
    provisional = a.provider === "local-provisional" || a.pending;
  const scoreText =
    a.pending || a.total == null
      ? `${a.coverage?.assessed ?? 0}/${a.coverage?.applicable ?? 0}`
      : `${a.total}/${a.denominator}`;
  const scoreCaption =
    a.pending || a.total == null
      ? "domains assessed"
      : `rubric${a.provider === "local-provisional" ? " (provisional)" : ""}`;
  const views = [
    ["summary", "Summary"],
    ...(c ? [["findings", "Objectives & findings"]] : []),
    ...(c ? [["interview", "Interview"]] : []),
    ["rubric", a.caseRubric ? "Rubrics" : "Rubric"],
    ["presence", "Body language"],
    ...(demoSession?.role === "faculty" ? [["bias", "Bias review"]] : []),
  ];
  if (!views.some(([k]) => k === repView)) repView = "summary";
  const body =
    repView === "findings"
      ? findingsView(a, c)
      : repView === "interview"
        ? flowView(a, c)
        : repView === "rubric"
          ? rubricView(a)
          : repView === "presence"
            ? presenceReview()
            : repView === "bias"
              ? biasPanel(
                  enc.biasAnalysis,
                  "encounter",
                  enc.id,
                  enc.status === "complete",
                )
              : summaryView(a, c);
  const caseScore =
    a.caseRubric?.total != null
      ? `<div><div class="score-num">${a.caseRubric.total}/${a.caseRubric.max}</div><div class="muted">case rubric</div></div>`
      : "";
  return `<div class="pn">${visitSwitcher()}<div class="panel-kicker">Encounter feedback</div><h1>${esc(enc.name)} · feedback on this attempt</h1>
  <div class="score-hero"><div><div class="score-num">${a.total}/${a.denominator}</div><div class="muted">rubric${provisional ? " (provisional)" : ""}</div></div>${c?.objectivePercent == null ? "" : `<div><div class="score-num">${c.objectivePercent}%</div><div class="muted">learning objectives</div></div>`}${caseScore}<div><p>${c ? `${c.findings.elicited.length} of ${c.findings.total} findings reached · ${c.flow.questions} questions asked` : ""}${duration()}</p>${sinceLast()}<p class="muted">${esc(a.notice)}</p></div></div>
  ${a.pending ? '<div class="import-progress pending-rubric" role="status"><div class="import-status"><b>Rubric ratings are being prepared…</b><span class="muted">usually under a minute; this page updates by itself</span></div><div class="meter indeterminate"><i style="width:100%"></i></div><p class="muted small">Objectives, findings and the interview review below are already final.</p></div>' : provisional ? '<div class="warn">Model assessment is unavailable, so the rubric ratings are provisional placeholders for faculty review, not a measured performance grade. Objectives, findings and the interview review come from the recorded encounter and are not affected.</div>' : ""}${reviewNotice(a)}
  <div class="rep-tabs" role="tablist">${views.map(([k, name]) => button(name, "rep-view", `data-view="${k}" role="tab" aria-selected="${repView === k}"`, repView === k ? "on" : "")).join("")}</div>
  ${biasEvidenceView()}${body}
  <div class="row rep-actions">${enc.attemptId ? button("Assigned tests", "nav", 'data-tab="tests"', "pri") : button("Try this patient again", "retry", "", "pri")}${button("All attempts", "nav", `data-tab="history"`)}<a class="btn" href="/api/encounters/${esc(enc.id)}/export">Download record</a></div>
  ${demoSession?.role === "faculty" ? `<p class="muted small">${a.na} N/A domains · ${esc(a.provider)}${a.model ? " · " + esc(a.model) : ""}${a.revised ? " · revised once after automated review" : ""}${a.failure ? " · fallback: " + esc(a.failure) : ""}</p>` : ""}</div>`;
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
    interview: "Interview started",
  };
  return `<details class="evidence" ${demoSession?.role === "faculty" ? "open" : ""}><summary>Evidence (${ids.length})</summary>${
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
// Polls a visit whose rubric is still being prepared and shows it on arrival.
let assessmentWatch = null;
function watchAssessment() {
  const id = enc?.id;
  if (!id || !enc.assessment?.pending || assessmentWatch === id) return;
  assessmentWatch = id;
  const check = async () => {
    if (assessmentWatch !== id) return;
    try {
      const fresh = (await api("/api/encounters/" + id)).encounter;
      if (!fresh.assessment?.pending) {
        assessmentWatch = null;
        if (enc?.id === id) {
          enc = fresh;
          if (tab === "rep") {
            message = "Rubric ratings are ready.";
            render();
          }
        }
        refresh().catch(() => {});
        return;
      }
    } catch {
      /* Try again on the next tick. */
    }
    setTimeout(check, 3000);
  };
  setTimeout(check, 3000);
}
async function ensureWording() {
  const c = enc?.assessment?.coaching;
  if (
    !c ||
    enc.assessment.pending ||
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
// Every visit as one row, newest first, with search and a patient filter.
function past() {
  const visits = [...history].sort(
    (x, y) => new Date(y.createdAt || 0) - new Date(x.createdAt || 0),
  );
  const patients = [...new Set(visits.map((e) => e.name))].sort();
  const done = visits.filter((e) => e.status === "complete").length;
  const when = (e) =>
    e.createdAt
      ? new Date(e.createdAt).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "–";
  // Who ran the visit: the student it belongs to, or faculty trying a case.
  const doneBy = (e) =>
    e.studentId
      ? students.find((s) => s.id === e.studentId)?.alias || "Student"
      : "Faculty";
  const rubric = (e) =>
    e.feedbackHeld
      ? '<span class="muted">Held until all trials finish</span>'
      : e.total == null
        ? '<span class="muted">–</span>'
        : `<div class="progress"><div class="meter"><i style="width:${e.denominator ? (e.total / e.denominator) * 100 : 0}%"></i></div><span>${e.total}/${e.denominator}${e.provisional ? " · provisional" : ""}</span></div>`;
  const rows = visits
    .map(
      (e) =>
        `<tr data-patient="${esc(e.name)}"><td class="when">${esc(when(e))}</td><td><div class="pt-cell">${patientAvatar(e.name, e.profileId)}<span><b>${esc(e.name)}</b><br><span class="muted small">${esc(doneBy(e))}</span></span></div></td><td><span class="visit-status ${e.status === "complete" ? "is-done" : "is-open"}">${e.status === "complete" ? "Completed" : "In progress"}</span></td><td>${e.turns}</td><td>${e.findingsTotal ? `${e.findingsElicited}/${e.findingsTotal}` : "–"}</td><td>${pct(e.objectivePercent)}</td><td>${rubric(e)}</td><td class="act"><div class="row">${button(e.status === "complete" ? "View" : "Resume", "resume", `data-id="${esc(e.id)}"`)}<a class="btn" href="/api/encounters/${esc(e.id)}/export" title="Download the full record of this visit">Download</a></div></td></tr>`,
    )
    .join("");
  return `<div class="pn history-page"><div class="history-head"><div><h1>Encounter history</h1><p class="muted">${visits.length ? `${visits.length} visit${visits.length > 1 ? "s" : ""} · ${done} completed · ${visits.length - done} in progress` : "Visits appear here once one is started."}</p></div>${visits.length ? `<div class="log-tools"><input id="visit-search" type="search" placeholder="Search patient, date…" aria-label="Search visits"><select id="visit-patient" aria-label="Filter by patient"><option value="">All patients</option>${patients.map((p) => `<option>${esc(p)}</option>`).join("")}</select></div>` : ""}</div>${
    visits.length
      ? `<div class="sc"><table class="hub-table history-table" id="visit-log"><thead><tr><th>Started</th><th>Patient</th><th>Status</th><th>Questions</th><th>Findings</th><th>Objectives</th><th>Rubric</th><th class="act">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : "<p>No encounters yet.</p>"
  }</div>`;
}
function rolePicker() {
  return `<section class="workspace-home role-picker" aria-labelledby="workspace-title"><h1 id="workspace-title">Choose your workspace</h1><p class="muted workspace-lede">Voice interviews with synthetic patients, progressive chart access, and evidence-linked feedback. Faculty publish cases and assign groups; students complete assessments.</p><div class="simulation-choices role-choices"><article class="role-choice-card"><span class="choice-symbol" aria-hidden="true">01</span><h2 class="choice-title">Faculty</h2><p class="choice-description">Patient Studio, prepared groups, assignments, and student results—including bias review when enabled.</p>${button("Enter faculty workspace", "choose-role", 'data-role="faculty"', "pri choice-action")}</article><article class="role-choice-card"><span class="choice-symbol" aria-hidden="true">02</span><h2 class="choice-title">Student</h2><p class="choice-description">My assigned assessments, open individual patients, and patient groups with feedback after each visit or trial set.</p><label class="choice-field" for="demo-student">Practice as</label><select id="demo-student">${students.map((s) => `<option value="${esc(s.id)}" ${s.id === loginStudent ? "selected" : ""}>${esc(s.alias)}</option>`).join("")}</select>${button("Enter student workspace", "choose-role", 'data-role="student"', "pri choice-action")}</article></div><p class="muted workspace-footnote">Workshop demo · alias picker only · synthetic patients · faculty facts govern disclosure</p></section>`;
}
function assignmentCards(items) {
  return items
    .map(
      (a) =>
        `<article class="group-card assignment-card"><div><span class="assignment-badge">Faculty assigned</span><h2>${esc(a.title)}</h2>${a.kind === "individual" ? "" : caseNames(a.cases)}<p class="muted">${a.kind === "individual" ? (a.attempt?.status === "complete" ? "Completed individual assessment" : "Individual assessment") : a.attempt ? `${a.attempt.completed}/${a.attempt.trials.length} trials complete` : `${a.cases.length} patient trials`}</p></div>${button(a.attempt?.status === "complete" ? "View results" : a.attempt ? "Resume assessment" : "Start assessment", "start-test", `data-id="${esc(a.id)}"`, "pri")}</article>`,
    )
    .join("");
}
function studentHome() {
  const alias =
    students.find((s) => s.id === demoSession.studentId)?.alias || "Student";
  const assigned = assignments.filter((a) => a.origin !== "open");
  return `<section class="pn student-assignments"><div class="workspace-heading"><div><div class="panel-kicker">Student workspace · ${esc(alias)}</div><h1>My assessments</h1></div><div class="row">${button("My performance", "nav", 'data-tab="performance"')}${button("My attempts", "nav", 'data-tab="history"')}</div></div><section class="assigned-work"><h2>Assigned to you by faculty</h2>${assignmentCards(assigned) || '<p class="muted">No assessments assigned yet. Choose any available simulation below.</p>'}</section>${learningTopics(insightsData?.me?.modules)}<section class="open-assessments"><h2>Open simulations</h2><p class="muted">Available to every student. These are separate from your faculty assignments above.</p>${catalogPicker()}<h3 class="catalog-heading">Select an AI patient</h3><p class="muted">Individual assessment · feedback after your visit.</p><div class="patient-grid">${
    list
      .filter(catalogMatches)
      .map((p) => card(p, false))
      .join("") ||
    '<p class="catalog-empty">No individual patients match. Clear filters to see all published cases.</p>'
  }</div><section class="group-catalog"><h3 class="catalog-heading">Multi-patient assessment</h3><p class="muted">Complete every trial to receive group feedback.</p>${groupCards()}</section></section></section>`;
}
function learningTopics(modules) {
  if (!modules?.length) return "";
  return `<section class="faculty-learning-topics"><h2>Faculty learning topics</h2><p class="muted">Reflection topics for your faculty debrief; these are not patient simulations.</p><div class="mod-list">${modules.map((m) => `<div class="mod"><span><b>${esc(m.title)}</b></span><span class="muted small">Assigned ${esc(new Date(m.assignedAt).toLocaleDateString())}</span></div>`).join("")}</div></section>`;
}
function studentGroups() {
  return `<div class="pn"><h1>Multi-patient assessments</h1>${catalogPicker()}<p class="muted">All ready simulations are available. Complete every trial to unlock group feedback.</p>${groupCards()}</div>`;
}

function publishedForGroups() {
  const retired = /^(denise carter|marcus lee|marcus ramirez|alex morgan)$/i;

  return list
    .filter((p) => p.version && !retired.test(p.name || ""))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function groupBuilder() {
  const patients = publishedForGroups();

  return `<details class="group-builder"><summary>Create a patient group</summary><p class="muted">Choose at least two published patients. Practice groups can mix conditions; demographic comparisons need matching clinical settings.</p><div class="group-fields"><label for="group-title">Group name</label><input id="group-title" maxlength="120" placeholder="e.g. Morning clinic set"><label for="group-purpose">Purpose (optional)</label><input id="group-purpose" maxlength="1000" placeholder="What should students practice?"><label for="group-kind">Group type</label><select id="group-kind"><option value="practice">Practice</option><option value="comparison">Demographic comparison</option></select></div><fieldset class="group-patient-picker"><legend>Patients · select at least two</legend><div class="group-patient-grid">${
    patients
      .map(
        (p) =>
          `<label class="group-patient-choice"><input type="checkbox" name="group-patient" value="${esc(p.id)}"><span class="patient-photo-well"><img src="${esc(p.imageUrl)}" alt=""></span><span><b>${esc(p.name)}</b><small>${p.age == null ? "Age unspecified" : esc(p.age) + " years"}</small></span></label>`,
      )
      .join("") ||
    '<p class="muted">Publish patients in Patient Studio before creating a group.</p>'
  }</div></fieldset>${button("Create group", "create-group", "", "pri")}</details>`;
}
function testCatalog() {
  if (demoSession.role === "student") return studentGroups();
  return `<div class="pn groups-page"><h1>Multi-patient assessments</h1>${catalogPicker()}<p class="muted">Assign a ready simulation from its card. Every published simulation is also available to all students.</p>${groupCards(true)}${groupBuilder()}<details class="student-management"><summary>Manage demo students</summary><div class="row"><label for="new-student-alias">New alias</label><input id="new-student-alias" maxlength="80" value="${esc(newStudentAlias)}">${button("Add student", "add-student")}</div></details><h2>Assigned assessments</h2>${
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
  return `<section class="bias-panel"><h3>Bias assessment · Faculty review</h3><p>${r.status === "pending" ? "Awaiting analysis" : r.status === "unavailable" ? "Analysis unavailable" : "Analysis complete"}</p>${ready ? button(r.status === "complete" ? "Recheck bias assessment" : "Run bias assessment", "analyze-bias", `data-type="${esc(type)}" data-id="${esc(id)}"`, "pri") : '<p class="muted">Available after this encounter or all group trials finish.</p>'} <a href="/api/bias/rubric/file" target="_blank" rel="noopener">View source rubric</a><p class="muted">Five separate performance ratings: 1 Unsatisfactory to 4 Exemplary. Higher is stronger performance. No combined bias score.</p>${tables}${findings.length ? `<h4>Possible bias indicators for faculty review</h4>${findings.map((f) => `<p>${esc(f.text)}</p>${citations(f.evidence)}`).join("")}` : r.status === "complete" ? "<p>No additional indicators reported; this does not establish absence of bias.</p>" : ""}<section class="bias-limits"><h4>Limits of this analysis</h4>${r.limitations.map((l) => `<p class="muted">${esc(l)}</p>`).join("")}<p class="muted">Separate from the student's seven-domain assessment. Encounter differences alone do not establish bias.</p></section></section>`;
}
function biasEvidenceView() {
  if (demoSession?.role !== "faculty" || !selectedEvidenceId) return "";
  const event = enc?.events.find((e) => e.id === selectedEvidenceId);
  if (!event) return "";
  const turn = enc.transcript.find((t) => t.id === event.id);
  return `<section class="bias-panel cited-event"><h2>Cited encounter event</h2><p>${esc(event.type)} · ${esc(new Date(event.at).toLocaleString())}</p><p>${esc(turn?.text || event.text || "Recorded encounter action")}</p><p class="muted">${esc(event.id)}</p></section>`;
}
function resultsPage() {
  return `<div class="pn"><h1>Student results</h1>${facultyResults.map((s) => `<section class="student-results"><h2>${esc(s.alias)}</h2>${s.attempts.map((a) => `<article class="group-card"><h3>${esc(a.title)} · ${a.completed}/${a.trials.length} trials</h3>${a.trials.map((t, i) => `<p>Trial ${i + 1}: ${esc(t.name)} · ${esc(t.status)} ${t.encounterId ? button("View trial", "resume", `data-id="${esc(t.encounterId)}"`) : ""}</p>`).join("")}${biasPanel(a.biasAnalysis, "attempt", a.id, a.status === "complete")}</article>`).join("")}${s.encounters.map((e) => `<article class="result-row"><h3>${esc(e.name)} · ${esc(e.status)}</h3><p>${e.total == null ? "Assessment pending" : `Rubric ${e.total}/${e.denominator}${e.provisional ? " · provisional" : ""}`} · ${e.turns} questions${e.duration ? ` · appointment ${esc(e.duration)}` : ""}</p>${button("View assessment & evidence", "resume", `data-id="${esc(e.id)}"`)}${biasPanel(e.biasAnalysis, "encounter", e.id, e.status === "complete")}</article>`).join("") || "<p>No encounters yet.</p>"}</section>`).join("")}</div>`;
}
// ---- Longitudinal views: a student's own performance, and faculty review of
// how a student's performance varies across patient demographics. The layout
// follows the team's reference design (student hub, faculty bias board).
async function loadInsights() {
  try {
    insightsData = await api("/api/insights");
  } catch (e) {
    insightsData = null;
    message = e.message;
  }
}
const pct = (v) => (v == null ? "–" : v + "%");
const outOf4 = (v) => (v == null ? "–" : v + "/4");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
const HUB_ICONS = {
  score: "M4 19h16M6 15l4-5 3 3 5-7",
  rubric: "M9 4h6v3H9zM7 5H5v15h14V5h-2M9 13l2 2 4-4",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  target: "M12 3a9 9 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0M12 12h.01",
  chat: "M4 5h16v11H9l-5 4z",
  list: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  shapes: "M4 13h7v7H4zM14 4l5 8H9zM17.5 14a3.5 3.5 0 1 0 .01 0",
  age: "M12 3a9 9 0 1 0 .01 0M12 7v5l3 2",
  ethnicity:
    "M12 3a9 9 0 1 0 .01 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  occupation: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  gender: "M12 4a3.5 3.5 0 1 0 .01 0M5 20c0-4 3-6 7-6s7 2 7 6",
  substance:
    "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9",
  weight: "M5 5h14v14H5zM8.5 11a3.5 3.5 0 0 1 7 0zM12 11l1.5-2.5",
  matched: "M4 8h13l-3-3M20 16H7l3 3",
  scope: "M10 4a6 6 0 1 0 .01 0M14.5 14.5L20 20M10 7v6M7 10h6",
  pen: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  file: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 14h1.5l1-3 1.5 6 1-3h1.5",
  close: "M6 6l12 12M18 6L6 18",
  right: "M9 6l6 6-6 6",
};
const hubIcon = (name) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${HUB_ICONS[name] || HUB_ICONS.rubric}"/></svg>`;
// The rubric's four levels, for a 1–4 average.
const levelOf = (v) =>
  v == null
    ? null
    : v >= 3.5
      ? ["Strong", "good"]
      : v >= 2.5
        ? ["Competent", "teal"]
        : v >= 1.5
          ? ["Developing", "amber"]
          : ["Needs review", "risk"];
const grade = (v) => {
  const level = levelOf(v);
  return level ? `<span class="tx-${level[1]}">${level[0]}</span>` : "–";
};
const patientAvatar = (name, profileId) =>
  `<span class="pt-avatar" aria-hidden="true">${esc(initials(name))}${profileId ? `<img src="/api/profiles/${esc(profileId)}/image" alt="" loading="lazy">` : ""}</span>`;
function hubBanner(summary, { title, pill, tag, line, boxes, faculty }) {
  const k = summary.kpis,
    last = summary.encounters[0];
  return `<section class="hb-banner ${faculty ? "is-faculty" : ""}"><div class="hb-who"><div class="hb-avatar" aria-hidden="true">${esc(initials(summary.student.alias))}<span class="hb-tag">${esc(tag)}</span></div><div><div class="hb-name"><h1>${esc(title)}</h1><span class="hb-pill">${esc(pill)}</span></div><p class="hb-line">${line}</p><div class="hb-facts"><span>${hubIcon("rubric")} Completed: <b>${plural(k.n, "visit")}</b></span><span>${hubIcon("gender")} Patients seen: <b>${summary.patients.length}</b></span>${last ? `<span>${hubIcon("age")} Last visit: <b>${esc(new Date(last.completedAt).toLocaleDateString())}</b></span>` : ""}</div></div></div><div class="hb-boxes">${boxes.map(([label, value]) => `<div class="hb-box"><p>${label}</p><b>${value}</b></div>`).join("")}</div></section>`;
}
function hubCard(tone, icon, label, value, extra, note, bar) {
  return `<section class="hc tone-${tone}"><div class="hc-top"><span class="hc-label">${label}</span><span class="hc-ico">${hubIcon(icon)}</span></div><div><div class="hc-val"><b>${value}</b>${extra}</div><p class="hc-note">${note}</p></div><div class="hc-bar"><i style="width:${Math.max(0, Math.min(100, bar || 0))}%"></i></div></section>`;
}
function hubCards(summary) {
  const k = summary.kpis;
  const scored = summary.encounters.filter((m) => m.rubricPct != null).length;
  const trend =
    k.trend == null || k.trend === 0
      ? ""
      : `<span class="hc-delta ${k.trend > 0 ? "up" : "down"}">${k.trend > 0 ? "▲ +" : "▼ −"}${Math.abs(k.trend)} pts</span>`;
  return `<div class="hc-grid">${hubCard("teal", "score", "Overall encounter score", pct(k.rubricPct), trend, k.trend == null ? "Rubric average across scored visits" : "Latest visit against the earlier average", k.rubricPct)}${hubCard("good", "chat", "Empathy and communication", k.empathy == null ? "–" : `${k.empathy}<small>/4</small>`, `<span class="hc-delta">${grade(k.empathy)}</span>`, "Rubric domain 2: rapport, respect and empathy", k.empathy == null ? 0 : (k.empathy / 4) * 100)}${hubCard("indigo", "target", "Learning objectives met", pct(k.objectivePct), "", `Findings reached: ${pct(k.findingsPct)}`, k.objectivePct)}${hubCard("amber", "rubric", "Encounters completed", String(k.n), `<span class="hc-delta muted">${plural(summary.patients.length, "patient")}</span>`, `${scored} of ${k.n} scored against the rubric`, k.n ? (scored / k.n) * 100 : 0)}</div>`;
}
// Seven rubric domains on a 0–4 scale, with the cohort outline when available.
function radar(domains, cohortDomains) {
  const size = 280,
    c = size / 2,
    r = 96,
    n = domains.length;
  const point = (i, value) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const d = (r * Math.max(0, value || 0)) / 4;
    return [c + d * Math.cos(angle), c + d * Math.sin(angle)];
  };
  const ring = (level) =>
    domains.map((_, i) => point(i, level).join(",")).join(" ");
  const shape = (list) =>
    list.map((d, i) => point(i, d.mean).join(",")).join(" ");
  const labels = domains
    .map((d, i) => {
      const [x, y] = point(i, 4.75);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${d.domain}</text>`;
    })
    .join("");
  const dots = domains
    .map((d, i) => {
      const [x, y] = point(i, d.mean);
      return d.mean == null
        ? ""
        : `<circle class="pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"><title>${esc(d.name)}: ${d.mean} / 4</title></circle>`;
    })
    .join("");
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Average score in each rubric domain">${[1, 2, 3, 4].map((l) => `<polygon class="ring" points="${ring(l)}"/>`).join("")}${domains
    .map((_, i) => {
      const [x, y] = point(i, 4);
      return `<line class="ring" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    })
    .join(
      "",
    )}${cohortDomains ? `<polygon class="cohort" points="${shape(cohortDomains)}"/>` : ""}<polygon class="self" points="${shape(domains)}"/>${dots}${labels}</svg>`;
}
const panelHead = (icon, title, sub, side = "") =>
  `<div class="hp-head"><div><h3>${hubIcon(icon)}<span>${title}</span></h3><p>${sub}</p></div>${side}</div>`;
// Radar of the rubric domains beside the three communication domains.
function visualizerPanel(summary, cohort) {
  const scored = summary.domains.some((d) => d.mean != null);
  const tones = ["teal", "indigo", "good"];
  const boxes = [2, 4, 5]
    .map((n) => summary.domains.find((d) => d.domain === n))
    .filter(Boolean)
    .map(
      (d, i) =>
        `<div class="hp-box"><div class="hp-box-top"><span class="tx-${tones[i]}">${esc(d.name)}</span><span>${outOf4(d.mean)}</span></div><p>${esc(d.descriptor || "No scored visits yet.")}</p></div>`,
    )
    .join("");
  return `<section class="hp span-7">${panelHead("heart", "Empathy and communication scale visualizer", "Average across the seven rubric domains, on the rubric's 1 to 4 scale", cohort ? `<span class="hp-badge">${hubIcon("shield")} Class avg: ${outOf4(cohort.empathy)}</span>` : "")}${
    scored
      ? `<div class="viz"><div class="viz-chart">${radar(summary.domains, cohort?.domains)}<div class="legend"><span><i class="key-self"></i>${esc(summary.student.alias)}</span>${cohort ? '<span><i class="key-cohort"></i>Class average</span>' : ""}</div></div><div class="viz-boxes">${boxes}</div></div>`
      : '<p class="muted">No scored visits yet. Rubric ratings need the model assessment.</p>'
  }</section>`;
}
// One bar per rubric domain, with the rubric level it sits at.
function competencyPanel(summary) {
  return `<section class="hp span-5">${panelHead("shapes", "Rubric domain competency", "Performance across the seven rubric domains")}<div class="comp">${summary.domains
    .map((d) => {
      const level = levelOf(d.mean);
      return `<div><div class="comp-top"><span>${d.domain}. ${esc(d.name)}</span><span class="tx-${level ? level[1] : "muted"}">${d.mean == null ? "Not scored" : `${Math.round((d.mean / 4) * 100)}% (${level[0]})`}</span></div><div class="comp-bar bg-${level ? level[1] : "muted"}"><i style="width:${d.mean == null ? 0 : (d.mean / 4) * 100}%"></i></div></div>`;
    })
    .join("")}</div></section>`;
}
function encounterLog(summary) {
  const rows = summary.encounters
    .map((m) => {
      const level = levelOf(m.empathy);
      return `<tr data-action="visit-open" data-id="${esc(m.id)}" data-patient="${esc(m.patient)}"><td class="mono">${esc(new Date(m.completedAt).toLocaleDateString())}</td><td><div class="pt-cell">${patientAvatar(m.patient, m.profileId)}<b>${esc(m.patient)}</b></div></td><td><span class="tag">${esc([m.age == null ? "" : m.age + " yrs", m.gender].filter(Boolean).join(" · ") || "Not recorded")}</span></td><td class="tx-teal"><b>${pct(m.findingsPct)}</b></td><td class="tx-indigo"><b>${pct(m.objectivePct)}</b></td><td>${level ? `<b class="tx-${level[1]}">${level[0]} (${m.empathy})</b>` : '<span class="muted">Not scored</span>'}</td><td class="overall">${pct(m.rubricPct)}</td><td class="act">${button("View debrief", "visit-open", `data-id="${esc(m.id)}"`, "mini")}</td></tr>`;
    })
    .join("");
  return `<section class="hp flush"><div class="log-head"><div><h3>${hubIcon("list")}<span>Standardized patient clinical encounters log</span></h3><p>Click any encounter to open its score breakdown and debrief</p></div><div class="log-tools"><input id="visit-search" type="search" placeholder="Search patient, date…" aria-label="Search encounters"><select id="visit-patient" aria-label="Filter by patient"><option value="">All patients</option>${summary.patients.map((p) => `<option>${esc(p.name)}</option>`).join("")}</select></div></div>${
    rows
      ? `<div class="sc"><table class="hub-table" id="visit-log"><thead><tr><th>Date</th><th>Patient SP case</th><th>Profile</th><th>Findings reached</th><th>Learning objectives</th><th>Empathy scale</th><th>Overall score</th><th class="act">Action</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted log-empty">No completed visits yet.</p>'
  }</section>`;
}
function filterVisits() {
  const query = ($("#visit-search")?.value || "").trim().toLowerCase();
  const patient = $("#visit-patient")?.value || "";
  for (const row of document.querySelectorAll("#visit-log tbody tr"))
    row.hidden =
      (!!query && !row.textContent.toLowerCase().includes(query)) ||
      (!!patient && row.dataset.patient !== patient);
}
// One visit at a glance, opened from the encounter log or a bias excerpt.
function visitDialog(summary) {
  const m = summary.encounters.find((e) => e.id === visitModal);
  if (!m) return "";
  const level = levelOf(m.empathy);
  const profile = [m.age == null ? "" : m.age + " years", m.gender, m.ethnicity]
    .filter(Boolean)
    .join(", ");
  const groups = [m.occupation, m.weight, m.substance].filter(Boolean);
  const box = (label, value, tone) =>
    `<div class="md-stat"><p>${label}</p><b class="tx-${tone}">${value}</b></div>`;
  return `<div class="hub-modal"><div class="hub-backdrop" data-action="visit-close"></div><section class="hub-dialog" role="dialog" aria-modal="true" aria-label="Encounter with ${esc(m.patient)}"><div class="md-head"><div class="md-title"><span class="md-ico">${hubIcon("file")}</span><div><h3>${esc(m.patient)} — ${plural(m.questions, "question")}${m.minutes == null ? "" : `, ${m.minutes} min`}</h3><p>Date: ${esc(new Date(m.completedAt).toLocaleString())} | ${m.rubricPct == null ? "Rubric not scored" : `Rubric ${m.rubricTotal}/${m.rubricMax}`}</p></div></div><button type="button" class="md-x" data-action="visit-close" aria-label="Close">${hubIcon("close")}</button></div><div class="md-body"><div class="md-stats">${box("Findings reached", pct(m.findingsPct), "teal")}${box("Learning objectives", pct(m.objectivePct), "indigo")}${box("Empathy score", level ? `${level[0]} (${m.empathy})` : "–", level ? level[1] : "muted")}${box("Overall grade", pct(m.rubricPct), "strong")}</div><div class="md-box"><h4>Patient presentation demographics:</h4><p><strong>Profile:</strong> ${esc(profile || "Not recorded")}</p>${groups.length ? `<p><strong>Comparison groups:</strong> ${esc(groups.join(", "))}</p>` : ""}<p><strong>Automated bias flag:</strong> ${m.biasFlags?.length ? m.biasFlags.map((f) => `<span class="tx-${f.level === "notable" ? "risk" : "amber"} flag">${esc(f.label)}</span>`).join(", ") : `<span class="tx-${summary.biasRated ? "good" : "muted"} flag">${summary.biasRated ? "None" : "Not enough visits to compare yet"}</span>`}</p>${(m.biasFlags || []).map((f) => `<p class="flag-detail">${esc(f.detail)}${f.basis === "text" ? " This grouping was read from the case text and may be wrong." : ""}</p>`).join("")}${m.biasFlags?.length ? '<p class="muted">A gap between patient groups is a prompt to reflect and discuss with faculty, not a finding of bias.</p>' : ""}${m.reviewRequired ? '<p><strong>Review:</strong> <span class="tx-amber">Marked for faculty review</span></p>' : ""}</div><div class="md-box"><h4>Debrief highlight:</h4>${m.strength ? `<p class="quote-line">“${esc(m.strength)}”</p>` : ""}${m.gap ? `<p><strong>To work on:</strong> ${esc(m.gap)}</p>` : ""}${m.strength || m.gap ? "" : '<p class="muted">Rubric feedback was not available for this visit.</p>'}</div></div><div class="md-foot">${button("Open full feedback", "resume", `data-id="${esc(m.id)}"`, "pri")}${button("Close evaluation", "visit-close")}</div></section></div>`;
}
function performanceHub() {
  const data = insightsData?.me;
  if (!data)
    return `<div class="pn"><h1>My performance</h1><p class="muted">Performance summary is unavailable.</p></div>`;
  const k = data.kpis;
  return `<div class="hub">${hubBanner(data, {
    title: "My performance",
    pill: data.student.alias,
    tag: "Student",
    line: "Built from your completed visits. A discussion aid, not a grade.",
    boxes: [
      ["Rubric average", `<span class="tx-teal">${pct(k.rubricPct)}</span>`],
      ["Empathy grade", grade(k.empathy)],
    ],
  })}${hubCards(data)}<div class="hub-row">${visualizerPanel(data, insightsData.cohort)}${competencyPanel(data)}</div>${data.modules?.length ? `<section class="hp">${panelHead("book", "Faculty learning topics", "Reflection topics for your faculty debrief; these are not patient simulations")}<div class="mod-list">${data.modules.map((m) => `<div class="mod"><span><b>${esc(m.code)}:</b> ${esc(m.title)}</span><span class="muted small">Assigned ${esc(new Date(m.assignedAt).toLocaleDateString())}</span></div>`).join("")}</div></section>` : ""}${encounterLog(data)}${visitDialog(data)}</div>`;
}
const VARIANCE_LABEL = {
  insufficient: "Not enough data",
  minimal: "Minimal variance",
  moderate: "Moderate variance",
  notable: "Notable variance",
};
const OVERALL_LABEL = {
  insufficient: "Not enough data yet",
  minimal: "Low variance / balanced",
  moderate: "Moderate variance detected",
  notable: "Notable variance flag",
};
const varianceBadge = (level, small) =>
  `<span class="lv level-${level}">${VARIANCE_LABEL[level]}${small && level !== "insufficient" ? " · small sample" : ""}</span>`;
// The widest gap in one line, for the card footer and the deep dive.
function deltaLine(item) {
  const w = item.widest;
  if (!w) {
    const visits = item.groups.reduce((sum, g) => sum + g.n, 0);
    return `${plural(item.groups.length, "group")} · ${plural(visits, "visit")}`;
  }
  if (w.gap === 0) return `No gap in ${w.label.toLowerCase()}`;
  return `−${w.gap}${w.unit === "%" ? " pts" : " of 4"} ${w.label.toLowerCase()} with ${w.low.label}`;
}
const groupWidth = (gap, value) =>
  gap.key === "empathy" ? (value / 4) * 100 : value;
// Two bars: the best- and worst-served group on the widest measure.
function gapBars(gap) {
  const row = (side, cls) =>
    `<span class="gap-row"><span class="gap-label">${esc(side.label)}</span><span class="gap-bar ${cls}"><i style="width:${Math.max(3, groupWidth(gap, side.value))}%"></i></span><b>${side.value}${gap.unit}</b></span>`;
  return `<span class="gap-bars" role="img" aria-label="${esc(gap.label)}: ${gap.high.value}${esc(gap.unit)} with ${esc(gap.high.label)}, ${gap.low.value}${esc(gap.unit)} with ${esc(gap.low.label)}">${row(gap.high, "hi")}${row(gap.low, "lo")}</span>`;
}
// Every group on each measure, so the whole comparison is visible at once.
function groupCharts(groups) {
  return [
    ["Rubric", (g) => g.rubricPct, (v) => v, "%"],
    ["Rapport and empathy", (g) => g.empathy, (v) => (v / 4) * 100, "/4"],
    ["Learning objectives", (g) => g.objectivePct, (v) => v, "%"],
    ["Open questions", (g) => g.openShare, (v) => v, "%"],
  ]
    .filter(([, read]) => groups.some((g) => read(g) != null))
    .map(
      ([label, read, width, unit]) =>
        `<div class="measure"><h5>${label}</h5>${groups.map((g, i) => `<div class="gap-row"><span class="gap-label">${esc(g.label)} <small class="muted">n=${g.n}</small></span><span class="gap-bar series-${i % 4}"><i style="width:${read(g) == null ? 0 : Math.max(3, width(read(g)))}%"></i></span><b>${read(g) == null ? "–" : read(g) + unit}</b></div>`).join("")}</div>`,
    )
    .join("");
}
function biasCard(item, on) {
  return `<button type="button" class="bc level-${item.level} ${on ? "on" : ""}" data-action="board-focus" data-focus="${esc(item.id)}"><span class="bc-top"><span class="bc-title"><span class="bc-ico">${hubIcon(item.trials ? "matched" : item.id)}</span><b>${esc(item.title)}</b></span>${varianceBadge(item.level, item.trials ? true : item.smallSample)}</span><span class="bc-sum">${esc(item.summary)}</span>${item.widest && item.level !== "insufficient" ? gapBars(item.widest) : ""}<span class="bc-foot"><span class="bc-delta">${esc(deltaLine(item))}</span><span class="bc-link">Deep-dive ${hubIcon("right")}</span></span></button>`;
}
function varianceTable(groups) {
  return `<div class="sc"><table class="hub-table"><thead><tr><th>Patient group</th><th>Visits</th><th>Rubric</th><th>Empathy</th><th>Objectives</th><th>Open questions</th><th>Questions per visit</th><th>Minutes per visit</th><th>Judgmental wording</th></tr></thead><tbody>${groups.map((g) => `<tr><td><b>${esc(g.label)}</b></td><td>${g.n}</td><td>${pct(g.rubricPct)}</td><td>${outOf4(g.empathy)}</td><td>${pct(g.objectivePct)}</td><td>${pct(g.openShare)}</td><td>${g.questions ?? "–"}</td><td>${g.minutes ?? "–"}</td><td>${g.judgmental}</td></tr>`).join("")}</tbody></table></div>`;
}
// A question faculty can put to the student, built from the widest gap.
function debriefPrompt(item) {
  const w = item.widest;
  if (!w || w.gap === 0) return "";
  return `${item.title}: ${w.label.toLowerCase()} averaged ${w.high.value}${w.unit} with ${w.high.label} and ${w.low.value}${w.unit} with ${w.low.label}. What felt different in those visits?`;
}
function deepDive(item) {
  const w = item.widest;
  const lead = item.trials
    ? `Same clinical case presented with a different ${item.differs.length ? item.differs.join(" and ") : "patient"}. `
    : "";
  const excerpts = (item.examples || [])
    .map(
      (x) =>
        `<div class="excerpt"><p class="excerpt-label">Transcript excerpt (${esc(x.patient)}, ${esc(new Date(x.at).toLocaleDateString())}):</p><p class="excerpt-quote">${x.quote ? `“${esc(x.quote)}”` : "No question recorded."} <span>(${esc(x.quoteKind)})</span></p>${x.note ? `<p class="excerpt-note"><strong>Rubric note:</strong> ${esc(x.note)}</p>` : ""}${button("Open encounter", "visit-open", `data-id="${esc(x.id)}"`, "mini")}</div>`,
    )
    .join("");
  return `<div class="dive level-${item.level}"><div class="dive-head"><div class="dive-title">${hubIcon(item.trials ? "matched" : item.id)}<div><h4>${esc(item.title)} — Faculty analysis</h4><p>Longitudinal variance delta: <span class="bc-delta">${esc(deltaLine(item))}</span></p></div></div>${varianceBadge(item.level, item.trials ? true : item.smallSample)}</div><div class="dive-body"><h4>${w ? `${esc(w.high.label)} vs. ${esc(w.low.label)} presentation analysis` : "Presentation analysis"}</h4><p>${esc(lead + item.summary)}</p>${item.groups.length > 1 ? `<div class="dive-grid"><div><p class="dive-cap">How the groups compare</p>${groupCharts(item.groups)}</div><div><p class="dive-cap">From the lower-scoring group${w ? ": " + esc(w.low.label) : ""}</p>${excerpts || '<p class="muted">No visits to quote yet.</p>'}</div></div>${debriefPrompt(item) ? `<div class="prompt">${hubIcon("chat")}<div><b>Suggested debrief question</b><p>${esc(debriefPrompt(item))}</p></div><button type="button" class="mod-add" data-action="board-add-prompt" data-prompt="${esc(debriefPrompt(item))}">Add to notes</button></div>` : ""}<details class="evidence"><summary>All numbers</summary>${varianceTable(item.groups)}</details>` : excerpts}${!item.trials && item.basis === "text" ? '<p class="muted small">These groups were read automatically from the case text and can be wrong. Check them against the case before drawing on this comparison.</p>' : ""}</div></div>`;
}
function biasBoard() {
  const all = insightsData?.students;
  if (!all)
    return `<div class="pn"><h1>Bias review</h1><p class="muted">Review data is unavailable.</p></div>`;
  const key = (s) => s.student.id || "unassigned";
  const current =
    all.find((s) => key(s) === boardStudent) ||
    // Legacy encounters can be reviewed, but assignments need a real student.
    all.filter((s) => s.student.id).sort((a, b) => b.kpis.n - a.kpis.n)[0] ||
    all[0];
  boardStudent = key(current);
  const v = current.variance,
    k = current.kpis;
  const items = [...v.comparisons, ...v.dimensions];
  const rank = Object.keys(VARIANCE_LABEL);
  const focus =
    items.find((i) => i.id === boardFocus) ||
    // Open on the widest gap.
    [...items].sort((a, b) => rank.indexOf(b.level) - rank.indexOf(a.level))[0];
  const flags = [...items]
    .filter((i) => ["moderate", "notable"].includes(i.level))
    .map((i) => i.title.toLowerCase());
  const prompts = items.map(debriefPrompt).filter(Boolean);
  const notes = boardDraft ?? current.notes.text;
  const saved =
    boardDraft != null && boardDraft !== current.notes.text
      ? "Unsaved changes"
      : current.notes.updatedAt
        ? "Saved " + new Date(current.notes.updatedAt).toLocaleString()
        : "Not saved yet";
  return `<div class="hub is-faculty"><section class="hp switcher"><div class="sw-title"><span class="sw-ico">${hubIcon("scope")}</span><div><h2>Student bias review board</h2><p>Longitudinal bias review and student competency analysis</p></div></div><div class="sw-pick"><label for="board-student">Target student:</label><select id="board-student" ${busy ? "disabled" : ""}>${all.map((s) => `<option value="${esc(key(s))}" ${key(s) === boardStudent ? "selected" : ""}>${esc(s.student.alias)} • ${plural(s.kpis.n, "visit")} • ${OVERALL_LABEL[s.variance.overall]}</option>`).join("")}</select></div></section>
  ${hubBanner(current, {
    title: current.student.alias,
    pill: current.notes.flagged ? "Flagged for mentorship" : "Bias review",
    tag: "Student",
    line: `Overall encounter score: <strong>${pct(k.rubricPct)}</strong> • Empathy: <strong>${outOf4(k.empathy)}</strong> (${grade(k.empathy)})${flags.length ? ` • Variance in ${esc(flags.join(", "))}` : ""}`,
    boxes: [
      [
        "Learning objectives",
        `<span class="tx-teal">${pct(k.objectivePct)}</span>`,
      ],
      ["SP cases analysed", `<span class="tx-amber">${k.n}</span>`],
    ],
    faculty: true,
  })}
  <section class="hp core"><div class="core-head"><div><div class="core-title"><span class="core-tag">Core faculty tool</span><h2>Longitudinal bias variance index</h2></div><p>Cross-analysing performance variance (rubric, empathy, learning objectives, open questions, time spent) across the patient presentations this student has seen.</p></div><div class="core-overall"><span>Overall bias variance rating:</span><span class="lv big level-${v.overall}">${OVERALL_LABEL[v.overall]}</span></div></div><div class="bc-grid">${items.map((i) => biasCard(i, i.id === focus.id)).join("")}</div>${deepDive(focus)}<details class="evidence"><summary>How to read this</summary><p>Levels come from the widest gap in rubric average or in the rapport and empathy domain between patient groups: under ${v.thresholds.moderate} points is minimal, ${v.thresholds.moderate}–${v.thresholds.notable - 1} moderate, ${v.thresholds.notable} or more notable. A patient group is rated only once it has ${v.thresholds.minPerGroup} visits; "small sample" means a group still has fewer than ${v.thresholds.smallSample}.</p><ul>${v.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details></section>
  <div class="hub-row"><section class="hp span-7"><h3 class="hp-rule">${hubIcon("pen")}<span>Faculty observation notes and debrief agenda</span></h3><label for="board-notes" class="fld">Specific reflection prompts for student session</label><textarea id="board-notes" rows="4" maxlength="5000" placeholder="Note specific moments where the student displayed variance in communication or thoroughness…">${esc(notes)}</textarea><div class="notes-foot"><label class="check"><input type="checkbox" id="board-flag" ${current.notes.flagged ? "checked" : ""}> Flag for 1-on-1 faculty mentorship review</label><div class="notes-save"><span class="muted small">${esc(saved)}</span>${button("Save faculty evaluation notes", "save-board-notes", "", "pri")}</div></div></section><section class="hp span-5 modules"><div><h3 class="hp-rule">${hubIcon("book")}<span>Assign follow-up learning topics</span></h3><p class="muted small">${current.student.id ? "For " + esc(current.student.alias) + ": reflection topics for a faculty debrief, not patient simulations." : "Select a named student above to assign learning topics or simulations. Unassigned encounters are retained for review only."}</p>${current.student.id ? button("Assign a patient simulation", "assign-case-from-board", `data-student="${esc(current.student.id)}"`, "pri") : ""}<div class="mod-list">${current.modules.map((m) => `<div class="mod ${m.assignedAt ? "is-on" : ""}"><span><b>${esc(m.code)}:</b> ${esc(m.title)}${m.suggested ? ' <span class="lv level-moderate">Suggested</span>' : ""}${m.assignedAt ? `<br><small class="muted">Assigned to ${esc(current.student.alias)} � ${esc(new Date(m.assignedAt).toLocaleDateString())}</small>` : ""}</span><button type="button" class="mod-add" data-action="module-toggle" data-module="${esc(m.id)}" data-assigned="${m.assignedAt ? "true" : "false"}" ${busy || !current.student.id ? "disabled" : ""}>${m.assignedAt ? "Remove assignment" : "Assign topic"}</button></div>`).join("")} </div></div><p class="mod-note">${hubIcon("shield")} Bias review is shown to faculty only. Students see their learning topics, without the faculty analysis.</p></section></div>${visitDialog(current)}</div>`;
}
function notice() {
  return `<div class="toast ${message ? "" : "hidden"}" role="status"><span>${esc(message)}</span>${message ? '<button type="button" class="toast-close" data-action="dismiss-message" aria-label="Dismiss notification"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' : ""}</div>`;
}
function render() {
  if (document.body.classList.contains("has-menu") !== !!demoSession) {
    document.body.classList.toggle("has-menu", !!demoSession);
    updateHeaderHeight();
  }
  if (!demoSession) {
    $("#nav").innerHTML = "";
    $("#app").innerHTML = notice() + rolePicker();
    return;
  }
  if (tab === "open-assessments") tab = "student-home";
  const focusId = document.activeElement?.id;
  const dialogScroll = $(".patient-form-body")?.scrollTop || 0;
  if (patientDialog && $("#patient-dialog")?.dataset.profileId === profile.id)
    for (const detail of document.querySelectorAll(
      "#patient-dialog details[data-detail]",
    ))
      patientDialog.openSections[detail.dataset.detail] = detail.open;
  const navs = [
    ...(demoSession.role === "student"
      ? [["student-home", "Assessments"]]
      : []),
    [
      "studio",
      demoSession.role === "student" ? "Individual patients" : "Patient Studio",
    ],
    ["enc", "Encounter"],
    ["rep", "Assessment"],
    ["history", "History"],
    [
      "tests",
      demoSession.role === "faculty" ? "Prepared groups" : "Patient groups",
    ],
    ...(demoSession.role === "faculty"
      ? [
          ["results", "Student results"],
          ["bias", "Bias review"],
        ]
      : [["performance", "My performance"]]),
  ];
  $("#nav").innerHTML =
    navs
      .map(([k, name]) =>
        button(
          name,
          "nav",
          `data-tab="${k}"${tab === k ? ' aria-current="page"' : ""}`,
          tab === k ? "on" : "",
        ),
      )
      .join("") +
    button(
      demoSession.role === "faculty"
        ? "Faculty workspace · Switch"
        : `Student workspace · ${students.find((s) => s.id === demoSession.studentId)?.alias || "Student"} · Switch`,
      "switch-role",
    );
  const draftNote = busy
    ? "Working…"
    : dirty
      ? "Unsaved draft changes"
      : "";
  $("#app").innerHTML =
    `${busy || dirty ? `<div class="app-status"><span>${busy ? "Working…" : "Unsaved draft changes"}</span></div>` : ""}${notice()}` +
    {
      studio,
      "student-home": studentHome,

      enc: encounter,
      rep: assessment,
      history: past,
      tests: testCatalog,
      results: resultsPage,
      bias: biasBoard,
      performance: performanceHub,
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
  if (
    !patientSpeaking &&
    (voiceDisplay.state === "speaking" || voiceDisplay.state === "thinking")
  )
    voiceDisplay = { state: "ready", text: readyStatus() };
  if (voiceDisplay.state === "ready") voiceDisplay.text = readyStatus();
  voiceState(voiceDisplay.state, voiceDisplay.text);
  setFaceAnchor();
  initTalkAvatar();
  attachTalkVideo();
  updateMicButton();
  syncVideoCall();
  syncLive();
  window.VirtuSPAvatar?.sync({ encounter: enc, tab, health, reducedMotion });
  syncInterviewTimer();
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
  $("#av-talk")?.classList.add("hidden");
  $("#avf")?.classList.add("has-video");
  $("#avf .patient-photo")?.classList.remove("hidden");
  v.classList.add("hidden");
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
      const type = r.headers.get("content-type") || "";
      if (!type.includes("video")) {
        const data = await r.json().catch(() => null);
        if (data?.status === "unavailable") {
          clearInterval(talkVideoPoll);
          talkVideoPoll = 0;
        }
        return;
      }
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
  clearSpeechWatch();
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
  stopTalkingCall();
  $("#avf")?.classList.remove("speaking");
}
function stopLive() {
  listening = false;
  clearTimeout(micRestartTimer);
  clearTimeout(silenceTimer);
  utteranceStarted = 0;
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
  voiceState("ready", readyStatus());
  updateMicButton();
}
function readyStatus() {
  if (!enc) return "Ready for your question";
  if (enc.status === "complete") return "Call ended";
  return "Ready for your question";
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
  const video = $("#av-video");
  if (callVideoUrl) {
    if (video) {
      try {
        video.pause();
      } catch {
        /* jsdom has no media playback. */
      }
      if (video.src === callVideoUrl) video.removeAttribute("src");
    }
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
  if (!ctx || !image?.width || typeof ctx.drawImage !== "function") return;
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
  if (studentStream) stopStudentCamera();
  portraitToken++;
  if (typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(callAnimation);
  callAnimation = 0;
}
function faceStatusLabel() {
  if (cameraState !== "on") return studentCameraNote || "Camera off";
  if (faceBroken || typeof window.FaceDetector !== "function") return "Camera on";
  return window.VirtuSPEncounter?.faceLabel?.(facePublic) || "Camera on";
}
function latencyLabel() {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "Offline. The question stays in the box until you send again.";
  if (lastLatencyMs == null) return "Connected";
  return "Connected. Last reply " + lastLatencyMs + " ms";
}
function logMedia(type, metadata) {
  if (!enc?.id || enc.status !== "active") return;
  try {
    const pending = fetch("/api/encounters/" + enc.id + "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, metadata: metadata || {} }),
    });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    /* A telemetry failure must not stop the visit. */
  }
}
function paintMedia() {
  const face = $("#face-status");
  if (face) face.textContent = faceStatusLabel();
  const note = $("#media-note");
  if (note) note.textContent = studentCameraNote;
  const latency = $("#latency-status");
  if (latency) latency.textContent = latencyLabel();
  const privacy = $("#media-privacy");
  if (privacy) {
    const secure = window.isSecureContext === true;
    privacy.textContent = [
      "Secure context " + (secure ? "yes" : "no"),
      "HTTPS " + (location.protocol === "https:" ? "yes" : "no"),
      "Camera " + (cameraState === "on" ? "on" : "off"),
      "Microphone " +
        (window.isSecureContext === false
          ? "blocked"
          : muted
            ? "muted"
            : listening
              ? "on"
              : "off"),
      "Recording off",
    ].join(" · ");
  }
  const on = cameraState === "on";
  document.querySelectorAll("[data-action='student-camera']").forEach((button) => {
    if (button.parentElement?.classList.contains("media-bar")) {
      button.textContent = on ? "Camera on" : "Camera off";
      button.setAttribute("aria-pressed", String(on));
    }
    if (button.parentElement?.classList.contains("self-view")) {
      button.hidden = on;
      button.textContent = "Turn camera on";
    }
  });
}
function stopFaceWatch() {
  if (faceWatch) clearInterval(faceWatch);
  faceWatch = 0;
  faceModel = null;
}
function startFaceWatch() {
  stopFaceWatch();
  faceMachine = window.VirtuSPEncounter?.createFacePresence
    ? window.VirtuSPEncounter.createFacePresence()
    : null;
  faceMachine?.cameraOn();
  facePublic = faceMachine?.state() || "NO_FACE";
  const Detector = window.FaceDetector;
  if (typeof Detector !== "function") {
    faceBroken = true;
    paintMedia();
    return;
  }
  try {
    faceModel = new Detector({ fastMode: true, maxDetectedFaces: 2 });
  } catch {
    faceBroken = true;
    paintMedia();
    return;
  }
  faceBroken = false;
  let lastLogged = "";
  faceWatch = setInterval(async () => {
    const video = $("#student-camera");
    if (!video || video.readyState < 2 || !faceModel) return;
    try {
      const faces = await faceModel.detect(video);
      const next = faceMachine
        ? faceMachine.observe(faces.length, Date.now())
        : faces.length > 1
          ? "MULTIPLE_FACES"
          : faces.length === 1
            ? "FACE_DETECTED"
            : "NO_FACE";
      if (next === facePublic) return;
      facePublic = next;
      paintMedia();
      if (next === "FACE_DETECTED" && lastLogged !== "FACE_DETECTED") {
        lastLogged = "FACE_DETECTED";
        logMedia("FACE_DETECTED", {});
      }
      if (next === "FACE_LOST" && lastLogged !== "FACE_LOST") {
        lastLogged = "FACE_LOST";
        logMedia("FACE_LOST", {});
      }
    } catch {
      faceBroken = true;
      stopFaceWatch();
      paintMedia();
    }
  }, 500);
}
function stopBargeVad() {
  if (bargeTimer) clearInterval(bargeTimer);
  bargeTimer = 0;
  try {
    bargeSource?.disconnect();
  } catch {
    /* Already disconnected. */
  }
  bargeSource = null;
  const ctx = bargeContext;
  bargeContext = null;
  if (ctx && ctx.state !== "closed") ctx.close?.().catch(() => {});
}
function interruptPatient() {
  if (!patientSpeaking) return;
  stopPatientAudio();
  holdMic = false;
  ignoreMicUntil = Date.now() + 280;
  voiceState("listening", "Listening…");
  logMedia("PATIENT_INTERRUPTED", {});
  updateMicButton();
  syncLive();
}
function startBargeVad() {
  stopBargeVad();
  const track = studentStream
    ?.getAudioTracks?.()
    .find((item) => item.readyState === "live");
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!track || typeof Ctx !== "function") return;
  try {
    bargeContext = new Ctx();
    bargeSource = bargeContext.createMediaStreamSource(new MediaStream([track]));
    const analyser = bargeContext.createAnalyser();
    analyser.fftSize = 512;
    bargeSource.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let hotSince = 0;
    bargeTimer = setInterval(() => {
      if (!patientSpeaking || Date.now() < bargeArmedAt) {
        hotSince = 0;
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = (data[i] - 128) / 128;
        sum += sample * sample;
      }
      if (Math.sqrt(sum / data.length) < 0.06) {
        hotSince = 0;
        return;
      }
      if (!hotSince) hotSince = Date.now();
      if (Date.now() - hotSince >= 450) {
        hotSince = 0;
        interruptPatient();
      }
    }, 50);
  } catch {
    stopBargeVad();
  }
}
function mediaConstraints(deviceId) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = "user";
  return {
    video,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}
function cameraProblem(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return {
      state: "denied",
      note: "Camera permission denied. Voice and typing still work.",
    };
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return {
      state: "missing",
      note: "No camera found. Voice and typing still work.",
    };
  if (name === "NotReadableError" || name === "TrackStartError")
    return {
      state: "busy",
      note: "Camera is in use by another app. Voice and typing still work.",
    };
  if (name === "AbortError")
    return {
      state: "error",
      note: "Camera request was dismissed. Voice and typing still work.",
    };
  if (name === "SecurityError")
    return {
      state: "error",
      note: "Camera and microphone need a secure page. Open " + secureDemoUrl(),
    };
  if (name === "OverconstrainedError")
    return {
      state: "missing",
      note: "No compatible camera was found. Voice and typing still work.",
    };
  return {
    state: "error",
    note: "Camera unavailable. Voice and typing still work.",
  };
}
async function listCameras() {
  try {
    const listed = await navigator.mediaDevices.enumerateDevices();
    cameraDevices = listed.filter((item) => item.kind === "videoinput");
    const select = $("#camera-device");
    if (!select) return;
    select.innerHTML = cameraDevices
      .map(
        (item, index) =>
          `<option value="${esc(item.deviceId)}">${esc(item.label || "Camera " + (index + 1))}</option>`,
      )
      .join("");
    select.hidden = cameraDevices.length < 2;
    if (selectedCameraId) select.value = selectedCameraId;
  } catch {
    cameraDevices = [];
  }
}
function attachStudentCamera() {
  const video = $("#student-camera");
  const retry = $('[data-action="student-camera"]');
  if (retry) retry.hidden = !!studentStream;
  if (!video) return;
  if (studentStream) {
    if (video.srcObject !== studentStream) video.srcObject = studentStream;
    video.hidden = false;
    return;
  }
  video.srcObject = null;
  video.hidden = true;
}
function startStudentCamera() {
  if (tab !== "enc" || enc?.status !== "active") return;
  if (!$("#student-camera")) return;
  if (studentStream || studentCameraTried) {
    attachStudentCamera();
    paintMedia();
    return;
  }
  studentCameraTried = true;
  if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
    cameraState = "error";
    studentCameraNote =
      "Camera and microphone need a secure page. Open " + secureDemoUrl();
    facePublic = "CAMERA_OFF";
    attachStudentCamera();
    paintMedia();
    return;
  }
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia) {
    cameraState = "missing";
    studentCameraNote = "No camera in this browser. You can still talk or type.";
    facePublic = "CAMERA_OFF";
    attachStudentCamera();
    paintMedia();
    return;
  }
  const request = ++studentCameraRequest;
  const chosen = deviceId || selectedCameraId;
  logMedia("CAMERA_REQUESTED", {});
  const audioOnly = { audio: mediaConstraints().audio, video: false };
  devices
    .getUserMedia({ video: { facingMode: "user" }, audio: false })
    .catch(() => devices.getUserMedia({ video: true, audio: false }))
    .then(
      (stream) => {
        if (
          request !== studentCameraRequest ||
          !callIsLive() ||
          tab !== "enc"
        ) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        studentStream = stream;
        studentCameraNote = "";
        attachStudentCamera();
        startPresenceCoach();
      },
      () => {
        if (request !== studentCameraRequest) return;
        studentCameraNote = "Your camera is off";
        attachStudentCamera();
      },
    );
}
function stopStudentCamera() {
  stopPresenceCoach();
  studentCameraRequest++;
  stopFaceWatch();
  stopBargeVad();
  studentStream?.getTracks().forEach((track) => track.stop());
  studentStream = null;
  studentCameraTried = false;
  cameraState = "off";
  const video = $("#student-camera");
  if (video) {
    video.srcObject = null;
    video.hidden = true;
  }
}
let presenceTimer = 0;
function startPresenceCoach() {
  if (!window.VirtuPresence || !callIsLive()) return;
  window.VirtuPresence.start({
    getVideo: () => $("#student-camera"),
  });
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => {
    const report = window.VirtuPresence.snapshot();
    if (enc?.id && report.samples && report.samples % 20 === 0) {
      api(`/api/encounters/${enc.id}/presence`, "POST", report).catch(() => {});
    }
  }, 2000);
}
function stopPresenceCoach() {
  clearInterval(presenceTimer);
  presenceTimer = 0;
  window.VirtuPresence?.stop?.();
}
async function pollTalkingVideo(turn, generation) {
  try {
    const started = await fetch(`/api/encounters/${enc.id}/talking-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: turn.id }),
    });
    if (!started.ok && started.status !== 202) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (generation !== speechGeneration) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (generation !== speechGeneration) return;
      const response = await fetch(
        `/api/encounters/${enc.id}/talking-video?turnId=${encodeURIComponent(turn.id)}`,
      );
      if (response.status === 503) return;
      const responseType = response.headers.get("content-type") || "";
      if (response.ok && responseType.includes("json")) {
        const data = await response.json().catch(() => null);
        if (data?.status === "unavailable") return;
      }
      if (response.ok && responseType.includes("video")) {
        const blob = await response.blob();
        if (generation !== speechGeneration) return;
        callVideoUrl = URL.createObjectURL(blob);
        const video = $("#av-video");
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
  if (window.VirtuSPAvatar?.ownsPlayback()) {
    stopPatientAudio();
    stopLive();
    holdMic = true;
    await VirtuSPAvatar.playTurn(turn);
    return;
  }
  stopPatientAudio();
  if (muted || tab !== "enc" || !turn || !callIsLive()) {
    holdMic = false;
    ignoreMicUntil = Date.now() + 250;
    syncLive();

    return;
  }
  const generation = speechGeneration;
  patientSpeaking = true;
  holdMic = true;
  bargeArmedAt = Date.now() + 500;
  armSpeechWatch(generation, 20000);
  visemes = visemesFromText(turn.text);
  stopLive();
  startTalkingCall(turn, generation);
  const settle = (state, text) => {
    if (generation !== speechGeneration) return;
    logMedia("TTS_FINISHED", {});
    clearSpeechWatch();
    patientSpeaking = false;
    holdMic = false;
    ignoreMicUntil = Date.now() + 280;
    stopMouth();
    pulseTalkVideo(false);
    if (!$("#avf")?.classList.contains("generated-video")) stopTalkingCall();
    voiceState(state, text);
    updateMicButton();
    syncLive();
  };
  if (health.speech === "elevenlabs-configured") {
    voiceState("thinking", "Preparing patient voice…");
    audio = new Audio(`/api/encounters/${enc.id}/speech/${turn.id}/stream`);
    audio.preload = "auto";
    audio.volume = patientVolume;
    audio.onplay = () => {
      if (generation !== speechGeneration) return;
      voiceState("speaking", "Patient speaking");
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
      voiceState("ready", "Patient speaking");
    }
  }
  if ("speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.volume = patientVolume;
    utter.onstart = () => {
      if (generation !== speechGeneration) return;
      voiceState("speaking", "Patient speaking");
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
async function question(text, inputMode) {
  const mode = inputMode === "voice" ? "voice" : "text";
  if (window.VirtuSPAvatar?.ownsPlayback()) await VirtuSPAvatar.interrupt();
  if (busy || !text.trim() || enc?.status !== "active" || !callIsLive()) return;
  window.VirtuPresence?.noteSpeech?.(text);
  stopPatientAudio();
  holdMic = true;
  busy = true;
  message = "";
  liveText = "";
  stopLive();
  turnStartedAt = performance.now();
  logMedia("PATIENT_REQUEST_STARTED", { input_mode: mode });
  voiceState("thinking", "The patient is answering…");
  updateMicButton();
  let delivered = false;
  try {
    await mutate("turn", {
      question: text,
      requestId: crypto.randomUUID(),
      inputMode: mode,
    });
    formMemory.question = "";
    delivered = true;
    lastLatencyMs = Math.round(performance.now() - turnStartedAt);
    const serverMs = enc?.transcript?.at(-1)?.latencyMs;
    logMedia("PATIENT_RESPONSE_RECEIVED", {
      latency_ms: lastLatencyMs,
      input_mode: mode,
      server_ms: Number.isFinite(serverMs) ? serverMs : 0,
    });
  } catch (e) {
    formMemory.question = text;
    message =
      e.status === 429
        ? "The server is busy. Wait a moment and send again."
        : e.message;
    logMedia("NETWORK_ERROR", { http_status: String(e.status || "") });
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
  if (!enc || enc.status !== "active" || !callIsLive()) return;
  paused = !paused;
  if (paused) {
    stopPatientAudio();
    stopLive();
    voiceState("ready", "Paused · tap the patient to resume.");
  } else {
    emptyListens = 0;
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
function secureDemoUrl() {
  const port = location.port || "3002";
  return "https://localhost:" + port + "/app.html";
}
function syncLive() {
  if (window.VirtuSPAvatar?.ownsPlayback()) {
    if (listening) stopLive();
    return;
  }
  if (
    tab !== "enc" ||
    !enc ||
    enc.status !== "active" ||
    !callIsLive() ||
    !liveSupported()
  ) {
    if (listening) stopLive();

    return;
  }
  if (window.isSecureContext === false) {
    if (listening) stopLive();
    voiceState(
      "ready",
      "Microphone needs a secure page. Open " + secureDemoUrl(),
    );
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
    if (live()) voiceState("listening", "Listening…");
    paintMedia();
  };
  rec.onresult = (e) => {
    if (!live()) return;
    const heard = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    liveText = [prefix, heard].filter(Boolean).join(" ").trim();
    window.VirtuPresence?.notePartial?.(liveText);
    if ($("#question")) $("#question").value = liveText;
    formMemory.question = liveText;
    const words = liveText.split(/\s+/).filter(Boolean).length;
    clearTimeout(silenceTimer);
    if (!words) return;
    emptyListens = 0;
    if (!utteranceStarted) {
      utteranceStarted = Date.now();
      logMedia("STUDENT_SPEECH_STARTED", {});
    }
    silenceTimer = setTimeout(commitUtterance, SILENCE_MS);
    if (Date.now() - utteranceStarted >= MAX_UTTERANCE_MS) commitUtterance();
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
    if (micIsHeld() || tab !== "enc" || enc?.status !== "active" || !callIsLive())
      return;
    if (!liveText.trim()) {
      emptyListens += 1;
      if (emptyListens >= EMPTY_LISTEN_LIMIT) {
        paused = true;
        stopLive();
        $("#avf")?.classList.add("paused");
        message =
          "The microphone recorded nothing. Type your question, or tap the patient to try again.";
        voiceState("ready", "Nothing recorded · type a question or tap to retry.");
        const toast = $(".toast");
        if (toast) {
          toast.textContent = message;
          toast.classList.remove("hidden");
        }
        updateMicButton();
        return;
      }
    } else emptyListens = 0;
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
  utteranceStarted = 0;
  const text = liveText.trim();
  liveText = "";
  if (!text || busy || enc?.status !== "active" || !callIsLive() || patientSpeaking) return;
  if ($("#question")) $("#question").value = "";
  logMedia("STUDENT_SPEECH_ENDED", {});
  logMedia("TRANSCRIPT_FINALIZED", { input_mode: "voice" });
  question(text, "voice");
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
  stopDraftDictation();
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
      patientDialog.mode === "ai"
        ? "Files attached. Choose their purpose, then Generate patient. AI reads selectable PDF/TXT text; image originals are preserved."
        : "Choose each document’s purpose, then Extract & fill form.";
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
  if (t.id === "ai-objective") {
    patientDialog.learningObjective = t.value;
    return;
  }
  if (t.dataset.catalogField && t.dataset.catalogScope === "profile") {
    profile.catalog = teaching.normalize(
      Object.fromEntries(
        ["objectives", "disciplines"].map((key) => [
          key,
          Array.from(
            document.querySelectorAll(
              `[data-catalog-scope="profile"][data-catalog-field="${key}"]:checked`,
            ),
          ).map((el) => el.value),
        ]),
      ),
    );
    profile.reviewAcknowledged = false;
    const acknowledgment = $("#field-reviewAcknowledged");
    if (acknowledgment) acknowledgment.checked = false;
    dirty = true;
    if ($("#save-status")) $("#save-status").textContent = "Unsaved changes";
    return;
  }
  if (t.id === "demo-student") loginStudent = t.value;
  if (t.id === "assign-student") selectedStudent = t.value;
  if (t.id === "new-student-alias") newStudentAlias = t.value;
  if (t.id === "patient-description") {
    stopDraftDictation();
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
    refreshGeneratedReports();
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
    if (!busy) {
      if (patientDialog.mode === "ai" && !patientDialog.generated)
        generatePatient();
      else submitPatient(true);
    }
  }
  if (e.target.id === "question-form") {
    e.preventDefault();
    question($("#question").value);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "catalog-discipline") {
      await changeDiscipline(e.target.value);
      render();
      return;
    }
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
    if (e.target.id === "files-import" || e.target.id === "folder-import") {
      await importFiles(e.target.files);
      return;
    }
    if (e.target.id === "visit-switch") {
      stopAudio();
      enc = (await api("/api/encounters/" + e.target.value)).encounter;
      render();
      return;
    }
    if (e.target.id === "import-redraft") {
      importRedraft = e.target.checked;
      return;
    }
    if (e.target.id === "csv-import") {
      const r = await api("/api/import", "POST", {
        csv: await e.target.files[0].text(),
      });
      message = `Imported ${r.added.length} drafts; skipped ${r.skipped.length} existing IDs.`;
      await refresh();
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
  if (a === "dismiss-message") {
    message = "";
    $(".toast").outerHTML = notice();
    return;
  }
  if (busy && a !== "toggle-pause") return;
  try {
    if (a === "filter-objective") {
      catalogObjective = t.dataset.objective;
      render();
      return;
    }
    if (a === "clear-catalog") {
      await changeDiscipline("");
      catalogObjective = "";
      render();
      return;
    }
    if (a === "assign-simulation") {
      const studentId = t
        .closest(".simulation-assignment")
        .querySelector("[data-assignment-student]").value;
      if (!studentId)
        throw new Error("Select a student to assign this simulation.");
      selectedStudent = studentId;
      const payload = {
        studentId,
        [t.dataset.kind === "group" ? "groupId" : "profileId"]: t.dataset.id,
      };
      busy = true;
      render();
      await api("/api/assignments", "POST", payload);
      await refresh();
      message =
        "Simulation assigned to " +
        students.find((s) => s.id === studentId).alias +
        ".";
      busy = false;
      render();
      return;
    }
    if (a === "import-files" || a === "import-folder") {
      $(a === "import-files" ? "#files-import" : "#folder-import")?.click();
      return;
    }
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
      catalogObjective = "";
      catalogDiscipline = r.preferences?.discipline || "";
      tab = demoSession.role === "student" ? "student-home" : "studio";
      await refresh();
      busy = false;
      render();
      pageTop();
      return;
    }
    if (a === "switch-role") {
      stopAudio();
      stopStudentCamera();
      stopDraftDictation();
      await api("/api/session", "DELETE");
      demoSession = null;
      catalogObjective = "";
      catalogDiscipline = "";
      enc = null;
      profile = null;
      patientDialog = null;
      history = [];
      list = [];
      facultyResults = [];
      insightsData = null;
      boardStudent = "";
      boardFocus = "";
      boardDraft = null;
      visitModal = "";
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
      pageTop();
      return;
    }
    if (a === "create-group") {
      const payload = {
        title: $("#group-title").value,
        purpose: $("#group-purpose").value,
        kind: $("#group-kind").value,
        availableToAll: true,
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
        $(".toast").outerHTML = notice();
        return;
      }
    }
    if (a === "add-student") {
      const alias = newStudentAlias;
      await api("/api/students", "POST", { alias });
      newStudentAlias = "";
      await refresh();
    }
    if (a === "start-test" || a === "start-available") {
      const route = a === "start-available" ? "groups" : "assignments";
      const r = await api(`/api/${route}/${t.dataset.id}/start`, "POST", {});
      if (r.attempt.status === "complete") {
        enc = (await api(`/api/encounters/${r.attempt.trials[0].encounterId}`))
          .encounter;
        tab = r.attempt.kind === "individual" ? "rep" : "history";
        await refresh();
      } else {
        const n = await api(`/api/attempts/${r.attempt.id}/next`, "POST", {});
        enc = n.encounter;
        localStorage.setItem("virtusp-active-v2", enc.id);
        section = "ov";
        tab = "enc";
        paused = false;
        holdMic = false;
        patientSpeaking = false;
        voiceDisplay = { state: "ready", text: "Ready for your question" };
        joinVisit();
      }
    }
    if (a === "next-test") {
      const r = await api(`/api/attempts/${t.dataset.id}/next`, "POST", {});
      enc = r.encounter;
      localStorage.setItem("virtusp-active-v2", enc.id);
      section = "ov";
      tab = "enc";
      joinVisit();
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
      if (["bias", "performance"].includes(tab)) await loadInsights();
      if (tab === "rep" && !enc) await openLatestVisit(true);
    }
    if (a === "board-focus") boardFocus = t.dataset.focus;
    if (a === "board-pick") {
      boardStudent = t.dataset.student;
      boardFocus = "";
      boardDraft = null;
    }
    if (a === "module-toggle") {
      const assigned = t.dataset.assigned !== "true";
      const topic =
        insightsData.students
          .find((s) => s.student.id === boardStudent)
          ?.modules.find((m) => m.id === t.dataset.module)?.title ||
        "Learning topic";
      busy = true;
      render();
      const response = await api(
        `/api/insights/modules/${boardStudent}/${t.dataset.module}`,
        "PUT",
        { assigned },
      );
      await loadInsights();
      message = assigned
        ? `${topic} assigned to ${response.student.alias}. It appears under Faculty learning topics on their assessments page.`
        : `${topic} removed from ${response.student.alias}'s learning topics.`;
    }
    if (a === "assign-case-from-board") {
      selectedStudent = t.dataset.student;
      catalogObjective = "";
      catalogDiscipline = "";
      tab = "studio";
      await refresh();
      message = `Choose a simulation to assign to ${students.find((s) => s.id === selectedStudent).alias}.`;
      pageTop();
    }
    if (a === "board-add-prompt") {
      const current = $("#board-notes").value.trim();
      boardDraft = (current ? current + "\n\n" : "") + t.dataset.prompt;
      message = "Added to the notes below. Save to keep it.";
    }
    if (a === "visit-open") visitModal = t.dataset.id;
    if (a === "visit-close" || a === "resume" || a === "nav") visitModal = "";
    if (a === "save-board-notes") {
      await api(`/api/insights/notes/${boardStudent}`, "PUT", {
        text: $("#board-notes").value,
        flagged: $("#board-flag").checked,
      });
      boardDraft = null;
      await loadInsights();
      message = "Faculty notes saved.";
    }
    if (a === "import-dismiss") importReport = null;
    if (a === "publish-draft" || a === "publish-drafts") {
      const targets =
        a === "publish-draft"
          ? list.filter((p) => p.id === t.dataset.id)
          : list.filter((p) => !p.version);
      const published = [],
        blocked = [];
      for (const p of targets)
        try {
          await api("/api/profiles/" + p.id + "/publish", "POST", {
            acknowledge: true,
          });
          published.push(p.name);
        } catch (err) {
          blocked.push(`${p.name} (${err.message})`);
        }
      issues = [];
      await refresh();
      message =
        (published.length
          ? `Published ${published.join(", ")}. Start assessment is now available.`
          : "") +
        (blocked.length
          ? ` Not published, open Edit to fix: ${blocked.join("; ")}`
          : "");
    }
    if (a === "delete-ask") deleteAsk = t.dataset.id;
    if (a === "delete-cancel") deleteAsk = "";
    if (a === "delete-confirm") {
      const r = await api("/api/profiles/" + t.dataset.id, "DELETE");
      deleteAsk = "";
      if (profile?.id === t.dataset.id) profile = null;
      await refresh();
      message = `Deleted ${r.name}. Import the case again to bring it back.`;
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
    if (a === "new-ai") {
      if (dirty) await save();
      stopAudio();
      tab = "studio";
      openPatientDialog("ai");
    }
    if (a === "dictate-patient") {
      dictatePatient();
      return;
    }
    if (["generate-ai", "random-ai", "regenerate-ai"].includes(a)) {
      await generatePatient(
        a === "random-ai" ||
          (a === "regenerate-ai" && patientDialog.lastRandom),
      );
      return;
    }
    if (a === "edit-ai-details") {
      patientDialog.editGenerated = !patientDialog.editGenerated;
    }
    if (a === "change-ai-brief" || a === "back-ai-review") {
      stopDraftDictation();
      patientDialog.generated = a === "back-ai-review";
      patientDialog.notice = "";
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
      paused = false;
      holdMic = false;
      patientSpeaking = false;
      voiceDisplay = { state: "ready", text: "Ready for your question" };
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
      joinVisit();
      return;
    }
    if (a === "answer-call") {
      joinVisit();
      return;
    }
    if (a === "student-camera") {
      if (studentStream && cameraState === "on") {
        stopStudentCamera();
        studentCameraTried = true;
        cameraState = "off";
        studentCameraNote = "Camera off. Voice and typing still work.";
        facePublic = "CAMERA_OFF";
        paintMedia();
        return;
      }
      studentCameraTried = false;
      studentCameraNote = "";
      startStudentCamera(selectedCameraId);
      return;
    }
    if (a === "toggle-captions") {
      captionsOn = !captionsOn;
      render();
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
      if (tab === "enc") joinVisit();
    }
    if (a === "section") {
      if (enc.status === "active")
        await mutate("open", { section: t.dataset.section });
      section = t.dataset.section;
      render();
      // A shorter tab can otherwise leave its first note behind the sticky
      // chart header at the previous tab's scroll position.
      // With the banner and its tabs pinned, the page returns to the top so
      // the visit and the chart both start just below them.
      if (sideMenu()) window.scrollTo?.({ top: 0, behavior: "instant" });
      else
        $(".ehr-panel")?.scrollIntoView?.({
          block: "start",
          behavior: "instant",
        });
      return;
    }
    if (a === "expand-doc") {
      if (
        enc.status === "active" &&
        (!enc.studentId || demoSession.role === "student")
      )
        await mutate("view", { artifactId: t.dataset.id });
      expandedDocId = t.dataset.id;
    }
    if (a === "close-doc") expandedDocId = "";
    if (a === "review") await mutate("review", { artifactId: t.dataset.id });
    if (a === "review-section")
      await mutate("review", { section: t.dataset.section });
    if (a === "complete") {
      const presence = window.VirtuPresence?.snapshot?.();
      stopAudio();
      stopStudentCamera();
      busy = true;
      message = "Saving the visit…";
      render();
      await mutate("complete", presence ? { presence } : {});
      repView = "summary";
      await refresh();
      busy = false;
      tab = "rep";
      message = enc?.assessment?.pending
        ? "Visit saved. Your feedback is ready; the rubric ratings will appear in under a minute."
        : "Encounter saved.";
      watchAssessment();
    }
    if (a === "toggle-pause") {
      togglePause();
      return;
    }
    if (a === "mic") {
      syncLive();
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
      paintMedia();
      return;
    }
    if (a === "adopt-suggestion") {
      const s = (profile.suggestions || []).find((item) => item.id === t.dataset.id);
      const id = "awareness-" + String(s?.fromArtifact || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (s && id.length > 10 && !profile.facts.some((f) => f.id === id)) {
        profile.facts.push({
          ...s,
          id,
          reviewed: false,
          awarenessApproved: false,
          origin: "document-suggestion",
        });
        profile.suggestions = profile.suggestions.filter((item) => item.id !== s.id);
        profile.reviewAcknowledged = false;
        dirty = true;
      }
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
    if (a === "nav") pageTop();
    syncVisitMedia();
  } catch (err) {
    busy = false;
    if (patientDialog) patientDialog.notice = err.message;
    else message = err.message;
    render();
  }
});
function themeName() {
  const saved = localStorage.getItem("virtusp-theme");
  if (saved === "auto" || saved === "dark" || saved === "light") return saved;
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function applyTheme(name) {
  const theme = name === "dark" || name === "auto" ? name : "light";
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  localStorage.setItem("virtusp-theme", theme);
  const btn = document.getElementById("themeBtn");
  if (!btn) return;
  const label = theme === "dark" ? "Dark" : theme === "auto" ? "Auto" : "Light";
  btn.textContent = "Theme: " + label;
  btn.setAttribute(
    "aria-label",
    "Theme: " + label + ". Choose light, dark, or match this device.",
  );
}
function toggleTheme() {
  const order = ["light", "dark", "auto"];
  const current = themeName();
  applyTheme(order[(order.indexOf(current) + 1) % order.length]);
}
document.getElementById("themeBtn")?.addEventListener("click", toggleTheme);
document.addEventListener("change", (e) => {
  if (e.target.id === "visit-patient") return filterVisits();
  if (e.target.id !== "board-student") return;
  boardStudent = e.target.value;
  message = "";
  boardFocus = "";
  boardDraft = null;
  render();
});
// Dropping files or a folder anywhere on Patient Studio starts an import.
const studioDrop = (e) =>
  tab === "studio" &&
  demoSession?.role === "faculty" &&
  !patientDialog &&
  e.target.closest?.(".studio") &&
  [...(e.dataTransfer?.types || [])].includes("Files");
document.addEventListener("dragover", (e) => {
  if (studioDrop(e)) e.preventDefault();
});
document.addEventListener("drop", async (e) => {
  if (!studioDrop(e)) return;
  e.preventDefault();
  await importFiles(await droppedFiles(e.dataTransfer));
});
document.addEventListener("input", (e) => {
  if (e.target.id === "import-note") importNote = e.target.value;
  if (e.target.id === "visit-search") filterVisits();
  // Keep typed notes across re-renders until they are saved.
  if (e.target.id === "board-notes") boardDraft = e.target.value;
});
// A patient without a portrait falls back to initials.
document.addEventListener(
  "error",
  (e) => {
    if (e.target.matches?.(".pt-avatar img")) e.target.remove();
  },
  true,
);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !visitModal) return;
  visitModal = "";
  render();
});
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
window.addEventListener("pagehide", () => {
  stopStudentCamera();
  stopAudio();
});
window.addEventListener("beforeunload", (e) => {
  stopInterviewTimer();
  stopAudio();
  stopStudentCamera();
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function boot() {
  try {
    applyTheme(themeName());
    try {
      faceAnchors = await (await fetch("/img/faces.json")).json();
    } catch {
      faceAnchors = null;
    }
    students = (await api("/api/students")).students;
    const entry = await api("/api/session");
    demoSession = entry.session;
    catalogDiscipline = entry.preferences?.discipline || "";
    if (!demoSession) {
      await refresh();
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
    if (
      enc?.status === "active" &&
      callIsLive() &&
      !enc.interviewStartedAt
    ) {
      try {
        await mutate("begin", {});
      } catch (error) {
        message = error.message;
      }
    }
    render();
    syncVisitMedia();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="pn"><h1>Server unavailable</h1><p>${esc(e.message)}</p><p>Start this app with npm start; static-only hosting cannot run encounters.</p><button class="btn" id="boot-retry" type="button">Retry</button></div>`;
    document.getElementById("boot-retry")?.addEventListener("click", () => {
      location.reload();
    });
  }
}
window.VirtuSPAvatar?.configure({
  submitQuestion: (text) => question(text),
  stopLocalAudio: () => stopPatientAudio(),
  onPlaybackSettled() {
    holdMic = false;
    patientSpeaking = false;
    ignoreMicUntil = Date.now() + 280;
    syncLive();
  },
  setMuted(value) {
    muted = value;
  },
  isMuted: () => muted,
  getEncounter: () => enc,
});
boot();
