"use strict";
const UNKNOWN = "I'm not sure about that.";
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
  if (["ok", "okay", "alright", "all right"].includes(text))
    return "I'm listening.";
  return null;
}
module.exports = { UNKNOWN, conversationalReply };
