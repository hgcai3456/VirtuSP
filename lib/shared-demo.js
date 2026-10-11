"use strict";
const { clone, validate } = require("./profiles");
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function content(p) {
  const copy = clone(p);
  delete copy.version;
  return JSON.stringify(stable(copy));
}
function mergeBundle(state, bundle) {
  if (bundle.schema !== 1 || bundle.synthetic !== true || !Array.isArray(bundle.profiles) || !Array.isArray(bundle.groups)) throw new Error("Expected the synthetic demo case bundle.");
  const ids = new Set();
  for (const p of bundle.profiles) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id || "") || ["__proto__", "constructor", "prototype"].includes(p.id) || ids.has(p.id)) throw new Error("Invalid or duplicate case ID.");
    ids.add(p.id);
    // Bundled demo releases can be unreviewed; preserve that status explicitly.
    if (validate({...p, reviewAcknowledged: p.preparedDemo ? true : p.reviewAcknowledged}).some(i => i.severity === "error")) throw new Error("Invalid published case: " + p.name);
    if ([p.portraitFileId, ...p.sources.map(x => x.fileId), ...p.artifacts.map(x => x.fileId)].some(Boolean)) throw new Error("This bundle must have self-contained case records.");
  }
  for (const g of bundle.groups) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(g.id || "") || ["__proto__", "constructor", "prototype"].includes(g.id) || !Array.isArray(g.profileIds) || g.profileIds.some(id => !ids.has(id))) throw new Error("Invalid shared group.");
  }
  const result = clone(state);
  result.groups ||= {};
  const report = { added: [], published: [], unchanged: [], preservedDrafts: [], preservedGroups: [] };
  for (const p of bundle.profiles) {
    const releases = result.releases.filter(r => r.p.id === p.id);
    const latest = releases.at(-1);
    const draft = result.drafts[p.id];
    const editedDraft = draft && (!latest || content(draft) !== content(latest.p));
    if (latest && content(latest.p) === content(p)) report.unchanged.push(p.name);
    else {
      const version = Math.max(0, ...releases.map(r => r.p.version)) + 1;
      result.releases.push({p:{...clone(p), version}, at:new Date().toISOString(), kind:"shared-synthetic-demo"});
      (latest ? report.published : report.added).push(p.name);
    }
    if (editedDraft) report.preservedDrafts.push(p.name);
    else {
      result.drafts[p.id] = clone(p);
      delete result.drafts[p.id].version;
    }
  }
  for (const g of bundle.groups) {
    if (!result.groups[g.id]) result.groups[g.id] = clone(g);
    else if (JSON.stringify(stable(result.groups[g.id])) !== JSON.stringify(stable(g))) report.preservedGroups.push(g.title);
  }
  return {state:result, report};
}
module.exports = { mergeBundle };
