/**
 * Safe loader for `expo-camera`.
 *
 * The `expo-camera` package's top-level JS calls
 * `requireNativeModule('ExpoCamera')`, which throws at module-eval
 * time on any binary that wasn't built with the camera config plugin
 * linked (e.g. the simulator binary used by the P3 dev workflow and
 * Maestro CI before the EAS cut lands — see P3.12 deferral in
 * `docs/v4/plan-p3-feature-build.md`).
 *
 * Without this shim, a missing native module would crash the entire
 * bundle at boot (Expo Router statically registers every route, which
 * statically imports the camera-capture screen, which statically
 * imports `expo-camera`). With the shim, the rest of the app boots
 * normally; if a user navigates to the camera screen on an unlinked
 * binary, they hit the permission-denied fallback rendered by the
 * camera screen body instead of a redbox.
 *
 * Tests mock this shim directly to bypass the runtime `require()`.
 */
type ExpoCameraModule = typeof import('expo-camera');

let mod: Partial<ExpoCameraModule> = {};
try {
  mod = require('expo-camera') as Partial<ExpoCameraModule>;
} catch (err) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      '[expo-camera-shim] native module unavailable; camera screen will render a disabled fallback.',
      err,
    );
  }
}

type PermissionTuple = ReturnType<ExpoCameraModule['useCameraPermissions']>;
const deniedPermission = {
  granted: false,
  canAskAgain: false,
  status: 'denied' as const,
  expires: 'never' as const,
  scope: 'none' as const,
};

export const CameraView = (mod.CameraView ?? (() => null)) as ExpoCameraModule['CameraView'];

export const useCameraPermissions: ExpoCameraModule['useCameraPermissions'] =
  mod.useCameraPermissions ??
  (((): PermissionTuple => [
    deniedPermission as unknown as PermissionTuple[0],
    (async () => deniedPermission) as unknown as PermissionTuple[1],
    (async () => deniedPermission) as unknown as PermissionTuple[2],
  ]) as unknown as ExpoCameraModule['useCameraPermissions']);

export type {
  CameraCapturedPicture,
  CameraType,
  FlashMode,
  CameraView as CameraViewType,
} from 'expo-camera';
