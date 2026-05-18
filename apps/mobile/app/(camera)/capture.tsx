/**
 * Camera capture route — full-screen modal wired to the
 * session-registry handoff (P3.12) and, since P3.15.2, the
 * `expo-media-library` save-to-camera-roll toggle.
 *
 *   1. reads `sessionId` from the URL (see canonical lifecycle in
 *      `lib/camera-session-registry.ts`)
 *   2. on Done: commits the URI list back to the session and pops —
 *      the caller drains in `useFocusEffect` and enqueues into the
 *      upload queue via `useCameraUploads` (`lib/camera/use-camera-uploads.ts`)
 *   3. on Cancel: pops (the body has already confirmed any discard)
 *
 * Save-to-camera-roll lives at the route level rather than the body
 * because (a) AsyncStorage is a side-effect the body shouldn't own,
 * and (b) the route already routes permission UX through
 * AppDialogSheet (no `Alert.alert`, hard rule).
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';

import { CameraCapture } from '@/screens/camera-capture';
import { commitCameraSession } from '@/lib/camera-session-registry';
import { safeBack } from '@/lib/nav/safe-back';
import {
  readSaveToRollPref,
  writeSaveToRollPref,
} from '@/lib/camera/save-to-roll-pref';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';

export default function CaptureRoute() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  const [saveToCameraRoll, setSaveToCameraRoll] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  // Hydrate the toggle from AsyncStorage on mount.
  useEffect(() => {
    let cancelled = false;
    void readSaveToRollPref().then((v) => {
      if (!cancelled) setSaveToCameraRoll(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleSaveToRoll = useCallback(async () => {
    if (saveToCameraRoll) {
      setSaveToCameraRoll(false);
      await writeSaveToRollPref(false);
      return;
    }
    // Turning ON — request write-only permission. iOS surfaces the
    // add-only sheet bound to NSPhotoLibraryAddUsageDescription.
    const result = await MediaLibrary.requestPermissionsAsync(true);
    if (result.granted) {
      setSaveToCameraRoll(true);
      await writeSaveToRollPref(true);
      return;
    }
    if (!result.canAskAgain) {
      setBlockedDialogOpen(true);
    }
  }, [saveToCameraRoll]);

  const handleSaveCapture = useCallback(async (uri: string) => {
    // The toggle is only on once permission was granted, so this call
    // shouldn't prompt again. Errors are swallowed by the body.
    await MediaLibrary.saveToLibraryAsync(uri);
  }, []);

  const handleCommit = useCallback(
    (uris: string[]) => {
      if (sessionId) {
        commitCameraSession(sessionId, uris);
      }
      safeBack(router, '/');
    },
    [router, sessionId],
  );

  const handleCancel = useCallback(() => {
    safeBack(router, '/');
  }, [router]);

  return (
    <>
      <CameraCapture
        onCommit={handleCommit}
        onCancel={handleCancel}
        saveToCameraRoll={saveToCameraRoll}
        onToggleSaveToCameraRoll={handleToggleSaveToRoll}
        saveCaptureToCameraRoll={handleSaveCapture}
      />
      <AppDialogSheet
        visible={blockedDialogOpen}
        title="Photos access is off"
        message="Allow Harpa Pro to add captured photos to your camera roll in Settings to use this feature."
        onClose={() => setBlockedDialogOpen(false)}
        actions={[
          {
            label: 'OK',
            variant: 'quiet',
            onPress: () => setBlockedDialogOpen(false),
            testID: 'btn-camera-roll-permission-dismiss',
          },
        ]}
      />
    </>
  );
}
