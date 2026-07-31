# iOS photo-library disablement

Status: accepted temporary behavior, 2026-07-30.

## Decision

Harpa Pro does not offer photo-library picking on iOS for now. The
report attachment sheet remains available with camera capture.

The account screen does not render an avatar, placeholder, upload
control, or edit control on either platform. Android keeps its existing
report photo-library attachment behavior. In-app previews of
already-uploaded report photos are unchanged on both platforms; those
galleries do not read the device photo library.

## Safety boundary

A single mobile capability owns the platform policy. Normal iOS UI
omits photo-library controls, while the shared picker helper also
returns before importing or invoking `expo-image-picker`.

Camera capture remains supported. Its optional save-to-library path
uses the existing add-only iOS permission and does not require reading
the user's photo library.

The API, storage layout, and upload contracts retain the avatar scope
for compatibility, but the mobile app has no reachable avatar feature.

## Re-enabling photo-library access on iOS

Re-enable the capability only alongside an `expo-image-picker` config
plugin entry with reviewed permission copy, a new native iOS build, and
a device smoke test proving report attachment. Reintroducing avatars is
a separate product decision and must restore its own user-visible tests.
