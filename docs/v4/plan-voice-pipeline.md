# Voice Note Pipeline — Completion Plan

> **Status:** Phases A–D shipped (design, server aggregator, mobile
> capture, mobile read side). Phases E–G (queue persistence,
> abort plumbing, on-device interim transcript) remain open and are
> tracked here. Voice-note E2E is gated by
> `.maestro/modules/09-voice-notes.yaml` in the regression journey.

## Problem

The voice-note pipeline is half-built: the API can transcribe and summarise audio, and the upload contract accepts `kind: 'voice'`, but **mobile capture is a no-op stub end-to-end**. There is no recorder, no permission flow, no `useVoiceNotePipeline` hook, no `VoiceNoteCard`, the `AudioPlaybackProvider` throws on `play()`, and `expo-audio` is not installed. AGENTS.md also lies about a fixture-mode simulator stub that doesn't exist. Several P1 correctness bugs (no idempotency on `/voice/summarize`, missing spend attribution, transcript/summary collide in one DB slot) and P2 polish gaps (no queue persistence, no in-flight abort, no on-device interim transcript) compound this.

## Approach

Land the work in **seven sequential phases**, each gated by tests + docs (per AGENTS.md hard rule #3 and #5). Big architectural decisions are made up front:

- **Data model**: add `summary` column to `app.notes` (expand-only migration); add `durationSec`, `language`, `provider`, `transcribedAt` for diagnostics.
- **API shape**: a single server aggregator `POST /reports/:reportId/notes/voice { fileId, language? }` runs transcribe → summarize → insert `notes` row in one scoped transaction. Idempotency keyed on `fileId`. Replaces the four-hop mobile orchestration.
- **Mobile UX**: a dedicated full-screen modal recorder at `app/(app)/projects/[project]/reports/[number]/record-voice.tsx`, triggered by the existing mic button. Permission denial / errors use `AppDialogSheet` (Pitfall 12). Fixture mode produces a canned audio file (Pitfall 13 / fixture stub promise).
- **Read side**: `VoiceNoteCard` with playback (real `AudioPlaybackProvider`), transcript expander, summary preview, retry affordance for `failed` rows.
- **Robustness**: AsyncStorage-backed upload queue persistence, `AbortSignal` plumbed through the upload pipeline, opus/m4a 16 kHz mono normalisation before upload, optional on-device interim transcript via `expo-speech-recognition`.

Each phase ends with a doc + checkbox update (`docs/v4/arch-voice-pipeline.md`, `arch-mobile.md`, `arch-api-design.md`, `plan-p3-feature-build.md §P3.15.6` or new `plan-p4`), and a passing test suite at the appropriate layer.

---

## Phases

### Phase A — Design + scaffolding
Author `docs/v4/arch-voice-pipeline.md` capturing the state machine, data model, aggregator contract, fixture behaviour, error states; update `arch-mobile.md §Voice note pipeline` drift; add `plan-p3-feature-build.md §P3.15.6` (or `plan-p4-voice.md`) checklist; fix the AGENTS.md fixture-stub claim to match the implementation we're about to ship.

### Phase B — Data model + server aggregator (API)
Expand-only Drizzle migration: add `summary text`, `duration_sec int`, `language text`, `transcribe_provider text`, `transcribed_at timestamptz` to `app.notes`. New route `POST /reports/:reportId/notes/voice` with `withAuth + withRateLimit + withIdempotency({ name: 'voice.note', keyBy: fileId+reportId })`; runs transcribe + summarize sharing `usageContext { projectId, reportId, userId }`; inserts the note in the same transaction. Integration test exercises real fixture providers (Pitfall 13). Also: extract summarize system prompt into `packages/api/src/prompts/voiceSummary.ts`; add `language` and `durationSec` to the contract.

### Phase C — Mobile capture UX
Install `expo-audio`. Add `features/voice/` directory. Build full-screen recorder modal with: permission gate (via `AppDialogSheet`), record/pause/resume/stop, amplitude meter + waveform, elapsed time, discard sheet, save action. Route from the existing mic button (`GenerateReportInputBar`). Fixture mode (`EXPO_PUBLIC_USE_FIXTURES`) bypasses the recorder and emits a canned audio file from `apps/mobile/assets/fixtures/voice-sample.m4a`.

### Phase D — Mobile pipeline hook + provider wiring + playback
Write `useVoiceNotePipeline({ reportId })` orchestrating: local file → enqueue upload (existing `useFileUpload`, `kind: 'voice'`) → `useCreateVoiceNoteMutation` (aggregator) → invalidate `['reportNotes']`. State machine: `idle → recording → uploading → transcribing → saved | failed (with failedStep)`. Replace the no-op `voice` surface in `GenerateReportProvider` with this hook. Replace the throwing `AudioPlaybackProvider` with a real single-instance `expo-audio` player (play/pause/stop/seek, one active note at a time).

### Phase E — Read-side rendering
Build `VoiceNoteCard` (waveform/scrubber, play/pause, duration, transcript expander, summary preview, retry button on `failed`, three-state header `transcribing… / ready / failed`). Wire into `NoteTimeline` (generate-screen side) and `ReportNotesPane` (saved-report side). Update `noteToEntry` to surface both `transcript` and `summary` instead of collapsing.

### Phase F — Robustness / polish
1. Upload queue persistence via AsyncStorage (rehydrate on app boot, dedupe by client id).
2. Thread `AbortSignal` through `putToR2`; `queue.remove()` actually cancels.
3. Client-side audio normalisation to 16 kHz mono m4a before upload.
4. Optional on-device interim transcript via `expo-speech-recognition` behind a feature flag; falls back gracefully when unavailable.

### Phase G — E2E, doc fixes, false-green removal
- Real Maestro module `modules/09-voice-notes.yaml` that records via fixture stub and asserts a `note.kind='voice'` row with non-empty transcript + summary appears.
- Fix `core-end-to-end.yaml:333-335` so the existing voice step is no longer false-green.
- Final pass over `arch-mobile.md §State management` (legend-state vs hand-rolled queue drift) and `AGENTS.md` (fixture-stub language now accurate).
- Tick `plan-p3-feature-build.md §P3.15.6` checkboxes.

---

## Notes / considerations

- **Idempotency**: aggregator key is derived from `fileId` (immutable per upload) so retries from mobile after transport hiccup never rebill.
- **Spend attribution**: both transcribe and summarize calls inside the aggregator share one `usageContext` carrying `projectId + reportId + userId`, fixing the current blind spot.
- **Vendor selection** (Pitfall 15): aggregator reads `getAiSettings(d, userId)` and passes `aiVendor` into both calls — no more hard-coded `openai`.
- **Pending-note persistence**: not building a separate `voice_jobs` table. The aggregator either succeeds-with-row or fails-with-no-row; mobile-side failures surface in the `useVoiceNotePipeline` state machine, which keeps the local audio file until the user retries or discards. If we later see lost-recording bugs we revisit.
- **No `Alert.alert`** anywhere (Pitfall 12). All permission / error UX uses `AppDialogSheet`.
- **DI defaults exercised** by integration tests (Pitfall 13 / docs/bugs R5). No mocking of `defaultUploadDeps` or the aggregator's transcribe/summarize collaborators in the happy-path test.
- **Migration is expand-only** (database-reviewer rules): add nullable columns, ship, then a follow-up commit can backfill. No drops.
- **Fixture stub now real**: AGENTS.md promise honoured in Phase C — the mic button in `EXPO_PUBLIC_USE_FIXTURES=true` records a canned file end-to-end, exercising the real upload + aggregator path against fixture providers.
