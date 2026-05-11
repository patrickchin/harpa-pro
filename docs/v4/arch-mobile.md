# Mobile architecture (Expo + NativeWind)

> Resolves [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design),
> [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten),
> [Pitfall 5](pitfalls.md#pitfall-5--auth-glue-done-late-env-handling-brittle),
> [Pitfall 11](pitfalls.md#pitfall-11--hermesrn-globalthiscrypto-missing),
> [Pitfall 12](pitfalls.md#pitfall-12--alertalert-used-for-app-dialogs).

## Stack

- Expo SDK (latest stable that supports our nativewind + expo-audio
  + expo-camera versions). Dev client + EAS for prod builds.
- **NativeWind v4** for styling. Tailwind config is the single
  source of truth for the design tokens.
- Expo Router v3 (file-system routing).
- React Query for server state.
- legend-state for the upload queue + offline persistence.
- expo-audio for recording + playback (already proven in v3).
- expo-camera for capture.
- react-native-pdf (Android) + WKWebView (iOS) for `PdfPreviewModal`.
- Sentry for crash reporting.

## Directory structure

```
apps/mobile/
  app/                                 # expo-router
    (auth)/
      _layout.tsx
      login.tsx
      verify.tsx
      onboarding.tsx
    (app)/
      _layout.tsx
      projects/
        index.tsx
        new.tsx
        [projectId]/
          index.tsx
          edit.tsx
          members.tsx
          reports/
            index.tsx
            generate.tsx          # the big one — Notes/Report/Edit tabs
            [reportId].tsx        # saved report
      camera/
        capture.tsx
      profile/
        index.tsx
        account.tsx
        usage.tsx
    +not-found.tsx
    _layout.tsx                        # providers (env, query, queue, dialogs, sentry)

  components/
    primitives/                        # P2.1 — locked early, snapshot-tested
      Card.tsx
      Input.tsx
      Button.tsx
      IconButton.tsx
      ScreenHeader.tsx
      EmptyState.tsx
      Skeleton.tsx
      AppDialogSheet.tsx
      StatTile.tsx
    reports/
      sections/
        StatBar.tsx
        WeatherStrip.tsx
        SummarySectionCard.tsx
        IssuesCard.tsx
        WorkersCard.tsx
        MaterialsCard.tsx
        NextStepsCard.tsx
        CompletenessCard.tsx
      ReportView.tsx
      ReportDetailTabBar.tsx
      ReportActionsMenu.tsx
      PdfPreviewModal.tsx
      SavedReportSheet.tsx
      GenerateReportInputBar.tsx
      GenerateReportTabBar.tsx
      GenerateReportActionRow.tsx
    notes/
      NoteTimeline.tsx
      VoiceNoteCard.tsx
      ImageNoteCard.tsx
      TextNoteCard.tsx
      ThreeDotMenu.tsx
    profile/
      UsageBarChart.tsx

  features/
    auth/
      useAuthSession.ts
      otpFlow.ts
    upload/
      queue.ts                         # legend-state observable queue
      pipeline.ts                      # presign → PUT → createFile → createNote
      __tests__/
    voice/
      useVoiceNotePipeline.ts
      useVoiceNotePlayer.ts            # coordinated single-playback
      useLiveTranscript.ts             # on-device interim transcript
      AudioPlaybackProvider.tsx
    reports/
      useReportPdfActions.ts
      useReportGeneration.ts
      GenerateReportProvider.tsx
    util/
      useCopyToClipboard.ts

  lib/
    env.ts                             # Zod-validated EXPO_PUBLIC_*
    date.ts                            # ISO-8601 + PG textual fallback
    uuid.ts                            # expo-crypto only
    dialogs/
      useAppDialogSheet.ts             # the only place Alert is allowed
    api/
      client.ts                        # api-contract typed client
      hooks.ts                         # generated React Query hooks
    section-icons.ts
    report-helpers.ts                  # toTitleCase, getItemMeta only
    mobile-ui.ts                       # getReportStats, getIssueSeverityTone

  tailwind.config.js                   # design tokens
  global.css
  app.config.ts
  babel.config.js
  metro.config.js
  .maestro/                            # E2E flows
  __tests__/
```

## Navigation

Expo Router file-tree above maps 1:1 to routes. Two route groups:
`(auth)` (no app shell) and `(app)` (tab + stack shell). Auth state
gates which group renders via `_layout.tsx` redirects driven by
`useAuthSession()`.

No `setTimeout` in auth flows (Pitfall 5).

## State management

| Concern | Tool |
|---|---|
| Server state (projects, reports, notes, files) | React Query |
| Per-screen UI state | `useState` / `useReducer` |
| Upload queue (offline-first, persisted) | legend-state observable |
| Audio playback coordination | `AudioPlaybackProvider` (single ref) |
| Auth session | `useAuthSession` (React Query + secure-store) |
| Dialogs | `useAppDialogSheet` portal |

## Design tokens (NativeWind)

`tailwind.config.js` defines:

- Colors: `background`, `foreground`, `card`, `card-foreground`,
  `muted`, `muted-foreground`, `secondary`, `accent`,
  `surface-muted`, `border`, `destructive`, `destructive-foreground`,
  `warning-soft`, `warning-border`, `warning-text`, `primary`,
  `primary-foreground`.
- Spacing: `screen` (= 16), plus default Tailwind scale.
- Radii: `lg` (12), `xl` (16), `2xl` (20).
- Typography: a single scale (`text-xs`–`text-3xl`) — Pitfall ref:
  v3 needed `0f3db66 refactor(mobile): tighten typography scale`.

These values come from the per-page docs' "Visual tokens" sections
in [`docs/legacy-v3/realignment/pages/`](../legacy-v3/realignment/pages/).
**No hex values appear outside the config.** ESLint rule
`no-restricted-syntax` flags hex literals in `apps/mobile/components/**`.

## Primitives (locked in P2.1)

Listed under "primitives" above. Each ships with:

- a Vitest snapshot test,
- a Maestro reference screenshot when used at full screen,
- documented props in `// JSDoc` only (no `.md` per primitive).

Adding a new primitive needs the `architect` subagent first. The
default answer is "use one of the 9 we have".

## Upload pipeline contract

See [Pitfall 8](pitfalls.md#pitfall-8--upload-pipeline-missed-timeline-integration).

```ts
queue.enqueue({ kind, file, noteContext })
  → presign           // POST /files/presign
  → uint8PUT          // PUT R2
  → createFile        // POST /files
  → createNote        // POST /reports/:id/notes  (ALWAYS)
  → invalidate(reportNotes)
```

Body bodies are `Uint8Array` (Pitfall 12 from v3:
`1747340 fix(mobile/uploads): pass Uint8Array bodies to bucket.upload
to fix Android image uploads`).

## Voice note pipeline

See [`docs/legacy-v3/realignment/pages/07-notes-tab.md`](../legacy-v3/realignment/pages/07-notes-tab.md)
for behaviour. Implementation:

- `useLiveTranscript` reads on-device speech-to-text *during*
  recording and streams interim text to the input bar (the
  "LISTENING" panel).
- `useVoiceNotePipeline` orchestrates the pending-note state
  machine (`uploading → transcribing → saved/failed`, with
  `failedStep` so retry resumes).
- `AudioPlaybackProvider` ensures only one note plays at a time.
- `VoiceNoteCard` renders the transcript inline.

## Camera flow

Per [`docs/legacy-v3/realignment/pages/13-camera.md`](../legacy-v3/realignment/pages/13-camera.md).
Uses `AppDialogSheet` for discard confirmation (Pitfall 12).
Three-column thumbnail strip; shutter haptic; session commit
back to the report.

## env.ts

```ts
import { z } from 'zod';

const Env = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  EXPO_PUBLIC_USE_FIXTURES: z.enum(['true', 'false']).default('false'),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const raw = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_USE_FIXTURES: process.env.EXPO_PUBLIC_USE_FIXTURES,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
};

export const env = Env.parse(raw); // throws at startup if missing
```

ESLint rule: `no-restricted-syntax` for `process.env.EXPO_PUBLIC_*`
outside `lib/env.ts`.

## Tests

| Layer | Tool | Coverage gate |
|---|---|---|
| Primitives | Vitest snapshot + behaviour | 100% |
| features/* | Vitest + MSW for API | ≥ 90% |
| Screens | Vitest behaviour test (per-page interactions) | ≥ 80% |
| End-to-end | Maestro on iOS sim + Android emu | All flows green |
| Visual | Maestro screenshot diff vs `docs/legacy-v3/screenshots/` | ≤ 2% diff per screen |

Per-page acceptance is the per-page doc's "Acceptance checklist"
section.

## Performance defaults

- `FlashList` for any list >10 items.
- `React.memo` on list item components by default.
- `useCallback` for `renderItem`.
- `useMemo` for filter functions.

(These were applied late in v3 as `dbaa4c1`. We apply them as the
default from P3.)

## Build modes

| Mode | Command | Purpose |
|---|---|---|
| dev (live API) | `pnpm ios` | Hits the Fly preview API |
| dev (fixtures) | `pnpm ios:mock` | Inlines `EXPO_PUBLIC_USE_FIXTURES=true`, fixtures everywhere |
| release (mock) | `pnpm ios:mock:release` | Same as `:mock` but Hermes release |
| release (live) | EAS build profile `production` | Real API |
