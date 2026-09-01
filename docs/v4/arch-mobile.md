# Mobile architecture

> **Status: live.** The current implementation under `apps/mobile/`
> is the final authority when this document and code disagree.
>
> This architecture applies the mobile rules from
> [Pitfalls 3–5, 8, and 11–13](pitfalls.md).

## Stack

The mobile workspace currently uses:

- Expo SDK 55 and React Native 0.83.
- React 19.
- Expo Router 55 with typed routes.
- NativeWind v4 and Tailwind CSS 3.
- TanStack Query 5 for server state.
- Better Auth with `@better-auth/expo` for application sessions.
- MMKV for persisted query snapshots and upload jobs.
- AsyncStorage for small non-credential preferences and developer flags.
- Expo Audio for recording and playback.
- Expo Camera, Image Picker, Media Library, and Image Manipulator.
- Expo File System's current `File` API for local file access.
- Sentry for mobile error reporting.
- EAS Build, Submit, and Update for distribution.

## Source layout

```text
apps/mobile/
  app/                 Expo Router route files and layouts
    (auth)/            email-code sign-in and onboarding
    (app)/             protected application Stack
    (camera)/          full-screen camera Stack
  screens/             props-driven screen bodies
  components/          presentational UI and shared primitives
  features/            state machines and native adapters
    generate/
    voice/
  lib/                 cross-cutting services and utilities
    ai/ api/ auth/ audio/ camera/ config/ dialogs/ files/
    native/ nav/ notes/ projects/ reports/ telemetry/ uploads/ util/
  assets/
  fastlane/
  plugins/
  scripts/
```

A domain belongs under `features/` when it owns a state machine,
provider, or native adapter. Presentational domain UI belongs under
`components/`. Route files own data hooks and navigation. Screen bodies
receive typed props and avoid direct API or authentication access.

## Navigation

The root layout renders a `Slot`. The authentication, protected app,
and camera groups each own a Stack.

The protected group uses one headerless Stack. There is no tab
navigator. `AppHeaderActions` provides a Profile shortcut from screen
headers. Projects, Profile, Account, Usage, Developer, project, report,
note, and debug surfaces are Stack routes.

The auth layouts redirect from the session discriminator. The camera
group uses a full-screen modal presentation and an explicit return URL.

See [`arch-mobile-navigation.md`](arch-mobile-navigation.md) and
[`arch-p2-6-app-shell.md`](arch-p2-6-app-shell.md).

## Environment

`apps/mobile/lib/config/env.ts` is the parsed JavaScript environment
boundary. It supports:

| Variable                       | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `EXPO_PUBLIC_API_URL`          | Default API origin.                           |
| `EXPO_PUBLIC_API_URL_OVERRIDE` | PR OTA API override.                          |
| `EXPO_PUBLIC_USE_FIXTURES`     | Deterministic local native inputs.            |
| `EXPO_PUBLIC_APP_VARIANT`      | Production, preview, or development behavior. |
| `EXPO_PUBLIC_LAYOUT_PROBE`     | Development layout-shift logging.             |
| `EXPO_PUBLIC_SCREENSHOT_MODE`  | Deterministic store-screenshot inputs.        |
| `EXPO_PUBLIC_SENTRY_DSN`       | Mobile Sentry project.                        |
| `EXPO_PUBLIC_PR_NUMBER`        | PR label for OTA builds.                      |

Metro inlines `EXPO_PUBLIC_*` values. A change requires a new bundle.
Application code imports the parsed `env` object instead of reading
`process.env` directly. Native adapter tests can use a documented seam
when they must change a flag after module load.

`EXPO_PUBLIC_USE_FIXTURES` affects the mobile application only. For
example, it selects the canned voice recorder. It does not send a
fixture-mode header and does not select the API's AI mode. The API uses
its own `AI_LIVE` setting.

## Application variants

`apps/mobile/eas.json` defines three profiles:

