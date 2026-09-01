/**
 * `(camera)` route group — full-screen modal camera. Ported verbatim
 * from `../haru3-reports/apps/mobile/app/(camera)/_layout.tsx` on
 * branch `dev`.
 *
 * The camera lives in its own route group because it is launched from
 * many places (report screen, future "add icon"). A
 * full-screen modal presentation keeps it visually independent of the
 * caller and lets us lock orientation without leaking that lock into
 * the parent stack.
 */
import { Stack } from 'expo-router';

export default function CameraLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'fullScreenModal',
        // All dismissal must pass through CameraCapture's Cancel/Discard
        // contract so completed temporary JPEGs are never silently lost.
        gestureEnabled: false,
        animation: 'slide_from_bottom',
        orientation: 'portrait',
        contentStyle: { backgroundColor: '#000000' },
      }}
    />
  );
}
