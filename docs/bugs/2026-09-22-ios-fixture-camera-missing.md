# 2026-09-22 — Fixture camera existed only in Maestro comments

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The full iOS Maestro regression reached the photo-note module,
opened the camera screen, and waited forever for an enabled shutter. The
simulator showed the controls over a black preview, but Expo Camera never
reported readiness because the simulator had no camera stream.

**Root cause.** The photo journeys and testing docs said fixture mode supplied
a synthetic capture, and `CameraCapture` already exposed permission, preview,
and capture injection seams. The route never connected those seams to
`EXPO_PUBLIC_USE_FIXTURES`. Android regression runs on camera-equipped hardware
therefore masked the missing fixture wiring.

After the fixture adapter made the shutter usable, iOS exposed a second layer:
the `Pressable` enforced `disabled={false}`, but XCTest did not publish an
enabled attribute even after the control published an explicit accessibility
state.

**Fix.** In fixture mode, the route now bypasses native permission and preview,
then copies an already bundled image to a unique cache file for every shutter
press. The shutter also publishes the same readiness boolean through
`accessibilityState.disabled`; a ready-only test ID on its visible region
exposes that boundary to XCTest. Non-fixture builds still use the native Expo Camera
path unchanged, and the dedicated native-input smoke remains its behavioral
guard.

**Test.** Unit coverage exercises the real fixture adapter and both route flag
branches. Release-confidence policy pins the bundle-time gate and the separate
non-fixture smoke. The complete iOS regression proves the image continues
through processing, MinIO upload, timeline rendering, report generation, and
cleanup.

**Pattern.** Executable fixture claims must be traced from the environment
selector through the route to the injected collaborator. A comment naming a
fixture is not evidence that the default E2E route actually selects it.
