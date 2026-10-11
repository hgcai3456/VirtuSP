# Local and Workshop setup

Use Node.js 22.17 or newer, Chrome or Edge, and a PowerShell terminal in this repository.

```powershell
npm ci
```

Copy `.env.example` to `.env` only if `.env` does not already exist. Never overwrite an existing credentials file. Keep `.env` outside `public/`; Git ignores it.

## AWS event credentials

In Workshop Studio, choose **Get AWS CLI credentials**. Paste all three temporary values into the root `.env`:

```dotenv
AWS_REGION=us-west-2
AWS_PROFILE=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
AI_ENABLED=false
```

These are AWS credentials, not a Bedrock API key. The session token is required for event access. Refresh all three when temporary credentials expire. Alternatively, use a named `workshop` CLI profile: set `AWS_PROFILE=workshop` and remove the three direct credential entries. Do not mix the two methods. Existing terminal environment variables take precedence over `.env`; restart the terminal if stale values interfere.

```powershell
npm run setup:aws
npm run preflight
```

`setup:aws` creates a uniquely named application bucket when `S3_BUCKET` is empty, writes its name to `.env`, blocks public access, and enables encryption and versioning. A saved bucket name allows a retry if a configuration step is denied. An existing `S3_BUCKET` is checked and configured instead. Use your application bucket, not the organizer's image bucket. No website is published and no IAM permissions are expanded by this script.

`preflight` checks real Bedrock inference and an S3 write. Unconfigured ElevenLabs is optional. After Bedrock and S3 succeed, set `AI_ENABLED=true`, then:

```powershell
npm start
```

