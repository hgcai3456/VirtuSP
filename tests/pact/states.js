"use strict";

async function call(base, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (options.expect && response.status !== options.expect) {
    throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${text.slice(0, 400)}`);
  }
  return { status: response.status, data, response };
}

function cookieFrom(response) {
  const listed = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const line = listed.find((item) => item.startsWith("virtusp_demo=")) || response.headers.get("set-cookie") || "";
  const pair = line.split(";")[0];
  if (!pair.startsWith("virtusp_demo=")) throw new Error("Session cookie was not set.");
  return pair;
}

async function faculty(base) {
  const login = await call(base, "/api/session", {
    method: "POST",
    body: { role: "faculty" },
    expect: 200,
  });
  return { cookie: cookieFrom(login.response) };
}

async function studentIdentity(base) {
  const list = await call(base, "/api/students", { expect: 200 });
  const student = list.data.students && list.data.students[0];
  if (!student || !student.id) throw new Error("No demo student is available.");
  return { studentId: student.id };
}

async function student(base) {
  const identity = await studentIdentity(base);
  const login = await call(base, "/api/session", {
    method: "POST",
    body: { role: "student", studentId: identity.studentId },
    expect: 200,
  });
  return { cookie: cookieFrom(login.response), studentId: identity.studentId };
}

async function draft(base) {
  const session = await faculty(base);
  const created = await call(base, "/api/profiles", {
    method: "POST",
    cookie: session.cookie,
    body: { starter: { name: "Pact Rivera", age: 34, concern: "I need a contract check." } },
    expect: 201,
  });
  return { cookie: session.cookie, profileId: created.data.profile.id };
}

async function encounter(base) {
  const session = await faculty(base);
  const created = await call(base, "/api/encounters", {
    method: "POST",
    cookie: session.cookie,
    body: { profileId: "omar" },
    expect: 201,
  });
  return { cookie: session.cookie, encounterId: created.data.encounter.id };
}

async function completed(base) {
  const current = await encounter(base);
  await call(base, `/api/encounters/${current.encounterId}/complete`, {
    method: "POST",
    cookie: current.cookie,
    body: {},
    expect: 200,
  });
  return current;
}

async function file(base) {
  const session = await faculty(base);
  const created = await call(base, "/api/files", {
    method: "POST",
    cookie: session.cookie,
    body: {
      name: "pact-note.txt",
      type: "text/plain",
      data: Buffer.from("hello pact").toString("base64"),
    },
    expect: 201,
  });
  return { cookie: session.cookie, fileId: created.data.file.id };
}

async function group(base) {
  const session = await faculty(base);
  const created = await call(base, "/api/groups", {
    method: "POST",
    cookie: session.cookie,
    body: {
      title: "Pact practice group",
      kind: "practice",
      purpose: "Contract test only.",
      profileIds: ["omar", "nisha"],
    },
    expect: 201,
  });
  return { cookie: session.cookie, groupId: created.data.group.id };
}

async function groupStudent(base) {
  const created = await group(base);
  const learner = await student(base);
  return { cookie: learner.cookie, groupId: created.groupId };
}

async function facultyStudent(base) {
  const teacher = await faculty(base);
  const learner = await studentIdentity(base);
  return { cookie: teacher.cookie, studentId: learner.studentId };
}

async function assignment(base) {
  const teacher = await facultyStudent(base);
  const created = await call(base, "/api/assignments", {
    method: "POST",
    cookie: teacher.cookie,
    body: { studentId: teacher.studentId, profileId: "omar" },
    expect: 201,
  });
  const learner = await student(base);
  return { cookie: learner.cookie, assignmentId: created.data.assignment.id };
}

async function attempt(base) {
  const ready = await assignment(base);
  const started = await call(base, `/api/assignments/${ready.assignmentId}/start`, {
    method: "POST",
    cookie: ready.cookie,
    body: {},
    expect: 200,
  });
  return { cookie: ready.cookie, attemptId: started.data.attempt.id };
}

function handlers(base) {
  return {
    "": () => ({}),
    "student-id": () => studentIdentity(base),
    student: () => student(base),
    faculty: () => faculty(base),
    draft: () => draft(base),
    encounter: () => encounter(base),
    completed: () => completed(base),
    file: () => file(base),
    group: () => group(base),
    "group-student": () => groupStudent(base),
    "faculty-student": () => facultyStudent(base),
    assignment: () => assignment(base),
    attempt: () => attempt(base),
  };
}

module.exports = { handlers, encounter, cookieFrom, call };
