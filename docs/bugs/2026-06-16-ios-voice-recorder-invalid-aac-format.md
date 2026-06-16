# 2026-06-16 — iOS voice recorder invalid AAC format (Pattern R10)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A TestFlight iPhone showed the in-app sheet `Recording failed` with the raw native message `Calling the 'prepareToRecordAsync' function has failed -> Caused by: Audio recording error: Failed to prepare recorder`.

**Root cause.** `apps/mobile/features/voice/expoAudioRecorder.ts` passed `ios.outputFormat: 'mpeg4aac'`. Expo SDK 55's valid AAC constant is `IOSOutputFormat.MPEG4AAC`, whose value is the four-character iOS format code `'aac '`. `expo-audio` forwards `outputFormat` into `AVFormatIDKey`; its Swift conversion reads the first four bytes, so `'mpeg4aac'` became the wrong native format id and `AVAudioRecorder.prepareToRecord()` failed. The hook then caught the native exception, stored `err.message`, rendered it directly in `GenerateReportProvider`, and did not report the caught start failure to Sentry. Sentry issue searches for `prepareToRecordAsync`, `Failed to prepare recorder`, `Audio recording error`, `Recording failed`, `expo-audio`, and `AudioRecorder` were empty, matching that catch-and-render path.

**Fix.** `HARPA_RECORDING_OPTIONS` now derives from `RecordingPresets.HIGH_QUALITY` and uses `IOSOutputFormat.MPEG4AAC` plus `AudioQuality.MEDIUM`, while preserving the Android AAC and metering behavior from the prior recorder fixes. `useInlineRecorder` now keeps the raw diagnostic string in `error`, exposes a separate user-safe `userErrorMessage`, and calls `captureRecorderStartFailure()` so initialized Sentry receives the original error and recorder context.

**Test.** Added focused mobile tests for the iOS AAC constant, friendly recorder-start sheet copy with raw native text excluded from UI, raw diagnostic preservation/Sentry capture from `useInlineRecorder.start()`, and Sentry recorder-start capture context. Follow-up coverage adds `.maestro/native-input-smoke.yaml`, a non-fixture iOS/Android smoke that starts/cancels the real native recorder and captures/discards one real camera photo without sending either path into the fixture upload/transcription pipeline.

**Pattern.** R10 — native-module option literals drift from SDK constants.
