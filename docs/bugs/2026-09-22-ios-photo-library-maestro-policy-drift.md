# 2026-09-22 — Maestro required Android photo-library UI on iOS

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The full iOS Maestro regression opened the report attachment
sheet, displayed the supported Camera action, then failed because
`btn-attachment-photo-library` was not visible.

**Root cause.** The cross-platform draft photo module asserted both attachment
actions unconditionally. That contradicted the accepted behavior in
[`design-ios-photo-library-disablement.md`](../v4/design-ios-photo-library-disablement.md):
Android supports library picking, while iOS intentionally exposes camera
capture only. Component and picker unit tests covered the policy correctly,
but the device journey had drifted.

**Fix.** Keep the shared attachment/camera journey, but branch the library
assertion by platform: visible on Android and absent on iOS.

**Test.** Release-confidence policy pins both platform branches and their order
before camera capture. The full iOS regression proves the camera-only path.

**Pattern.** Cross-platform E2E assertions must encode intentional capability
differences at the smallest branch instead of treating one platform's controls
as the universal UI contract.
