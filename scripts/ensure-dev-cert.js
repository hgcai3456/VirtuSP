"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const CERT_NAME = "localhost.pem";
const KEY_NAME = "localhost-key.pem";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(command + " exited " + code + (stderr ? ": " + stderr.slice(0, 400) : "")));
    });
  });
}

function commandExists(name) {
  const locator = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [name] : ["-v", name];
  return new Promise((resolve) => {
    const child = spawn(locator, args, { stdio: "ignore", shell: process.platform !== "win32" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function powershellScript(dir) {
  const escaped = dir.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
$dir = '${escaped}'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$cert = New-SelfSignedCertificate -DnsName 'localhost','127.0.0.1' -CertStoreLocation 'Cert:\\CurrentUser\\My' -FriendlyName 'VirtuSP local development' -NotAfter (Get-Date).AddYears(2) -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1')
$public = Join-Path $dir 'localhost.cer'
Export-Certificate -Cert $cert -FilePath $public | Out-Null
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
$store.Open('ReadWrite')
$store.Add($cert)
$store.Close()
$pem = '-----BEGIN CERTIFICATE-----' + [Environment]::NewLine + [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks') + [Environment]::NewLine + '-----END CERTIFICATE-----' + [Environment]::NewLine
Set-Content -Path (Join-Path $dir '${CERT_NAME}') -Value $pem -Encoding ascii
$pwd = ConvertTo-SecureString 'virtusp-local-dev' -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $dir 'localhost.pfx') -Password $pwd | Out-Null
`.trim();
}

const DEV_PFX_PASSWORD = "virtusp-local-dev";

async function readPair(dir) {
  const certPath = path.join(dir, CERT_NAME);
  const keyPath = path.join(dir, KEY_NAME);
  const pfxPath = path.join(dir, "localhost.pfx");
  try {
    await fs.access(pfxPath);
    return {
      pfx: await fs.readFile(pfxPath),
      passphrase: DEV_PFX_PASSWORD,
      certPath,
      keyPath: pfxPath,
    };
  } catch {
    return {
      cert: await fs.readFile(certPath),
      key: await fs.readFile(keyPath),
      certPath,
      keyPath,
    };
  }
}

async function ensureDevCert(options = {}) {
  const dir = options.dir || path.join(process.cwd(), "certs");
  const certPath = path.join(dir, CERT_NAME);
  const keyPath = path.join(dir, KEY_NAME);
  const pfxPath = path.join(dir, "localhost.pfx");
  const exists = options.exists || (async (file) => {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  });
  await fs.mkdir(dir, { recursive: true });
  if (await exists(pfxPath)) return readPair(dir);
  if ((await exists(certPath)) && (await exists(keyPath))) return readPair(dir);
  const which = options.which || commandExists;
  const exec = options.run || run;
  if (await which("mkcert")) {
    try {
      await exec("mkcert", ["-install"]);
    } catch {
      /* A previous install can still sign localhost. */
    }
    await exec("mkcert", [
      "-cert-file",
      certPath,
      "-key-file",
      keyPath,
      "localhost",
      "127.0.0.1",
      "::1",
    ]);
    return readPair(dir);
  }
  const platform = options.platform || process.platform;
  if (platform === "win32") {
    await exec("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      powershellScript(dir),
    ]);
    return readPair(dir);
  }
  throw new Error(
    "Install mkcert and run npm run cert:local. VirtuSP will not start the demo on plain HTTP.",
  );
}

async function main() {
  const pair = await ensureDevCert();
  console.log("Local certificate ready at " + pair.certPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { commandExists, ensureDevCert, powershellScript, run };
