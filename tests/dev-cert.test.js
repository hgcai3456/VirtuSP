"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const certs = require("../scripts/ensure-dev-cert");

test("local certificate helper reuses files and reports a missing tool", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-cert-"));
  await fs.writeFile(path.join(dir, "localhost.pfx"), Buffer.from("pfx"));
  const existing = await certs.ensureDevCert({ dir, which: async () => false });
  assert.equal(existing.passphrase, "virtusp-local-dev");
  assert.equal(existing.pfx.toString(), "pfx");

  const pemDir = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-pem-"));
  await fs.writeFile(path.join(pemDir, "localhost.pem"), "cert");
  await fs.writeFile(path.join(pemDir, "localhost-key.pem"), "key");
  const pem = await certs.ensureDevCert({ dir: pemDir, which: async () => false });
  assert.equal(pem.cert.toString(), "cert");
  assert.equal(pem.key.toString(), "key");

  const made = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-mkcert-"));
  let installed = false;
  const signed = await certs.ensureDevCert({
    dir: made,
    which: async () => true,
    run: async (command, args) => {
      if (args[0] === "-install") {
        installed = true;
        throw new Error("already installed");
      }
      assert.equal(installed, true);
      assert.equal(command, "mkcert");
      await fs.writeFile(path.join(made, "localhost.pfx"), Buffer.from("signed"));
    },
  });
  assert.equal(signed.pfx.toString(), "signed");

  const windows = await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-win-"));
  const generated = await certs.ensureDevCert({
    dir: windows,
    platform: "win32",
    which: async () => false,
    run: async (command) => {
      assert.equal(command, "powershell.exe");
      await fs.writeFile(path.join(windows, "localhost.pfx"), Buffer.from("win"));
    },
  });
  assert.equal(generated.pfx.toString(), "win");

  await assert.rejects(
    certs.ensureDevCert({
      dir: await fs.mkdtemp(path.join(os.tmpdir(), "virtusp-none-")),
      platform: "linux",
      which: async () => false,
    }),
    /mkcert/,
  );

  assert.equal(await certs.commandExists("node"), true);
  assert.equal(await certs.commandExists("virtusp-missing-binary-xyz"), false);
  assert.match(certs.powershellScript("C:\\certs"), /New-SelfSignedCertificate/);
  assert.match(certs.powershellScript("C:\\certs"), /Export-PfxCertificate/);
  assert.doesNotMatch(certs.powershellScript("C:\\certs"), /AWS_SECRET_ACCESS_KEY=/);
});