| Profile       | Bundle ID           | API                        |
| ------------- | ------------------- | -------------------------- |
| `development` | `com.harpa.pro.dev` | Development Fly API        |
| `preview`     | `com.harpa.pro.dev` | Development Fly API        |
| `production`  | `com.harpa.pro`     | `https://api.harpapro.com` |

`app.config.ts` also configures universal links, App Links, native
permissions, Sentry, and the production iPhone-only setting.

## Authentication

`lib/auth/client.ts` creates the Better Auth client with the Expo and
email-OTP plugins. The Expo plugin stores cookies in SecureStore. Local
unsigned simulator builds use an in-memory fallback only when
SecureStore has no signing entitlement.

`AuthSessionProvider` maps `authClient.useSession()` into:

```text
loading | unauthenticated | needs-onboarding | authenticated
```

A missing `displayName` produces `needs-onboarding`. `companyName` is
optional.

The existing typed API client uses bearer authentication. The session
provider reads the Better Auth session token from the stored cookie and
installs it through `setAuthTokenGetter()`. The API accepts that bearer
token and validates the backing Better Auth session.

Every API 401 triggers the same local boundary:

1. Abort and clear the active upload queue.
2. Sign out through Better Auth.
3. Clear the in-memory and persisted query caches.
4. Let the protected route gate return to email sign-in.

There is no seven-day mobile JWT cache and no phone-number hint. The
old phone-auth and custom JWT design is retired.

## Root providers

`app/_layout.tsx` mounts:

```text
AppErrorBoundary
  GestureHandlerRootView
    SafeAreaProvider
      AuthSessionProvider
        SessionQueryProvider
          DialogSheetProvider
            QueueProvider
              AudioPlaybackProvider
                SentryProvider
                  Slot
```

The query provider waits for a stable auth identity. This prevents a
previous user's persisted data from rendering during an account change.

## API and server state

`lib/api/client.ts` is a typed fetch wrapper over the `paths` type from
`@harpa/api-contract`. It:

- Resolves the API URL through `lib/api/base-url.ts`.
- Substitutes typed path and query parameters.
- Adds the current bearer token.
- Parses JSON success bodies.
- Maps transport and non-2xx responses to `ApiError`.
- Calls the global unauthorized callback before it throws a 401.

`lib/api/hooks.ts` contains generated TanStack Query hooks. Run
`pnpm gen:api` from the repository root after a contract change.
`scripts/check-spec-drift.sh` verifies the committed OpenAPI document,
generated contract types, and generated hooks.

`lib/api/invalidation.ts` defines one rule for every generated
mutation. Its test fails when a mutation has no explicit rule.
Imperative upload and voice paths call helpers from the same module.

See [`arch-data-layer.md`](arch-data-layer.md).

## Query persistence

`SessionQueryProvider` creates a new `QueryClient` for each user or
anonymous scope. Authenticated clients restore selected successful
queries from MMKV.

The storage key includes the user ID. Snapshots expire after 24 hours
and use the application version as a cache buster. The allowlist
currently includes projects, project members, reports, report notes,
the user profile, and limits. Usage history, debug responses, health,
and resolver queries do not persist.

Snapshots that contain optimistic note IDs do not persist. A sign-out,
401, or anonymous resolution clears persisted query data.

## Client state

| Concern                           | Owner                                      |
| --------------------------------- | ------------------------------------------ |
| Server resources                  | TanStack Query                             |
| Screen interaction state          | React state and reducers                   |
| Better Auth cookie                | SecureStore through `@better-auth/expo`    |
| Query snapshots                   | User-scoped MMKV keys                      |
| Upload jobs                       | User-scoped MMKV keys                      |
| Generate Debug tab flag           | AsyncStorage                               |
| Save-to-camera-roll preference    | AsyncStorage                               |
| Dialogs                           | `DialogSheetProvider` and `AppDialogSheet` |
| Audio playback                    | `AudioPlaybackProvider`                    |

## Upload pipeline

