# Talking-patient avatar

Inspected on 2026-10-10. Branch `feature/talking-patient-avatar`. Git HEAD `b046173c7beeabfdb1379d5aed01f12fe7ef1bf4` (`add the pathology test data`). The avatar libraries are in that commit. Follow-up fixes, route tests, the browser view test, this note, and the setup note are additional working-tree files and were not committed.

## Selected execution path

The educational encounter UI is the path this feature uses. The ground-truth routes in `lib/api.js` are a separate API and do not decide patient lines for this avatar.

1. `public/js/app.js` sends a finalized question to `POST /api/encounters/:id/turn`.
2. `lib/http.js` calls `lib/engine.js` `ask()`. The engine commits the patient transcript turn after the published case and disclosure checks.
3. The browser plays that turn through the existing portrait path (`GET /api/encounters/:id/speech/:turnId/stream`, MP3, or browser speech) unless a voice session is already active.
4. When `VirtuSPAvatar.ownsPlayback()` is true, `speak()` does not play that MP3. It sends `POST /api/encounters/:id/avatar/speak` with the saved `turnId` and a `playbackRequestId`.
5. `lib/avatar-session.js` loads that turn from the encounter record, accepts it only through `lib/avatar-policy.js`, and synthesizes that exact text.
6. LiveAvatar LITE receives PCM audio. It does not receive the case, hidden facts, or a second dialogue prompt.

There is one playback trigger: the frontend speak call after the turn is committed. The server does not also start speech when the turn is saved.

Encounters are server-owned. A speech request that supplies answer text, `case_facts`, or an `approved` flag is rejected before synthesis.

## Provider contract

Documentation read on 2026-10-10:

- https://docs.liveavatar.com/docs/lite-mode/overview
- https://docs.liveavatar.com/docs/lite-mode/lifecycle
- https://docs.liveavatar.com/docs/lite-mode/events
- https://docs.liveavatar.com/api-reference/sessions/create-session-token
- https://docs.liveavatar.com/api-reference/sessions/start-session
- https://docs.liveavatar.com/api-reference/sessions/stop-session
- https://elevenlabs.io/docs/api-reference/text-to-speech/stream
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play

Session creation is server-side only:

- `POST https://api.liveavatar.com/v1/sessions/token` with `X-API-KEY` and body `mode: "LITE"`, `avatar_id`, and `max_session_duration`.
- `POST https://api.liveavatar.com/v1/sessions/start` with `Authorization: Bearer <session_token>`.
- `POST https://api.liveavatar.com/v1/sessions/stop` with the API key and bearer token.

Success is the documented envelope `code === 100` plus `data`. Start must include `session_id`, `livekit_url`, `livekit_client_token`, and `ws_url`. The start schema describes `ws_url` as custom mode. LITE audio control still needs that socket. If it is missing, the adapter stops the session and falls back. That behavior has not been confirmed against a live account.

The API key, session token, agent token, and control WebSocket URL stay on the server. The browser receives `livekit_url` and `livekit_client_token` only, and only while `live` is true. Media is subscribed with the pinned `livekit-client` UMD served at `/vendor/livekit-client.umd.js`. The page does not publish the microphone into the room.

Commands used after `session.state_updated` reports `connected`: `agent.speak`, `agent.speak_end`, `agent.interrupt`, `agent.start_listening`, `agent.stop_listening`, and `session.keep_alive`. The first speak `event_id` is the utterance id.

ElevenLabs speech for this path uses `output_format=pcm_24000` (signed 16-bit little-endian, 24 kHz, mono). The existing MP3 stream stays on the portrait path. `apply_text_normalization` stays `on`. `optimize_streaming_latency` is `2`.

## Approved speech

`evaluateTurn` allows a committed patient turn only when its text is exactly:

- one or more disclosed ask-fact `say` lines, optionally prefixed by the server empathy lead;
- a server-owned courtesy already used by the engine;
- a server-owned unknown or deflection;
- the published profile intro.

Chart-only wording is rejected. Word overlap is not a match. Missing smoking, stroke, or family-history facts are not turned into negatives. A client cannot submit a replacement sentence.

Presentation events go to `enc.presentationLog`. They are not copied into `enc.events`, so speech generation is not assessment credit.

## Lifecycle

Sessions start only from **Start voice encounter**. They are bound to the demo-session owner, encounter id, published case version, and provider session id. The same encounter and owner returns the existing session. Starting another encounter for that owner stops the previous provider session.

A backend sweep stops sessions at the shorter of the application limit and the provider limit, and after the idle timeout. Browser `pagehide` also posts stop. Heartbeats call `session.keep_alive`. Comparison presentations (`presentationKey`) stay on the existing portrait and do not open LiveAvatar.

Billable routes require a loopback address and a localhost `Host` while `AVATAR_LOCAL_ONLY` is true (the default). Demo cookies are not authentication for a public deployment. Leave local-only on until encounters have real authentication.

Missing credentials return `connection: "unavailable"`, `live: false`, and `state: "FALLBACK"`. They do not call LiveAvatar and are not reported as connected. `AVATAR_PROVIDER=mock` is labeled `mock-connected` and `live: false`.

Fallback order is live avatar, then portrait audio of the approved line, then text. A failure after audio was already sent does not replay the whole line automatically. The status sets `partial` and `replayAvailable`.

## What this does not establish

No live LiveAvatar or ElevenLabs call was made for this change. Mock events and jsdom are not lip synchronization, audible quality, or clinical validation. `browserPlaybackAt` is reported as `unavailable` because the server clock is not synchronized with the browser.
