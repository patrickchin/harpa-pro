/**
 * CameraCapture screen body tests.
 *
 * Covers each visible state + every interaction the canonical
 * `app/(camera)/capture.tsx` exercises:
 *  - permission requesting (no hook result yet) → spinner
 *  - permission denied (canAskAgain=true) → "Allow camera"
 *  - permission denied (canAskAgain=false) → "Open Settings"
 *  - shutter callback fires + appends a new capture
 *  - mode toggle: flip facing, cycle flash
 *  - Done invokes onCommit with the URI list
 *  - native JPEG writes serialize shutter, Done, and burst capacity
 *  - late native results after cancellation/unmount delete temp files
 *  - Cancel (no captures) invokes onCancel immediately
 *  - Cancel (with captures) opens discard dialog → Discard → onCancel
 *  - one snapshot of the granted-empty layout
 *
 * `expo-camera` + `expo-file-system` are mocked so the body
 * exercises every code path without touching native modules.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler, Platform } from 'react-native';

const cameraNativeMock = vi.hoisted(() => ({
  getAvailablePictureSizesAsync: vi.fn<() => Promise<string[]>>(),
  takePictureAsync: vi.fn<(options: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock('@/lib/native/expo-camera-shim', () => {
  return {
    CameraView: React.forwardRef(
      (
        props: Record<string, unknown> & { children?: React.ReactNode },
        ref: React.ForwardedRef<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          getAvailablePictureSizesAsync: cameraNativeMock.getAvailablePictureSizesAsync,
          takePictureAsync: cameraNativeMock.takePictureAsync,
        }));
        return React.createElement('rn-CameraView', props, props.children ?? null);
      },
    ),
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: 'granted', expires: 'never' },
      vi.fn(async () => ({
        granted: true,
        canAskAgain: true,
        status: 'granted',
        expires: 'never',
      })),
      vi.fn(),
    ],
  };
});

vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    size = 1024;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      // no-op for tests
    }
  }
  return { File };
});

import {
  CameraCapture,
  pickPictureSize,
  type CameraCaptureItem,
  type CameraCaptureProps,
} from './camera-capture';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function baseProps(overrides: Partial<CameraCaptureProps> = {}): CameraCaptureProps {
  return {
    onCommit: vi.fn(() => true),
    onCancel: vi.fn(),
    onOpenSettings: vi.fn(),
    deleteFile: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  cameraNativeMock.getAvailablePictureSizesAsync.mockReset();
  cameraNativeMock.getAvailablePictureSizesAsync.mockResolvedValue([]);
  cameraNativeMock.takePictureAsync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CameraCapture', () => {
  it('renders the requesting spinner when permission is pending', () => {
    const tree = render(<CameraCapture {...baseProps({ permissionOverride: 'requesting' })} />);
    expect(
      tree.root.findAllByProps({ testID: 'camera-permission-requesting' }).length,
    ).toBeGreaterThan(0);
  });

  it('renders the permission-denied notice with "Allow camera" when canAskAgain', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: false, canAskAgain: true },
        })}
      />,
    );
    const btn = tree.root.findByProps({ testID: 'btn-camera-permission-action' });
    const text = collectText(btn.props.children);
    expect(text).toContain('Allow camera');
  });

  it('renders the permission-denied notice with "Open Settings" when permanently denied', () => {
    const onOpenSettings = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: false, canAskAgain: false },
          onOpenSettings,
        })}
      />,
    );
    const btn = tree.root.findByProps({ testID: 'btn-camera-permission-action' });
    expect(collectText(btn.props.children)).toContain('Open Settings');
    act(() => {
      btn.props.onPress();
    });
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('cancel from permission gate invokes onCancel', () => {
    const onCancel = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: false, canAskAgain: true },
          onCancel,
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-permission-cancel' }).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('discards seeded captures before exiting a denied permission gate', () => {
    const onCancel = vi.fn();
    const deleteFile = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: false, canAskAgain: true },
          onCancel,
          deleteFile,
          initialCaptures: [{ uri: 'file:///denied-temp.jpg', width: 100, height: 100 }],
        })}
      />,
    );

    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-permission-cancel' }).props.onPress();
    });

    expect(deleteFile).toHaveBeenCalledWith('file:///denied-temp.jpg');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('discards seeded captures when hardware Back exits a requesting permission gate', () => {
    const onCancel = vi.fn();
    const deleteFile = vi.fn();
    let hardwareBack!: () => boolean;
    vi.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBack = handler as () => boolean;
      return { remove: vi.fn() };
    });
    render(
      <CameraCapture
        {...baseProps({
          permissionOverride: 'requesting',
          onCancel,
          deleteFile,
          initialCaptures: [{ uri: 'file:///requesting-temp.jpg', width: 100, height: 100 }],
        })}
      />,
    );

    act(() => {
      expect(hardwareBack()).toBe(true);
    });

    expect(deleteFile).toHaveBeenCalledWith('file:///requesting-temp.jpg');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders the camera UI (root + shutter + done) when permission is granted', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'camera-capture-root' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'btn-camera-shutter' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'btn-camera-done' }).length).toBeGreaterThan(0);
  });

  it('keeps the Android shutter disabled until picture-size rebinding is ready', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    cameraNativeMock.getAvailablePictureSizesAsync.mockResolvedValue(['1856x1392']);

    try {
      const tree = render(
        <CameraCapture
          {...baseProps({
            permissionOverride: { granted: true, canAskAgain: true },
          })}
        />,
      );

      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(true);

      await act(async () => {
        await tree.root
          .findByType('rn-CameraView' as unknown as React.ComponentType)
          .props.onCameraReady();
      });

      expect(
        tree.root.findByType('rn-CameraView' as unknown as React.ComponentType).props.pictureSize,
      ).toBe('1856x1392');
      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(true);

      await act(async () => {
        await tree.root
          .findByType('rn-CameraView' as unknown as React.ComponentType)
          .props.onCameraReady();
      });

      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOs,
      });
    }
  });

  it('keeps the iOS shutter ready across camera flips', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    cameraNativeMock.getAvailablePictureSizesAsync.mockResolvedValueOnce([]);

    try {
      const tree = render(
        <CameraCapture
          {...baseProps({
            permissionOverride: { granted: true, canAskAgain: true },
          })}
        />,
      );

      await act(async () => {
        await tree.root
          .findByType('rn-CameraView' as unknown as React.ComponentType)
          .props.onCameraReady();
      });
      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);

      act(() => {
        tree.root.findByProps({ testID: 'btn-camera-flip' }).props.onPress();
      });

      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOs,
      });
    }
  });

  it('ignores Android readiness that completes for the camera before a flip', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    let resolveOldReadiness!: (sizes: string[]) => void;
    const oldReadiness = new Promise<string[]>((resolve) => {
      resolveOldReadiness = resolve;
    });
    cameraNativeMock.getAvailablePictureSizesAsync
      .mockImplementationOnce(() => oldReadiness)
      .mockResolvedValueOnce([]);

    try {
      const tree = render(
        <CameraCapture
          {...baseProps({
            permissionOverride: { granted: true, canAskAgain: true },
          })}
        />,
      );
      let oldReadyCallback!: Promise<void>;
      act(() => {
        oldReadyCallback = tree.root
          .findByType('rn-CameraView' as unknown as React.ComponentType)
          .props.onCameraReady();
      });
      act(() => {
        tree.root.findByProps({ testID: 'btn-camera-flip' }).props.onPress();
      });

      await act(async () => {
        resolveOldReadiness([]);
        await oldReadyCallback;
      });

      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(true);

      await act(async () => {
        await tree.root
          .findByType('rn-CameraView' as unknown as React.ComponentType)
          .props.onCameraReady();
      });
      expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOs,
      });
    }
  });

  it('enables the shutter when native picture-size discovery fails', async () => {
    cameraNativeMock.getAvailablePictureSizesAsync.mockRejectedValueOnce(
      new Error('size discovery unavailable'),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );

    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(true);

    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });

    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
  });

  it('awaits the native JPEG terminal before unlocking controls', async () => {
    let resolveCapture!: (photo: unknown) => void;
    let captureOptions: Record<string, unknown> | undefined;
    cameraNativeMock.takePictureAsync.mockImplementationOnce((options) => {
      captureOptions = options;
      return new Promise((resolve) => {
        resolveCapture = resolve;
      });
    });
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );

    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    let capturePromise!: Promise<void>;
    act(() => {
      capturePromise = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(captureOptions).not.toHaveProperty('onPictureSaved');
    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(true);

    await act(async () => {
      resolveCapture({ uri: 'file:///native/shot-1.jpg', width: 1856, height: 1392 });
      await capturePromise;
    });
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }).length).toBeGreaterThan(0);
    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
  });

  it('treats native rejection as a terminal and permits the next capture', async () => {
    cameraNativeMock.takePictureAsync
      .mockRejectedValueOnce(new Error('native JPEG write failed'))
      .mockResolvedValueOnce({
        uri: 'file:///recovered-shot.jpg',
        width: 200,
        height: 200,
      });
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);

    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(cameraNativeMock.takePictureAsync).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }).length).toBeGreaterThan(0);
  });

  it('uses an atomic native lock for same-tick shutter calls', async () => {
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });

    let firstCapture!: Promise<void>;
    act(() => {
      const shutter = tree.root.findByProps({ testID: 'btn-camera-shutter' });
      firstCapture = shutter.props.onPress();
      void shutter.props.onPress();
    });
    expect(cameraNativeMock.takePictureAsync).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCapture({ uri: 'file:///native/only-shot.jpg', width: 1856, height: 1392 });
      await firstCapture;
    });
  });

  it('uses the ref-backed burst count from a stale shutter handler', async () => {
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          maxBurst: 1,
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    const staleOnPress = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress;
    const firstCapture = staleOnPress() as Promise<void>;

    await act(async () => {
      resolveCapture({ uri: 'file:///at-cap.jpg', width: 200, height: 200 });
      await firstCapture;
      await staleOnPress();
    });
    expect(cameraNativeMock.takePictureAsync).toHaveBeenCalledOnce();
  });

  it('ignores camera flips while a native save is in flight', async () => {
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    let firstCapture!: Promise<void>;
    act(() => {
      firstCapture = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    const flip = tree.root.findByProps({ testID: 'btn-camera-flip' });
    expect(flip.props.disabled).toBe(true);
    act(() => flip.props.onPress());
    expect(
      tree.root.findByType('rn-CameraView' as unknown as React.ComponentType).props.facing,
    ).toBe('back');

    await act(async () => {
      resolveCapture({ uri: 'file:///after-held-flip.jpg', width: 200, height: 200 });
      await firstCapture;
    });
  });

  it('blocks Done and burst overflow until the native save completes', async () => {
    const onCommit = vi.fn(() => true);
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onCommit,
          maxBurst: 2,
          initialCaptures: [{ uri: 'file:///first.jpg', width: 100, height: 100 }],
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    let capturePromise!: Promise<void>;
    act(() => {
      capturePromise = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });

    const pendingDone = tree.root.findByProps({ testID: 'btn-camera-done' });
    expect(pendingDone.props.disabled).toBe(true);
    act(() => pendingDone.props.onPress());
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      void tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(cameraNativeMock.takePictureAsync).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCapture({ uri: 'file:///second.jpg', width: 200, height: 200 });
      await capturePromise;
    });
    const readyDone = tree.root.findByProps({ testID: 'btn-camera-done' });
    expect(readyDone.props.disabled).toBe(false);
    act(() => readyDone.props.onPress());
    expect(onCommit).toHaveBeenCalledWith(['file:///first.jpg', 'file:///second.jpg']);
  });

  it('deletes a native result that resolves after cancellation', async () => {
    const onCancel = vi.fn();
    const deleteFile = vi.fn();
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onCancel,
          deleteFile,
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    let capturePromise!: Promise<void>;
    act(() => {
      capturePromise = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
      tree.root.findByProps({ testID: 'btn-camera-cancel' }).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCapture({ uri: 'file:///late-after-cancel.jpg', width: 200, height: 200 });
      await capturePromise;
    });
    expect(deleteFile).toHaveBeenCalledWith('file:///late-after-cancel.jpg');
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' })).toHaveLength(0);
  });

  it('deletes a native result that resolves after unmount', async () => {
    const deleteFile = vi.fn();
    let resolveCapture!: (photo: unknown) => void;
    cameraNativeMock.takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          deleteFile,
        })}
      />,
    );
    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
    });
    let capturePromise!: Promise<void>;
    act(() => {
      capturePromise = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
      tree.unmount();
    });

    await act(async () => {
      resolveCapture({ uri: 'file:///late-after-unmount.jpg', width: 200, height: 200 });
      await capturePromise;
    });
    expect(deleteFile).toHaveBeenCalledWith('file:///late-after-unmount.jpg');
  });

  it('deletes an injected result that resolves after unmount', async () => {
    const deleteFile = vi.fn();
    let resolveCapture!: (photo: CameraCaptureItem) => void;
    const takePicture = vi.fn(
      () =>
        new Promise<CameraCaptureItem>((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          deleteFile,
          takePicture,
        })}
      />,
    );
    let capturePromise!: Promise<void>;
    act(() => {
      capturePromise = tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
      tree.unmount();
    });

    await act(async () => {
      resolveCapture({ uri: 'file:///late-injected.jpg', width: 200, height: 200 });
      await capturePromise;
    });
    expect(deleteFile).toHaveBeenCalledWith('file:///late-injected.jpg');
  });

  it('cleans completed temporary captures on system unmount', () => {
    const deleteFile = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          deleteFile,
          initialCaptures: [
            { uri: 'file:///uncommitted-1.jpg', width: 100, height: 100 },
            { uri: 'file:///uncommitted-2.jpg', width: 100, height: 100 },
          ],
        })}
      />,
    );

    act(() => tree.unmount());
    expect(deleteFile.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///uncommitted-1.jpg',
      'file:///uncommitted-2.jpg',
    ]);
  });

  it('finishes a native save when camera-roll persistence throws synchronously', async () => {
    const saveCaptureToCameraRoll = vi.fn(() => {
      throw new Error('photo library unavailable');
    });
    cameraNativeMock.takePictureAsync.mockResolvedValueOnce({
      uri: 'file:///saved-despite-library-error.jpg',
      width: 200,
      height: 200,
    });
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          saveToCameraRoll: true,
          saveCaptureToCameraRoll,
        })}
      />,
    );

    await act(async () => {
      await tree.root
        .findByType('rn-CameraView' as unknown as React.ComponentType)
        .props.onCameraReady();
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
      await Promise.resolve();
    });

    expect(saveCaptureToCameraRoll).toHaveBeenCalledWith('file:///saved-despite-library-error.jpg');
    expect(tree.root.findByProps({ testID: 'btn-camera-done' }).props.disabled).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }).length).toBeGreaterThan(0);
  });

  it('shutter appends a capture via the takePicture injection', async () => {
    const item: CameraCaptureItem = {
      uri: 'file:///dev/shot-1.jpg',
      width: 1920,
      height: 1080,
    };
    const takePicture = vi.fn(async () => item);
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          takePicture,
        })}
      />,
    );
    expect(tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.disabled).toBe(false);
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(takePicture).toHaveBeenCalledOnce();
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }).length).toBeGreaterThan(0);
  });

  it('flip + flash toggles relabel their controls (mode toggle)', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    const flashBtn = tree.root.findByProps({ testID: 'btn-camera-flash' });
    expect(flashBtn.props.accessibilityLabel).toBe('Flash Off');
    act(() => {
      flashBtn.props.onPress();
    });
    expect(tree.root.findByProps({ testID: 'btn-camera-flash' }).props.accessibilityLabel).toBe(
      'Flash Auto',
    );

    const flipBtn = tree.root.findByProps({ testID: 'btn-camera-flip' });
    expect(flipBtn.props.accessibilityLabel).toBe('Flip camera');
    act(() => {
      flipBtn.props.onPress();
    });
    // Re-query still resolves to a single Pressable host.
    expect(tree.root.findByProps({ testID: 'btn-camera-flip' }).props.accessibilityLabel).toBe(
      'Flip camera',
    );
  });

  it('Done invokes onCommit with the captured URI list', () => {
    const onCommit = vi.fn(() => true);
    const seed: CameraCaptureItem[] = [
      { uri: 'file:///a.jpg', width: 100, height: 100 },
      { uri: 'file:///b.jpg', width: 100, height: 100 },
    ];
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onCommit,
          initialCaptures: seed,
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-done' }).props.onPress();
    });
    expect(onCommit).toHaveBeenCalledWith(['file:///a.jpg', 'file:///b.jpg']);
  });

  it('deletes captures when the caller rejects the Done handoff', () => {
    const onCommit = vi.fn(() => false);
    const deleteFile = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          onCommit,
          deleteFile,
          initialCaptures: [
            { uri: 'file:///stale-session-1.jpg', width: 100, height: 100 },
            { uri: 'file:///stale-session-2.jpg', width: 100, height: 100 },
          ],
        })}
      />,
    );

    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-done' }).props.onPress();
    });

    expect(onCommit).toHaveBeenCalledWith([
      'file:///stale-session-1.jpg',
      'file:///stale-session-2.jpg',
    ]);
    expect(deleteFile.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///stale-session-1.jpg',
      'file:///stale-session-2.jpg',
    ]);

    act(() => tree.unmount());
    expect(deleteFile).toHaveBeenCalledTimes(2);
  });

  it('commits once, preserves committed files, and rejects later shutters', () => {
    const onCommit = vi.fn(() => true);
    const onCancel = vi.fn();
    const deleteFile = vi.fn();
    const takePicture = vi.fn(async () => ({
      uri: 'file:///should-not-start.jpg',
      width: 100,
      height: 100,
    }));
    const tree = render(
      <CameraCapture
        {...baseProps({
          onCommit,
          onCancel,
          deleteFile,
          takePicture,
          initialCaptures: [{ uri: 'file:///committed.jpg', width: 100, height: 100 }],
        })}
      />,
    );

    const done = tree.root.findByProps({ testID: 'btn-camera-done' });
    const staleThumbnail = tree.root.findByProps({ testID: 'btn-camera-thumb-0' });
    const staleCancel = tree.root.findByProps({ testID: 'btn-camera-cancel' });
    act(() => {
      done.props.onPress();
      done.props.onPress();
      void tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
      staleThumbnail.props.onPress();
      staleCancel.props.onPress();
    });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(['file:///committed.jpg']);
    expect(takePicture).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    act(() => tree.unmount());
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('routes hardware Back through the discard confirmation', () => {
    const onCancel = vi.fn();
    let hardwareBack!: () => boolean;
    const backSpy = vi
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        hardwareBack = handler as () => boolean;
        return { remove: vi.fn() };
      });
    const tree = render(
      <CameraCapture
        {...baseProps({
          onCancel,
          initialCaptures: [{ uri: 'file:///needs-confirmation.jpg', width: 100, height: 100 }],
        })}
      />,
    );
    backSpy.mockRestore();

    act(() => {
      expect(hardwareBack()).toBe(true);
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ title: 'Discard photos?' }).props.visible).toBe(true);
  });

  it('cancel with no captures invokes onCancel immediately', () => {
    const onCancel = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onCancel,
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-cancel' }).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancel with captures opens discard dialog → Discard → onCancel', () => {
    const onCancel = vi.fn();
    const seed: CameraCaptureItem[] = [{ uri: 'file:///a.jpg', width: 100, height: 100 }];
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onCancel,
          initialCaptures: seed,
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-cancel' }).props.onPress();
    });
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-confirm-discard' }).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('tapping a thumbnail removes it from the strip', () => {
    const deleteFile = vi.fn();
    const seed: CameraCaptureItem[] = [{ uri: 'file:///a.jpg', width: 100, height: 100 }];
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          deleteFile,
          initialCaptures: seed,
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-camera-thumb-0' }).props.onPress();
    });
    expect(deleteFile).toHaveBeenCalledWith('file:///a.jpg');
    expect(tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' })).toHaveLength(0);
  });

  it('matches snapshot — granted, empty', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  // ── P3.15.2 additions ───────────────────────────────────────────────

  it('save-to-camera-roll toggle is hidden when no handler is provided', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'btn-camera-save-to-roll' })).toHaveLength(0);
  });

  it('save-to-camera-roll toggle renders the controlled state', () => {
    const onToggle = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          saveToCameraRoll: true,
          onToggleSaveToCameraRoll: onToggle,
        })}
      />,
    );
    const btn = tree.root.findByProps({ testID: 'btn-camera-save-to-roll' });
    expect(btn.props.accessibilityState).toEqual({ checked: true });
    act(() => {
      btn.props.onPress();
    });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shutter invokes saveCaptureToCameraRoll iff toggle is on', async () => {
    const save = vi.fn(async () => undefined);
    const take = vi
      .fn()
      .mockResolvedValueOnce({
        uri: 'file:///shot-gallery-off.jpg',
        width: 100,
        height: 100,
      })
      .mockResolvedValueOnce({
        uri: 'file:///shot-gallery-on.jpg',
        width: 100,
        height: 100,
      });

    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          takePicture: take,
          saveToCameraRoll: false,
          onToggleSaveToCameraRoll: vi.fn(),
          saveCaptureToCameraRoll: save,
        })}
      />,
    );
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(save).not.toHaveBeenCalled();

    // Re-render with toggle ON and shoot again.
    act(() => {
      tree.update(
        <CameraCapture
          {...baseProps({
            permissionOverride: { granted: true, canAskAgain: true },
            takePicture: take,
            saveToCameraRoll: true,
            onToggleSaveToCameraRoll: vi.fn(),
            saveCaptureToCameraRoll: save,
          })}
        />,
      );
    });
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(save).toHaveBeenCalledWith('file:///shot-gallery-on.jpg');
  });

  it('pinch gesture drives the zoom prop on CameraView', () => {
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
        })}
      />,
    );
    // Initial zoom is 0.
    expect(tree.root.findByType('rn-CameraView' as unknown as React.ComponentType).props.zoom).toBe(
      0,
    );

    const detector = tree.root.findByProps({ testID: 'camera-gesture-surface' });
    // Walk up to the GestureDetector (parent host) and grab its
    // composed gesture from the mock's __cfg.
    const gestureDetector = detector.parent!;
    const gesture = gestureDetector.props.gesture as {
      __cfg: { kind: string; children: Array<{ __cfg: GestureCfg }> };
    };
    expect(gesture.__cfg.kind).toBe('simultaneous');
    const pinch = gesture.__cfg.children.find((g) => g.__cfg.kind === 'pinch');
    expect(pinch).toBeDefined();

    act(() => {
      pinch!.__cfg.onStart?.({});
      pinch!.__cfg.onUpdate?.({ scale: 1.4 });
    });
    const camAfter = tree.root.findByType('rn-CameraView' as unknown as React.ComponentType);
    // delta = (1.4 - 1) * 0.5 = 0.2, anchored at 0.
    expect(camAfter.props.zoom).toBeCloseTo(0.2, 5);
  });

  it('tap gesture renders the focus indicator and forwards a normalised point', () => {
    const onFocusPoint = vi.fn();
    const tree = render(
      <CameraCapture
        {...baseProps({
          permissionOverride: { granted: true, canAskAgain: true },
          onFocusPoint,
        })}
      />,
    );

    const surface = tree.root.findByProps({ testID: 'camera-gesture-surface' });
    act(() => {
      surface.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 800 } },
      });
    });

    const gestureDetector = surface.parent!;
    const gesture = gestureDetector.props.gesture as {
      __cfg: { children: Array<{ __cfg: GestureCfg }> };
    };
    const tap = gesture.__cfg.children.find((g) => g.__cfg.kind === 'tap');
    expect(tap).toBeDefined();

    act(() => {
      tap!.__cfg.onEnd?.({ x: 100, y: 400 });
    });
    expect(onFocusPoint).toHaveBeenCalledWith({ x: 0.25, y: 0.5 });
    expect(tree.root.findAllByProps({ testID: 'camera-focus-indicator' }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('pickPictureSize', () => {
  it('picks the largest 4:3 size under the pixel cap', () => {
    const sizes = [
      '640x480', // 4:3, 0.3 MP
      '1280x720', // 16:9 — rejected
      '1920x1440', // 4:3, 2.76 MP — winner under 3 MP cap
      '2560x1920', // 4:3, 4.92 MP — over cap
      '3072x2304', // 4:3, 7.08 MP — over cap
      '4032x3024', // 4:3, 12.19 MP — over cap
      'Photo', // iOS preset string — ignored
      'High',
    ];
    expect(pickPictureSize(sizes)).toBe('1920x1440');
  });

  it('returns undefined when no 4:3 sizes match', () => {
    expect(pickPictureSize(['1280x720', '1920x1080'])).toBeUndefined();
    expect(pickPictureSize([])).toBeUndefined();
    expect(pickPictureSize(['Photo', 'Medium', 'High'])).toBeUndefined();
  });

  it('respects a custom pixel cap', () => {
    const sizes = ['640x480', '1920x1440', '2560x1920'];
    // Cap at 1 MP — only 640x480 (0.3 MP) qualifies.
    expect(pickPictureSize(sizes, 1_000_000)).toBe('640x480');
  });
});

interface GestureCfg {
  kind: string;
  onStart?: (e: unknown) => void;
  onUpdate?: (e: unknown) => void;
  onEnd?: (e: unknown) => void;
}

function collectText(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  const node = n as { children?: unknown };
  if (node.children !== undefined) return collectText(node.children);
  return '';
}