Open [the landing page](http://localhost:3000/) or [the simulator](http://localhost:3000/app.html) for text-only local work. Camera and microphone require a trusted HTTPS page. Create a local certificate and start the secure server:

```powershell
npm run cert:local
npm run dev:https
```

Then open [https://localhost:3002/app.html](https://localhost:3002/app.html). Do not bypass the browser warning and do not launch Chrome with certificate or web-security flags. `cert:local` uses mkcert when it is installed, and otherwise creates a certificate in the current user trust store. Certificate files stay in `certs/` and are gitignored. If a development key was ever committed or pasted into the browser, rotate it. Production TLS is terminated by CloudFront or the load balancer; the app trusts `X-Forwarded-Proto` and `X-Forwarded-Host` only when `VIRTUSP_TRUST_PROXY=true` and `X-VirtuSP-Edge` matches `VIRTUSP_EDGE_SECRET`. Set `VIRTUSP_HSTS=true` only after that HTTPS path is verified. `VIRTUSP_REQUIRE_HTTPS=true` redirects other HTTP requests to HTTPS and leaves `/api/live`, `/api/ready`, and `/api/health` on HTTP for the load balancer.

The header says **configured**, not verified quality. Actual patient turns display their provider; a failed model request uses approved wording and records the reason. Storage status distinguishes local saves from pending, failed and successful S3 copies.

Choose **Faculty** to author/review patients and assign prepared groups, or **Student** with a demo alias to practice. Prepare the comparison cases once before rehearsal using [DEMO-GROUPS.md](DEMO-GROUPS.md). Faculty results and bias integration are documented there and in [BIAS-INTEGRATION.md](BIAS-INTEGRATION.md).

## Create and edit patients

Download the organizer-linked profiles with `npm run corpus:fetch`. See [CORPUS.md](CORPUS.md) for Omar/Yvette documents and required disclosure review. Files can be dragged into the faculty upload area or selected using Browse.

Click **New patient** or a card's **Edit** button to open the faculty form. Upload synthetic case documents, choose their purpose, then **Extract & fill form**. Review/correct details and use the single faculty acknowledgment before **Create & publish patient**. Use **Save draft** for unfinished work. Parsing previews do not add patients; missing medical facts stay unknown. Selectable PDF text works; image/handwritten OCR is deferred. See [AUTHORING.md](AUTHORING.md) for examples and artifact guidance.

## ElevenLabs can be added later

Leave ElevenLabs configuration empty for offline work. The adapter is implemented and optional; live-provider observations are historical and must be rehearsed separately for this checkout.

## Bedrock schema warm-up

Supported Claude 4.5/4.6 models use strict JSON schemas for grounding and assessment. AWS may take several minutes to compile a new schema; the schema is then cached. `BEDROCK_SCHEMA_TIMEOUT_MS=180000` allows this first request, while ordinary generation uses `BEDROCK_TIMEOUT_MS=25000`. Run cloud evaluation before rehearsal to warm schemas and check actual results. `BEDROCK_STRUCTURED_OUTPUTS=false` disables the feature; runtime validation still applies. JSON format guarantees do not guarantee factual accuracy. See [AWS structured outputs](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html).

## Optional speech configuration

Answer the incoming call before media capture starts and grant browser permissions yourself. Speech recognition and silence timing depend on the current browser/client implementation; do not use earlier three-second timing as a contractual behavior. Listening pauses during patient playback, and typed Send remains immediate. Permission refusal must leave text available. Rehearse speech and cancellation on trusted HTTPS; mock/DOM tests do not prove audible performance. See [avatar setup](AVATAR_SETUP.md) and [testing](TESTING.md).

Set `ELEVENLABS_API_KEY` and a default `ELEVENLABS_VOICE_ID` in `.env` for natural patient speech. Restricted keys need text-to-speech; voice listing is used when the key allows it. Each patient gets a stable premade voice from age and gender. Only saved, validated patient replies are spoken, streamed turn by turn from `GET /api/encounters/:id/speech/:turnId/stream`. The portrait uses viseme (mouth-shape) animation timed to the reply, plus idle motion and blinks. The visit shows a generated talking person (not the still photo), with lip motion while they speak. An ElevenLabs talking clip can replace that avatar if the Pro video flow succeeds. Gemini Live Avatar is not used as the patient. SadTalker, MuseTalk and LivePortrait are not bundled. Mute, pause and navigation cancel playback. Optional overrides: `ELEVENLABS_MODEL_ID` (TTS model, default `eleven_flash_v2_5`), `ELEVENLABS_STT_MODEL`, `BEDROCK_FAST_MODEL`, `ELEVENLABS_VIDEO_MODEL`. A `POST /api/encounters/:id/live-token` endpoint mints a short-lived single-use Scribe token and never exposes the API key to the browser.

Official references: [API authentication](https://elevenlabs.io/docs/api-reference/authentication), [finding a voice ID](https://help.elevenlabs.io/hc/en-us/articles/14599760033937-How-do-I-find-the-voice-ID-of-my-voices-via-the-website-and-API).

## Persistence and recovery

The backend atomically saves drafts, immutable releases and encounters in `data/state.json`. Attachments live under `data/files/`. The browser stores appearance and the active encounter ID. Restarting preserves the server record. Active attempts keep their original published profile.

S3 saves a recovery manifest after its referenced attachments. Explicit versioned profile paths and completed encounter records are copied too. A cloud failure leaves local recovery available and is reported. A later save retries the manifest and unsynced files. This single-process prototype has no distributed transactions or automatic cloud failover.

`npm run profiles:archive` also writes every profile document and artifact file to S3 and upserts those rows into RDS (`PGHOST`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`). Without RDS, the same tables are written to the local SQLite file. Set `PROFILE_S3_BUCKET` to choose a bucket other than `S3_BUCKET`. Set `PROFILE_ARCHIVE=true` to queue that copy after each save.

Stop the app before an explicit backup or restore:

```powershell
npm run backup
npm run restore
```

Restore creates `data-recovery-<timestamp>/`, preserving existing data. Set `VIRTUSP_DATA_DIR` to that directory name in `.env` to inspect it, then restart. Preserve local copies of `data/` and reviewed evaluation outputs before the Workshop account expires. Organizer images are optional: enable `AWS_IMAGES_ENABLED` only with authorized read access; otherwise a generic portrait appears.

## Troubleshooting

### Share the current synthetic demo patients

Pull main, stop the Node server, then run:

```powershell
npm run demo:sync
npm start
```

This imports [shared-demo.json](../corpus/shared-demo.json): 12 synthetic profiles (including Marlene) and two prepared groups. Portrait mappings/assets are committed alongside it. It excludes student aliases, encounters, assessments, assignments, credentials and runtime database files. The command creates an ignored backup, adds missing cases, appends a version when published case content differs, and preserves older versions and active attempts. Faculty drafts and differing local group edits are retained and reported. Running it twice does not create duplicate releases. It uses local JSON storage and makes no cloud calls. Existing additional local cases remain available.

The authored portrait assets are listed in [PORTRAITS.md](PORTRAITS.md). Unknown cases without an uploaded or authored portrait show a neutral avatar rather than an unrelated person's face.

| Symptom                                    | Next step                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Invalid or expired token                   | Refresh all three temporary credential values, including session token. Restart.        |
| Bedrock access denied or model unavailable | Check event region and model permission. Keep the model ID configurable.                |
| S3 access denied                           | Check bucket region and Workshop permissions. Local recovery remains available.         |
| Exact scripted replies                     | Check `AI_ENABLED`, restart and inspect the provider and recorded fallback reason.      |
| ElevenLabs denied                          | Check key scope, credits, voice access and model. Browser speech/text remain available. |
| Draft cannot launch                        | Resolve publication errors and acknowledge profile review.                              |
| Static-only page fails                     | Start the Node backend; the app requires its API.                                       |

The loopback app has selectable demo roles and server-enforced role/encounter boundaries, but no passwords. Anyone using the local picker can choose Faculty or another alias. Keep it local; shared deployment requires real authentication, tenant isolation and a storage redesign.
