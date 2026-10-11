# Talking-patient avatar setup

The avatar is off until you set the values below in your local `.env`. Do not paste API keys into chat, commit `.env`, or put keys in `public/`.

Copy `.env.example` to `.env` only when `.env` does not already exist.

## Values you supply locally

| Name | What to enter |
| --- | --- |
| `AVATAR_ENABLED` | `true` only while you want the voice session controls to open a provider session. |
| `AVATAR_PROVIDER` | `liveavatar` for the real adapter. `mock` is for tests and is not a live session. |
| `LIVEAVATAR_API_KEY` | Your LiveAvatar API key. |
| `LIVEAVATAR_DEFAULT_AVATAR_ID` | A stock avatar UUID you are allowed to use. Do not upload a person's likeness. |
| `LIVEAVATAR_MODE` | `LITE`. Any other value stays on the portrait fallback. |
| `ELEVENLABS_API_KEY` | The key the existing speech path already uses. |
| `ELEVENLABS_VOICE_ID` | The existing voice id. |
| `ELEVENLABS_MODEL_ID` | Optional. The default remains `eleven_flash_v2_5`. |

Optional limits already read by the server: `AVATAR_MAX_SESSION_SECONDS` (default 600), `AVATAR_IDLE_TIMEOUT_SECONDS` (default 90), `AVATAR_PCM_CHUNK_BYTES` (default 48000), `AVATAR_PCM_MAX_BUFFER_BYTES`, `AVATAR_MAX_UTTERANCE_SECONDS`, `AVATAR_MAX_SESSIONS_PER_MINUTE`, `AVATAR_MAX_CONCURRENT`, `AVATAR_HEARTBEAT_MS`. Keep `AVATAR_LOCAL_ONLY=true` until encounter ownership is real authentication. Shared hosting of these routes is not enabled by this setup.

## PowerShell

```powershell
cd C:\Users\Jasna\VirtuSP\VirtuSP-upstream
npm ci
npm start
```

Open http://127.0.0.1:3000/app.html . Sign in with the local demo workspace, open a synthetic patient encounter, and choose **Start voice encounter**. **End voice session** releases the avatar. It does not complete the clinical encounter.

Typed questions and the chart stay available when the microphone is denied or the live avatar is not configured.

## Tests

`npm test` runs `tests/*.test.js`, including `tests/avatar.test.js` and `tests/avatar-view.test.js`. Those tests use the mock provider and do not call LiveAvatar or ElevenLabs.

```powershell
npm test
node --test --test-timeout=120000 tests/avatar.test.js tests/avatar-view.test.js
```

The default smoke command does not contact a provider:

```powershell
npm run avatar:smoke
```

## Opt-in live smoke test

This opens one billable session. Run it only when you intend to spend credits. It speaks the server-owned sentence `Hello.`, waits for provider events, interrupts, and stops the session in a `finally` block. It does not listen to the result or judge lip synchronization. `liveAudioObserved` and `lipSyncObserved` stay false.

```powershell
node scripts/avatar-smoke.js --live
```

## Manual browser rehearsal

Use a synthetic encounter on localhost. Record what you actually saw and heard.

- Ask a question the published case answers, and confirm the spoken line matches the transcript.
- Ask something the case does not specify, and confirm the reply stays an unknown rather than a new fact.
- Ask a line that contains a dose or a blood-pressure pair, and listen for the number order and the negation.
- Choose **Stop speaking** while the patient is talking.
- Switch to another patient and confirm the previous answer does not continue.
- Disconnect or stop the provider and confirm the portrait or text fallback, without a second copy of the audio.
- Deny the microphone and type the question.
- Read the captions.
- Narrow the window and confirm the avatar controls remain reachable.

A green automated test does not replace this rehearsal.
