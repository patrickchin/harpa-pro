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
      login.tsx                        # thin wrapper around screens/login.tsx
      verify.tsx
      onboarding.tsx
    (app)/
      _layout.tsx
      projects/
        index.tsx                      # thin wrapper around screens/projects-list.tsx
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
    (dev)/                             # P2.0b — dev gallery; never in prod
      _layout.tsx
      index.tsx                        # screen-list with mock-prop tap-through
      <one route per screen>.tsx       # mounts the body with canned mock props
    +not-found.tsx
    _layout.tsx                        # providers (env, query, queue, dialogs, sentry)

  screens/                             # P2.0b — props-driven screen bodies
                                       # (no API/auth inside; consumed by
                                       # both real routes and (dev) mirrors)

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
      auth.ts                          # token getter + onUnauthorized callback
      errors.ts                        # ApiError envelope
      hooks.ts                         # generated React Query hooks
      invalidation.ts                  # mutation→queryKey invalidation map
    auth/
      session.tsx                      # AuthSessionProvider + useAuthSession
      storage.ts                       # SecureStore (session) + AsyncStorage (lastPhone)
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

## API client (P2.3)

`lib/api/client.ts` is a typed `fetch` wrapper. Generic over the
`paths` tree from `@harpa/api-contract` (regenerated from the API's
`openapi.json`), so request / response shapes stay in lock-step with
the server contract — wrong path or wrong body fails at compile time.

Surface:

- `request(path, method, init?)` — base call. Resolves the URL via
  `lib/env.ts` (`EXPO_PUBLIC_API_URL`), substitutes path params,
  serialises query, attaches `Authorization: Bearer <token>` from
  `lib/api/auth.ts:getAuthToken()`, and maps non-2xx + transport
  failures into a single `ApiError` envelope `{ code, message, status,
  requestId?, details? }`.
- `lib/api/hooks.ts` — generated React Query hooks (one per
  operationId). Mutations wire `onSuccess` into the central
  `INVALIDATIONS` map in `lib/api/invalidation.ts`. The generator
  (`scripts/gen-hooks.ts`) is committed; `pnpm gen:api` regenerates
  it; `check-spec-drift.sh` fails CI if the file is stale.
- `lib/api/auth.ts` exports two pluggable hooks the auth session
  wires up at boot:
  - `setAuthTokenGetter(fn)` — synchronous bearer source.
  - `setOnUnauthorizedCallback(fn)` — fired on **every** HTTP 401
    (queries _and_ mutations) before the `ApiError` is thrown, so a
    single 401 path tears the session down everywhere.

Multipart uploads (R2 presign PUTs) bypass this client — they go
direct to R2 with the headers the presigner returned.

## Auth session (P2.4)

`lib/auth/session.tsx` exposes `<AuthSessionProvider>` and
`useAuthSession()`. The provider is mounted once at the root of
`app/_layout.tsx` (P2.6), above the React Query and dialog providers.

State machine:

```
loading
  ├─ no stored session                            → unauthenticated
  ├─ stored session, /me ok, profile complete     → authenticated
  ├─ stored session, /me ok, profile incomplete   → needs-onboarding
  ├─ stored session, /me 401                      → unauthenticated (storage cleared)
  └─ stored session, /me network error            → trust stored user (offline-usable)
```

Bootstrap is idempotent and **always** terminates `loading` — every
error branch sets a status. Pitfall 5: no implicit ordering, no
`setTimeout`, status is the single discriminator.

Storage split (`lib/auth/storage.ts`):

