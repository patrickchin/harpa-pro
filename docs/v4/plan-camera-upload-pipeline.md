# Plan: Complete the Camera Capture & Upload Pipeline

## Problem

The 4-step upload pipeline (presign → R2 PUT → register → createNote) is
correctly designed and exercised on the happy path via `FixtureStorage`,
but the feature is **not user-complete**:

- Successful image uploads render as the literal string `"📷 Photo"` in
  the timeline (`NoteTimeline` has no `ImageNoteCard`).
- The attachment sheet (gallery picker) is a "coming soon" stub.
- The upload queue is in-memory, with no progress / retry / cancel UI
  and no persistence across app kill.
- No client-side downscale: bursts can produce 4–8 MB JPEGs; no client
  guard vs. the 50 MB API cap.
- Two pitfall regressions: Maestro `appId` is hardcoded (Pitfall 9),
  and the route-level `R2Storage` is never default-wired in tests
  (Pitfall 13 trapdoor — `pickStorage()` short-circuits on
  `NODE_ENV==='test'`).
- No cross-owner scope test for `/files/*` (Pitfall 6).
- No live-pipeline Maestro E2E (Pitfall 13 layer 3).

## Decisions (confirmed)

- Scope: **P0 + P1 + P2 full close-out**.
- Queue persistence storage: **MMKV** (`react-native-mmkv`).
- Client-side image processing: **expo-image-manipulator**, target
  ≤ 2 MB, longest edge 2048 px, JPEG q≈0.85.
- Route-level R2 default-wiring test: **MinIO via Testcontainers**
  (hermetic, real S3 protocol).
- Document note kind: **deferred entirely** — no `DocumentNoteCard`,
  no document picker in the attachment sheet, no `pdf`/`document`
  flows shipped in this slice. Keep the queue's `kind` enum intact
  (server-side pipeline already supports them) but do not expose UI.
- Attachment sheet: **gallery (expo-image-picker) only**, multi-select
  images, routed through the same `enqueueCameraUris` path.

## Approach

Work in three phases. Each phase merges independently; later phases
depend on earlier ones only where the SQL `todo_deps` say so.

### Phase A — P0: regressions, scope tests, real-R2 test, live E2E

Tighten the safety net before extending the feature.

- **Maestro `appId` fix.** Replace every literal `com.harpa.pro` in
  `.maestro/*.yaml` with `${MAESTRO_APP_ID}` and add a pre-`test:e2e`
  grep guard that fails the run if any literal appears. Document the
  override in `.maestro/README.md`.
