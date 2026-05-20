/**
 * Camera capture route — full-screen modal wired to the
 * session-registry handoff (P3.12).
 *
 * The screen body in `screens/camera-capture.tsx` is props-only. This
 * route:
 *
 *   1. reads `sessionId` from the URL (see canonical lifecycle in
 *      `lib/camera-session-registry.ts`)
 *   2. on Done: commits the URI list back to the session and pops
 *   3. on Cancel: pops (the body has already confirmed any discard)
 *
 * Upload + media-library save are deferred to P4 (see plan-p3.md
 * "Deferred to P4" subsection on P3.12). The session-registry handoff
 * is the one stable contract — once the caller drains the URIs in
 * `useFocusEffect`, the upload pipeline takes over.
 */
import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CameraCapture } from '@/screens/camera-capture';
import { commitCameraSession } from '@/lib/camera-session-registry';
import { safeBack } from '@/lib/nav/safe-back';

export default function CaptureRoute() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  const handleCommit = useCallback(
    (uris: string[]) => {
      if (sessionId) {
        commitCameraSession(sessionId, uris);
      }
      // TODO(P4): kick the upload queue here once the
      // R2-presign / registerFile / createNote pipeline lands. For
      // now the caller is responsible for draining the session in
      // `useFocusEffect` and uploading from there.
      safeBack(router, '/');
    },
    [router, sessionId],
  );

  const handleCancel = useCallback(() => {
    safeBack(router, '/');
  }, [router]);

  return <CameraCapture onCommit={handleCommit} onCancel={handleCancel} />;
}
