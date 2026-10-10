"use strict";
const http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const profiles = require("./profiles"),
  engine = require("./engine"),
  cloud = require("./cloud"),
  speech = require("./speech"),
  caseRubric = require("./caseRubric");
const { Store } = require("./store");
const demo = require("./demo");
const { refreshCoaching } = require("./assessment");
const root = path.join(__dirname, "../public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function validId(id) {
  return (
    /^[a-zA-Z0-9_-]{1,80}$/.test(id || "") &&
    !["__proto__", "constructor", "prototype"].includes(id)
  );
}
function portraitFile(p) {
  if (p?.presentationKey) return "patient.jpg";
  if (p?.id === "denise") return "denise.jpg";
  if (p?.id === "marcus") return "marcus.jpg";
  const g = String(p?.gender || "").toLowerCase();
  const gender = g.startsWith("f") ? "f" : "m";
  const n = Number(p?.age);
  const age = !Number.isFinite(n)
    ? "mid"
    : n < 30
      ? "young"
      : n >= 60
        ? "old"
        : "mid";
  const pool = {
    "m-young": ["m-young.jpg"],
    "m-mid": ["m-mid.jpg", "m-mid-2.jpg"],
    "m-old": ["m-old.jpg"],
    "f-young": ["f-young.jpg"],
    "f-mid": ["f-mid.jpg", "f-mid-2.jpg"],
    "f-old": ["f-old.jpg"],
  }[gender + "-" + age] || ["patient.jpg"];
  let h = 2166136261;
  for (const ch of String(p?.id || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }

  return pool[(h >>> 0) % pool.length];
}
function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw failure("Request exceeds 8 MB.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw failure("Invalid JSON body.");
  }
}
function send(res, status, value, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(value));
}
function checkProfile(p) {
  if (
    !p ||
    !validId(p.id) ||
    !Array.isArray(p.facts) ||
    !Array.isArray(p.obj) ||
    !Array.isArray(p.sources) ||
    !Array.isArray(p.artifacts) ||
    !p.facts.every((f) => f && Array.isArray(f.kw)) ||
    !p.artifacts.every(
      (a) => a && Array.isArray(a.facts) && Array.isArray(a.unlock),
    ) ||
    JSON.stringify(p).length > 200000
  )
    throw failure("Invalid profile structure or size.");
}
async function extractPdf(buffer) {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdf.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > 50) throw failure("PDFs are limited to 50 pages.");
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      text +=
        `\nPage ${i}\n` +
        (await page.getTextContent()).items.map((item) => item.str).join(" ");
      if (text.length > 100000)
        throw failure("Extracted PDF text exceeds 100,000 characters.");
    }
    return text.trim();
  } finally {
    await loadingTask.destroy();
  }
}
function fileBuffer(input) {
  if (
    !input ||
    typeof input.data !== "string" ||
    !input.name ||
    ![
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
      "text/csv",
    ].includes(input.type)
  )
    throw failure("Upload PDF, PNG, JPG, TXT or CSV.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))
    throw failure("Invalid base64 file.");
  const buffer = Buffer.from(input.data, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024)
    throw failure("Files must be 1 byte–5 MB.");
  if (
    input.type === "application/pdf" &&
    buffer.subarray(0, 5).toString() !== "%PDF-"
  )
    throw failure("Invalid PDF signature.");
  if (
    input.type === "image/png" &&
    buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw failure("Invalid PNG signature.");
  if (
    input.type === "image/jpeg" &&
    buffer.subarray(0, 3).toString("hex") !== "ffd8ff"
  )
    throw failure("Invalid JPEG signature.");
  return buffer;
}
async function createApp(options = {}) {
  const store = options.store || (await new Store(options.dataDir).init());
  if (demo.initialize(store)) await store.save();
  const sessions = new Map();
  const queues = new Map(),
    images = new Map();
  async function locked(id, fn) {
    const previous = queues.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    queues.set(id, next);
    try {
      return await next;
    } finally {
      if (queues.get(id) === next) queues.delete(id);
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (
        req.headers.origin &&
        ![
          "http://localhost:" + server.address().port,
          "http://127.0.0.1:" + server.address().port,
        ].includes(req.headers.origin)
      )
        throw failure("Cross-origin requests are not allowed.", 403);
      if (req.method === "OPTIONS")
        throw failure("Cross-origin requests are not allowed.", 403);
      const url = new URL(req.url, "http://localhost");
      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
      if (parts[0] !== "api") {
        if (req.method !== "GET" && req.method !== "HEAD")
          throw failure("Method not allowed.", 405);
        const pathname = decodeURIComponent(url.pathname),
          relative = pathname === "/" ? "index.html" : pathname.slice(1),
          full = path.resolve(root, relative);
        if (full !== root && !full.startsWith(root + path.sep))
          throw failure("Forbidden.", 403);
        let data;
        try {
          data = await fs.readFile(full);
        } catch {
          throw failure("Not found.", 404);
        }
        res.writeHead(200, {
          "Content-Type":
            types[path.extname(full)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache",
        });
        return res.end(req.method === "HEAD" ? undefined : data);
      }
      if (parts[1] === "health" && req.method === "GET")
        return send(res, 200, {
          dialogue: cloud.enabled() ? "bedrock-configured" : "local",
          region: cloud.region(),
          model: cloud.model(),
          speech: speech.configured() ? "elevenlabs-configured" : "browser",
          guardrail: !!process.env.BEDROCK_GUARDRAIL_ID,
          caseRubrics: caseRubric.list(),
          storage: store.sync,
        });
      const token = /(?:^|;\s*)virtusp_demo=([a-zA-Z0-9-]+)/.exec(
        req.headers.cookie || "",
      )?.[1];
      let session = sessions.get(token);
      if (parts[1] === "session") {
        if (req.method === "GET")
          return send(res, 200, { session: session || null });
        if (req.method === "POST") {
          const input = await body(req);
          if (!["faculty", "student"].includes(input.role))
            throw failure("Choose Faculty or Student.");
          if (
            input.role === "student" &&
            !store.state.students[input.studentId]
          )
            throw failure("Choose a demo student.");
          if (token) sessions.delete(token);
          const id = randomUUID();
          session = {
            role: input.role,
            studentId: input.role === "student" ? input.studentId : null,
          };
          sessions.set(id, session);
          return send(
            res,
            200,
            { session },
            {
              "Set-Cookie": `virtusp_demo=${id}; HttpOnly; SameSite=Strict; Path=/`,
            },
          );
        }
        if (req.method === "DELETE") {
          sessions.delete(token);
          return send(
            res,
            200,
            { session: null },
            {
              "Set-Cookie":
                "virtusp_demo=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            },
          );
        }
      }
      if (parts[1] === "students" && req.method === "GET")
        return send(res, 200, {
          students: Object.values(store.state.students),
        });
      if (!session)
        throw failure("Choose Faculty or Student to continue.", 401);
      const faculty = () => {
        if (session.role !== "faculty")
          throw failure("Faculty workspace only.", 403);
      };
      if (parts[1] === "students" && req.method === "POST") {
        faculty();
        const input = await body(req);
        if (
          typeof input.alias !== "string" ||
          !input.alias.trim() ||
          input.alias.length > 80
        )
          throw failure("Enter a student alias (1–80 characters).");
        if (
          Object.values(store.state.students).some(
            (s) => s.alias.toLowerCase() === input.alias.trim().toLowerCase(),
          )
        )
          throw failure("That student alias already exists.", 409);
        const student = { id: randomUUID(), alias: input.alias.trim() };
        store.state.students[student.id] = student;
        await store.save();
        return send(res, 201, { student });
      }
      if (parts[1] === "groups" && req.method === "GET" && !parts[2])
        return send(res, 200, {
          groups: Object.values(store.state.groups)
            .map((g) => demo.groupView(store, g, session.role === "faculty"))
            .filter(
              (g) =>
                session.role === "faculty" ||
                (g.availableToAll && g.preparationStatus === "ready") ||
                Object.values(store.state.assignments).some(
                  (a) =>
                    a.groupId === g.id && a.studentId === session.studentId,
                ),
            ),
        });
      if (parts[1] === "groups" && req.method === "POST" && !parts[2]) {
        faculty();
        const group = demo.createGroup(store, await body(req));
        await store.save();
        return send(res, 201, { group: demo.groupView(store, group, true) });
      }
      if (parts[1] === "groups" && req.method === "PUT" && parts[2]) {
        faculty();
        const group = store.state.groups[parts[2]];
        if (!group) throw failure("Group not found.", 404);
        const input = await body(req);
        if (typeof input.availableToAll !== "boolean")
          throw failure(
            "Choose whether this group is available to all students.",
          );
        group.availableToAll = input.availableToAll;
        await store.save();
        return send(res, 200, { group: demo.groupView(store, group, true) });
      }
      if (
        parts[1] === "groups" &&
        req.method === "POST" &&
        parts[3] === "start"
      ) {
        if (session.role !== "student")
          throw failure("Enter the student workspace to start a group.", 403);
        return await locked(
          `group:${parts[2]}:${session.studentId}`,
          async () => {
            const group = store.state.groups[parts[2]];
            if (
              !group?.availableToAll ||
              demo.groupView(store, group, false).preparationStatus !== "ready"
            )
              throw failure(
                "This group is not available for self-start. Use a faculty assignment.",
                403,
              );
            let assignment = Object.values(store.state.assignments).find(
              (a) =>
                a.groupId === group.id && a.studentId === session.studentId,
            );
            assignment ||= demo.assign(store, group.id, session.studentId);
            const attempt = demo.start(store, assignment, session.studentId);
            await store.save();
            return send(res, 200, {
              attempt: demo.attemptView(store, attempt),
            });
          },
        );
      }
      if (parts[1] === "assignments") {
        if (req.method === "GET" && !parts[2])
          return send(res, 200, {
            assignments: Object.values(store.state.assignments)
              .filter(
                (a) =>
                  session.role === "faculty" ||
                  a.studentId === session.studentId,
              )
              .map((a) => ({
                ...a,
                title: store.state.groups[a.groupId]?.title,
                attempt: a.attemptId
                  ? demo.attemptView(store, store.state.attempts[a.attemptId])
                  : null,
              })),
          });
        if (req.method === "POST" && !parts[2]) {
          faculty();
          const input = await body(req);
          const assignment = demo.assign(store, input.groupId, input.studentId);
          await store.save();
          return send(res, 201, { assignment });
        }
        if (req.method === "POST" && parts[3] === "start") {
          if (session.role !== "student")
            throw failure(
              "Switch to the assigned student to start the test.",
              403,
            );
          return await locked("assignment:" + parts[2], async () => {
            const assignment = store.state.assignments[parts[2]];
            if (!assignment) throw failure("Assignment not found.", 404);
            const attempt = demo.start(store, assignment, session.studentId);
            await store.save();
            return send(res, 200, {
              attempt: demo.attemptView(store, attempt),
            });
          });
        }
      }
      if (parts[1] === "attempts") {
        const attempt = store.state.attempts[parts[2]];
        if (
          !attempt ||
          (session.role !== "faculty" &&
            attempt.studentId !== session.studentId)
        )
          throw failure("Attempt not found.", 404);
        if (req.method === "GET")
          return send(res, 200, {
            attempt: demo.attemptView(store, attempt),
            ...(session.role === "faculty"
              ? { biasAnalysis: demo.biasView(store, "attempt", attempt.id) }
              : {}),
          });
        if (req.method === "POST" && parts[3] === "next") {
          if (session.role !== "student")
            throw failure(
              "Switch to the assigned student to run a trial.",
              403,
            );
          return await locked("attempt:" + attempt.id, async () => {
            const enc = demo.next(store, attempt);
            await store.save();
            return send(res, 200, {
              encounter: demo.view(store, session, enc),
              attempt: demo.attemptView(store, attempt),
            });
          });
        }
      }
      if (parts[1] === "faculty-results" && req.method === "GET") {
        faculty();
        return send(res, 200, {
          students: [
            ...Object.values(store.state.students),
            { id: null, alias: "Unassigned demo encounters" },
          ].map((student) => ({
            ...student,
            encounters: Object.values(store.state.encounters)
              .filter((e) => (e.studentId || null) === student.id)
              .map((e) => ({
                ...demo.summary(store, session, e),
                biasAnalysis: demo.biasView(store, "encounter", e.id),
              })),
            attempts: Object.values(store.state.attempts)
              .filter((a) => a.studentId === student.id)
              .map((a) => ({
                ...demo.attemptView(store, a),
                biasAnalysis: demo.biasView(store, "attempt", a.id),
              })),
          })),
        });
      }
      if (parts[1] === "bias") {
        faculty();
        if (req.method === "GET" && parts[4] === "context")
          return send(
            res,
            200,
            demo.detectorContext(store, parts[2], parts[3]),
          );
        if (req.method === "GET" && !parts[4]) {
          demo.detectorContext(store, parts[2], parts[3]);
          return send(res, 200, {
            biasAnalysis: demo.biasView(store, parts[2], parts[3]),
          });
        }
        if (req.method === "PUT" && !parts[4]) {
          const result = demo.saveBias(
            store,
            parts[2],
            parts[3],
            await body(req),
          );
          await store.save();
          return send(res, 200, { biasAnalysis: result });
        }
      }
      if (["references", "generate", "import", "files"].includes(parts[1]))
        faculty();
      if (parts[1] === "references" && req.method === "GET")
        return send(res, 200, {
          sources: require("../corpus/references.json"),
        });
      if (parts[1] === "profiles") {
        const id = parts[2];
        if (!(req.method === "GET" && (!id || parts[3] === "image"))) faculty();
        if (id && !validId(id)) throw failure("Invalid profile ID.");
        if (!id && req.method === "GET")
          return send(res, 200, {
            profiles: Object.values(store.state.drafts)
              .filter(
                (p) =>
                  !p.comparisonOnly &&
                  (session.role === "faculty" || store.latest(p.id)),
              )
              .map((draft) => {
                const p =
                  session.role === "faculty" ? draft : store.latest(draft.id).p;
                return {
                  id: p.id,
                  name: p.name,
                  age: p.age,
                  origin: p.origin || "scaffold",
                  version: store.latest(p.id)?.p.version || null,
                  imageUrl: `/api/profiles/${p.id}/image`,
                  errors: profiles
                    .validate(p)
                    .filter((i) => i.severity === "error").length,
                };
              }),
          });
        if (!id && req.method === "POST") {
          const input = await body(req);
          const p = input.profile
            ? profiles.clone(input.profile)
            : input.starter
              ? profiles.seedFromStarter(input.starter)
              : profiles.blank();
          if (!input.starter) {
            checkProfile(p);
            if (Object.hasOwn(store.state.drafts, p.id))
              throw failure("Patient ID already exists.", 409);
            delete p.version;
            if (input.publish === true) {
              const issues = profiles.validate(p);
              if (issues.some((i) => i.severity === "error"))
                return send(res, 422, {
                  error: issues.find((i) => i.severity === "error").message,
                  issues,
                });
              if (
                [...p.sources, ...p.artifacts].some(
                  (r) => r.fileId && !store.state.files[r.fileId],
                )
              )
                throw failure("An attached file is missing.");
              profiles.approveRecords(p);
            }
          }
          store.state.drafts[p.id] = p;
          const released =
            input.publish === true
              ? {
                  p: { ...profiles.clone(p), version: 1 },
                  at: new Date().toISOString(),
                }
              : null;
          if (released) store.state.releases.push(released);
          await store.save();
          if (released)
            await store.mirror(
              `profiles/${p.id}/v1.json`,
              JSON.stringify(released),
            );
          return send(res, 201, { profile: p, version: released?.p.version });
        }
        const p = store.state.drafts[id];
        if (!p || (session.role !== "faculty" && !store.latest(id)))
          throw failure("Patient not found.", 404);
        if (parts[3] === "image" && req.method === "GET") {
          let image = images.get(id);
          if (!image) {
            if (
              process.env.AWS_IMAGES_ENABLED === "true" &&
              p.image?.startsWith("s3://")
            )
              try {
                image = await cloud.object(p.image);
              } catch {
                image = null;
              }
            if (!image) {
              let file = portraitFile(p);
              try {
                image = {
                  body: await fs.readFile(path.join(root, "img", file)),
                  type: "image/jpeg",
                };
              } catch {
                image = {
                  body: await fs.readFile(
                    path.join(root, "img", "patient.jpg"),
                  ),
                  type: "image/jpeg",
                };
              }
            }
            images.set(id, image);
          }
          res.writeHead(200, {
            "Content-Type": image.type,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          });
          return res.end(Buffer.from(image.body));
        }
        if (parts[3] === "prepare" && req.method === "POST") {
          const template = require("../corpus/teaching-drafts.json")[id];
          if (!template)
            throw failure(
              "No organizer teaching suggestions exist for this patient. Author facts directly.",
            );
          p.facts = template.facts.map((f) =>
            profiles.fact(f.id, f.label, {
              ...profiles.clone(f),
              src: "organizer-csv",
              origin: "engineering-organized organizer material",
              reviewed: false,
            }),
          );
          p.obj = profiles.clone(template.obj);
          p.reviewAcknowledged = false;
          p.missing = [template.note, ...(p.missing || [])];
          await store.save();
          return send(res, 200, { profile: p, issues: profiles.validate(p) });
        }
        if (parts[3] === "publish" && req.method === "POST") {
          const issues = profiles.validate(p);
          if (issues.some((i) => i.severity === "error"))
            return send(res, 422, {
              error: issues.find((i) => i.severity === "error").message,
              issues,
            });
          for (const a of p.artifacts)
            if (a.fileId && !store.state.files[a.fileId])
              throw failure("Artifact file is missing.");
          for (const s of p.sources)
            if (s.fileId && !store.state.files[s.fileId])
              throw failure("Source file is missing.");
          profiles.approveRecords(p);
          const released = {
            p: { ...profiles.clone(p), version: store.releases(id).length + 1 },
            at: new Date().toISOString(),
          };
          store.state.releases.push(released);
          await store.save();
          await store.mirror(
            `profiles/${id}/v${released.p.version}.json`,
            JSON.stringify(released),
          );
          return send(res, 201, {
            version: released.p.version,
            issues,
            storage: store.sync,
          });
        }
        if (req.method === "GET" && !parts[3])
          return send(res, 200, {
            profile: p,
            versions: store
              .releases(id)
              .map((r) => ({ version: r.p.version, at: r.at })),
            issues: profiles.validate(p),
          });
        if (req.method === "PUT" && !parts[3]) {
          const input = await body(req);
          checkProfile(input.profile);
          if (input.profile.id !== id)
            throw failure("Patient ID cannot change.");
          delete input.profile.version;
          store.state.drafts[id] = profiles.clone(input.profile);
          images.delete(id);
          await store.save();
          return send(res, 200, {
            profile: store.state.drafts[id],
            issues: profiles.validate(input.profile),
            storage: store.sync,
          });
        }
      }
      if (parts[1] === "import" && req.method === "POST") {
        const input = await body(req);
        if (typeof input.csv !== "string" || input.csv.length > 200000)
          throw failure("CSV must be text under 200 KB.");
        const imported = profiles.importCsv(input.csv);
        if (imported.length > 100)
          throw failure("Import at most 100 patients.");
        for (const p of imported)
          if (!validId(p.id))
            throw failure("CSV contains an invalid patient ID.");
        const added = [],
          skipped = [];
        for (const p of imported) {
          if (Object.hasOwn(store.state.drafts, p.id)) skipped.push(p.name);
          else {
            store.state.drafts[p.id] = p;
            added.push(p.id);
          }
        }
        await store.save();
        return send(res, 200, { added, skipped });
      }
      if (parts[1] === "generate" && req.method === "POST") {
        const input = await body(req);
        if (input.files !== undefined && !Array.isArray(input.files))
          throw failure("Uploaded documents must be a list.");
        const uploads = (input.files || []).map((entry) => {
          const file = store.state.files[entry?.id];
          if (!file || !["case", "clinical", "reference"].includes(entry.role))
            throw failure("Choose an uploaded file and its purpose.");
          return {
            ...file,
            role: entry.role,
            section: profiles.sections.includes(entry.section)
              ? entry.section
              : "notes",
            sourceId: "upload-" + file.id,
          };
        });
        if (new Set(uploads.map((f) => f.id)).size !== uploads.length)
          throw failure("Select each file only once.");
        const description = [
          input.description || "",
          ...uploads
            .filter((f) => f.role !== "reference" && f.excerpt)
            .map(
              (f) =>
                `\nPatient document ${f.sourceId} (${f.name}; ${f.role === "clinical" ? "chart record, not patient-known unless explicitly stated" : "faculty case brief"}):\n${f.excerpt}`,
            ),
        ].join("\n");
        if (
          typeof input.description !== "string" ||
          !description.trim() ||
          description.length > 48000
        )
          throw failure(
            "Provide patient details or a text-based case PDF (up to 48,000 extracted characters). Scans require manual transcription; OCR is not available yet.",
          );
        const p = profiles.blank(),
          selectedSources = [
            ...(store.state.drafts[input.profileId]?.sources || []),
            ...uploads
              .filter((f) => f.role === "reference")
              .map((f) => ({
                id: f.sourceId,
                title: f.name,
                excerpt: f.excerpt,
                fileId: f.id,
                role: "reference",
                reviewed: false,
              })),
          ];
        let generated = null,
          draftError = null,
          provider = "local-organizer",
          warning =
            "AI is disabled. Description preserved for manual structuring; no clinical facts inferred.";
        if (cloud.enabled())
          try {
            generated = await cloud.draft(description, selectedSources);
            provider = "bedrock-draft";
            warning =
              "AI draft: review every detail against the faculty description before publication.";
          } catch (e) {
            draftError = cloud.draftFailure(e);
            warning = draftError.message;
          }
        p.sources = [
          ...(input.description.trim()
            ? [
                {
                  id: "description",
                  title: "Faculty description",
                  excerpt: input.description,
                  reviewed: false,
                },
              ]
            : []),
          ...uploads
            .filter((f) => f.role !== "reference")
            .map((f) => ({
              id: f.sourceId,
              title: f.name,
              excerpt: f.excerpt,
              fileId: f.id,
              role: f.role,
              reviewed: false,
            })),
          ...profiles
            .clone(selectedSources)
            .filter((s) => s.id !== "description"),
        ];
        if (generated) {
          p.origin = "generated";
          p.name =
            typeof generated.name === "string" ? generated.name : "New Patient";
          p.age = Number.isInteger(generated.age) ? generated.age : null;
          p.gender =
            typeof generated.gender === "string" ? generated.gender : "";
          p.ethnicity =
            typeof generated.ethnicity === "string" ? generated.ethnicity : "";
          p.personality = String(generated.personality || "");
          p.style = String(generated.style || "");
          p.emotion = String(generated.emotion || "");
          p.facts = (Array.isArray(generated.facts) ? generated.facts : [])
            .slice(0, 100)
            .map((f, i) =>
              profiles.fact("generated-" + i, String(f.label || ""), {
                say: String(f.say || ""),
                topic: String(f.topic || f.ehr || "history"),
                kw: Array.isArray(f.kw)
                  ? f.kw.filter((k) => typeof k === "string" && k.trim())
                  : [],
                vis: f.vis === "chart" ? "chart" : "ask",
                ehr: profiles.sections.includes(f.ehr) ? f.ehr : "hx",
                sec:
                  f.vis === "chart"
                    ? profiles.sections.includes(f.sec)
                      ? f.sec
                      : "notes"
                    : undefined,
                src: String(f.src || "description"),
                date: String(f.date || ""),
                unit: String(f.unit || ""),
                ref: String(f.ref || ""),
                lab: f.lab === true,
                origin: "generated",
                reviewed: false,
              }),
            );
          p.missing = Array.isArray(generated.missing)
            ? generated.missing.map(String)
            : [];
          if (!Number.isInteger(generated.age))
            p.missing.push(
              "Age unspecified: optional; leave blank unless supplied or explicitly authored.",
            );
          const objs = (
            Array.isArray(generated.objectives) ? generated.objectives : []
          ).slice(0, 10);
          p.obj = objs.map((o, i) => ({
            id: "objective-" + i,
            t: String(o.title || ""),
            ty: "fact",
            w:
              Math.floor(100 / Math.max(1, objs.length)) +
              (i === 0 ? 100 % Math.max(1, objs.length) : 0),
            f: (Array.isArray(o.factIndexes) ? o.factIndexes : [])
              .filter((j) => Number.isInteger(j) && p.facts[j])
              .map((j) => p.facts[j].id),
            tip: String(o.tip || "Review this objective"),
          }));
        } else {
          p.facts = [
            profiles.fact("description", description, {
              vis: "chart",
              sec: "notes",
              ehr: "notes",
              say: "",
              src: "description",
              origin: "faculty-description",
              topic: "Faculty description",
            }),
          ];
          p.missing = [
            "Split description into patient-known facts and chart records",
            "Name and age require review",
            "Objectives and disclosure rules require authoring",
          ];
        }
        p.artifacts = uploads
          .filter((f) => f.role === "clinical")
          .map((f) => ({
            id: "report-" + f.id,
            title: f.name,
            src: f.sourceId,
            fileId: f.id,
            kind: "report",
            sec: f.section,
            date: profiles.documentDate(f.excerpt),
            release: "section",
            unlock: [],
            facts: p.facts
              .filter((fact) => fact.src === f.sourceId && fact.vis === "chart")
              .map((fact) => fact.id),
            rows: [],
            reviewed: false,
          }));
        // A clinical attachment must remain chart-only even if a model mislabels it.
        for (const f of p.facts) {
          const document = uploads.find((u) => u.sourceId === f.src);
          if (document?.role === "clinical") {
            f.vis = "chart";
            f.sec = document.section;
            f.ehr = document.section;
          }
        }
        for (const artifact of p.artifacts)
          artifact.facts = p.facts
            .filter((f) => f.src === artifact.src && f.vis === "chart")
            .map((f) => f.id);
        p.missing.push(
          ...uploads
            .filter((f) => !f.excerpt)
            .map(
              (f) =>
                `${f.name}: no selectable text found. Transcribe manually; OCR is deferred.`,
            ),
        );
        p.intro = `Hello, I'm ${p.name.split(" ")[0]}.`;
        if (input.preview !== true) {
          store.state.drafts[p.id] = p;
          await store.save();
        }
        return send(res, 201, {
          profile: p,
          provider,
          warning,
          ...(draftError ? { draftError } : {}),
        });
      }
      if (parts[1] === "files") {
        if (req.method === "POST" && !parts[2]) {
          const input = await body(req),
            buffer = fileBuffer(input),
            id = randomUUID();
          let excerpt = "";
          if (input.type === "application/pdf")
            excerpt = await extractPdf(buffer);
          if (input.type.startsWith("text/"))
            excerpt = buffer.toString("utf8").slice(0, 100000);
          const metadata = {
            id,
            name: path.basename(String(input.name)).slice(0, 200),
            type: input.type,
            size: buffer.length,
            excerpt,
            date: profiles.documentDate(excerpt),
          };
          await fs.writeFile(path.join(store.dir, "files", id), buffer);
          store.state.files[id] = metadata;
          await store.save();
          const storage = await store.mirror(`files/${id}`, buffer, input.type);
          return send(res, 201, { file: metadata, storage });
        }
        if (req.method === "GET" && validId(parts[2])) {
          const file = store.state.files[parts[2]];
          if (!file) throw failure("File not found.", 404);
          res.writeHead(200, {
            "Content-Type": file.type,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Cache-Control": "private, no-store",
          });
          return res.end(
            await fs.readFile(path.join(store.dir, "files", file.id)),
          );
        }
      }
      if (parts[1] === "encounters") {
        const id = parts[2];
        if (!id && req.method === "GET")
          return send(res, 200, {
            encounters: Object.values(store.state.encounters)
              .filter((e) => demo.canSee(session, e))
              .map((e) => demo.summary(store, session, e)),
          });
        if (!id && req.method === "POST") {
          const input = await body(req),
            release =
              store.state.releases.find(
                (r) =>
                  r.p.id === input.profileId &&
                  r.p.version === Number(input.version),
              ) || (!input.version ? store.latest(input.profileId) : null);
          if (!release)
            throw failure(
              "Publish this profile before starting an encounter.",
              422,
            );
          if (release.p.comparisonOnly && session.role !== "faculty")
            throw failure("Start this case through its assigned group.", 403);
          const enc = engine.create(release.p);
          enc.studentId = session.role === "student" ? session.studentId : null;
          store.state.encounters[enc.id] = enc;
          await store.save();
          return send(res, 201, {
            encounter: demo.view(store, session, enc),
            storage: store.sync,
          });
        }
        if (!validId(id) || !store.state.encounters[id])
          throw failure("Encounter not found.", 404);
        if (!demo.canSee(session, store.state.encounters[id]))
          throw failure("Encounter not found.", 404);
        const action = parts[3];
        if (
          session.role === "faculty" &&
          store.state.encounters[id].studentId &&
          req.method === "POST" &&
          action !== "speech"
        )
          throw failure(
            "Student attempts are read-only in the faculty workspace.",
            403,
          );
        return await locked(id, async () => {
          const enc = store.state.encounters[id];
          if (req.method === "GET" && !action)
            return send(res, 200, {
              encounter: demo.view(store, session, enc),
              storage: store.sync,
            });
          if (req.method === "GET" && action === "export")
            return send(res, 200, demo.view(store, session, enc), {
              "Content-Disposition": `attachment; filename="virtusp-${id}.json"`,
            });
          if (
            req.method === "GET" &&
            action === "artifacts" &&
            parts[5] === "file"
          ) {
            const a = enc.p.artifacts.find((a) => a.id === parts[4]);
            if (
              !a ||
              !enc.released[a.id] ||
              !a.fileId ||
              !store.state.files[a.fileId]
            )
              throw failure("Artifact is not available.", 403);
            const file = store.state.files[a.fileId];
            res.writeHead(200, {
              "Content-Type": file.type,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "no-store",
            });
            return res.end(
              await fs.readFile(path.join(store.dir, "files", file.id)),
            );
          }
          if (req.method === "POST" && action === "speech") {
            const input = await body(req),
              turn = enc.transcript.find(
                (t) => t.id === input.turnId && t.role === "patient",
              );
            if (!turn)
              throw failure("Only validated patient turns can be spoken.");
            if (!speech.configured())
              throw failure(
                "ElevenLabs is not configured; use browser speech.",
                503,
              );
            try {
              await speech.refreshCatalog();
              const audio = await speech.synthesize(
                turn.text,
                speech.pickVoice(enc.p),
              );
              res.writeHead(200, {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-store",
              });
              return res.end(audio);
            } catch {
              throw failure(
                "ElevenLabs request failed; browser speech is available.",
                502,
              );
            }
          }
          if (action === "talking-video") {
            if (!speech.configured())
              throw failure(
                "ElevenLabs is not configured; the in-app avatar is used.",
                503,
              );
            if (req.method === "POST") {
              const input = await body(req);
              const turn = enc.transcript.find(
                (t) => t.id === input.turnId && t.role === "patient",
              );
              speech.beginTalkingVideo({
                profile: enc.p,
                text: turn?.text || enc.p.intro,
                dir: store.dir,
              });

              return send(res, 202, { status: "pending" });
            }
            if (req.method !== "GET") throw failure("Not found.", 404);
            const state = await speech.talkingVideoState(enc.p.id, store.dir);
            if (
              state.status !== "ready" &&
              state.status !== "pro-required" &&
              state.status !== "failed"
            )
              speech.beginTalkingVideo({
                profile: enc.p,
                text: enc.p.intro,
                dir: store.dir,
              });
            const latest = await speech.talkingVideoState(enc.p.id, store.dir);
            if (latest.status === "ready") {
              res.writeHead(200, {
                "Content-Type": "video/mp4",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
              });

              return res.end(await fs.readFile(latest.file));
            }
            const status =
              latest.status === "pro-required" || latest.status === "failed"
                ? 501
                : 202;

            return send(res, status, {
              status: latest.status === "idle" ? "pending" : latest.status,
            });
          }
          if (req.method === "POST" && action === "transcribe") {
            if (!speech.configured())
              throw failure(
                "ElevenLabs is not configured; type your question.",
                503,
              );
            const input = await body(req);
            if (
              typeof input.data !== "string" ||
              !input.data ||
              input.data.length > 4 * 1024 * 1024
            )
              throw failure("Record a short spoken question.");
            const allowed = [
              "audio/webm",
              "audio/wav",
              "audio/mpeg",
              "audio/mp4",
              "audio/ogg",
              "audio/x-wav",
            ];
            const type = allowed.includes(input.type)
              ? input.type
              : "audio/webm";
            try {
              const audio = Buffer.from(input.data, "base64");
              if (!audio.length || audio.length > 3 * 1024 * 1024)
                throw failure("Record a short spoken question.");
              const text = await speech.transcribe(audio, type);
              return send(res, 200, { text });
            } catch (error) {
              if (error.status) throw error;
              throw failure(
                "Could not transcribe speech. Type your question.",
                502,
              );
            }
          }
          if (req.method !== "POST") throw failure("Not found.", 404);
          if (action === "coaching") {
            if (enc.status !== "complete")
              throw failure("Finish the encounter first.", 409);
            await refreshCoaching(enc);
            await store.save();
            return send(res, 200, {
              encounter: engine.publicView(enc),
              storage: store.sync,
            });
          }
          if (enc.status !== "active" && action !== "complete")
            throw failure("Encounter complete. Start a new attempt.", 409);
          const input = await body(req);
          if (action === "turn")
            await engine.ask(enc, input.question, input.requestId);
          else if (action === "open") engine.openSection(enc, input.section);
          else if (action === "review") {
            if (input.artifactId) engine.review(enc, input.artifactId);
            else engine.reviewSection(enc, input.section);
          } else if (action === "note") engine.reconcile(enc, input.text);
          else if (action === "handoff") engine.handoff(enc, input.text);
          else if (action === "role") {
            if (typeof input.role !== "string" || input.role.length > 100)
              throw failure("Invalid role.");
            enc.role = input.role;
            engine.event(enc, "role", { text: input.role });
          } else if (action === "plan") {
            if (
              typeof input.text !== "string" ||
              !input.text.trim() ||
              input.text.length > 2000
            )
              throw failure("Provide a plan item.");
            const e = engine.event(enc, "careplan", { text: input.text });
            enc.plan.push({
              id: e.id,
              text: input.text,
              role: enc.role,
              at: e.at,
            });
          } else if (action === "complete") {
            await engine.complete(enc);
            demo.completeTrial(store, enc);
          } else throw failure("Not found.", 404);
          await store.save();
          if (action === "complete")
            await store.mirror(
              `encounters/${enc.id}.json`,
              JSON.stringify(enc),
            );
          return send(res, 200, {
            encounter: demo.view(store, session, enc),
            storage: store.sync,
          });
        });
      }
      throw failure("Not found.", 404);
    } catch (e) {
      if (!res.headersSent)
        send(res, e.status || 400, { error: e.message || "Request failed." });
      else res.end();
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  return { server, store };
}
module.exports = { createApp, fileBuffer };
