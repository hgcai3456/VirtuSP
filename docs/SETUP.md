# Root development setup

Reviewed October 11, 2026. Scope: the root application started by `npm start`; the separate `VirtuSP-upstream/` checkout is outside this runtime.

## Prerequisites and install

Use Node 24/npm and a JavaScript/localStorage-capable browser. Verified locally: Node 24.15.0/npm 11.13.0. Package engines say >=18, but locked AWS dependencies require >=20; use Node 24. Git is optional at runtime and helpful for identity.

From the root checkout:

```sh
npm ci
npm test
npm start
```

Open [the simulator](http://127.0.0.1:3000/app.html). Installation normally requires registry access; default typed operation then requires no cloud/model credentials. The nested checkout runs a different application.

## Configuration

[README configuration](../README.md#configuration) lists all variables/defaults. Set process variables; `.env` is not loaded. Leave `PROFILE_S3_BUCKET` and `VIRTUSP_DR_TABLE` unset and retain loopback for the local demo.

```powershell
$env:PORT = '3100'
npm start
```

Open port 3100 in this example. Custom `VIRTUSP_DATA_DIR` must be writable and excluded from Git; publications persist there but attempts stay in memory. `NODE_ENV=production` changes a label, not missing security controls.

## Optional cloud/container setup

Enable S3 only with an existing synthetic-data bucket, SDK runtime identity/region, scoped write permissions, and backup ownership. Do not paste keys into source/browser settings. [Operations](OPERATIONS.md) covers partial failures; [deployment](DEPLOYMENT.md) covers packaging.

Docker uses Node 24/non-root and requires a writable data mount. CodeBuild currently tests under Node 22 before building the Node 24 image. Local tests do not verify that CI runtime or container build.

## Confirm setup

Check visible identity/mode; publish a synthetic case, start fresh, ask supported/unknown questions, and inspect review/evidence. Rehearse [demo](DEMO.md) for rendering/audio. [Testing](TESTING.md) defines automation scope; [troubleshooting](../README.md#troubleshooting) covers common failures.

Use synthetic data. Preserve recovery files and contributor changes. Ownership/license/private reporting require coordination with the project owner.
