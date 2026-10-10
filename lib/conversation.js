"use strict";
const UNKNOWN = "I'm not sure about that.";
const UNKNOWNS = [
  "I'm not sure about that.",
  "I don't know.",
  "I couldn't tell you.",
  "That's not something I know.",
  "I haven't been told that.",
  "I'm not sure I can say.",
];
const UNKNOWN_SET = new Set(UNKNOWNS);
function isUnknownReply(text) {
  return UNKNOWN_SET.has(String(text || "").trim());
}
function nextUnknown(enc) {
  const used = (enc?.transcript || []).filter(
    (t) => t.role === "patient" && isUnknownReply(t.text),
  ).length;

  return UNKNOWNS[used % UNKNOWNS.length];
}
// Exact, server-owned courtesies contain no patient health claims. They are
// separate from clinical generation, whose fact citation rules remain strict.
function conversationalReply(profile, question) {
  const text = question
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, "")
    .trim();
  const names = ["", "there", profile.name, profile.name.split(" ")[0]].map(
    (n) => n.toLowerCase(),
  );
  for (const greeting of [
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
  ])
    if (names.some((name) => text === greeting + (name ? " " + name : "")))
      return "Hello.";
  if (
    [
      "can you hear me",
      "could you hear me",
      "did you hear me",
      "can you read this",
      "are you there",
      "is this working",
    ].includes(text)
  )
    return "Yes, your message came through.";
  if (
    [
      "thanks",
      "thank you",
      "thanks for sharing",
      "thank you for sharing",
    ].includes(text)
  )
    return "You're welcome.";
  if (
    [
      "how are you",
      "how are you today",
      "how are you doing",
      "how's it going",
    ].includes(text)
  )
    return "I'm doing all right. Thanks for asking.";
  if (["ok", "okay", "alright", "all right"].includes(text))
    return "I'm listening.";

  return null;
}
module.exports = {
  UNKNOWN,
  UNKNOWNS,
  isUnknownReply,
  nextUnknown,
  conversationalReply,
};
