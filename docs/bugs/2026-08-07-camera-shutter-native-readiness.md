# 2026-08-07 — Camera shutter preceded native readiness (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The Android regression journey captured its first camera
thumbnail, attempted a second burst capture, and timed out either waiting for
`btn-camera-thumb-1` or for the shutter to become enabled. The failure
hierarchy showed one photo and a disabled shutter.

**Root cause.** `CameraCapture` rendered an enabled shutter before Expo
CameraX emitted its first ready callback. The first callback discovered and
applied a preferred `pictureSize`, which tore down and rebuilt CameraX's
`ImageCapture` pipeline while the second capture was pending. Expo's injected
component tests started from an immediately ready collaborator, so they did not
cover the default native callback order. After startup was gated, a fresh run
exposed a second callback-order edge: CameraX invoked `onPictureSaved` and
produced the thumbnail while the fast-mode `takePictureAsync` promise remained
pending, so the capture lock never cleared.

**Fix.** The default shutter now fails closed until native size discovery is
stable. Android waits for the guaranteed ready callback after picture-size
rebinding; iOS completes on its first callback because a preset change does not
emit another ready event. The initial fix let either fast-mode completion signal
release the capture lock, with an attempt id preventing an older delayed
callback from unlocking a newer capture. The later
[`2026-08-21` lifecycle fix](2026-08-21-camera-native-save-pending-race.md)
replaced fast mode with one ordinary awaited terminal. Current Maestro camera
flows share a bounded helper that waits for the enabled shutter before capture.
Android flips use a separate camera generation so pre-flip discovery cannot
mark the replacement pipeline ready; iOS preserves readiness because Expo does
not emit another ready event for its session-device update.

**Test.** Component tests prove Android remains disabled through the first
callback and enables after the post-rebind callback. At the time, callback tests
covered both fast-mode terminal orders; the superseding lifecycle regressions
now cover the ordinary promise's success and rejection terminals. Flip tests
cover both platform-specific readiness contracts. Release-confidence policy
requires the semantic helper to precede every shutter tap in each current
direct camera flow. Two fresh Android regression passes and the post-merge full
Maestro inventory provide the behavioral proof.

**Pattern.** R5 — injected collaborators made readiness immediate while
default native wiring had a multi-callback startup contract.
