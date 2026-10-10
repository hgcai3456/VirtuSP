# VirtuSP

Virtual standardized patient simulator for healthcare education. Faculty author a patient once. Students interview by voice or text, read a chart that opens as they ask the right questions, reconcile authored contradictions, hand off in SBAR, and get feedback tied to evidence.

The model never decides what is medically true. Every patient line comes from an approved fact in the published profile.

## Run locally

```bash
cd ~/VirtuSP
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

Or run `npm start`. Node 16 or newer is enough. There is no install step, no API keys, and no sign-in.

Optional port:

```bash
PORT=8080 node server.js
```

Static-only alternative:

```bash
python3 -m http.server 3000 --directory public
```

Chrome or Edge is recommended if you want the microphone. Safari may not support speech recognition; use the text box. Edits save in the browser (`localStorage`). Use **Reset demo data** on Patient Studio for a clean demo.

## Demo path

1. Open the simulator from the landing page.
2. Edit Denise (or create a second patient from a template), validate, and publish.
3. Launch the encounter. Use suggested questions or type. Open Labs, Notes, and Medications.
4. Document the authored discrepancy, switch role, submit an SBAR handoff.
5. Open Assessment for evidence-linked scores.
6. Launch Marcus on the same engine. No code changes.

## Layout

- `public/index.html` — landing page
- `public/app.html` — simulator shell
- `public/js/app.js` — patients, validation, dialogue engine, voice/avatar adapters, UI
- `public/css/` — landing and app themes
- Data key: `virtusp-v1` (migrates older `ptl-v1` data once)

## Local demo services

The app runs without keys:

```js
SERVICES = { dialogue: 'local', voice: 'browser', avatar: 'svg' }
```

- Dialogue: keyword match over approved `facts[].say`
- Voice: browser `speechSynthesis` / `SpeechRecognition`
- Avatar: local SVG

Unknown questions stay unknown: the patient says they are not sure.

## Adding real AI later

When you have keys, replace these functions in `public/js/app.js` and keep the grounding rule (replies only from approved facts):

| Function | Current adapter | Later swap |
| --- | --- | --- |
| `ask()` | Local keyword matcher | Bedrock / LLM dialogue |
| `speak()` | Browser speech synthesis | Cloud TTS |
| `mic()` | Browser speech recognition | Cloud STT |

Suggested environment variables for that later pass (not required now):

```
BEDROCK_REGION=
BEDROCK_MODEL_ID=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Do not commit secrets. The UI will keep working in local demo mode until those adapters are wired.
