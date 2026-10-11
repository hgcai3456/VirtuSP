(function (root) {
  "use strict";
  const objectives = [
    { id: "communication", label: "Communication and empathy" },
    { id: "history", label: "Gather a patient history" },
    { id: "medications", label: "Medication review and shared decisions" },
    { id: "nutrition", label: "Nutrition counseling" },
    { id: "mobility", label: "Mobility and fall safety" },
    { id: "urgent-referral", label: "Recognize when urgent referral is needed" },
  ];
  const disciplines = [
    { id: "medicine", label: "Medicine" },
    { id: "nursing", label: "Nursing" },
    { id: "pa", label: "Physician assistant" },
    { id: "nutrition", label: "Nutrition / dietetics" },
    { id: "physical-therapy", label: "Physical therapy" },
  ];
  function normalize(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Object.assign(new Error("Choose valid teaching categories."), { status: 400 });
    const result = {};
    for (const [key, choices] of [["objectives", objectives], ["disciplines", disciplines]]) {
      const selected = value[key] ?? [];
      if (!Array.isArray(selected) || selected.some(id => !choices.some(c => c.id === id)))
        throw Object.assign(new Error("Choose valid " + key + " from the teaching categories."), { status: 400 });
      result[key] = [...new Set(selected)];
    }
    return result;
  }
  // Legacy cases use their already-authored teaching objective titles only.
  // Never inspect clinical facts, answer keys, case descriptions or demographics.
  const patterns = {
    communication: /empath|rapport|respect|communication|shared decision|concern|trust|judg/i,
    history: /history|information gather|symptom|elicit|explore|assess/i,
    medications: /medication|medicine|statin|adherence|regimen|missed dose|side.effect/i,
    nutrition: /nutrition|diet|food|meal|eating/i,
    mobility: /mobility|fall|balance|walking|exercise|physical therap/i,
    "urgent-referral": /emergency|urgent|\bER\b|\b911\b|red.flag/i,
  };
  function forProfile(p) {
    if (p?.catalog !== undefined) return normalize(p.catalog);
    const titles = (p?.obj || []).map(o => typeof o.t === "string" ? o.t : "").join("\n");
    return { objectives: objectives.filter(o => patterns[o.id].test(titles)).map(o => o.id), disciplines: [] };
  }
  function groupCatalog(profiles) {
    if (!profiles.length) return { objectives: [], disciplines: [] };
    const values = profiles.map(forProfile);
    const common = objectives.filter(o => values.every(v => v.objectives.includes(o.id))).map(o => o.id);
    const supported = disciplines.filter(d => values.every(v => !v.disciplines.length || v.disciplines.includes(d.id))).map(d => d.id);
    // Empty means no discipline restriction; an incompatible group gets no match.
    return { objectives: common, disciplines: supported, disciplineMismatch: supported.length === 0 };
  }
  function matches(value, objective = "", discipline = "") {
    return (!objective || value.objectives.includes(objective)) &&
      (!discipline || (!value.disciplineMismatch && (!value.disciplines.length || value.disciplines.includes(discipline))));
  }
  const api = { objectives, disciplines, normalize, forProfile, groupCatalog, matches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VirtuCatalog = api;
})(typeof window !== "undefined" ? window : globalThis);
