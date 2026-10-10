"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { patientRecords, profileDocuments } = require("../lib/corpus");

test("Organizer concatenated JSON normalizes without changing source values", () => {
  const records = [
    {
      patient_overview: { name: 'Patient {A} "quoted"', age: 45 },
      details: { text: "backslash \\ and braces } {" },
    },
    {
      patient_overview: { name: "Patient B", age: null },
      measurements: [{ value: 123, unit: "unspecified" }],
    },
  ];
  const text = records
    .map((record) => JSON.stringify(record, null, 2))
    .join("\n\n");
  assert.deepEqual(patientRecords(text), records);
  assert.throws(() => patientRecords(text.slice(0, -1)), /Incomplete/);
  assert.throws(() => patientRecords(text + "not JSON"), /Expected/);
  assert.throws(
    () => patientRecords('{"patient_overview":{}}'),
    /name missing/,
  );
});

test("Upload documents preserve disclosure and keep hidden material and assumptions separate", () => {
  const record = {
    patient_overview: { name: "Test Patient", age: 45 },
    clinical_profile: { result: "123, units unspecified" },
    information_disclosure: {
      initial_information: ["Name: Test Patient"],
      reluctant_information: ["I miss doses"],
      hidden_information: ["Protected chart finding"],
    },
    metadata: { assumption: "Unapproved optional detail" },
  };
  const documents = profileDocuments(record, {
    url: "https://example.test/source",
    revision: "abc123",
  });
  assert.ok(documents["case-brief.txt"].includes("I miss doses"));
  assert.ok(documents["case-brief.txt"].includes("guarded disclosure rule"));
  assert.ok(!documents["case-brief.txt"].includes("Protected chart finding"));
  assert.ok(
    !documents["case-brief.txt"].includes("Unapproved optional detail"),
  );
  assert.ok(
    documents["clinical-record.txt"].includes("Protected chart finding"),
  );
  assert.ok(
    documents["clinical-record.txt"].includes("123, units unspecified"),
  );
  assert.ok(
    documents["faculty-notes.txt"].includes("Unapproved optional detail"),
  );
  for (const text of Object.values(documents)) {
    assert.ok(text.includes("abc123"));
    assert.ok(text.includes("Rutgers University"));
  }
});
