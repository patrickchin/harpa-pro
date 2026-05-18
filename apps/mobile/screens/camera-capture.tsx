/**
 * CameraCapture screen body — props-only, no session-registry /
 * router coupling. Ported from
 * `../haru3-reports/apps/mobile/app/(camera)/capture.tsx` on branch
 * `dev`.
 *
 * The body owns:
 *  - permissions hook (`useCameraPermissions`, allowed by P3.12 spec)
 *  - `CameraView` ref + capture queue (uri[], width/height)
 *  - flash / facing toggles + shutter "isCapturing" lock
 *  - the "discard photos" confirmation dialog
 *
 * Parents flow in:
 *  - `onCommit(uris)` — invoked when the user taps Done. The body has
 *    no opinion on what to do with the URIs (session-registry,
 *    upload-queue, avatar-uploader …).
 *  - `onCancel()` — invoked when the user backs out (with no photos
 *    or after confirming discard).
 *
 * Test / dev injection (Pitfall 13 — defaults are tested, overrides
 * are for negative-path / preview):
 *  - `permissionOverride`  — bypass `useCameraPermissions`
 *  - `renderPreview`       — replace `CameraView` with a stub View
 *  - `takePicture`         — replace the camera-ref takePictureAsync
 *  - `onOpenSettings`      — replace `Linking.openSettings()`
 *  - `deleteFile`          — replace `new File(uri).delete()`
 *  - `initialCaptures`     — seed the strip for previewing populated state
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraType,
  type FlashMode,
  type CameraViewType,
} from '@/lib/native/expo-camera-shim';
import * as FileSystem from 'expo-file-system';
import {
  Camera as CameraIcon,
  RefreshCw,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';

export const DEFAULT_MAX_BURST = 20;

export interface CameraCaptureItem {
  uri: string;
  width: number;
  height: number;
}

export interface CameraCapturePermissionOverride {
  granted: boolean;
  canAskAgain: boolean;
}

export interface CameraCaptureProps {
  /** Invoked with the committed URI list when the user taps Done. */
  onCommit: (uris: string[]) => void;
  /** Invoked when the user dismisses the screen (cancel / discard). */
  onCancel: () => void;
  /** Cap on photos per session. Defaults to 20 (matching canonical). */
  maxBurst?: number;
  /** Override the hook-driven permission state (dev mirror / tests). */
  permissionOverride?: CameraCapturePermissionOverride | 'requesting';
  /**
   * Replace the live `CameraView` with an arbitrary node (dev mirror
   * placeholders, snapshot tests). Receives the current facing/flash
   * so previews can reflect the toggles if useful.
   */
  renderPreview?: (opts: { facing: CameraType; flash: FlashMode }) => ReactNode;
  /**
   * Replace the camera-ref `takePictureAsync` invocation. Useful in
   * the dev mirror (no real camera) and tests. Resolving with `null`
   * is treated as "no-op shutter".
   */
  takePicture?: () => Promise<CameraCaptureItem | null>;
  /** Override `Linking.openSettings()`. */
  onOpenSettings?: () => void;
  /** Override the local `File(uri).delete()` cleanup side-effect. */
  deleteFile?: (uri: string) => void;
  /** Seed the strip for previewing populated state in dev / tests. */
  initialCaptures?: ReadonlyArray<CameraCaptureItem>;
}

