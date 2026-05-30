# 2026-05-18 — `expo-camera` native module missing crashed boot on dev-clients without the linked module (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Launching the dev-client app produced an immediate
redbox: `Cannot find native module 'ExpoCamera'`. The crash
happened at module evaluation of `screens/camera-capture.tsx`
because `expo-camera`'s top-level code calls
`requireNativeModule('ExpoCamera')` eagerly, even if the
`CameraView` component is never mounted.

**Root cause.** P3.12 added `expo-camera` to the JS bundle but the
native binary on the running dev-client predated the addition (the
fmt/Xcode 26 native rebuild has been deferred — see
`docs/v4/plan-p3-feature-build.md` P3.12). Any route that imports a
file which imports `expo-camera` blows up the whole bundle, not
just the camera screen.

**Fix.** Added `apps/mobile/lib/native/expo-camera-shim.ts` which
wraps `require('expo-camera')` in a try/catch and re-exports
`CameraView` / `useCameraPermissions` with safe fallbacks that
render an inline "Camera unavailable" message when the native
module is missing. `screens/camera-capture.tsx` now imports from
the shim. The shim keeps the typings intact so the rest of the app
is unchanged.

**Avoiding recurrence.**
- Any native-only Expo module loaded at module-eval time gets the
  same lazy-loader treatment when introduced. Add a checklist item
  to P3-style screen rollouts: "Does this need a shim?"
- Lint rule candidate: flag direct imports of `expo-camera`,
  `expo-av`, `expo-file-system` outside of `lib/native/*`.