`QueueProvider` owns one serial upload queue per stable auth identity.
Each job follows:

```text
presign -> signed R2 PUT -> register file -> create or append note
```

A report-scoped image, voice, document, or PDF upload always produces
a timeline note. Personal-scope uploads, such as avatars, stop after
file registration.

The queue:

- Persists jobs to MMKV.
- Converts an interrupted job to `pending` after restart.
- Drops jobs whose local source file no longer exists.
- Retries up to three attempts with exponential backoff.
- Uses `AbortController` for removal and session teardown.
- Uses caller-supplied `clientId` values for deduplication.
- Groups camera batches into one note and appends the remaining files.
- Uploads optional 256-pixel thumbnails beside full images.

The default provider uses the real typed API client and signed PUT
implementation. Negative-path tests can inject dependencies. The happy
path tests exercise the default wiring.

## Camera and gallery

The camera route writes captured URIs to a session registry. The report
route consumes the session when focus returns and enqueues one batch.

Before upload, the image pipeline:

- Re-encodes to JPEG and strips EXIF data.
- Limits the longest edge to 2048 pixels.
- Targets two megabytes with a quality ladder.
- Rejects any final result above the API's 50 MB limit.
- Creates a 256-pixel square thumbnail.

Android supports multi-select photo-library picking. iOS currently
disables library reads because the production app requests add-only
permission. iOS camera capture and optional camera-roll saves remain
available.

## Voice notes

The report composer uses an inline recorder. `useInlineRecorder` owns
permission, native recording, duration, and waveform state. The strip
supports start, send, and cancel. It auto-sends at 15 minutes.

`useVoiceNotePipeline` uploads the recording as a file and then calls
`POST /reports/{report}/notes/voice`. The server transcribes,
summarizes, records usage, and creates the note. The mobile hook
invalidates the report and note caches after success.

Fixture and screenshot modes select the bundled two-second M4A
recording. Normal builds use Expo Audio. The application does not
implement on-device interim transcription or an
`EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPT` flag.

`AudioPlaybackProvider` permits one active voice note. It pauses and
releases the old player before another URI starts. Draft and saved
report surfaces share the voice-card presentation and signed URL path.

See [`arch-voice-pipeline.md`](arch-voice-pipeline.md).

## Design system

`tailwind.config.js` is the primary token source. Components use
NativeWind classes and shared primitives. The component lint rules
reject hard-coded hex colors in the guarded component tree.

Common primitives include `AppDialogSheet`, `Button`, `Card`,
`EmptyState`, `IconButton`, `InlineNotice`, `Input`, `SafeAreaView`,
`ScreenHeader`, `Skeleton`, and `StatTile`.

Application dialogs must use `AppDialogSheet` or its provider. Product
code must not use `Alert.alert`.

## Developer surfaces

The shared `SHOW_DEVELOPER_TOOLS` policy exposes Developer surfaces only in
development or fixture builds. It gates the Profile row, direct Developer and
report-debug routes, their reads, and both the selector and pane for Generate
Debug. The Generate Debug preference defaults off and persists in AsyncStorage,
but cannot override the build policy. See
[`design-mobile-developer-tools-gate.md`](design-mobile-developer-tools-gate.md).

Draft report edits use the per-card edit modal on the Report pane; Generate has
no Edit tab.

## Tests

The mobile workspace uses Vitest and React Test Renderer for unit and
component behavior. It does not use an MSW mobile harness. Tests stub
the platform or global fetch boundary where required.

Maestro drives integrated device flows. Store screenshot capture uses
a separate deterministic mode and seeded local data. Visual acceptance
remains a manual review against the relevant design document or the
current implementation.

Run:

```sh
pnpm --filter @harpa/mobile test
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
pnpm --filter @harpa/mobile bundle:smoke
```

Maestro requires an installed native build, a device or simulator, and
the supporting local or development services. Use `.maestro/README.md`
and `tools/maestro-orchestrator/README.md` for the current procedure.
