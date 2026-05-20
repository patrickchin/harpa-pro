# Voice Note Pipeline

> **Design document** — defines the end-to-end voice-note recording,
> upload, transcription, summarisation, and rendering pipeline shared
> between the mobile app (`apps/mobile`) and the Hono API
> (`packages/api`).
>
> Companion to [`plan-voice-pipeline.md`](plan-voice-pipeline.md)
> (seven-phase delivery checklist). Read this for the architecture;
> read the plan for the order of work.
>
> Related:
> - [`arch-mobile.md` §Voice note pipeline](arch-mobile.md#voice-note-pipeline)
> - [`arch-api-design.md` §Voice](arch-api-design.md#voice-voice-authed)
> - [`arch-storage.md`](arch-storage.md) — R2 upload contract
> - [`arch-ai-fixtures.md`](arch-ai-fixtures.md) — record/replay
> - [`pitfalls.md`](pitfalls.md) — Pitfalls 12, 13, 15 referenced below

## Problem statement

v4 inherits a half-built voice pipeline:

- The API exposes `POST /voice/transcribe` and `POST /voice/summarize`
  but not a single aggregator. Mobile would have to make four hops
  (presign → PUT → transcribe → summarize → createNote) and any
  network blip leaves the user with a paid-for transcript and no
  note row.
- `app.notes` collapses transcript + summary into one `transcript`
  column. There is no place to store the canonical *summary* (the
  text the report generator should read) separately from the raw
  transcript (the audit trail the user verifies).
- `useVoiceNotePipeline` does not exist; the `voice` surface on
  `GenerateReportProvider` is a no-op. The mic button on
  `GenerateReportInputBar` calls a no-op.
- `AudioPlaybackProvider` is a stub that throws on `play()` /
  `pause()` / `stop()`.
- `expo-audio` is not installed.
- AGENTS.md §Mobile dev / fixture mode claims fixture mode "stubs
  the iOS-simulator audio recorder" — no such stub exists.
- The upload queue lives in memory only; backgrounding the app
  during a long voice upload loses the recording.
- `/voice/summarize` is not idempotent — a retried request rebills.
- Both AI calls hard-code `vendor: 'openai'` instead of consulting
  `getAiSettings()` ([Pitfall 15](pitfalls.md#pitfall-15--route-handlers-that-ignore-user-settings)).
- LLM spend on transcribe + summarize is not attributed to a
  `(projectId, reportId)` — the Usage screen can't break voice down
  per project.

## Design decisions

### D1. One server-side aggregator, not four mobile hops

Add `POST /reports/{report}/notes/voice` (`{ fileId, language? }`).
The handler runs, in one scoped transaction:

1. Verify file ownership + that `file.kind === 'voice'`.
2. Load `getAiSettings(db, userId)` → `aiVendor`.
3. `transcribe()` against the signed R2 URL.
4. `chat()` with the canonical summary prompt against the transcript.
5. Insert one `app.notes` row (`kind='voice'`, `body=summary`,
   `transcript=transcript`, plus diagnostics).
6. Return the inserted note row.

Both AI calls share one `usageContext { db, userId, projectId,
reportId }` so spend lands attributed.

**Why aggregator, not "make mobile orchestrate":**

- Idempotency is one key (`fileId+reportId`), not three.
- Retry-after-network-blip never rebills.
- The DB row is created in the same transaction as the AI calls —
  no orphaned spend.
- Mobile state machine collapses from five steps to three.

### D2. Idempotency keyed on `(fileId, reportId)`

`withIdempotency({ name: 'voice.note', keyBy: (c) => fileId + ':' +
reportId })`. `fileId` is server-issued and immutable per upload;
`reportId` scopes the key to the right timeline. Retries after a
transport hiccup deduplicate to the same note row + the same
`llm_usage_events` rows.

### D3. Expand-only schema change

Add to `app.notes`:

| Column                 | Type            | Nullable | Purpose |
|---                     |---              |---       |---      |
| `title`                | `text` (≤ 200)  | yes      | **Generic** short headline. Today only the voice aggregator writes it (derived heuristically from `summary` — first sentence, ≤ 80 chars, word-cut + ellipsis); text / image / document notes leave it null but may populate it in the future (e.g. user-supplied document title, photo caption). The 200-char DB cap leaves headroom to swap the heuristic for a dedicated LLM call later without a follow-up migration. |
| `summary`              | `text`          | yes      | **Generic** long-form summary. For `kind='voice'` rows it is the canonical site-note body — what the report generator reads. Other kinds may populate it later. |
| `duration_sec`         | `int`           | yes      | Voice-only. Recording length (client-reported). |
| `language`             | `text`          | yes      | Voice-only. BCP-47 transcript language. |
| `transcribe_provider`  | `text`          | yes      | Voice-only. Vendor + model that produced the transcript (diagnostics). |
| `transcribed_at`       | `timestamptz`   | yes      | Voice-only. Server time of transcription. |

`transcript` stays as the raw transcript. `body` keeps its existing
meaning for non-voice notes; for `voice` notes `body` mirrors
`summary` (so existing readers that read `body` still get a sensible
human-readable string until they migrate to `summary`).

Migration `0004_notes_voice_columns.sql` is expand-only — `ADD COLUMN
… NULL`. No drops. Backfill (`UPDATE notes SET summary = body WHERE
kind='voice' AND summary IS NULL`) is a follow-up commit, not part of
this migration (database-reviewer rule: expand → ship → backfill →
contract).

### D4. Mobile state machine

```
idle
  └─ user taps mic ──────────► permission gate
       └─ granted? ──no──► AppDialogSheet "Microphone access" → idle
       └─ granted ──► recording
                        └─ stop ──► uploading
                                      ├─ presign → R2 PUT → registerFile
                                      ├─ then    ► transcribing
                                      │             └─ POST /reports/:id/notes/voice
                                      │                  ├─ 2xx ► saved (invalidate ['reportNotes'])
                                      │                  └─ err ► failed(failedStep)
                                      └─ err ────► failed(failedStep='upload')
       └─ user taps cancel ──► discard local audio, → idle
failed(step)
  └─ retry ──► resume from failedStep
  └─ discard ──► delete local audio file, idle
```

Pause / resume are intentionally absent in the Phase H inline UX
(WhatsApp/Telegram parity — tap-to-start, tap-to-send, tap-to-cancel).
The recorder factory still exposes `pause`/`resume` for future surfaces
that want them.

`failedStep` ∈ `{ 'upload', 'transcribe' }`. Retry from `'upload'`
re-runs presign + PUT (R2 may have GC'd the partial). Retry from
`'transcribe'` re-calls the aggregator with the **same** `fileId`,
which deduplicates via D2.

The local audio file (`features/voice/storage.ts`) is **not**
deleted until the pipeline reaches `saved` or the user explicitly
discards. This is the only "pending-note persistence" we ship in
this round — no separate `voice_jobs` table.

### D5. Capture UX

**Phase H (current):** the recording UI is an inline WhatsApp / Telegram
style strip rendered by `GenerateReportInputBar` while
`voice.isRecording` is true. State is owned by `useInlineRecorder`
(`features/voice/useInlineRecorder.ts`) and rendered by
`InlineVoiceRecorder` (`features/voice/InlineVoiceRecorder.tsx`).

Row layout (replaces the text-note + Photo + Mic row in-place):

```
[🗑 cancel] [● 0:08] [▁▂▅▇▆▃▁▂▄▆▇▅▃▁… scrolling waveform] [▶ send]
```

- Tap mic → permission check → arm recorder + show strip.
- Tap Send (`btn-record-send`) → stop, hand the finalised audio file
  to `useVoiceNotePipeline`, restore the input row.
- Tap Trash (`btn-record-cancel`) → discard local audio, restore input
  row. No discard-confirm sheet (lighter than the old modal flow,
  matches WhatsApp/Telegram).
- No pause/resume (Phase C carried both; Phase H drops them for
  parity with the WhatsApp/Telegram UX).

The permission-denied path opens an `AppDialogSheet` from the
provider (`Pitfall 12` — no `Alert.alert`). The same dialog scope
handles `errored` recorder events.

Audio output: `audio/m4a` (AAC-LC), 16 kHz mono, ≤ 50 MB enforced by
the upload contract. Phase F adds a client-side normalisation step
to guarantee 16 kHz mono regardless of device defaults.

**Historical:** Phase C–G shipped a full-screen `VoiceRecorderModal`
with explicit Record/Pause/Resume/Save/Discard buttons. Phase H
removes the modal entirely in favour of the inline strip.

### D6. Fixture mode contract

When `EXPO_PUBLIC_USE_FIXTURES === 'true'` (set by `pnpm ios:mock`),
`pickRecorderFactory()` returns the canned
`fixtureRecorderFactory` instead of `expoAudioRecorderFactory`. The
fixture backend:

1. Skips the permission gate (returns `'granted'`).
2. Emits synthesised amplitude samples so the inline strip's waveform
   animates in fixture mode.
3. On `stop()`, resolves the bundled
   `apps/mobile/assets/fixtures/voice-sample.m4a` URI so the queue
   has a real local file to enqueue.

This **is** the AGENTS.md "stubbing the iOS-simulator audio recorder"
promise.
[Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken):
the fixture-mode integration test calls the real upload pipeline and
the real aggregator against fixture AI providers; no `setUploadDeps`,
no aggregator mocks on the happy path.

### D7. Read side

`VoiceNoteCard` (`features/voice/VoiceNoteCard.tsx`) — landed in Phase E:

- Header strip with state label derived in
  `voiceNoteCardHeader.ts` (`deriveVoiceCardHeader`): one of
  `Uploading… / Transcribing… / Voice note (ready) / Voice note failed`.
- Play / pause + duration via `useAudioPlayback()` (real, single
  active note — see §D8).
- Duration formatted as `m:ss` (`formatDuration`); waveform / scrubber
  visualisation deferred to Phase F polish.
- Summary preview (one-line foreground text) above a transcript
  toggle that expands the full STT output.
- Inline `Retry` pill rendered on `failed`; calls
  `voice.retry()` on the `GenerateReport` provider surface, which
  hands off to `useVoiceNotePipeline.retry()`.

`noteToEntry()` in the generate route stops collapsing transcript +
summary into a single line — voice rows on `NoteEntry` carry
`fileId`, `transcript`, `summary`, `durationSec` separately so the
card never re-fetches the row. Wired into:

- `NoteTimeline` (generate screen — draft side). The provider also
  injects a synthetic `voiceStatus: 'uploading' | 'transcribing' |
  'failed'` `NoteEntry` while the pipeline is in flight so the card
  renders the spinner / retry pill until the saved row arrives via
  the invalidated `useReportNotesQuery`.
- `ReportNotesPane` (saved report — only `ready` rows because the
  aggregator never inserts on failure). Server-side `summary`,
  `transcript`, `durationSec`, and `fileId` are threaded through
  `ReportNoteRow` into `VoiceNoteRow`, which reuses the same
  `useAudioPlayback` + `formatDuration` helpers as the draft card.

### D8. Playback

`AudioPlaybackProvider` (Phase D) backs the read side with a single
`expo-audio` player instance. Contract:

- One active player at a time. Starting `play(uriB)` while
  `play(uriA)` is active calls `pause()` + `remove()` on A first,
  then constructs a new player for B.
- `play(uri)` — caller resolves the signed R2 URL via
  `useFileSignedUrl(fileId)` first. Resuming the currently-loaded uri
  while paused does NOT reconstruct the player (position is preserved).
- `pause()`, `stop()` (pause + release), `seek(seconds)` operate on
  the active player.
- Subscribers (`VoiceNoteCard`, `VoiceNoteRow`) read
  `useAudioPlayback().status` → `{ uri, playing, positionSec,
  durationSec }`. Each card scopes the status to its own row by
  comparing `status.uri === audioUri`.
- A `playerFactory` prop lets node tests swap the lazy
  `createAudioPlayer` require for a fake — production code never
  passes it.

No global audio session juggling beyond what `expo-audio` does for
us; iOS interruption (incoming call) pauses playback automatically.

### D8a. Background audio coordination (`lib/audio/audioSession.ts`)

WhatsApp / Telegram / Voice Memos all behave the same way: starting
a recording or playing a voice note **pauses** any music app in the
background and **resumes** it when you're done. We match that with a
single refcounted helper module:

- `beginPlayback()` / `endPlayback()` — wraps any voice-note
  playback. Sets `interruptionMode: 'doNotMix'` + `playsInSilentMode:
  true` (so voice notes are audible even when the iPhone silent
  switch is on, and so Spotify is paused while we play), and calls
  `setIsAudioActiveAsync(true)` on the first client.
- `beginRecording()` / `endRecording()` — wraps any voice-note
  recording. Same policy plus `allowsRecording: true` (which forces
  iOS into the `.playAndRecord` AVAudioSession category). On end,
  reverts `allowsRecording: false` so subsequent playback isn't
  stuck routing through the ear receiver.
- Refcounted across clients so overlapping lifecycles (e.g. starting
  a new recording before the previous playback has fully torn down)
  don't leave background music paused indefinitely. Only the LAST
  `end*()` call deactivates the session.
- Session deactivation calls `setIsAudioActiveAsync(false)` — iOS
  sends `AVAudioSessionInterruptionTypeEnded` with
  `.notifyOthersOnDeactivation`, which is the cue Spotify et al. use
  to resume.

Cross-feature coordination: `GenerateReportProvider.handleVoiceStart`
calls `playback.stop()` before `inlineRecorder.start()` if a
previous voice note is currently playing. Otherwise the iOS category
switch interrupts the playback player abruptly and the UI never sees
the pause transition.

Failure mode: all `setAudioModeAsync` / `setIsAudioActiveAsync` calls
are wrapped in `try/catch`. An audio-session config error must not
break the recorder or the player itself — that's the user-visible
surface.

### D9. Robustness (Phase F)

**Landed:**

1. **Queue persistence** — `AsyncStorage` snapshot keyed
   `harpa.uploads.queue.v1`. Persisted on every notify (status,
   progress). Snapshot drops `completed` jobs (server already owns
   them) and normalises in-flight statuses to `pending` so a crash
   mid-PUT resumes cleanly. `rehydrate()` is called once on
   `QueueProvider` mount; jobs are deduped by `id` and by
   `input.clientId`. Corrupt snapshots are dropped via
   `removeItem` instead of crashing. Rehydrated jobs lose their
   original promise consumers (no-op resolvers) — callers that need
   the outcome re-enqueue with the same `clientId`, which hijacks
   the existing job's resolvers.
2. **AbortSignal** — `UploadDeps.putToR2` accepts an
   `AbortSignal`. The XHR path calls `xhr.abort()` on signal abort;
   the fetch fallback forwards the signal directly. `queue.remove()`
   on an in-flight job triggers the controller; `runUploadJob`
   surfaces an "abort" error which `processJob` matches via
   `/abort/i` regex and treats as terminal (no retry). The voice
   pipeline forwards `clientId = voice:${reportId}:${uri}:${size}`
   so retries are idempotent across app restarts.

**Deferred (rationale):**

3. **Audio normalisation** (`normalizeAudio(localUri) → 16 kHz
   mono m4a`) requires `ffmpeg-kit` (native module), is not
   testable in node-only vitest, and risks app-size regressions.
   Server-side transcription tolerates the `HIGH_QUALITY`
   recorder preset (aac/m4a, 44.1 kHz). Track in
   `docs/bugs/README.md` if real recordings produce poor
   transcripts.
4. **Interim transcript** (`expo-speech-recognition` under
   `EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPT`) requires a native module
   and platform-specific permission flow; defer until the recorder
   UX has a confirmed need and a Maestro flow that can exercise it.

### D10. Errors surface as `AppDialogSheet`, not `Alert.alert`

All user-visible errors (mic denied, mic busy, upload failed,
transcribe failed, file too long) go through `useAppDialogSheet()`
([Pitfall 12](pitfalls.md#pitfall-12--alertalert-used-for-app-dialogs)).
In Phase H the dialogs are owned by `GenerateReportProvider` (one
permission-denied dialog, one recorder-error dialog), keyed off
`useInlineRecorder.permission` and `.error`. The inline strip
itself never renders an `Alert.alert`.

### D11. No expo-file-system (deprecated)

The voice code does NOT depend on `expo-file-system`. The recorder
reads its own file size via `fetch(uri).then(r => r.blob()).size`
(works for `file://` URIs in RN) and skips eager deletion of
discarded recordings — the OS cleans the cache directory eventually
and a few KB of orphaned m4a is an acceptable trade for not pulling
in a deprecated dep.

## Data flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ apps/mobile                                                          │
│                                                                      │
│  ┌─────────────────────┐    user taps mic                            │
│  │ GenerateReportInput │────────────────────────┐                    │
│  │      Bar (mic)      │                        ▼                    │
│  └─────────────────────┘            ┌────────────────────────┐       │
│                                     │ inline record strip    │       │
│                                     │ (Phase H, WhatsApp-    │       │
│                                     │  style)                │       │
│                                     │ - perm gate dialog     │       │
│                                     │ - 🗑 / ●0:08 / waveform│       │
│                                     │ - ▶ send               │       │
│                                     └──────────┬─────────────┘       │
│                                                │ save                │
│                                                ▼                     │
│                                    ┌────────────────────────┐        │
│                                    │ useVoiceNotePipeline   │        │
│                                    │ state machine (D4)     │        │
│                                    └──────────┬─────────────┘        │
│                                               │                      │
│       ┌────── presign ─── PUT ─── register ───┘                      │
│       │   (existing useFileUpload, kind:'voice', reportId: undef,    │
│       │    so the queue stops after registerFile — no createNote)    │
│       ▼                                                              │
│  ┌──────────┐  fileId           ┌───────────────────────────────┐    │
│  │  R2      │ ─────────────────►│ useCreateVoiceNoteMutation    │    │
│  └──────────┘                   │ POST /reports/:id/notes/voice │    │
│                                 └────────────┬──────────────────┘    │
│                                              │                       │
│                                              ▼                       │
│                                  invalidate(['reportNotes'])         │
│                                  → VoiceNoteCard renders             │
└──────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ packages/api: POST /reports/:reportId/notes/voice                    │
│                                                                      │
│   withAuth + withRateLimit + withIdempotency(keyBy fileId:reportId)  │
│                                                                      │
│   1. assertReportMember + getFile + assertFileOwnerAndKind('voice')  │
│   2. getAiSettings(db, userId) → { aiVendor }                        │
│   3. signed = pickStorage().signGet(file.fileKey)                    │
│   4. transcribe({ audioUrl: signed.url, vendor,                      │
│                    usageContext: { db, userId, projectId,            │
│                                    reportId }})                      │
│   5. chat({ systemPrompt: voiceSummaryPrompt(language),              │
│             userPrompt: transcript, vendor,                          │
│             usageContext: { db, userId, projectId, reportId }})      │
│   6. INSERT app.notes ({ kind:'voice', body: summary,                │
│                          transcript, summary, durationSec,           │
│                          language, transcribeProvider: `${vendor}:${model}`,│
│                          transcribedAt: now() })                     │
│   7. 200 → returns the inserted note row (existing notesRowShape)    │
└──────────────────────────────────────────────────────────────────────┘
```

## Contract additions (`packages/api-contract/src/schemas/notes.ts`)

```ts
export const createVoiceNoteRequest = z.object({
  fileId,                       // existing fileId shape
  language: z.string().min(2).max(8).optional(),  // BCP-47, e.g. "en-US"
  durationSec: z.number().int().min(1).max(60 * 60).optional(),
});

// The response reuses the existing `noteResponse` schema; the
// returned note row carries `kind='voice'`, `transcript`, `summary`,
// `body` (== summary), `durationSec`, `language`.
```

## Rate-limiting / idempotency budget

| Route                                    | Limit                | Idempotency                       |
|---                                       |---                   |---                                |
| `POST /reports/:reportId/notes/voice`    | 30 / min / user      | `voice.note` keyed `fileId+reportId` |

The aggregator's downstream `transcribe` + `chat` calls bypass the
per-route AI rate-limiters because the aggregator is itself
rate-limited (the user-facing surface). This avoids double-billing
the limiter for one user action.

## Tests

### API (`packages/api/src/__tests__/`)

- `voice-aggregator.integration.test.ts` — Pitfall 13 default
  wiring: real `transcribe` + `chat` via fixture providers, real
  R2 stub, real DB. Asserts:
  - Note row inserted with `kind='voice'`, `summary`, `transcript`,
    `transcribed_at`, `transcribe_provider`.
  - Two `llm_usage_events` rows with matching `(project_id,
    report_id)`.
  - Retry with same `fileId+reportId` returns the same `noteId`
    (idempotency) and inserts **zero** additional usage rows.
  - 404 when caller is not a member of the report.
  - 404 when `fileId` is not owned by caller.
  - 400 when `file.kind !== 'voice'`.
  - 502 when transcribe fails — **no** partial note row.

- `voice-aggregator.scope.test.ts` — per-request scope coverage:
  member of report A cannot create a voice note on report B; non-owner
  of `fileId` cannot summon it onto their own report.

### Mobile (`apps/mobile/__tests__/` + `features/voice/__tests__/`)

- `useVoiceNotePipeline.test.tsx` — state machine transitions
  including `failed → retry → saved`.
- `VoiceNoteCard.test.tsx` — three header states; transcript
  expander; retry button surfaces only on `failed`.
- `AudioPlaybackProvider.test.tsx` — playing note B pauses note A.
- `record-voice.test.tsx` — permission denial → `AppDialogSheet`,
  not `Alert.alert`; save enqueues into pipeline with expected
  `{kind:'voice', sourceUri, contentType:'audio/m4a'}` shape.
- `voice-pipeline.fixture.test.tsx` — end-to-end pipeline with
  `EXPO_PUBLIC_USE_FIXTURES=true`: tap fixture-save button →
  `note.kind='voice'` row appears with non-empty
  `summary` + `transcript`. **No** `setUploadDeps` or aggregator
  mock (Pitfall 13).

### E2E (`.maestro/`)

- `p3-15-voice-record.yaml` — boots the app under fixture mode,
  opens a report, taps the mic, taps the fixture-save button,
  asserts the new voice card appears with a transcript line.
- `core-end-to-end.yaml` voice step — replace the currently
  false-green tap with a real assertion that the voice card
  appears post-record.

## Error envelope mapping

| Cause                              | API status | Mobile surface |
|---                                 |---         |---             |
| Mic permission denied              | n/a        | `AppDialogSheet` with Open Settings CTA |
| Recording shorter than 1 sec       | 400        | Inline toast "Recording too short" |
| Recording > 50 MB                  | 413        | `AppDialogSheet` "Recording too long" |
| R2 PUT 5xx                         | n/a        | Pipeline `failed('upload')` → retry CTA on card |
| Aggregator 502 (transcribe down)   | 502        | Pipeline `failed('transcribe')` → retry CTA on card |
| Aggregator 404 (file not found)    | 404        | `AppDialogSheet` "This recording is no longer available" + discard |

## Open questions deferred

- **Speaker diarisation** — out of scope. The schema can grow a
  `speakers jsonb` column later without a contract change to
  callers.
- **Server-side audio transcoding** — out of scope. We rely on
  client-side normalisation (Phase F). If devices ship recordings
  the AI providers reject, we revisit.
- **Voice search** — out of scope. The `summary` column is indexed
  by Postgres' default text behaviour; adding a trigram or `tsvector`
  index is a P4 follow-up.

## Migration / rollout

- **Phase A** (this commit) — design + arch-mobile drift fix +
  AGENTS.md fixture line.
- **Phase B** — schema migration + aggregator + contract. Old
  `/voice/transcribe` and `/voice/summarize` stay shipped (mobile
  no longer uses them, but the CLI and any external consumer keep
  working).
- **Phase C–F** — mobile UX, hook, playback, read side, robustness.
- **Phase G** — Maestro flow + AGENTS.md / arch-mobile / plan tick
  fix-ups.

Old behaviour (mobile calling `/voice/transcribe` and
`/voice/summarize` directly) is removed entirely in Phase D — there
is no flag, no two-path window. The aggregator is strictly better
on every dimension that mattered (idempotency, spend attribution,
vendor selection, one DB transaction).
