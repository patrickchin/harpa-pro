# Camera fixture-input adapter

## Status

Approved for implementation as part of the required pre-production iOS
Maestro regression.

## Problem

The long Maestro regression is documented as a deterministic fixture-input
run. Its photo modules say that `EXPO_PUBLIC_USE_FIXTURES=true` supplies a
synthetic camera image, but the camera route always mounted the native camera
and never injected a capture collaborator. Android hardware masked the gap.
On an iOS simulator, Expo Camera has no hardware stream, never emits the ready
callback, and correctly leaves the shutter disabled. The journey therefore
could not exercise the camera-to-upload pipeline on iOS.

## Decision

When `EXPO_PUBLIC_USE_FIXTURES=true`, the camera route will use the existing
`CameraCapture` seams:

- permission is granted without a native prompt;
- a non-native preview replaces `CameraView`;
- each shutter press copies an already bundled app image to a unique cache
  file and returns that file as the captured image.

The unique copy preserves the real capture ownership contract: thumbnails
have distinct keys, cancel/remove can delete the temporary file, and the
image-manipulation and upload pipeline receives a readable local URI. The
route still commits through the camera-session registry and all processing,
presign, MinIO upload, note creation, report generation, and cleanup remain
real local-stack behavior.

`EXPO_PUBLIC_USE_FIXTURES=false` keeps the production/default path unchanged:
native permission, `CameraView`, readiness callbacks, and
`takePictureAsync`. `.maestro/native-input-smoke.yaml` remains the focused
non-fixture guard for that wiring.

## Verification

Unit coverage proves the fixture adapter resolves the bundled asset, copies it
to a unique cache URI, and fails closed when Expo cannot materialize the
asset. Route coverage proves the three fixture props are present only when the
parsed bundle-time flag is true. Static release-confidence checks keep the
fixture regression and non-fixture native smoke on opposite sides of that
boundary. The complete iOS regression is the behavioral proof before the
production merge.
