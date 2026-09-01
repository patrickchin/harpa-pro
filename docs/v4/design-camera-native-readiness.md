# Camera native-readiness gate

## Status

Approved for implementation under the request to continue fixing and rerunning
all local Maestro journeys.

## Problem

The Android regression journey can open the camera and tap the shutter before
Expo CameraX reaches its first ready state. Expo then discovers the preferred
picture size in `onCameraReady`, changes the `pictureSize` prop, and rebuilds
the native `ImageCapture` pipeline while a burst capture is pending. The
pending promise may never settle, leaving the shutter disabled and the second
thumbnail absent.

The failing run preserved this sequence under
`harpa-maestro-fix-20260806-231632`: the second tap completed before the first
CameraX OPEN event, then the picture-size update cleared and rebuilt the
pipeline.

## Decision

`CameraCapture` will make the existing shutter's enabled state the semantic
native-readiness boundary:

- Default native wiring starts unready.
- The first `onCameraReady` discovers the preferred picture size.
- On Android, when discovery changes `pictureSize`, readiness remains false
  until CameraX emits the guaranteed ready callback after rebinding.
- On iOS, readiness becomes true after the first callback because changing the
  session preset does not emit another ready callback.
- Missing size discovery, no matching size, or a discovery error falls back to
  the native default and marks the camera ready.
- An injected `takePicture` collaborator starts ready so component tests and
  non-native previews keep their existing contract.
- Android lens flips increment a camera generation and clear readiness until
  the replacement CameraX pipeline reports ready. Async discovery from an old
  generation is ignored.
- iOS lens flips preserve readiness because Expo updates the session device
  without emitting another ready callback.

The shutter and Done stay disabled while a capture is in flight. The default
native path deliberately uses ordinary awaited `takePictureAsync` rather than
Expo fast mode. Expo 55's fast contract has no save-failure callback or callback
unregister operation: Android can settle the early promise and then fail JPEG
writing without emitting `onPictureSaved`, and view teardown can leave the
module-global JavaScript callback registered. Independent saves can also finish
out of shutter order.

Awaited mode gives each shutter one success/rejection terminal, keeps the
atomic ref-backed lock until the URI exists, and serializes burst order. Done
also checks that lock in its handler, so a stale enabled control cannot commit
an incomplete list. `skipProcessing: true`, the approximately 3 MP picture-size
cap, cached thumbnails, and fire-and-forget camera-roll copies retain the other
hot-path optimizations. Reintroduce overlapping native saves only after a
real-device latency benchmark shows this serialization is unacceptable and the
installed Expo version exposes success, failure, cancellation, and unregister
terminals.

The capture session is ref-backed and becomes inactive atomically on Done,
Cancel, or unmount. Results that resolve after cancellation are deleted.
System unmount deletes every completed-but-uncommitted cache file, while Done
preserves URIs only when the session registry accepts their handoff; a missing
or stale session rejects ownership and the camera deletes those files. Android
Back uses the same Cancel/Discard flow, and native modal gestures are disabled
so they cannot bypass confirmation. Permission-gate exits cannot render that
discard sheet, so they directly reclaim any retained captures before leaving.

## Maestro contract

A shared helper will wait for `btn-camera-shutter` to be visible and enabled.
Every current direct camera flow will use it before its first capture. The two
burst flows will use it again between their first thumbnail and second capture.
No fixed sleep or whole-flow retry is allowed.

## Verification

Unit coverage proves Android remains disabled through picture-size discovery
and enables only after the post-rebind callback. Default-wiring regressions
hold the ordinary native promise and prove the atomic shutter lock rejects a
same-tick second press, Done cannot commit early, burst order is stable, and
late results plus completed uncommitted files are cleaned on cancellation or
unmount. They also prove committed files survive route teardown and hardware
Back reaches discard confirmation. Regressions cover rejected stale-session
handoffs and denied/requesting permission exits with retained captures. Flip
coverage proves iOS stays ready and Android ignores stale pre-flip discovery.
Static policy requires the shared helper before each shutter tap in every
current consumer. The Android regression journey is the behavioral proof; the
complete post-merge Maestro inventory remains the release proof.
