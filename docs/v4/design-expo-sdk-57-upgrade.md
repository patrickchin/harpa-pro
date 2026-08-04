# Expo SDK 55 to 56 to 57 upgrade

## Status

Accepted. This change implements SDK 56; SDK 57 remains a separate,
independently verified follow-up.

## Why this is staged

Harpa Pro currently uses Expo SDK 55, React Native 0.83.6, and React
19.2.0. SDK 56 is the substantive migration step. SDK 57 then moves the
app from React Native 0.85 to 0.86 and is expected to require little or
no additional source migration.

The work must be staged because SDK 56 changes several assumptions that
this repository owns directly:

- The minimum supported iOS version becomes 16.4 and the supported build
  toolchain moves to Xcode 26.4.
- `expo-file-system` makes `File.copy()`, `File.move()`,
  `Directory.copy()`, and `Directory.move()` asynchronous.
- Expo Router changes how React Navigation modules are imported.
- `globalThis.fetch` is backed by `expo/fetch`.
- Harpa Pro uses CNG, EAS Build, `expo-dev-client`, `expo-updates`, and a
  custom iOS config plugin, so the native project must be regenerated and
  rebuilt at both stages.

The migration deliberately excludes the open repository-wide dependency
rollup and the separate React Native Gesture Handler 3.x major update.

## Goals

- Upgrade mobile from SDK 55 to SDK 57 through a verified SDK 56 state.
- Use Expo-managed dependency versions at each stage.
- Keep current bundle identifiers, update channels, runtime-version
  policy, permissions, and EAS profiles unchanged.
- Make each stage independently revertible.
- Require fresh native binaries; neither stage is an OTA-only change.

## Non-goals

- No React Native Gesture Handler 3.x adoption.
- No migration to Expo UI primitives or pager replacements.
- No migration to the new MediaLibrary object API.
- No repo-wide dependency sweep.
- No release-process, OTA-policy, or application-architecture redesign.

## Current baseline

- `expo ~55.0.26`, `react-native 0.83.6`, and `react 19.2.0` in the
  mobile workspace.
- Expo Router 55, Expo Updates 55, and the Expo 55 native-module family.
- React Native Gesture Handler 2.30.1, Reanimated 4.2.1, and Worklets
  0.7.4.
- Development builds are the normal development surface; Expo Go is not
  a rollout dependency.
- No `ios/` or `android/` directories are checked in, so CNG is the
  source of native projects.
- `apps/mobile/plugins/with-fix-build-warnings.js` has an iOS deployment
  target fallback of 15.1 that is incompatible with SDK 56.
- `apps/mobile/lib/reports/export-report-pdf.ts` calls `File.move()`
  synchronously.

## References

