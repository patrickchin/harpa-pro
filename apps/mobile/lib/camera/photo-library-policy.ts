import { Platform } from 'react-native';

/**
 * Photo-library reads are temporarily disabled on iOS. Camera capture
 * and add-only saves to the camera roll remain available.
 */
export function isPhotoLibraryPickingEnabled(
  platform: typeof Platform.OS = Platform.OS,
): boolean {
  return platform !== 'ios';
}