- **Cross-owner scope tests for `/files/*`.** Extend
  `packages/api/src/__tests__/files.integration.test.ts` (or new
  `files.scope.integration.test.ts`) with Alice/Bob pairs asserting:
  - `GET /files/:bobFileId/url` as Alice → 404.
  - `POST /files` with `fileKey=users/<bobId>/…` as Alice → 400.
  - `POST /files/presign` as Alice yields a key under
    `users/<aliceId>/…` (not Bob's).
- **Real R2 default-wiring test (Pitfall 13 layer 2).**
  - Add MinIO Testcontainers helper under
    `packages/api/src/__tests__/helpers/r2-container.ts`.
  - Add `R2_FIXTURE_MODE` env enum in `packages/api/src/lib/env.ts`
    (`'live' | 'replay'`, default `'replay'`); `pickStorage()` reads
    it via parsed env (not raw `process.env`).
  - New `files.r2-live.integration.test.ts`: starts MinIO, sets
    `R2_FIXTURE_MODE=live`, hits `POST /files/presign`, performs the
    real signed PUT against MinIO, then asserts the object exists
    with the signed `Content-Type` and `Content-Length`.
- **Live-pipeline Maestro flow** `.maestro/p3-15-upload.yaml`:
  sign in → open report → tap Photo → capture mirror Done → wait for
  the new image note row to render (depends on Phase B `ImageNoteCard`
  landing first — see todo_deps).

### Phase B — P1: user-visible completion

Make the success path visible and the queue controllable.

- **`ImageNoteCard`** in `apps/mobile/components/reports/notes/`:
  uses `useFileSignedUrl(fileId)` + `<CachedImage>`, with skeleton,
  error retry, and tap-to-zoom (modal). Wire into `NoteTimeline`'s
  switch so `source === 'image'` no longer falls back to text.
- **`PendingPhotoCard`**: optimistic row driven by an upload job
  before the note exists. Shows local URI thumbnail + progress bar
  + per-job retry/cancel. Reconciles with the real note row on
  `reportNotes` invalidation.
- **`UploadQueueStrip`** (small footer on the report screen):
  consumes `useFileUpload` → `activeJobs` (progress) + `failedJobs`
  (retry/dismiss). Hidden when both lists are empty.
- **Attachment sheet wiring.** Replace the "coming soon" stub in
  `generate.tsx:handlePickAttachment` with `expo-image-picker`
  multi-select; pipe the chosen URIs through `enqueueCameraUris`
  (rename to `enqueueImageUris` if it makes the call sites cleaner).
- **Queue persistence with MMKV.**
  - Add `react-native-mmkv` to `apps/mobile` (`pnpm --filter mobile
    add react-native-mmkv`), expo prebuild config plugin if needed.
  - Persist `UploadJob` records (sourceUri, kind, contentType,
    sizeBytes, reportId, attempt count, status) to MMKV on every
    state transition.
  - On `QueueProvider` mount, rehydrate non-terminal jobs and
    resume. Drop jobs whose `sourceUri` is no longer reachable
    (`new File(uri).exists`), surfaced as a failed job.
  - Add a contract test that kills the queue mid-flight (simulated)
    and asserts a fresh `QueueProvider` resumes the in-flight job.
- **Real cancellation.** Thread an `AbortController` through
  `runUploadJob → defaultPutToR2`; on `queue.remove(jobId)` call
  `.abort()` and the XHR `abort()`. Unit test: `remove()` during
  PUT yields a terminal `cancelled` state without firing
  `POST /files`.

### Phase C — P2: hardening, cleanup, docs

Lock the policy in.

- **Client-side image processing.**
  - Add `expo-image-manipulator` to `apps/mobile`.
  - New `lib/camera/process-image.ts`: resize to longest-edge 2048,
    JPEG quality 0.85, iterate down to ≤ 2 MB if needed. Strip EXIF
    (we already pass `exif:false` to `takePictureAsync`, but gallery
    picks may carry EXIF).
  - Call before `statSize` in `useCameraUploads.enqueueCameraUris`.
  - Add a client-side size guard (> 50 MB after processing → mark
    job as failed pre-presign with a clear message).
  - Unit test on a fixture JPEG asserting output size + dimensions.
- **Capture URI cleanup.** After a job reaches `succeeded`, call
  `new File(sourceUri).delete()` (best-effort, swallow errors).
- **Env hardening.** Declare `R2_FIXTURE_MODE` and any other raw
  `process.env.*` reads in `packages/api/src/lib/env.ts` (Zod
  enum / default). Add a lint guard for `process.env.R2_*`.
- **Doc updates (Pitfall 8 — docs in the same commit).**
  - `docs/v4/arch-storage.md`: document the 4-step pipeline diagram,
    `users/<userId>/<kind>/<uuid>.<ext>` key shape, signed-header
    policy, R2_FIXTURE_MODE values, the client-side processing
    policy (≤2 MB / 2048 px), queue persistence (MMKV) and
    cancellation semantics, and the `pdf → document` mapping plus
    the explicit deferral of document UI.
  - `docs/v4/pitfalls.md`: append a sub-bullet to Pitfall 13 noting
    the route-level `pickStorage()` trapdoor and the MinIO test as
    the closing fix.
  - `docs/bugs/README.md`: log the Maestro `appId` regression.
  - `docs/v4/plan-p3-feature-build.md`: check off the camera /
    upload milestones touched by this slice.

## Definition of Done

- All Phase A tests fail on `main` if their target regression is
  reintroduced (verified by reverting locally).
- Camera capture → upload → timeline thumbnail works end-to-end in
  dev simulator and in the new Maestro flow.
- Attachment sheet (gallery) produces the same thumbnail outcome.
- Killing the app mid-upload and relaunching resumes the queue.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green.
- All touched docs updated in the same commits as the code.

## Out of scope

- Document / PDF note rendering (explicitly deferred).
- Video capture.
- Server-side image processing / thumbnail derivatives.
- Offline-first capture queueing across multiple reports (only
  in-flight per-app-launch resumption is in scope).
