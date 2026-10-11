"use strict";

const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const timeline = document.querySelector("#timeline");
const labels = new Set([
  "Live AWS telemetry",
  "Local synthetic test telemetry",
  "No data",
  "Stale data",
  "Not configured",
  "Not assessed",
]);

function show(node, text) {
  status.hidden = false;
  status.textContent = text;
  node.hidden = true;
}

async function read(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

function chart(cards) {
  const numeric = cards.filter(([, value]) => typeof value === "number");
  if (!numeric.length) return "<p>No data</p>";
  const max = Math.max(...numeric.map(([, value]) => value), 1);
  return `<div class="obs-chart">${numeric
    .map(([name, value]) => {
      const width = Math.round((100 * value) / max);
      return `<div class="obs-bar"><span>${escapeText(name)}</span><i style="width:${width}%"></i><b>${value}</b></div>`;
    })
    .join("")}</div>`;
}

function renderSummary(body) {
  const label = labels.has(body.label) ? body.label : "Not configured";
  status.textContent = label;
  if (label === "No data" || label === "Not configured") {
    summary.hidden = false;
    summary.innerHTML = `<p>${label}</p><p class="muted">Generated ${escapeText(body.generatedAt || "—")}. Source ${escapeText(body.source || "none")}.${body.errorCode ? ` ${escapeText(body.errorCode)}` : ""}</p>`;
    return;
  }
  const counts = body.counts || {};
  const cards = [
    ["API successes", counts.apiSuccess],
    ["API failures", counts.apiFailure],
    ["Approved turns", counts.turns],
    ["Persistence failures", counts.persistenceFailures],
    ["Blocked before delivery", counts.blocked],
    ["Confirmed unsupported", counts.confirmedUnsupported],
    ["Fallbacks", counts.fallbacks],
  ];
  const objectives = (body.objectives || [])
    .map((item) => {
      const state = item.sampleCount ? item.status : "insufficient_data";
      const shown = item.value == null ? "Not assessed" : `${Math.round(item.value * 1000) / 10}%`;
      return `<article class="obs-card"><span>${item.id}</span><strong>${shown}</strong><small>${state} · ${item.sampleCount} samples · target ${item.target}</small></article>`;
    })
    .join("");
  summary.hidden = false;
  summary.innerHTML = `<p class="muted">${label} · ${escapeText(body.generatedAt)} · ${escapeText(body.environment || "")} · build ${escapeText(body.buildVersion || "unknown")}</p>
    ${chart(cards)}
    <div class="obs-grid">${cards
      .map(
        ([name, value]) =>
          `<article class="obs-card"><span>${name}</span><strong>${value == null ? "No data" : value}</strong></article>`,
      )
      .join("")}${objectives}</div>`;
}

async function load() {
  show(summary, "Loading");
  const range = document.querySelector("#range").value;
  try {
    const { response, body } = await read(`/api/observability/summary?range=${encodeURIComponent(range)}`);
    if (response.status === 401 || response.status === 403) {
      show(summary, "Not configured");
      status.textContent = "Permission denied. Open this page from a faculty session.";
      document.querySelector("#alarms").textContent = "Permission denied.";
      return;
    }
    if (!response.ok) {
      show(summary, "Not configured");
      return;
    }
    renderSummary(body);
    loadAlarms();
  } catch {
    show(summary, "Not configured");
  }
}

async function loadAlarms() {
  const node = document.querySelector("#alarms");
  const { response, body } = await read("/api/observability/alarms");
  if (response.status === 401 || response.status === 403) {
    node.textContent = "Permission denied.";
    return;
  }
  const label = labels.has(body.label) ? body.label : "Not configured";
  const rows = (body.alarms || [])
    .map(
      (alarm) =>
        `<article class="obs-event"><strong>${escapeText(alarm.name)}</strong><small>${escapeText(alarm.state)} · ${escapeText(alarm.updated || "Not assessed")}</small></article>`,
    )
    .join("");
  node.innerHTML = `<h2>Alarms</h2><p>${label}</p>${rows}<p class="muted">${escapeText(body.note || body.errorCode || "")}</p>`;
}

document.querySelector("#filters").addEventListener("submit", (event) => {
  event.preventDefault();
  load();
});

document.querySelector("#lookup").addEventListener("submit", async (event) => {
  event.preventDefault();
  timeline.textContent = "Loading";
  const requestId = document.querySelector("#requestId").value.trim();
  const encounterId = document.querySelector("#encounterId").value.trim();
  const path = encounterId
    ? `/api/observability/timeline?encounterId=${encodeURIComponent(encounterId)}`
    : `/api/observability/lookup?requestId=${encodeURIComponent(requestId)}`;
  const { response, body } = await read(path);
  if (response.status === 401 || response.status === 403) {
    timeline.textContent = "Permission denied.";
    return;
  }
  if (!response.ok) {
    timeline.textContent = body.label || "No data";
    return;
  }
  const events = body.events || [];
  if (!events.length) {
    timeline.textContent = "No data";
    return;
  }
  const link = body.links && body.links.traces
    ? `<p><a href="${body.links.traces}">Trace</a></p>`
    : `<p>${(body.links && body.links.label) || "Not configured"}</p>`;
  timeline.innerHTML = `<p>${body.label || "No data"} · version ${body.profileVersion ?? "—"}</p>${link}${events
    .map(
      (item) =>
        `<article class="obs-event"><strong>${item.operation || item.event_name}</strong><small>${item.at || item.timestamp} · ${item.outcome || "Not assessed"} · ${item.reason || item.error_code || ""}</small></article>`,
    )
    .join("")}`;
});

load();