- [Expo SDK 56 release notes](https://expo.dev/changelog/sdk-56)
- [Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57)
- [Expo SDK upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Expo Router SDK 55 to 56 migration](https://docs.expo.dev/router/migrate/sdk-55-to-56/)
- [Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/)

## Package policy

Use the versions selected by `expo install --fix` for each SDK. Do not
hand-pick a different native dependency combination unless Expo Doctor
demonstrates that the managed set is invalid.

The expected anchors are:

| Package                          | Current       | SDK 56     | SDK 57    |
| -------------------------------- | ------------- | ---------- | --------- |
| `expo`                           | `~55.0.26`    | `~56.0.18` | `~57.0.8` |
| `react`                          | `19.2.0`      | `19.2.3`   | `19.2.3`  |
| `react-native`                   | `0.83.6`      | `0.85.3`   | `0.86.0`  |
| `expo-router`                    | `~55.0.16`    | `~56.2.17` | `~57.0.8` |
| `expo-updates`                   | `^55.0.24`    | `~56.0.23` | `~57.0.9` |
| `expo-dev-client`                | `^55.0.35`    | `~56.0.24` | `~57.0.8` |
| `expo-file-system`               | `^55.0.22`    | `~56.0.8`  | `~57.0.1` |
| `expo-media-library`             | `^55.0.17`    | `~56.0.10` | `~57.0.3` |
| `expo-camera`                    | `^55.0.19`    | `~56.0.8`  | `~57.0.3` |
| `expo-audio`                     | `^55.0.14`    | `~56.0.13` | `~57.0.3` |
| `expo-image`                     | `^55.0.11`    | `~56.0.11` | `~57.0.1` |
| `expo-image-picker`              | `^55.0.20`    | `~56.0.22` | `~57.0.6` |
| `expo-sharing`                   | `^55.0.18`    | `~56.0.23` | `~57.0.7` |
| `expo-splash-screen`             | legacy config | `~56.0.14` | managed   |
| `expo-build-properties`          | absent        | `~56.0.24` | managed   |
| `expo-status-bar`                | `~55.0.6`     | `~56.0.4`  | `~57.0.1` |
| `react-native-gesture-handler`   | `~2.30.1`     | `~2.31.1`  | `~2.32.0` |
| `react-native-pager-view`        | `8.0.0`       | `8.0.1`    | `8.0.2`   |
| `react-native-reanimated`        | `~4.2.1`      | `4.3.1`    | `4.5.0`   |
| `react-native-safe-area-context` | `5.6.2`       | `~5.7.0`   | `~5.7.0`  |
| `react-native-screens`           | `~4.23.0`     | `~4.26.0`  | `~4.26.0` |
| `react-native-svg`               | `15.15.3`     | `15.15.4`  | `15.15.4` |
| `react-native-worklets`          | `~0.7.4`      | `0.8.3`    | `0.10.0`  |

The root Expo, React, React DOM, React Test Renderer, React Native, and
React overrides must be aligned in the same SDK commit so hoisting
cannot pin mobile to the prior SDK's graph.

Keep `@sentry/react-native` in `expo.install.exclude`. TypeScript is a
repo-wide toolchain dependency rather than an Expo-native dependency, so
also exclude it during the SDK migration. A TypeScript major upgrade is
separate work.

## Stage 1: SDK 55 to 56

### Dependency alignment

1. Bump Expo in both the root and mobile manifests.
2. Run Expo-managed dependency alignment in the mobile workspace.
3. Align the root React pins and overrides.
4. Keep React Native Gesture Handler on Expo's 2.x line.
5. Regenerate the pnpm lockfile without unrelated workspace upgrades.

### Router imports

Run the Expo Router 55 to 56 codemod or an equivalent repository-wide
audit. Direct `@react-navigation/*` imports are not expected, but this
must be verified rather than assumed. Replace the removed public `Router`
type with `ImperativeRouter` in navigation helpers and tests.

### Splash-screen config

SDK 56 no longer exposes the legacy top-level splash field through the
typed Expo config. Add `expo-splash-screen` and preserve the same image,
resize mode, and brand background through its supported config plugin.

### iOS deployment target

SDK 56 raises the minimum iOS version to 16.4.

- Add `expo-build-properties` and configure
  `ios.deploymentTarget: "16.4"`.
- Change the custom pod-target plugin fallback from 15.1 to 16.4.
- Verify generated native configuration with Expo config and prebuild
  introspection before a native build.

Without both changes the custom plugin can reintroduce a stale deployment
floor even when the Expo package graph is correct.

### Asynchronous file-system operations

Audit every `File.copy()`, `File.move()`, `Directory.copy()`, and
`Directory.move()` call. Await the confirmed report-export move while
preserving its cleanup semantics. Tests must make the mocked move truly
asynchronous so a missing `await` fails observably.

### Fetch transport

No source change is planned for the API or auth clients, but SDK 56
changes the global fetch implementation. Re-verify:

- email OTP and session persistence;
- JSON API requests;
- direct uploads and their completion callbacks.

### Scope guardrails

- Do not change MediaLibrary APIs.
- Do not replace pager or gesture libraries.
- Do not change bundle IDs, update channels, or runtime-version policy.

## Stage 2: SDK 56 to 57

1. Start from the verified SDK 56 state.
2. Bump Expo to SDK 57 and run managed dependency alignment again.
3. Keep React Native Gesture Handler on the Expo-managed 2.x line.
4. Regenerate the lockfile and repeat every local/mobile validation.
5. Note that SDK 57 cleans native directories during prebuild by default.
   This is compatible with Harpa Pro's CNG model. Use `--no-clean` only
   when a debugging workflow intentionally needs in-place native changes.

No repo-specific source refactor is expected in this stage.

## Validation

### Local checks for each stage

- `pnpm --filter @harpa/mobile lint`
- `pnpm --filter @harpa/mobile typecheck`
- `pnpm --filter @harpa/mobile test:nocoverage -- __tests__/app-config.test.ts`
- `pnpm --filter @harpa/mobile test:nocoverage -- lib/reports/export-report-pdf.test.ts`
- `pnpm --filter @harpa/mobile test:nocoverage -- features/voice/expoAudioRecorder.test.ts`
- `pnpm --filter @harpa/mobile test:nocoverage -- screens/camera-capture.test.tsx`
- `pnpm --filter @harpa/mobile bundle:smoke`
- `pnpm dlx expo-doctor@latest` from `apps/mobile/`

### Device smoke after SDK 56 and SDK 57

- Launch a new iOS development-client binary.
- Sign in through email OTP and verify the session survives a restart.
- Record/cancel one voice note, then record and save a real voice note.
- Capture a photo with and without saving it to the camera roll.
- Upload an image through the real upload path.
- Preview, save, open, and share a PDF.
- Exercise pinch, drag, and dismiss gestures in the image viewer.

### EAS gates

1. Build `development-simulator` for fast iOS validation.
2. Build `development` for real device/dev-client validation.
3. Build `preview` after the local and device checks are green.
4. Repeat the same sequence for SDK 57 before considering production.

EAS builds are separate, explicitly authorized release operations; local
validation does not claim that a native binary has been built or uploaded.

## Monitoring

Watch the following during preview validation:

- Sentry app-start and screen-open crashes;
- auth persistence through `expo-secure-store`;
- camera and media-library permissions;
- iOS AAC recorder startup and voice-note upload;
- PDF preview/open/share flows;
- Reanimated-heavy camera, image, and preview screens for memory growth.

SDK 56 release notes call out a Hermes V1 and Reanimated memory regression,
which is material because Harpa Pro uses Reanimated heavily.

## Rollout and rollback

Land SDK 56 in one focused PR. After local, native, and preview verification,
land SDK 57 in a second focused PR. Only then cut a normal mobile release.

- Do not rely on OTA for either stage; both require fresh native binaries.
- Keep `runtimeVersion: { policy: "appVersion" }` unchanged.
- If SDK 56 fails, revert only the SDK 56 PR.
- If SDK 57 fails, keep the verified SDK 56 state and revert only SDK 57.
- Because native projects are generated, rollback is a package/config/source
  reversion followed by a fresh native build.

## Separation from open dependency PRs

- The broad production dependency rollup remains out of scope.
- The React Native Gesture Handler 3.x PR remains out of scope until SDK 57
  is stable on Expo's managed 2.x line.
- The Expo-only major PR is not mergeable as a migration because changing
  only `expo` leaves Router, React Native, file-system, camera, and other
  native satellites on SDK 55-era versions.
