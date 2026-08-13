# Maestro-on-Mac / iOS-Simulator pitfalls

> **Status: historical.** Several examples use the removed phone-auth routes
> and helpers. Use the current email-auth flows under `.maestro/` for active
> test work. Keep this file as an incident record.

This document catalogs pitfalls hit while pushing E2E coverage with
Maestro on **macOS** driving the **iOS Simulator** (iPhone 17 Pro,
iOS 18.x) with a dev-client build of the mobile app. Companion to
[`pitfalls-maestro-windows.md`](./pitfalls-maestro-windows.md), which
covers the same suite running on Windows / Android.

The regression journey under test is
[`.maestro/regression-journey.yaml`](../../.maestro/regression-journey.yaml).

When working on either platform, **read both files** — many "platform
specific" issues turn out to have a cross-platform analog.

---

## Pitfall 1 — iOS SpringBoard "Open in 'Harpa Pro Dev'?" dialog after `openLink`

**Symptom.** First `openLink` to any custom URL scheme (e.g.
`harpa://sign-up/phone`, `exp+harpa-pro-v4://...`) on a fresh app
install raises an iOS confirm sheet:

```
Open in "Harpa Pro Dev"?
[Cancel] [Open]
```

The dialog appears **~1 second asynchronously** after `openLink`
returns. Maestro proceeds into the flow's next step (typically an
`assertVisible` of `input-signup-phone`) before the dialog has
rendered, and either the assertion times out (dialog blocks the
target element) or — worse — the sheet steals focus mid-way.

It fires **once per scheme per device install**. So both `harpa://`
and `exp+harpa-pro-v4://` each get one dialog on the first launch
after `clearState: true`.

