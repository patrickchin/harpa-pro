# M2 voice demo

The marketing voice demo is a self-contained Astro/React island. It
uses committed fixtures and web-native markup in
`apps/marketing/src/components/VoiceDemo.tsx` and
`apps/marketing/src/components/VoiceReportPreview.tsx`.

Mobile report and voice UI stays inside `apps/mobile`. There is no
shared voice UI workspace package because mobile and web UI parity is
not a current product requirement.

## Current scope

- The demo runs entirely in the browser against committed fixtures.
- No audio, report payload, or generated content leaves the browser.
- The report preview fixture lives at
  `apps/marketing/src/fixtures/demoReport.ts`.
- Live API transcription and report generation remain deferred.

## Verification

- Marketing unit tests cover the local report preview.
- Marketing build/typecheck should be run for changes to the demo
  island or fixture shape.
