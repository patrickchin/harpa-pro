/**
 * CameraCapture screen body — props-only, no session-registry /
 * router coupling. Ported from
 * `../haru3-reports/apps/mobile/app/(camera)/capture.tsx` on branch
 * `dev`, extended in P3.15.2 with pinch-to-zoom, tap-to-focus, and a
 * save-to-camera-roll toggle.
 *
 * The body owns:
 *  - permissions hook (`useCameraPermissions`, allowed by P3.12 spec)
 *  - `CameraView` ref + capture queue (uri[], width/height)
 *  - flash / facing toggles + shutter "isCapturing" lock
 *  - zoom (0..1) driven by a pinch gesture
 *  - tap-to-focus indicator + optional onFocusPoint callback
 *  - the "discard photos" confirmation dialog
 *
 * Parents flow in:
 *  - `onCommit(uris)` — invoked when the user taps Done. The body has
 *    no opinion on what to do with the URIs (session-registry,
 *    upload-queue, avatar-uploader …).
 *  - `onCancel()` — invoked when the user backs out (with no photos
 *    or after confirming discard).
 *  - `saveToCameraRoll` + `onToggleSaveToCameraRoll` — controlled
 *    toggle. The body never persists; the route owns AsyncStorage.
 *  - `saveCaptureToCameraRoll(uri)` — invoked after a successful shot
 *    iff the toggle is on. Errors are swallowed (best-effort save).
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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CachedImage } from '@/components/ui/CachedImage';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraType,
  type FlashMode,
  type CameraViewType,
} from '@/lib/native/expo-camera-shim';
import { File as FsFile } from 'expo-file-system';
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

/**
 * Cap on the picture size we'll accept from
 * `getAvailablePictureSizesAsync()`. The native Camera app captures at
 * the sensor's full resolution (often 12–48 MP), but for site-report
 * photos we only need ~3 MP — and the smaller JPEG encodes + writes to
 * disk much faster, which is what the user *feels* between shutter
 * presses. 3 MP comfortably picks 1920×1440 on most modern Androids
 * (4:3 sensors) — still sharp enough for fullscreen lightbox viewing
 * and moderate crop, with a noticeably faster shutter than 5 MP.
 */
const MAX_PICTURE_PIXELS = 3_000_000;

/**
 * Choose the largest 4:3 picture size from the device list that stays
 * under our pixel cap. Returns `undefined` if no `WxH` entries match —
 * in which case we let `expo-camera` use its own default (full sensor
 * resolution). On iOS the list is the same across devices; on Android
 * it varies.
 */
export function pickPictureSize(
  sizes: ReadonlyArray<string>,
  maxPixels: number = MAX_PICTURE_PIXELS,
): string | undefined {
  const parsed = sizes
    .map((s) => {
      const m = /^(\d+)x(\d+)$/.exec(s);
      if (!m) return null;
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (!w || !h) return null;
      return { s, w, h, pixels: w * h, ratio: w / h };
    })
    .filter((x): x is { s: string; w: number; h: number; pixels: number; ratio: number } =>
      x != null,
    )
    .filter((x) => x.pixels <= maxPixels)
    .filter(
      (x) =>
        Math.abs(x.ratio - 4 / 3) < 0.02 ||
        Math.abs(x.ratio - 3 / 4) < 0.02,
    );
  parsed.sort((a, b) => b.pixels - a.pixels);
  return parsed[0]?.s;
}

export interface CameraCaptureItem {
  uri: string;
  width: number;
  height: number;
}

export interface CameraCapturePermissionOverride {
  granted: boolean;
  canAskAgain: boolean;
}

export interface FocusPoint {
  /** Normalised x in [0, 1] across the preview width. */
  x: number;
  /** Normalised y in [0, 1] across the preview height. */
  y: number;
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
   * placeholders, snapshot tests). Receives the current facing/flash/
   * zoom so previews can reflect the toggles if useful.
   */
  renderPreview?: (opts: {
    facing: CameraType;
    flash: FlashMode;
    zoom: number;
  }) => ReactNode;
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
  /** Controlled toggle. Default false. */
  saveToCameraRoll?: boolean;
  /** Invoked when the user taps the save-to-roll toggle. */
  onToggleSaveToCameraRoll?: () => void;
  /**
   * Invoked after each successful capture when `saveToCameraRoll` is
   * on. Errors are swallowed; the shutter still appends the photo to
   * the strip even if the library save fails.
   */
  saveCaptureToCameraRoll?: (uri: string) => Promise<void> | void;
  /** Optional callback invoked with the normalised focus point. */
  onFocusPoint?: (point: FocusPoint) => void;
}

