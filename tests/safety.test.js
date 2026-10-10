"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { blank, fact } = require("../lib/profiles");
const engine = require("../lib/engine");
const {
  EMERGENCY_TEXT,
  EMPATHY_LEAD,
  criticalPatientText,
  empathyLead,
} = require("../lib/safety");

test("Critical patient speech is the crisis line, not ordinary help-seeking", () => {
  assert.equal(
    criticalPatientText(
      "Hi. I wasn't sure I should text, but I need help. Things have been really heavy.",
    ),
    false,
  );
  assert.equal(criticalPatientText("I feel safe with my sister nearby."), false);
  assert.equal(criticalPatientText("I eat a healthy diet."), false);
  assert.equal(criticalPatientText(""), false);
  assert.equal(criticalPatientText(null), false);
  for (const line of [
    "I do not feel safe.",
    "I don't feel safe.",
    "I dont feel safe.",
    "I have been thinking about ending my life.",
    "Have you thought about ending your life?".replace(
      "Have you thought about ",
      "I am ",
    ),
    "I want to die.",
    "I might hurt myself.",
    "I might hurt someone.",
  ])
    assert.equal(criticalPatientText(line), true, line);
});

test("An empathetic lead is added once", () => {
  assert.equal(empathyLead("Okay, I'm listening."), `${EMPATHY_LEAD} Okay, I'm listening.`);
  assert.equal(
    empathyLead(`${EMPATHY_LEAD} Okay, I'm listening.`),
    `${EMPATHY_LEAD} Okay, I'm listening.`,
  );
});

test("Only a text visit adds the empathetic lead, and 911 is recorded once", async () => {
  process.env.AI_ENABLED = "false";
  const seeds = JSON.parse(await fs.readFile("corpus/scaffold.json", "utf8"));
  const riley = seeds.find((patient) => patient.id === "riley");
  riley.version = 1;
  assert.equal(criticalPatientText(riley.intro), false);
  assert.equal(
    criticalPatientText(riley.facts.find((item) => item.id === "r5").say),
    true,
  );

  const enc = engine.create(riley);
  assert.equal(enc.emergency, undefined);
  await engine.ask(enc, "I am sorry this has been so hard.", "kind");
  assert.match(enc.transcript.at(-1).text, new RegExp("^" + EMPATHY_LEAD));
  assert.equal(enc.emergency, undefined);

  const visit = engine.create({
    ...blank(),
    name: "Ada Synthetic",
    version: 1,
    age: 40,
    channel: "visit",
    facts: [
      fact("concern", "Tired", {
        say: "I feel tired.",
        topic: "Reason for visit",
        kw: ["tired"],
      }),
    ],
    artifacts: [],
    obj: [],
    sources: [],
  });
  await engine.ask(visit, "I am sorry you feel tired.", "visit-kind");
  assert.equal(visit.transcript.at(-1).text, "I feel tired.");
  assert.equal(visit.transcript.at(-1).text.includes(EMPATHY_LEAD), false);

  await engine.ask(enc, "I hear how heavy this feels.", "kind-2");
  await engine.ask(
    enc,
    "Do you feel safe right now, or have you thought about ending your life?",
    "safety",
  );
  assert.equal(enc.emergency.service, "911");
  assert.equal(enc.emergency.text, EMERGENCY_TEXT);
  const alerts = enc.events.filter((event) => event.type === "emergency");
  await engine.ask(
    enc,
    "Do you feel safe right now, or have you thought about ending your life?",
    "safety-again",
  );
  assert.equal(enc.events.filter((event) => event.type === "emergency").length, alerts.length);
  assert.equal(engine.publicView(enc).emergency.service, "911");
});