| Data | Backend | Why |
|---|---|---|
| `{ token, user }` (the credential) | `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android) | 7-day JWT — must be encrypted at rest. |
| `lastPhone` (UX hint) | `AsyncStorage` | Not a credential; SecureStore would be overkill. Survives sign-out so the next login pre-fills. |

Token getter wiring (security review §B / §I):

- The provider keeps the bearer in a module-level cache and registers
  `setAuthTokenGetter(() => cachedToken)` once on mount. The getter is
  synchronous so `client.ts` doesn't pay an async hop per request.
- Until bootstrap completes, the cache is `null` and the
  `onUnauthorized` callback is a no-op — a stale request that fires
  pre-bootstrap and gets a 401 cannot silently nuke a valid stored
  session.

401 handling:

- Any post-bootstrap 401 (query OR mutation) calls
  `notifyUnauthorized()`, which clears the in-memory token + sets
  status to `unauthenticated`. The route guard in `app/_layout.tsx`
  redirects to `/(auth)/login`.

Sign-out:

- Best-effort `POST /auth/logout`, then clear SecureStore + state +
  `queryClient.clear()`. Network failure on the POST does **not** stop
  the local clear (we'd otherwise leak a session into a multi-user
  device).

What we deliberately do **not** have:

- No silent JWT refresh. Tokens are 7 days; an inactive user re-OTPs.
- No `Alert.alert` anywhere in the auth flow (Pitfall 12) — verify
  errors surface through the dialog sheet primitive.
- No Supabase, no Supabase auth (hard rule).

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

These values come from the canonical source's `tailwind.config.js`
at `../haru3-reports/apps/mobile/tailwind.config.js`.
**No hex values appear outside the config.** ESLint rule
`no-restricted-syntax` flags hex literals in `apps/mobile/components/**`.

## Dev gallery (P2.0b)

Every screen the app ships has its body extracted into
`apps/mobile/screens/<name>.tsx` as a presentational component
that takes typed props and has **no** API / auth / persistence
dependencies of its own. Two route files mount it:

- `app/(auth|app)/<path>.tsx` — the real route. Wires hooks, auth
  session, navigation params; passes them as props.
- `app/(dev)/<name>.tsx` — the dev mirror. Imports the same body
  with hand-crafted mock props. Modals, sheets, tabs, and
  back/forward navigation work; nothing else does.

The gallery index at `app/(dev)/index.tsx` lists every dev mirror
for tap-through manual review. The `(dev)` group is guarded by
`__DEV__ || env.EXPO_PUBLIC_USE_FIXTURES` so the routes never reach
a production bundle. This is the canonical workflow for visual
review against `../haru3-reports/apps/mobile@dev` — there is no
automated screenshot-diff gate.

## Primitives (locked in P2.2)

Listed under "primitives" above. Each ships with:

- a Vitest snapshot test,
- a row in the dev gallery so it can be eyeballed in the simulator,
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

Behaviour mirrors the canonical source's notes tab in
`../haru3-reports/apps/mobile/app/projects/[projectId]/reports/generate.tsx`
and its imported components. Implementation:

- `useLiveTranscript` reads on-device speech-to-text *during*
  recording and streams interim text to the input bar (the
  "LISTENING" panel).
- `useVoiceNotePipeline` orchestrates the pending-note state
  machine (`uploading → transcribing → saved/failed`, with
  `failedStep` so retry resumes).
- `AudioPlaybackProvider` ensures only one note plays at a time.
- `VoiceNoteCard` renders the transcript inline.

## Camera flow

Mirrors the canonical source's camera screen in
`../haru3-reports/apps/mobile/app/(camera)/capture.tsx`.
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
| Visual | Manual review against `../haru3-reports/apps/mobile@dev` via the dev gallery | n/a (no automated gate) |

Per-page acceptance is the per-page doc's "Acceptance checklist"
section.

## Performance defaults

- `FlashList` for any list >10 items.
- `React.memo` on list item components by default.
- `useCallback` for `renderItem`.
- `useMemo` for filter functions.

(These were applied late in v3 as `dbaa4c1`. We apply them as the
default from P3.)

## API client

Lives in [`apps/mobile/lib/api/`](../../apps/mobile/lib/api/). Five files:

```
client.ts          ← typed fetch wrapper over `paths` from @harpa/api-contract
auth.ts            ← swappable bearer-token getter (P2.4 plugs in useAuthSession)
errors.ts          ← ApiError class + envelope mapping
hooks.ts           ← AUTO-GENERATED — one React Query hook per endpoint
invalidation.ts    ← post-mutation query-key invalidation rules
```

### Generator

`apps/mobile/scripts/gen-hooks.ts` walks
[`packages/api-contract/openapi.json`](../../packages/api-contract/openapi.json)
and emits `hooks.ts` (committed). Run via `pnpm gen:api`.

We do not use orval / openapi-react-query-codegen / swagger-typescript-api.
The `paths` types are already emitted by `openapi-typescript` in
`@harpa/api-contract`; the hook layer is ~20 lines per endpoint and a
third-party generator would pull megabytes of deps for negligible win.
The generator carries a fixed `ENDPOINTS` table (operation → hook
name → invalidation hint) that reviewers eyeball — adding/renaming/
removing a route means editing the table + the invalidation map in
the same commit, so names cannot drift silently. The script throws
if the table doesn't match `openapi.json` exactly.

The spec-drift gate (`scripts/check-spec-drift.sh`, run by `pnpm lint`)
re-runs `pnpm gen:api` and fails if any of `openapi.json`,
`generated/types.ts`, or `apps/mobile/lib/api/hooks.ts` would change.

### Bearer-token getter

`auth.ts` exposes `setAuthTokenGetter(() => string | null | Promise<…>)`.
The default returns `null` (no `Authorization` header). The auth session
in P2.4 calls `setAuthTokenGetter` once at boot, pointing at its
secure-store-backed cache. Keeping the getter outside `client.ts`
avoids a circular `lib/api/* ⟷ lib/auth/*` import.

### Error mapping

Every non-2xx response is mapped to a typed `ApiError` matching the
server's `errorEnvelope` (`{ error: { code, message, details?, requestId? } }`).
Transport failures become `ApiError({ code: 'network_error', status: 0 })`.
JSON parse failures on a 2xx body become `ApiError({ code: 'parse_error' })`.
Callers pattern-match on `code` — they never inspect raw `Response`s.

### Invalidation map

`invalidation.ts` maps every generated mutation hook name to either an
array of query-key prefixes or `INVALIDATIONS_NONE`. The generator wires
each mutation's `onSuccess` to invalidate every prefix in its rule.

`invalidation.test.ts` parses the generated `hooks.ts` and asserts:
every mutation has a registered rule (no silent omissions); no rule
references a hook that no longer exists; queries are not in the map
(only mutations declare invalidations); each rule is a non-empty array
of strings or the explicit `INVALIDATIONS_NONE` opt-out.

## Build modes

| Mode | Command | Purpose |
|---|---|---|
| dev (live API) | `pnpm ios` | Hits the Fly preview API |
| dev (fixtures) | `pnpm ios:mock` | Inlines `EXPO_PUBLIC_USE_FIXTURES=true`, fixtures everywhere |
| release (mock) | `pnpm ios:mock:release` | Same as `:mock` but Hermes release |
| release (live) | EAS build profile `production` | Real API |
