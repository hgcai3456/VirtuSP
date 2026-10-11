"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { record, sanitize } = require("../lib/media-events");

test("media events keep timing metadata and drop biometric payloads", () => {
  const enc = { events: [] };
  const saved = record(
    enc,
    {
      type: "CAMERA_GRANTED",
      metadata: {
        latency_ms: 42.2,
        input_mode: "voice",
        embedding: [1, 2, 3],
        frame: "data:image/jpeg;base64,AAAA",
        note: "data:image/png;base64,BBBB",
      },
    },
    (target, type, detail) => {
      const event = { id: "e1", type, ...detail };
      target.events.push(event);
      return event;
    },
  );
  assert.equal(saved.type, "CAMERA_GRANTED");
  assert.equal(saved.metadata.latency_ms, 42);
  assert.equal(saved.metadata.input_mode, "voice");
  assert.equal(saved.metadata.embedding, undefined);
  assert.equal(saved.metadata.frame, undefined);
  assert.equal(saved.metadata.note, undefined);
  assert.deepEqual(sanitize({ token: "secret", ok: true }), { ok: true });
});

test("unknown encounter events are rejected", () => {
  assert.throws(
    () => record({ events: [] }, { type: "FACE_EMBEDDING" }, () => {}),
    (error) => error.status === 422,
  );
});
