/**
 * Dev mirror — Camera capture screen with state toggles.
 *
 * Mirrors the route at `app/(camera)/capture.tsx` with mocked
 * permission state, a placeholder `<View />` standing in for the
 * live `CameraView`, and a stub shutter that synthesises a local
 * URI so the populated-strip state is exercisable without a real
 * camera.
 *
 * Toggle between
 *   - `requesting` → permission spinner
 *   - `denied`     → permission gate ("Allow camera")
 *   - `blocked`    → permission gate ("Open Settings")
 *   - `granted`    → camera UI with a stub preview + working shutter
 *   - `populated`  → granted, seeded with 3 dummy captures
 *
 * NOTE: the camera preview is a placeholder `<View />` in dev — the
 * shutter writes synthetic `cam-dev://N` URIs (no real file is
 * created). Tap a thumbnail to remove it (no file deletion runs in
 * dev). The discard-confirm dialog still wires up.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import {
  CameraCapture,
  type CameraCaptureItem,
  type CameraCapturePermissionOverride,
} from '@/screens/camera-capture';

type Mode = 'requesting' | 'denied' | 'blocked' | 'granted' | 'populated';

const SEED_CAPTURES: CameraCaptureItem[] = [
  { uri: 'cam-dev://seed-1', width: 1920, height: 1080 },
  { uri: 'cam-dev://seed-2', width: 1920, height: 1080 },
  { uri: 'cam-dev://seed-3', width: 1920, height: 1080 },
];

function permissionFor(mode: Mode): CameraCaptureProps['permissionOverride'] {
  switch (mode) {
    case 'requesting':
      return 'requesting';
    case 'denied':
      return { granted: false, canAskAgain: true };
    case 'blocked':
      return { granted: false, canAskAgain: false };
    default:
      return { granted: true, canAskAgain: true };
  }
}

type CameraCaptureProps = Parameters<typeof CameraCapture>[0];

export default function DevCameraCapture() {
  const [mode, setMode] = useState<Mode>('granted');
  const [shutterCounter, setShutterCounter] = useState(0);

  const takePicture = useCallback(async (): Promise<CameraCaptureItem> => {
    const next = shutterCounter + 1;
    setShutterCounter(next);
    return { uri: `cam-dev://shot-${next}`, width: 1920, height: 1080 };
  }, [shutterCounter]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(
          ['requesting', 'denied', 'blocked', 'granted', 'populated'] as Mode[]
        ).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'default' : 'outline'}
            size="sm"
            onPress={() => setMode(m)}
          >
            {m}
          </Button>
        ))}
      </View>

      <View className="flex-1">
        <CameraCapture
          key={mode}
          onCommit={() => setMode('granted')}
          onCancel={() => setMode('granted')}
          permissionOverride={permissionFor(mode)}
          renderPreview={() => (
            <View className="flex-1 bg-stone-700" testID="dev-camera-preview-stub" />
          )}
          takePicture={takePicture}
          onOpenSettings={() => undefined}
          deleteFile={() => undefined}
          initialCaptures={mode === 'populated' ? SEED_CAPTURES : undefined}
        />
      </View>
    </View>
  );
}
