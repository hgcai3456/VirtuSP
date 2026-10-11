"use strict";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const { createApp } = require("../lib/http");
const { ensureDevCert } = require("./ensure-dev-cert");

async function start(options = {}) {
  const material = options.tls || (await ensureDevCert(options.cert));
  const tls = material.pfx
    ? { pfx: material.pfx, passphrase: material.passphrase }
    : { key: material.key, cert: material.cert };
  const app = await createApp({ ...(options.app || {}), tls });
  const requested = options.port ?? process.env.VIRTUSP_HTTPS_PORT;
  const port = requested == null || requested === "" ? 3002 : Number(requested);
  const host = options.host || "127.0.0.1";
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, host, resolve);
  });
  const bound = app.server.address().port;
  return {
    server: app.server,
    store: app.store,
    url: "https://localhost:" + bound + "/app.html",
  };
}

if (require.main === module) {
  start()
    .then(({ url }) => {
      console.log("VirtuSP running at " + url);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { start };
