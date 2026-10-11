"use strict";
const assets = require("../corpus/portrait-map.json");
function portraitFile(p) {
  // Authored identity mappings, not guesses based on gender, ethnicity or name.
  return Object.hasOwn(assets, p?.id) ? assets[p.id] : "patient-avatar.svg";
}
module.exports = { portraitFile };