export function CameraCapture(props: CameraCaptureProps) {
  const {
    onCommit,
    onCancel,
    maxBurst = DEFAULT_MAX_BURST,
    permissionOverride,
    renderPreview,
    takePicture,
    onOpenSettings,
    deleteFile,
    initialCaptures,
  } = props;

  const [hookPermission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraViewType>(null);

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [captures, setCaptures] = useState<CameraCaptureItem[]>(() =>
    initialCaptures ? [...initialCaptures] : [],
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const removeFile = useCallback(
    (uri: string) => {
      if (deleteFile) {
        try {
          deleteFile(uri);
        } catch {
          // ignore — best-effort cleanup
        }
        return;
      }
      try {
        void FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // ignore — file may already be gone, or live outside our
        // managed cache root on some platforms.
      }
    },
    [deleteFile],
  );

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    if (captures.length >= maxBurst) return;
    setIsCapturing(true);
    try {
      let item: CameraCaptureItem | null = null;
      if (takePicture) {
        item = await takePicture();
      } else if (cameraRef.current) {
        const photo: CameraCapturedPicture | undefined =
          await cameraRef.current.takePictureAsync({
            quality: 0.9,
            skipProcessing: false,
            exif: false,
            imageType: 'jpg',
          });
        if (photo?.uri) {
          item = { uri: photo.uri, width: photo.width, height: photo.height };
        }
      }
      if (item) {
        setCaptures((prev) => [...prev, item!]);
      }
    } catch {
      // Swallow — a single bad shot shouldn't kill the screen. The
      // user can simply press the shutter again.
    } finally {
      setIsCapturing(false);
    }
  }, [captures.length, isCapturing, maxBurst, takePicture]);

  const handleRemove = useCallback(
    (uri: string) => {
      setCaptures((prev) => prev.filter((c) => c.uri !== uri));
      removeFile(uri);
    },
    [removeFile],
  );

  const handleDone = useCallback(() => {
    onCommit(captures.map((c) => c.uri));
  }, [captures, onCommit]);

  const discardAndClose = useCallback(() => {
    for (const c of captures) {
      removeFile(c.uri);
    }
    setConfirmDiscardOpen(false);
    onCancel();
  }, [captures, onCancel, removeFile]);

  const handleCancel = useCallback(() => {
    if (captures.length > 0) {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  }, [captures.length, onCancel]);

  // ── Permission gates ────────────────────────────────────────────────

  const effectivePermission = resolvePermission(permissionOverride, hookPermission);

  if (effectivePermission.state === 'requesting') {
    return (
      <View
        className="flex-1 items-center justify-center bg-black"
        testID="camera-permission-requesting"
      >
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (effectivePermission.state === 'denied') {
    const { canAskAgain } = effectivePermission;
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-black"
        testID="camera-permission-denied"
      >
        <View className="px-8 items-center" style={styles.permissionInner}>
          <CameraIcon size={48} color="#ffffff" />
          <Text className="text-white text-xl font-bold mt-2 text-center">
            Camera access is off
          </Text>
          <Text
            className="text-base text-center"
            style={styles.permissionBody}
          >
            Allow camera access to capture site photos for your reports.
          </Text>
          <View className="mt-4 gap-2 self-stretch">
            <Button
              testID="btn-camera-permission-action"
              onPress={() => {
                if (canAskAgain) {
                  void requestPermission();
                } else if (onOpenSettings) {
                  onOpenSettings();
                } else {
                  void Linking.openSettings();
                }
              }}
            >
              {canAskAgain ? 'Allow camera' : 'Open Settings'}
            </Button>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              className="py-3 items-center"
              testID="btn-camera-permission-cancel"
            >
              <Text className="text-white text-base">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera UI ───────────────────────────────────────────────────────

  const flashIcon =
    flash === 'off' ? (
      <ZapOff size={22} color="#ffffff" />
    ) : (
      <Zap
        size={22}
        color={flash === 'on' ? colors.accent.DEFAULT : '#ffffff'}
      />
    );
  const nextFlash: FlashMode =
    flash === 'off' ? 'auto' : flash === 'auto' ? 'on' : 'off';

  return (
    <View className="flex-1 bg-black" testID="camera-capture-root">
      {renderPreview ? (
        renderPreview({ facing, flash })
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="picture"
          pictureSize="1920x1080"
          responsiveOrientationWhenOrientationLocked={false}
        />
      )}

      <SafeAreaView className="absolute inset-0 justify-end" pointerEvents="box-none">
        {/* Top bar */}
        <View
          className="absolute top-0 left-0 right-0 h-14 px-4 flex-row items-center justify-between"
          style={styles.topBar}
        >
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            testID="btn-camera-cancel"
            className="w-11 h-11 rounded-full items-center justify-center"
            style={styles.iconButton}
          >
            <X size={24} color="#ffffff" />
          </Pressable>
          <Pressable
            onPress={() => setFlash(nextFlash)}
            accessibilityRole="button"
            accessibilityLabel={`Flash ${flash}`}
            testID="btn-camera-flash"
            className="w-11 h-11 rounded-full items-center justify-center"
            style={styles.iconButton}
          >
            {flashIcon}
            <Text className="text-white text-[9px] mt-0.5 uppercase tracking-wider">
              {flash}
            </Text>
          </Pressable>
        </View>

        <View className="flex-1" />

        {/* Thumbnail strip + flip */}
        <View className="flex-row items-center px-3 pb-2 gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripContent}
            className="flex-grow-0 flex-shrink"
          >
            {captures.map((c, idx) => (
              <Pressable
                key={c.uri}
                onPress={() => handleRemove(c.uri)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}
                testID={`btn-camera-thumb-${idx}`}
                className="w-14 h-14 rounded-lg overflow-hidden border-2 border-white"
              >
                <Image source={{ uri: c.uri }} className="w-full h-full" />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            testID="btn-camera-flip"
            className="w-11 h-11 rounded-full items-center justify-center ml-auto"
            style={styles.iconButton}
          >
            <RefreshCw size={22} color="#ffffff" />
          </Pressable>
        </View>

        {/* Shutter */}
        <View className="items-center py-3">
          <Pressable
            onPress={handleCapture}
            disabled={isCapturing || captures.length >= maxBurst}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            testID="btn-camera-shutter"
            style={({ pressed }) => [
              styles.shutter,
              (pressed || isCapturing) && styles.shutterPressed,
              captures.length >= maxBurst && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>

        {/* Bottom action bar */}
        <View className="px-4 pb-4 pt-1 flex-row items-center justify-between gap-3">
          <Text
            className="text-white text-sm font-medium"
            testID="lbl-camera-count"
          >
            {captures.length === 0
              ? 'No photos'
              : `${captures.length} photo${captures.length === 1 ? '' : 's'}`}
            {captures.length >= maxBurst ? ' (max)' : ''}
          </Text>
          <Button
            onPress={handleDone}
            disabled={captures.length === 0}
            testID="btn-camera-done"
          >
            Done
          </Button>
        </View>
      </SafeAreaView>

      <AppDialogSheet
        visible={confirmDiscardOpen}
        title="Discard photos?"
        message={`You have ${captures.length} unsaved photo${captures.length === 1 ? '' : 's'}.`}
        onClose={() => setConfirmDiscardOpen(false)}
        actions={[
          {
            label: 'Discard',
            variant: 'destructive',
            onPress: discardAndClose,
            testID: 'btn-camera-confirm-discard',
          },
          {
            label: 'Keep editing',
            variant: 'quiet',
            onPress: () => setConfirmDiscardOpen(false),
            testID: 'btn-camera-keep-editing',
          },
        ]}
      />
    </View>
  );
}

type ResolvedPermission =
  | { state: 'requesting' }
  | { state: 'denied'; canAskAgain: boolean }
  | { state: 'granted' };

function resolvePermission(
  override: CameraCaptureProps['permissionOverride'],
  hook: ReturnType<typeof useCameraPermissions>[0],
): ResolvedPermission {
  if (override) {
    if (override === 'requesting') return { state: 'requesting' };
    if (override.granted) return { state: 'granted' };
    return { state: 'denied', canAskAgain: override.canAskAgain };
  }
  if (!hook) return { state: 'requesting' };
  if (hook.granted) return { state: 'granted' };
  return { state: 'denied', canAskAgain: hook.canAskAgain };
}

// Visual styles that don't translate cleanly to Tailwind utilities
// (semi-transparent overlays, exact pixel-perfect shutter, etc.) live
// in StyleSheet so the bare `bg-black/35` etc. don't depend on
// NativeWind v4 colour-opacity quirks at runtime.
const styles = StyleSheet.create({
  topBar: { backgroundColor: 'rgba(0,0,0,0.35)' },
  iconButton: { backgroundColor: 'rgba(0,0,0,0.35)' },
  stripContent: { gap: 6, alignItems: 'center' },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
  },
  shutterPressed: { opacity: 0.7 },
  shutterDisabled: { opacity: 0.4 },
  permissionInner: { gap: 16 },
  permissionBody: { color: '#d6d3cc', lineHeight: 21 },
});
