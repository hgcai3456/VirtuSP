"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFacePresence,
  createConversation,
  faceLabel,
} = require("../public/js/encounter-runtime");

test("face presence ignores a brief loss and notices a sustained one", () => {
  const faces = createFacePresence({ graceMs: 3000 });
  assert.equal(faces.state(), "CAMERA_OFF");
  assert.equal(faces.observe(1, 0), "CAMERA_OFF");
  assert.equal(faces.cameraOn(), "NO_FACE");
  assert.equal(faces.observe(0, 1000), "NO_FACE");
  assert.equal(faceLabel(faces.observe(1, 1100)), "Face detected");
  assert.equal(faces.observe(0, 2000), "FACE_DETECTED");
  assert.equal(faces.observe(0, 5100), "FACE_LOST");
  assert.equal(faceLabel("FACE_LOST"), "Move into frame");
  assert.equal(faces.observe(2, 4200), "MULTIPLE_FACES");
  assert.equal(faceLabel("MULTIPLE_FACES"), "More than one face detected");
  assert.equal(faces.cameraOff(), "CAMERA_OFF");
  assert.equal(faceLabel("CAMERA_OFF"), "Camera off");
});

test("conversation state follows a turn, an interruption, pause, failure, and end", () => {
  const talk = createConversation();
  assert.equal(talk.start(), "LISTENING");
  assert.equal(talk.studentSpeech(), "STUDENT_SPEAKING");
  assert.equal(talk.silence(), "TRANSCRIBING");
  assert.equal(talk.submit(), "PATIENT_THINKING");
  assert.equal(talk.patientSpeaks(), "PATIENT_SPEAKING");
  assert.equal(talk.studentSpeech(), "INTERRUPTED");
  assert.equal(talk.pause(), "PAUSED");
  assert.equal(talk.studentSpeech(), "PAUSED");
  assert.equal(talk.resume(), "LISTENING");
  assert.equal(talk.fail(), "ERROR");
  assert.equal(talk.retry(), "LISTENING");
  assert.equal(talk.end(), "ENDED");
  assert.equal(talk.start(), "ENDED");
  assert.equal(talk.studentSpeech(), "ENDED");
});
