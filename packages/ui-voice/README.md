# @harpa/ui-voice

Cross-platform UI components for the Harpa voice-notes and report
features. Authored with React Native primitives + NativeWind v4 so the
same JSX renders identically in:

- `apps/mobile` (Expo / React Native) — direct workspace import.
- `apps/marketing` (Astro + React islands) — via a Vite alias
  `react-native` → `react-native-web`.

See [`docs/v4/arch-ui-voice.md`](../../docs/v4/arch-ui-voice.md) for the
full design.

## Exports

- `VoiceReportView` — renders a `ReportBody` payload from
  `@harpa/api-contract` with summary, issues, workers, materials, next
  steps and free-form sections.
- `VoiceReportSkeleton` — pulse placeholder while a report loads.
- `demoReport`, `demoTranscript` (from `@harpa/ui-voice/fixtures`) —
  hand-written sample payloads used by the marketing M2 voice demo and
  the mobile dev gallery.

## What this package does NOT do

- Audio playback or recording — injected by the host app.
- API calls — injected by the host app.
- Icons — kept text-only for now to avoid `react-native-svg` /
  `lucide-react-native` web compatibility work. Revisit when needed.
