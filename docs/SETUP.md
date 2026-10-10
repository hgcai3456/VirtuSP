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
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SESSION_TOKEN=your_session_token
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

Open [the simulator](http://localhost:3000/app.html). The header says **configured**, not verified quality. Actual patient turns display their provider; a failed model request uses approved wording and records the reason. Storage status distinguishes local saves from pending, failed and successful S3 copies.

## ElevenLabs can be added later

Leave `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` empty to use text and browser speech. Recognition starts only with **Tap to talk**, requires microphone permission and may send audio to the browser vendor's service. Use synthetic scenarios and text when recognition is unavailable.

In ElevenLabs, copy the key under Developers → API Keys. In My Voices, use the voice menu → Copy voice ID. Put both in `.env`, then restart the server. Enable text-to-speech access for a restricted key; voice metadata preflight also needs voice read access. An optional per-patient voice ID is editable in Studio. Only saved, validated patient replies are sent for speech. Mute, Pause and navigation cancel playback.

Official references: [API authentication](https://elevenlabs.io/docs/api-reference/authentication), [finding a voice ID](https://help.elevenlabs.io/hc/en-us/articles/14599760033937-How-do-I-find-the-voice-ID-of-my-voices-via-the-website-and-API).

## Persistence and recovery

The backend atomically saves drafts, immutable releases and encounters in `data/state.json`. Attachments live under `data/files/`. The browser stores appearance and the active encounter ID. Restarting preserves the server record. Active attempts keep their original published profile.

S3 saves a recovery manifest after its referenced attachments. Explicit versioned profile paths and completed encounter records are copied too. A cloud failure leaves local recovery available and is reported. A later save retries the manifest and unsynced files. This single-process prototype has no distributed transactions or automatic cloud failover.

Stop the app before an explicit backup or restore:

```powershell
npm run backup
npm run restore
```

Restore creates `data-recovery-<timestamp>/`, preserving existing data. Set `VIRTUSP_DATA_DIR` to that directory name in `.env` to inspect it, then restart. Preserve local copies of `data/` and reviewed evaluation outputs before the Workshop account expires. Organizer images are optional: enable `AWS_IMAGES_ENABLED` only with authorized read access; otherwise a generic portrait appears.

## Troubleshooting

| Symptom                                    | Next step                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Invalid or expired token                   | Refresh all three temporary credential values, including session token. Restart.        |
| Bedrock access denied or model unavailable | Check event region and model permission. Keep the model ID configurable.                |
| S3 access denied                           | Check bucket region and Workshop permissions. Local recovery remains available.         |
| Exact scripted replies                     | Check `AI_ENABLED`, restart and inspect the provider and recorded fallback reason.      |
| ElevenLabs denied                          | Check key scope, credits, voice access and model. Browser speech/text remain available. |
| Draft cannot launch                        | Resolve publication errors and acknowledge profile review.                              |
| Static-only page fails                     | Start the Node backend; the app requires its API.                                       |

The loopback app has no login or faculty/student access control. Student views enforce encounter disclosure, but someone with local API access can open faculty endpoints. Keep it local; shared deployment requires authentication, authorization, tenant isolation and a storage redesign.
