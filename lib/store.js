"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path");
const { importCsv, clone } = require("./profiles");
const { randomUUID } = require("node:crypto");
const cloud = require("./cloud");
const { archiveState } = require("./profile-archive");
class Store {
  constructor(
    directory = path.resolve(
      __dirname,
      "..",
      process.env.VIRTUSP_DATA_DIR || "data",
    ),
  ) {
    this.dir = directory;
    this.state = {
      schema: 2,
      drafts: {},
      releases: [],
      encounters: {},
      files: {},
    };
    this.queue = Promise.resolve();
    this.cloudQueue = Promise.resolve();
    this.mirroredFiles = new Set();
    this.sync = { status: "local", message: "S3 bucket not configured" };
  }
  async init() {
    await fs.mkdir(path.join(this.dir, "files"), { recursive: true });
    try {
      this.state = JSON.parse(
        await fs.readFile(path.join(this.dir, "state.json"), "utf8"),
      );
      if (this.state.schema !== 2) throw new Error("Unsupported store schema");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const seeds = JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../corpus/scaffold.json"),
          "utf8",
        ),
      );
      // BUNDLED_PATIENTS=false starts with an empty patient library.
      const bundled = process.env.BUNDLED_PATIENTS !== "false";
      for (const p of bundled ? seeds : []) {
        for (const f of p.facts) {
          if (f.lab) f.date = /\d{4}-\d{2}-\d{2}/.exec(f.label)?.[0];
        }
        for (const a of p.artifacts) {
          a.reviewed = true;
          a.release = a.release || "question";
          if (a.img) {
            const fileId = randomUUID();
            const bytes = await fs.readFile(
              path.join(__dirname, "../corpus/artifacts", path.basename(a.img)),
            );
            await fs.writeFile(path.join(this.dir, "files", fileId), bytes);
            this.state.files[fileId] = {
              id: fileId,
              name: path.basename(a.img),
              type: "image/jpeg",
              size: bytes.length,
              excerpt: "",
            };
            a.fileId = fileId;
            delete a.img;
          }
        }
        this.state.drafts[p.id] = p;
        this.state.releases.push({
          p: { ...clone(p), version: 1 },
          at: new Date().toISOString(),
        });
      }
      const imported = importCsv(
        await fs.readFile(
          path.join(__dirname, "../corpus/faculty-patients.csv"),
          "utf8",
        ),
      );
      for (const p of bundled ? imported : []) this.state.drafts[p.id] = p;
      await this.save();
    }
    if (require("./demo").initialize(this)) await this.save();
    return this;
  }
  async save() {
    const snapshot = JSON.stringify(this.state, null, 2);
    const task = this.queue.then(async () => {
      if (require("./observability").faultActive("persistence"))
        throw Object.assign(new Error("Injected persistence failure."), {
          code: "PERSISTENCE_FAILED",
        });
      const tmp = path.join(this.dir, "state.tmp");
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, path.join(this.dir, "state.json"));
    });
    this.queue = task.catch(() => {});
    const persistenceStarted = Date.now();
    try {
      await task;
      require("./observability").notePersistence(
        "ok",
        Date.now() - persistenceStarted,
      );
    } catch (error) {
      require("./observability").notePersistence(
        "error",
        Date.now() - persistenceStarted,
      );
      throw error;
    }
    if (process.env.S3_BUCKET) {
      this.sync = {
        status: "pending",
        message: "Local recovery saved; cloud copy pending",
      };
      const files = Object.values(JSON.parse(snapshot).files);
      this.cloudQueue = this.cloudQueue.then(async () => {
        try {
          for (const file of files)
            if (!this.mirroredFiles.has(file.id)) {
              await cloud.put(
                `files/${file.id}`,
                await fs.readFile(path.join(this.dir, "files", file.id)),
                file.type,
              );
              this.mirroredFiles.add(file.id);
            }
          this.sync = await cloud.put("state.json", snapshot);
        } catch (e) {
          this.sync = { status: "failed", message: e.name + ": " + e.message };
        }
      });
    }
    if (process.env.PROFILE_ARCHIVE === "true") {
      this.sync = {
        status: "pending",
        message: "Local recovery saved; profile archive pending",
      };
      const archived = JSON.parse(snapshot);
      const filesDir = path.join(this.dir, "files");
      this.cloudQueue = this.cloudQueue.then(async () => {
        try {
          const report = await archiveState(archived, { filesDir });
          if (report.errors.length || report.s3.status === "failed")
            this.sync = {
              status: "failed",
              message: report.errors[0] || report.s3.message,
            };
          else if (report.s3.status === "synced")
            this.sync = { status: "synced", at: report.s3.at };
        } catch (e) {
          this.sync = { status: "failed", message: e.name + ": " + e.message };
        }
      });
    }
    return this.sync;
  }
  async mirror(suffix, body, type) {
    try {
      const r = await cloud.put(suffix, body, type);
      this.sync = r;
      return r;
    } catch (e) {
      this.sync = { status: "failed", message: e.name + ": " + e.message };
      return this.sync;
    }
  }
  async flush() {
    await this.queue;
    await this.cloudQueue;
  }
  releases(id) {
    return this.state.releases.filter((r) => r.p.id === id);
  }
  latest(id) {
    return this.releases(id).at(-1);
  }
}
module.exports = { Store };