**Cause.** iOS LaunchServices prompts the user to confirm the first
time an app receives a deep link from another process (here: Maestro
via `simctl openurl`). Not specific to Expo or React Native — every
iOS app that uses custom schemes hits this. Maestro has no built-in
dismissal (open issue:
[mobile-dev-inc/Maestro#940](https://github.com/mobile-dev-inc/Maestro/issues/940)).

**Workaround (shipped).** Reusable helper
[`.maestro/helpers/dismiss-open-dialog.yaml`](../../.maestro/helpers/dismiss-open-dialog.yaml):

```yaml
- waitForAnimationToEnd:
    timeout: 3000
- runFlow:
    when:
      visible: 'Open'
    commands:
      - tapOn: 'Open'
      - waitForAnimationToEnd
```

Called after every `openLink` that targets a custom scheme:

```yaml
- openLink: harpa://sign-up/phone
- runFlow:
    file: ../helpers/dismiss-open-dialog.yaml
```

No-op on Android (no "Open" text visible) and on iOS after the scheme
has been approved once.

**Better solution (not shipped, Mac-only).** Pre-approve the scheme at
the simulator level so the dialog never appears:

```bash
/usr/libexec/PlistBuddy \
  ~/Library/Developer/CoreSimulator/Devices/${DEVICE_ID}/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist \
  -c "add com.apple.CoreSimulator.CoreSimulatorBridge-->harpa string com.harpa.pro.dev"
```

We didn't ship this because `PlistBuddy` is macOS-only — the Windows
agent has no way to apply the same pre-approval, so the YAML helper
is the only portable solution.

---

## Pitfall 2 — Expo dev-menu floating "Tools button" overlaps `btn-open-profile`

**Symptom.** Tapping `btn-open-profile` (top-right of the header)
intermittently lands on the dev-menu trigger instead, opening the
Reload / Go home / Tools sheet mid-flow. The sign-out and
14-account modules fail with a stuck dev menu over the profile screen.

The FAB has `resource-id: "gearshape.fill"` and sits at
`[348,96][374,122]` on iPhone 17 Pro. `btn-open-profile` is at
`[338,76][384,120]` — geometrically overlapping. Maestro's
`tapOn id: btn-open-profile` resolves to coordinates and iOS picks
whichever view is on top.

**Cause.** `expo-dev-menu` adds a floating action button to every
dev-client build, intended to be a convenience replacement for the
device-shake gesture. The button is on by default and there was no
config option to disable it until
[expo/expo#44251](https://github.com/expo/expo/pull/44251) shipped in
**expo-dev-launcher 55.0.30** (2026-05-01).

**Workaround (shipped).** Set `toolsButton: false` in the
`expo-dev-client` plugin block in `apps/mobile/app.config.ts`:

```ts
plugins: [
  'expo-router',
  ['expo-dev-client', { toolsButton: false }],
  // ...
],
```

This writes the `EXDevMenuShowFloatingActionButton` key into
Info.plist (iOS) and AndroidManifest (Android). **Requires a fresh
native build** (EAS / `expo prebuild --clean` + pod install) — JS-only
reloads won't pick it up.

**Previous workaround (now deleted).** Before adopting the plugin
flag we had `helpers/move-dev-fab.yaml` which dragged the FAB to the
bottom-left corner. It was a `swipe: start: "90%,12%" end: "10%,88%"`
gate triggered by `visible: { id: "gearshape.fill" }`. The position
persisted in UIKit state until the next `clearState`. The cleaner
plugin-flag solution makes this helper obsolete.

---

## Pitfall 3 — iOS dev-launcher "Continue" first-run sheet

**Symptom.** On the very first cold launch after `clearState: true`,
the iOS dev-launcher displays a one-time onboarding sheet ("This is
the developer menu... [Continue]") that overlays the sign-in screen.

Tapping Continue does **not** just dismiss the sheet — it opens the
**actual dev menu** (Reload / Go home / tool list), which then has
its own "Close" X button at the top-right that must also be tapped.

**Cause.** Same package as Pitfall 2 — `expo-dev-menu`'s first-run
introduction flow.

**Workaround.** A pair of conditional gates in `01-auth.yaml` and the
current regression entrypoints:

```yaml
- runFlow:
    when:
      visible: 'Continue'
    commands:
      - tapOn:
          text: 'Continue'
      - waitForAnimationToEnd
- runFlow:
    when:
      visible: 'Close'
    commands:
      - tapOn:
          text: 'Close'
      - waitForAnimationToEnd
```

Both gates are no-ops on iOS after the first launch and on Android
once `expo-dev-launcher` ≥55.0.30 with `toolsButton: false` is built
in (the onboarding sheet stops appearing).

---

## Pitfall 4 — `tapOn: point: "50%,15%"` is not cross-platform

**Symptom.** Modules written on iOS to dismiss the keyboard via
`tapOn: point: "50%,15%"` (tap the top of the screen) broke on
Android, where `50%,15%` lands on the status bar / system UI rather
than empty space.

The hack started as a workaround for `hideKeyboard` being unreliable
in the country-picker FlatList (see Pitfall 5) and silently spread to
every form module.

**Cause.** Screen-coordinate taps are inherently device- and
orientation-dependent. iPhone 17 Pro safe-area is different from a
Samsung Galaxy — `50%,15%` has no semantic meaning across devices.

**Workaround.** Use `hideKeyboard` everywhere (now that the
FlatList fix is in — see Pitfall 5). If `hideKeyboard` ever doesn't
dismiss the keyboard, **tap a known element** (a heading, a
container with a testID) rather than a random coordinate. Never use
`tapOn: point`.

All instances of `tapOn: point: "50%,15%"` have been removed from
`.maestro/` as part of PR #42. The root lint script now also runs
`scripts/check-no-maestro-point-taps.sh`, which fails if any Maestro
flow reintroduces a `point:` key.

---

## Pitfall 5 — `hideKeyboard` swallowed by FlatList in country picker

**Symptom.** The country-picker modal lists countries in a
`FlatList`. Tapping the search input opens the keyboard. Calling
`- hideKeyboard` does nothing — keyboard stays up.

**Cause.** React Native's `hideKeyboard` works by sending a tap to
the screen background, which propagates a `Keyboard.dismiss()` call
when the touch is captured by a ScrollView/FlatList with the
appropriate `keyboardDismissMode`. The picker's FlatList had no
`keyboardDismissMode`, so the gesture went nowhere.

**Cause (real).** Missing `keyboardDismissMode="on-drag"` prop on the
FlatList in `apps/mobile/components/primitives/CountryPicker.tsx`.

**Workaround.** Fixed at the source in commit `605e0b7`:

```tsx
<FlatList
  keyboardDismissMode="on-drag"
  // ...
/>
```

Same fix applied to the Account ScrollView for consistency. After
this, `hideKeyboard` works reliably in every form.

---

## Pitfall 6 — `clearState: true` doesn't wipe iOS LaunchServices state

**Symptom.** Even with `clearState: true` + `clearKeychain: true` on
`launchApp`, the iOS "Open in" dialog **doesn't re-appear** on
subsequent runs — but it also doesn't re-appear after deleting and
re-installing the app via `simctl uninstall`. It only re-appears
after a full simulator reset (`xcrun simctl erase`).

**Cause.** LaunchServices scheme approval lives in
`com.apple.launchservices.schemeapproval.plist` under the simulator's
device data dir, not inside the app sandbox. App-level `clearState`
can't touch it.

**Implication.** The `dismiss-open-dialog.yaml` helper is mostly a
no-op in CI/dev once a scheme has been approved once on a given
simulator. It only fires after a `simctl erase` or on a brand-new
simulator. **Don't remove the helper** just because runs are clean —
the first run on a fresh simulator (e.g. on CI) needs it.

---

## Pitfall 7 — `appId` mismatch between fixture-mode and prod builds

**Symptom.** Maestro flows hardcode `appId: com.harpa.pro.dev` but
the prod-channel test build is `com.harpa.pro`. Running flows against
the wrong build silently launches the wrong app or fails the
`clearState` step.

**Cause / Workaround.** Use `appId: ${MAESTRO_APP_ID}` and set the
env var per-run:

```bash
MAESTRO_APP_ID=com.harpa.pro.dev maestro test .maestro/regression-journey.yaml
```

The `scripts/maestro/run.sh` wrapper sets this automatically based on
the build profile. See also
[`docs/bugs/2026-05-22-maestro-appid-hardcoded.md`](../bugs/2026-05-22-maestro-appid-hardcoded.md).

---

## Pitfall 8 — `Pressable` inside Modal doesn't receive Maestro taps reliably

**Symptom.** Tapping a button inside a `<Modal>` (e.g. confirm
dialogs) via Maestro intermittently fails — the tap lands on the
backdrop instead of the button.

**Cause / Workaround.** Use the themed `AppDialogSheet` primitive
which uses `react-native-bottom-sheet`, not the bare `Modal`
component. See
[`docs/bugs/2026-05-18-maestro-modal-pressable-tap.md`](../bugs/2026-05-18-maestro-modal-pressable-tap.md)
for the full investigation.

---

## Quick reference: cross-platform helpers

| Helper                       | Purpose                                | Notes            |
| ---------------------------- | -------------------------------------- | ---------------- |
| `dismiss-open-dialog.yaml`   | iOS SpringBoard "Open in X?" dismissal | No-op on Android |
| `pick-country-us.yaml`       | Ensure phone-input country is US       | Both platforms   |
| `sign-in.yaml` (`PHONE` env) | Sign in as any user                    | Both platforms   |
| `sign-out.yaml`              | Profile → sign out                     | Both platforms   |
| `open-project.yaml`          | Open the regression-journey project    | Both platforms   |
