# 2026-08-21 — camera native-save pending race (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** In native fast mode, tapping Done immediately after a shutter
press could commit only the older photo URIs while the newest JPEG was still
encoding. The same gap let additional shutter presses exceed the burst cap,
and leaving an empty session before the callback arrived could orphan the late
temporary JPEG.

**Root cause.** `takePictureAsync({ onPictureSaved })` intentionally resolves
before `onPictureSaved` so the next shot can start quickly. The screen released
its `isCapturing` lock on that early promise, but Done and burst capacity used
only `captures.length`; the URI is appended later by the callback. The callback
also had no session-lifetime guard. On Android, a later JPEG-processing failure
cannot reject the already-settled promise and emits no callback. Expo exposes
no callback unregister operation, view teardown can strand its module-global
callback closure, and concurrent saves may finish out of shutter order.
Injection-based Done tests returned a URI directly and could not reproduce the
default native timing.

**Fix.** Replace fast mode with ordinary awaited `takePictureAsync`, protected
by an atomic ref-backed lock. The shutter and Done remain locked until the JPEG
URI exists or the promise rejects, which serializes burst order and gives each
attempt one terminal. Mark Done, Cancel, and unmount atomically; delete results
that arrive after cancellation and every completed-but-uncommitted cache file
on unmount, while preserving URIs only after the session registry accepts their
handoff. Missing or stale sessions reject ownership and the camera reclaims the
files. Android Back uses the discard flow and modal gesture dismissal is
disabled. Permission-gate exits directly discard any retained captures because
their early-return UI cannot present the confirmation sheet. The size cap,
`skipProcessing`, cached thumbnails, and asynchronous camera-roll copy retain
the remaining capture hot-path optimizations.

**Test.** Default-wiring `CameraView` regressions hold the native promise and
prove same-tick shutter calls serialize, Done cannot commit a partial list,
the burst cap and URI order hold, and late results after cancellation or
unmount are deleted. Separate cases cover injected late results, system-unmount
cleanup, committed-file preservation, single-shot Done idempotency, hardware
Back confirmation, rejected session handoff, safe denied/requesting permission
exits, and synchronous camera-roll failures.

**Pattern.** R5 — the injected `takePicture` collaborator made the capture
completion model synchronous from the screen's perspective; the default native
save lifecycle needs its own regression coverage.
