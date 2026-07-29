# iOS photo-library disablement

Status: accepted temporary behavior, 2026-07-30.

## Decision

Harpa Pro does not offer photo-library picking on iOS for now. The
report attachment sheet remains available with camera capture, and the
account screen continues to display an existing avatar without making
it tappable or advertising avatar changes.

Android keeps its existing photo-library attachment and avatar-upload
behavior. In-app previews of already-uploaded photos are unchanged on
both platforms; those galleries do not read the device photo library.

## Safety boundary

A single mobile capability owns the platform policy. Normal iOS UI
omits photo-library controls, while the shared picker helper also
returns before importing or invoking `expo-image-picker`. The avatar
component uses the same policy and loads the picker only after the
interactive Android path is chosen.

Camera capture remains supported. Its optional save-to-library path
uses the existing add-only iOS permission and does not require reading
the user's photo library.

## Re-enabling iOS

Re-enable the capability only alongside an `expo-image-picker` config
plugin entry with reviewed permission copy, a new native iOS build, and
a device smoke test proving both report attachment and avatar upload.
