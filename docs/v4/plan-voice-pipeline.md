# Voice-note pipeline delivery record

> **Historical plan, current status: shipped.** The server aggregator,
> inline recorder, upload pipeline, read-side cards, playback, queue
> persistence, cancellation, and Maestro module are implemented.
> Audio normalization and on-device interim transcription were
> intentionally deferred. Use
> [`arch-voice-pipeline.md`](arch-voice-pipeline.md) for current behavior.

## Delivered architecture

The shipped path is:

```text
inline recorder
  -> upload and register voice file
  -> POST /reports/{report}/notes/voice
  -> transcribe and summarize on the API
  -> create one voice note
  -> invalidate report and note caches
```

The API aggregator owns AI settings, usage attribution, idempotency,
and note insertion. Mobile does not call `/voice/transcribe` or
`/voice/summarize` for the integrated note flow.

## Phase status

### A. Design and schema

Shipped:

- `arch-voice-pipeline.md`.
- Nullable voice metadata on `app.notes`.
- Separate raw transcript and human-readable summary fields.

### B. Server aggregator

Shipped:

- `POST /reports/{report}/notes/voice`.
- Writer-role and scoped file access checks.
- Pre-action usage-limit checks.
- Transcription and summary usage attribution.
- Caller-supplied `Idempotency-Key` support.
- Default-wiring and scope integration tests.

The older standalone voice routes remain available for CLI and API
consumers. The mobile note flow does not use them.

### C. Recorder

Shipped and later redesigned:

- Expo Audio recorder adapter.
- Deterministic fixture recorder.
- Microphone permission handling through `AppDialogSheet`.
- Inline start, waveform, duration, send, and cancel controls.
- Ten-minute warning and 15-minute automatic send.

The first implementation used a full-screen modal with pause and
resume. The current composer uses the inline recorder and omits those
controls.

### D. Mobile pipeline and playback

Shipped:

- `useVoiceNotePipeline` state and retry handling.
- File upload before the aggregator call.
- A stable `fileId` across aggregator retries.
- Query invalidation through the central invalidation map.
- One-active-note `AudioPlaybackProvider`.
- Shared draft and saved-report voice cards.

### E. Persistence and cancellation

Shipped:

- User-scoped MMKV upload snapshots.
- Rehydration of interrupted jobs as `pending`.
- Local source existence checks.
- `AbortSignal` support for upload cancellation and session teardown.
- `clientId` deduplication for repeated recording submission.

This supersedes the original AsyncStorage proposal.

### F. Device coverage

Shipped:

- Unit tests for the native and fixture recorder adapters.
- Pipeline tests through the default upload and request boundaries.
- API default-wiring and scope tests.
- `.maestro/modules/09-voice-notes.yaml` in the regression journey.

## Deferred decisions

### Audio normalization

The app records AAC/M4A with the platform configuration in
`expoAudioRecorder.ts`. It does not bundle an FFmpeg normalization
module. The API enforces a 25 MB voice limit.

Add normalization only after device evidence shows that the supported
recording configuration is insufficient. The change needs native build
and real-device tests.

### Interim transcript

The app does not install `expo-speech-recognition`, does not define
`useLiveTranscript`, and does not support
`EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPT`.

Add this feature only with a product requirement, platform permission
design, and device-level test coverage.

## Fixture boundary

`EXPO_PUBLIC_USE_FIXTURES=true` selects the bundled mobile recorder.
It does not configure the API. The API independently selects AI live
or replay mode through `AI_LIVE`.

A fixture recorder can still call a live API if the mobile API URL
targets one. Test and runbook text must not describe `ios:mock` as a
complete no-cost or no-network mode.

## Acceptance references

- `apps/mobile/features/voice/`
- `apps/mobile/lib/audio/`
- `apps/mobile/components/notes/VoiceNoteCard.tsx`
- `packages/api/src/routes/voice.ts`
- `packages/api/src/__tests__/voice-aggregator.integration.test.ts`
- `packages/api/src/__tests__/scope/voice.scope.test.ts`
- `.maestro/modules/09-voice-notes.yaml`
