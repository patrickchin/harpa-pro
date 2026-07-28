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
- Hand-rolled `UploadQueue` (`lib/uploads/queue.ts`) for offline-first
  upload + AsyncStorage persistence. ~370 lines, tiny surface
  (`enqueue`/`retry`/`remove`/`subscribe`/`rehydrate`), fully
  unit-tested in node. See
  [`arch-voice-pipeline.md` §D9](arch-voice-pipeline.md#d9-robustness-phase-f)
  for the persistence + AbortSignal contract.
- expo-audio for recording + playback (already proven in v3).
- expo-camera for capture.
- react-native-pdf (Android) + WKWebView (iOS) for `PdfPreviewModal`.
- Sentry for crash reporting.

## Folder rule

A file goes in `features/<domain>/` if and only if the domain owns a
**state machine, a React Context provider with non-trivial reducer
logic, or a native/external adapter** (recorder, camera session,
OTP). Pure presentational UI — even when domain-named
(`VoiceNoteCard`, `PhotoNoteCard`, `ReportView`) — goes in
`components/<domain>/`. `lib/` holds cross-cutting utilities only
(api client, env, date, dialogs, telemetry), grouped into subfolders
by concern; no flat files at the `lib/` root (enforced in CI).
`screens/` holds props-driven screen bodies; `app/` holds expo-router
route files that wire data into screens.

## Directory structure

```
apps/mobile/
  app/                                 # expo-router
    (auth)/  (app)/  (camera)/  ...    # routes do data fetching
    _layout.tsx                        # providers (env, query, queue, dialogs, sentry)

  screens/                             # props-driven screen bodies
                                       # (no API/auth inside; consumed
                                       # by the routes in app/)

  components/                          # PRESENTATIONAL ONLY
    primitives/                        # Card, Button, Input, …
    notes/
      NoteTimeline.tsx
      TextNoteCard.tsx
      PhotoNoteCard.tsx
      PendingPhotoCard.tsx
      PhotoBatchGrid.tsx
      PhotoGridTile.tsx
      VoiceNoteCard.tsx                # ← lives here, not in features/
      VoiceCardShell.tsx
      voiceNoteCardHeader.ts
      NoteCardHeader.tsx
      NoteOptionsSheet.tsx
      NoteOptionsKebab.tsx
    reports/
      ReportView.tsx
      ReportEditForm.tsx
      StatBar.tsx WeatherStrip.tsx SummarySectionCard.tsx
      IssuesCard.tsx WorkersCard.tsx MaterialsCard.tsx
      NextStepsCard.tsx CompletenessCard.tsx PdfPreviewModal.tsx
      detail/                          # saved-report UI pieces
      generate/                        # generate-report UI pieces
                                       #   (provider lives in features/generate/)
    files/  uploads/  account/  skeletons/  ui/

  features/                            # STATE MACHINES + ADAPTERS
    voice/
      InlineVoiceRecorder.tsx
      useInlineRecorder.ts
      useVoiceNotePipeline.ts
      expoAudioRecorder.ts
      fixtureRecorder.ts
      pickRecorder.ts
      recorder-types.ts
    generate/
      GenerateReportProvider.tsx       # provider + reducer

  lib/                                 # CROSS-CUTTING (subfolders only)
    api/  auth/  audio/  camera/  config/  dialogs/  files/  nav/
    native/  notes/  projects/  reports/  telemetry/  util/
    ai/  design-tokens/  dev-fixtures/  uploads/

  tailwind.config.js  global.css  app.config.ts  babel.config.js  metro.config.js
  .maestro/  __tests__/
```

## Navigation

Expo Router file-tree above maps 1:1 to routes. Two route groups:
`(auth)` (no app shell) and `(app)` (tab + stack shell). Auth state
gates which group renders via `_layout.tsx` redirects driven by
`useAuthSession()`.

No `setTimeout` in auth flows (Pitfall 5).

### Deep-link readiness

Deep links + universal links are wired in P4. The route shape above
is already deep-link compatible (Expo Router maps files to URLs 1:1;
prefixed slugs per [arch-ids-and-urls.md](arch-ids-and-urls.md)).
Rules every P2/P3 screen must follow:

1. **URL params are sufficient to mount.** Cold-start a screen from
   route params alone — fetch via React Query, never assume a prior
   screen pre-populated a store.
2. **Navigate by URL, not by ref.** Use
   `router.push('/projects/prj_xxxxxx')`, not
   `navigation.navigate('ProjectDetail', { id })`.
3. **Auth gate stashes intent.** Unauthed users hitting a protected
   URL → `(app)/_layout.tsx` records the path and replays after
   sign-in (P2.6).
4. **Route shape = entity shape.** No funnelling everything through
   `(app)/index` with local state. File routes only.
5. **Reserve the scheme now.** `app.json` `scheme` + placeholder
   universal-link domain set in P0 so dev share links resolve.

Universal Links / App Links infra (`apple-app-site-association`,
`assetlinks.json`), push → deep-link routing, and deferred deep-link
install handling land in P4.

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
  ├─ stored session, /me ok, displayName set      → authenticated
  ├─ stored session, /me ok, displayName missing  → needs-onboarding
  ├─ stored session, /me 401                      → unauthenticated (storage cleared)
  └─ stored session, /me network error            → trust stored user (offline-usable)
```

`companyName` is optional at signup/onboarding. When blank, the
mobile onboarding submit omits it from `PATCH /me`, leaving the user
authenticated once `displayName` is set.

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
  status to `unauthenticated`. It also aborts and clears the active
  user-scoped upload queue before auth teardown. The route guard in
  `app/_layout.tsx` redirects to `/(auth)/sign-in/email`.

Sign-out:

- Best-effort `POST /api/auth/sign-out`, then clear SecureStore + state +
  `queryClient.clear()`. The active upload queue is aborted and cleared
  before the network call. Network failure on the POST does **not**
  stop either local clear (we'd otherwise leak session data into a
  multi-user device).

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
| Upload queue (offline-first, persisted) | Hand-rolled `UploadQueue` (`lib/uploads/queue.ts`) with AsyncStorage persistence + `AbortSignal` cancellation |
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

## Screens as props-driven bodies (P2.0b)

Every screen the app ships has its body extracted into
`apps/mobile/screens/<name>.tsx` as a presentational component
that takes typed props and has **no** API / auth / persistence
dependencies of its own. The real route at
`app/(auth|app)/<path>.tsx` wires hooks, auth session, and
navigation params, then passes them as props.

Visual review is manual against `../haru3-reports/apps/mobile@dev`
on the iOS simulator — there is no automated screenshot-diff gate
and no in-app gallery. Coverage relies on per-screen behaviour tests
plus Maestro flows for visual regressions.

## Primitives (locked in P2.2)

Listed under "primitives" above. Each ships with:

- a Vitest snapshot test,
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

Full design lives in [`arch-voice-pipeline.md`](arch-voice-pipeline.md);
delivery checklist in [`plan-voice-pipeline.md`](plan-voice-pipeline.md).
At a glance:

- The mic button on `GenerateReportInputBar` mounts
  `InlineVoiceRecorder` (`features/voice/InlineVoiceRecorder.tsx`)
  inline — no route push. `useInlineRecorder` drives the recording
  side of the state machine; permission denial and recording errors
  surface through `AppDialogSheet` (Pitfall 12) — never `Alert.alert`.
- `useVoiceNotePipeline({ reportId })` runs the state machine
  `idle → recording → uploading → transcribing → saved | failed(step)`.
  Upload uses the shared `useFileUpload` queue with `kind: 'voice'`
  but **no** `reportId` — the queue stops after `registerFile`,
  then the hook calls the server aggregator.
- The server aggregator `POST /reports/:reportId/notes/voice`
  (`{ fileId, language?, durationSec? }`) runs transcribe +
  summarize + insert in one scoped transaction, idempotent on
  `fileId+reportId`. Mobile never calls `/voice/transcribe` or
  `/voice/summarize` directly.
- `AudioPlaybackProvider` is a real single-instance `expo-audio`
  player — starting note B pauses note A.
- `VoiceNoteCard` renders three header states (`transcribing… /
  ready / failed`), summary preview, transcript expander, and a
  retry CTA on failure.
- Fixture mode (`EXPO_PUBLIC_USE_FIXTURES=true`) replaces the
  recorder with a "Save fixture voice note" stub that copies
  `assets/fixtures/voice-sample.m4a` through the real upload
  pipeline and aggregator (Pitfall 13 — default wiring exercised).
- `useLiveTranscript` (Phase F, feature-flagged behind
  `EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPT`) wraps
  `expo-speech-recognition` for on-device interim transcript;
  falls back to a no-op when unavailable.

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
| Visual | Manual review against `../haru3-reports/apps/mobile@dev` on iOS sim | n/a (no automated gate) |

Per-page acceptance is the per-page doc's "Acceptance checklist"
section.

## Performance defaults

- `FlashList` for any list >10 items.
- `React.memo` on list item components by default.
- `useCallback` for `renderItem`; `useMemo` for filter functions.

(Applied late in v3 as `dbaa4c1`; default from P3.)

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
