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

The shutter stays disabled while the camera is unready, while a capture is in
flight, or after the burst limit is reached.

Expo fast mode has two completion signals: the `takePictureAsync` promise and
the `onPictureSaved` callback. Android may save the JPEG and invoke the callback
without settling the promise. Either signal therefore releases the capture
lock. Each capture receives a monotonically increasing attempt id so a delayed
callback from an older capture cannot unlock a newer one.

## Maestro contract

A shared helper will wait for `btn-camera-shutter` to be visible and enabled.
Every current direct camera flow will use it before its first capture. The two
burst flows will use it again between their first thumbnail and second capture.
No fixed sleep or whole-flow retry is allowed.

## Verification

Unit coverage will prove Android remains disabled through picture-size
discovery and enables only after the post-rebind callback. It will also prove
that a saved-photo callback releases a capture whose promise remains pending,
without letting a delayed callback unlock a newer capture. Flip coverage will
prove iOS stays ready and Android ignores stale pre-flip discovery. Static
policy will require the shared helper before each shutter tap in every current
consumer. The Android regression journey is the behavioral proof; the complete
post-merge Maestro inventory remains the release proof.
