"use strict";

// Patient speech only. These phrases mark immediate danger for a teaching
// encounter. They do not describe methods.
const CRITICAL = [
  "suicidal",
  "want to die",
  "kill myself",
  "end my life",
  "ending my life",
  "ending your life",
  "better off dead",
  "want to kill myself",
  "hurt myself",
  "harm myself",
  "kill someone",
  "hurt someone",
  "do not feel safe",
  "don't feel safe",
  "dont feel safe",
];

const EMERGENCY_TEXT =
  "Call 911 now. The patient described immediate danger. In the United States, you can also call or text 988. This teaching encounter records the alert and does not place the emergency call.";

const EMPATHY_LEAD = "Thank you for saying that.";

function criticalPatientText(text) {
  const lower = String(text || "").toLowerCase();
  return CRITICAL.some((phrase) => lower.includes(phrase));
}

function empathyLead(text) {
  const body = String(text || "").trim();
  if (body.toLowerCase().startsWith(EMPATHY_LEAD.toLowerCase())) return body;
  return `${EMPATHY_LEAD} ${body}`;
}

module.exports = {
  CRITICAL,
  EMERGENCY_TEXT,
  EMPATHY_LEAD,
  criticalPatientText,
  empathyLead,
};