const MIN_ZOOM = 0;
const MAX_ZOOM = 1;

function clampZoom(z: number): number {
  'worklet';
  if (Number.isNaN(z)) return MIN_ZOOM;
  if (z < MIN_ZOOM) return MIN_ZOOM;
  if (z > MAX_ZOOM) return MAX_ZOOM;
  return z;
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
    saveToCameraRoll = false,
    onToggleSaveToCameraRoll,
    saveCaptureToCameraRoll,
    onFocusPoint,
  } = props;

  const [hookPermission, requestPermission] = useCameraPermissions({ request: true });
  const cameraRef = useRef<CameraViewType>(null);
  const insets = useSafeAreaInsets();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [captures, setCaptures] = useState<CameraCaptureItem[]>(() =>
    initialCaptures ? [...initialCaptures] : [],
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  // `zoomStart` lives on the UI thread so the pinch worklet can read
  // and write it without crossing the JS bridge each frame. We bridge
  // back to React state via `runOnJS(setZoom)` so `CameraView`'s
  // `zoom` prop stays in sync.
  const zoomStart = useSharedValue(MIN_ZOOM);
  const [focusIndicator, setFocusIndicator] = useState<{
    x: number;
    y: number;
    key: number;
  } | null>(null);
  const focusKeyRef = useRef(0);
  const previewSizeRef = useRef({ width: 1, height: 1 });
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  // ── Picture-size discovery ──────────────────────────────────────────
  //
  // expo-camera defaults to the sensor's max resolution (often 12–48
  // MP). For our use case (site-report photos) that's wasteful — the
  // big JPEG encode + disk write is the dominant per-shot delay. On
  // mount we ask the native camera which sizes it supports, pick the
  // largest 4:3 size under `MAX_PICTURE_PIXELS`, and pin it via the
  // `pictureSize` prop. Falls back silently if the API isn't available
  // (test mocks, dev mirror, unlinked binary).
  const onCameraReady = useCallback(async () => {
    const ref = cameraRef.current;
    const getSizes = (
      ref as unknown as {
        getAvailablePictureSizesAsync?: () => Promise<string[]>;
      } | null
    )?.getAvailablePictureSizesAsync;
    if (!getSizes) return;
    try {
      const sizes = await getSizes.call(ref);
      const best = pickPictureSize(sizes ?? []);
      if (best) setPictureSize(best);
    } catch {
      // Best-effort — leave `pictureSize` undefined and use defaults.
    }
  }, []);

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
        // expo-file-system v55 modern API: `new File(uri).delete()`.
        // Best-effort cleanup — swallow errors (the file may already be
        // gone, or live outside our managed cache root on some platforms).
        new FsFile(uri).delete();
      } catch {
        // ignore
      }
    },
    [deleteFile],
  );

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    if (captures.length >= maxBurst) return;
    setIsCapturing(true);

    // ── Test / dev-mirror injection path ────────────────────────────
    if (takePicture) {
      try {
        const item = await takePicture();
        if (item) {
          setCaptures((prev) => [...prev, item]);
          if (saveToCameraRoll && saveCaptureToCameraRoll) {
            void Promise.resolve(saveCaptureToCameraRoll(item.uri)).catch(
              () => {},
            );
          }
        }
      } catch {
        // ignore — bad shot
      } finally {
        setIsCapturing(false);
      }
      return;
    }

    // ── Default wiring (expo-camera) ────────────────────────────────
    //
    // `onPictureSaved` lets `takePictureAsync` resolve as soon as the
    // sensor capture completes, *before* the JPEG is encoded and
    // written to disk. That JPEG encode is the bulk of the delay the
    // user feels between shutter presses, so releasing `isCapturing`
    // on the awaited promise (rather than waiting for the URI) lets
    // the next press fire ~immediately. The thumbnail / camera-roll
    // side-effects then run in the callback once the file is ready.
    const ref = cameraRef.current;
    if (!ref) {
      setIsCapturing(false);
      return;
    }
    try {
      await ref.takePictureAsync({
        skipProcessing: true,
        exif: false,
        imageType: 'jpg',
        onPictureSaved: (photo: CameraCapturedPicture) => {
          if (!photo?.uri) return;
          const item: CameraCaptureItem = {
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
          };
          // Defer the re-render (which decodes the new thumbnail) so
          // it doesn't compete with the next shutter press for the
          // JS thread on slower devices.
          InteractionManager.runAfterInteractions(() => {
            setCaptures((prev) => [...prev, item]);
            if (saveToCameraRoll && saveCaptureToCameraRoll) {
              void Promise.resolve(saveCaptureToCameraRoll(item.uri)).catch(
                () => {},
              );
            }
          });
        },
      });
    } catch {
      // Swallow — a single bad shot shouldn't kill the screen.
    } finally {
      // Resolves ~immediately when `onPictureSaved` is set, so the
      // next press can fire without waiting on the JPEG write.
      setIsCapturing(false);
    }
  }, [
    captures.length,
    isCapturing,
    maxBurst,
    takePicture,
    saveToCameraRoll,
    saveCaptureToCameraRoll,
  ]);

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

  // ── Gestures ────────────────────────────────────────────────────────
  //
  // Pinch updates `zoom` in [0,1]; we anchor at the start of the pinch
  // so the gesture feels stable rather than jumping on every update.
  // Tap-to-focus shows a brief indicator at the touch point and
  // forwards a normalised coordinate to `onFocusPoint` if provided —
  // the actual focus call is platform-specific on expo-camera and not
  // wired here, but the gesture surface is in place for that follow-up.

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      zoomStart.value = zoom;
    })
    .onUpdate((event: { scale: number }) => {
      'worklet';
      const scale = typeof event.scale === 'number' ? event.scale : 1;
      const delta = (scale - 1) * 0.5;
      const next = clampZoom(zoomStart.value + delta);
      runOnJS(setZoom)(next);
    });

  // Tap-to-focus needs JS-thread access (refs, setState, prop
  // callbacks), so opt out of the default worklet behaviour with
  // `.runOnJS(true)` — RNGH then invokes the callback on the JS
  // thread directly.
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event: { x: number; y: number }) => {
      const { width, height } = previewSizeRef.current;
      const x = typeof event.x === 'number' ? event.x : 0;
      const y = typeof event.y === 'number' ? event.y : 0;
      focusKeyRef.current += 1;
      setFocusIndicator({ x, y, key: focusKeyRef.current });
      onFocusPoint?.({
        x: width > 0 ? x / width : 0,
        y: height > 0 ? y / height : 0,
      });
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, tapGesture);

  // ── Permission gates ────────────────────────────────────────────────

  const effectivePermission = resolvePermission(permissionOverride, hookPermission);

  if (effectivePermission.state === 'requesting') {
    return (
      <View
        className="flex-1 items-center justify-center bg-black"
        testID="camera-permission-requesting"
      >
        <ActivityIndicator color={colors.primary.foreground} />
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
        <View className="px-8 items-center gap-4">
          <CameraIcon size={48} color={colors.primary.foreground} />
          <Text className="text-white text-xl font-bold mt-2 text-center">
            Camera access is off
          </Text>
          <Text
            className="text-stone-300 text-base text-center leading-[21px]"
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
      <ZapOff size={22} color={colors.primary.foreground} />
    ) : (
      <Zap
        size={22}
        color={flash === 'on' ? colors.accent.DEFAULT : colors.primary.foreground}
      />
    );
  const nextFlash: FlashMode =
    flash === 'off' ? 'auto' : flash === 'auto' ? 'on' : 'off';

  return (
    <View className="flex-1 bg-black" testID="camera-capture-root">
      {/*
       * The preview is constrained to the sensor's native 3:4 portrait
       * aspect (4:3 landscape) and centered with letterbox top/bottom,
       * so what the user sees on-screen matches the JPEG that
       * `takePictureAsync` actually returns. expo-camera otherwise
       * stretch-fills its container, hiding the crop the camera will
       * apply at capture time.
       */}
      <View
        className="flex-1 items-center justify-center"
        pointerEvents="box-none"
        testID="camera-preview-frame"
      >
        <GestureDetector gesture={composedGesture}>
          <View
            style={{ width: '100%', aspectRatio: 3 / 4, maxHeight: '100%' }}
            testID="camera-gesture-surface"
            onLayout={(e: {
              nativeEvent: { layout: { width: number; height: number } };
            }) => {
              const { width, height } = e.nativeEvent.layout;
              previewSizeRef.current = { width, height };
            }}
          >
            {renderPreview ? (
              renderPreview({ facing, flash, zoom })
            ) : (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                flash={flash}
                zoom={zoom}
                mode="picture"
                pictureSize={pictureSize}
                onCameraReady={onCameraReady}
                responsiveOrientationWhenOrientationLocked={false}
              />
            )}
            {focusIndicator ? (
              <View
                testID="camera-focus-indicator"
                pointerEvents="none"
                className="absolute w-16 h-16 rounded-full border-2 border-white"
                style={{
                  left: focusIndicator.x - 32,
                  top: focusIndicator.y - 32,
                }}
              />
            ) : null}
          </View>
        </GestureDetector>
      </View>

      <SafeAreaView
        className="absolute inset-0 justify-end"
        pointerEvents="box-none"
      >
        {/* Top bar */}
        <View
          className="absolute top-0 left-0 right-0 px-4 flex-row items-center justify-between bg-black/35"
          style={{ paddingTop: insets.top, height: 56 + insets.top }}
        >
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            testID="btn-camera-cancel"
            className="w-11 h-11 rounded-full items-center justify-center bg-black/35"
          >
            <X size={24} color={colors.primary.foreground} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            {onToggleSaveToCameraRoll ? (
              <Pressable
                onPress={onToggleSaveToCameraRoll}
                accessibilityRole="switch"
                accessibilityState={{ checked: saveToCameraRoll }}
                accessibilityLabel={
                  saveToCameraRoll
                    ? 'Save to gallery: on'
                    : 'Save to gallery: off'
                }
                testID="btn-camera-save-to-roll"
                className={`h-11 px-3 rounded-full flex-row items-center ${
                  saveToCameraRoll ? 'bg-accent/85' : 'bg-black/35'
                }`}
              >
                <Text className="text-white text-xs font-semibold uppercase">
                  Gallery {saveToCameraRoll ? 'on' : 'off'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setFlash(nextFlash)}
              accessibilityRole="button"
              accessibilityLabel={`Flash ${flash}`}
              testID="btn-camera-flash"
              className="w-11 h-11 rounded-full items-center justify-center bg-black/35"
            >
              {flashIcon}
              <Text className="text-white text-[9px] mt-0.5 uppercase tracking-wider">
                {flash}
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-1" />

        {/* Thumbnail strip + flip */}
        <View className="flex-row items-center px-3 pb-2 gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-1.5 items-center"
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
                <CachedImage
                  source={{ uri: c.uri }}
                  intrinsicWidth={c.width}
                  intrinsicHeight={c.height}
                  contentFit="cover"
                  transition={0}
                  cachePolicy="memory"
                  style={{ width: '100%', height: '100%' }}
                />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            testID="btn-camera-flip"
            className="w-11 h-11 rounded-full items-center justify-center ml-auto bg-black/35"
          >
            <RefreshCw size={22} color={colors.primary.foreground} />
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
            className={`w-[78px] h-[78px] rounded-full border-4 border-white items-center justify-center ${
              captures.length >= maxBurst ? 'opacity-40' : ''
            }`}
            style={({ pressed }) =>
              (pressed || isCapturing) && { opacity: 0.7 }
            }
          >
            <View className="w-[60px] h-[60px] rounded-full bg-white" />
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
        noticeTone="danger"
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
