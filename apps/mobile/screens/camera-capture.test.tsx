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
 *  - Cancel (no captures) invokes onCancel immediately
 *  - Cancel (with captures) opens discard dialog → Discard → onCancel
 *  - one snapshot of the granted-empty layout
 *
 * `expo-camera` + `expo-file-system` are mocked so the body
 * exercises every code path without touching native modules.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

vi.mock('@/lib/native/expo-camera-shim', () => {
  return {
    CameraView: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('rn-CameraView', props, props.children ?? null),
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
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    onOpenSettings: vi.fn(),
    deleteFile: vi.fn(),
    ...overrides,
  };
}

describe('CameraCapture', () => {
  it('renders the requesting spinner when permission is pending', () => {
    const tree = render(
      <CameraCapture {...baseProps({ permissionOverride: 'requesting' })} />,
    );
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
      tree.root
        .findByProps({ testID: 'btn-camera-permission-cancel' })
        .props.onPress();
    });
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
    expect(
      tree.root.findAllByProps({ testID: 'camera-capture-root' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-camera-shutter' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-camera-done' }).length,
    ).toBeGreaterThan(0);
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
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-camera-shutter' }).props.onPress();
    });
    expect(takePicture).toHaveBeenCalledOnce();
    expect(
      tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }).length,
    ).toBeGreaterThan(0);
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
    expect(flashBtn.props.accessibilityLabel).toBe('Flash off');
    act(() => {
      flashBtn.props.onPress();
    });
    expect(
      tree.root.findByProps({ testID: 'btn-camera-flash' }).props
        .accessibilityLabel,
    ).toBe('Flash auto');

    const flipBtn = tree.root.findByProps({ testID: 'btn-camera-flip' });
    expect(flipBtn.props.accessibilityLabel).toBe('Flip camera');
    act(() => {
      flipBtn.props.onPress();
    });
    // Re-query still resolves to a single Pressable host.
    expect(
      tree.root.findByProps({ testID: 'btn-camera-flip' }).props
        .accessibilityLabel,
    ).toBe('Flip camera');
  });

  it('Done invokes onCommit with the captured URI list', () => {
    const onCommit = vi.fn();
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
    const seed: CameraCaptureItem[] = [
      { uri: 'file:///a.jpg', width: 100, height: 100 },
    ];
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
      tree.root
        .findByProps({ testID: 'btn-camera-confirm-discard' })
        .props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('tapping a thumbnail removes it from the strip', () => {
    const deleteFile = vi.fn();
    const seed: CameraCaptureItem[] = [
      { uri: 'file:///a.jpg', width: 100, height: 100 },
    ];
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
      tree.root
        .findByProps({ testID: 'btn-camera-thumb-0' })
        .props.onPress();
    });
    expect(deleteFile).toHaveBeenCalledWith('file:///a.jpg');
    expect(
      tree.root.findAllByProps({ testID: 'btn-camera-thumb-0' }),
    ).toHaveLength(0);
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
    expect(
      tree.root.findAllByProps({ testID: 'btn-camera-save-to-roll' }),
    ).toHaveLength(0);
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
    const take = vi.fn(async () => ({
      uri: 'file:///shot.jpg',
      width: 100,
      height: 100,
    }));

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
    expect(save).toHaveBeenCalledWith('file:///shot.jpg');
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
    expect(
      tree.root.findByType('rn-CameraView' as unknown as React.ComponentType).props.zoom,
    ).toBe(0);

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
    expect(
      tree.root.findAllByProps({ testID: 'camera-focus-indicator' }).length,
    ).toBeGreaterThan(0);
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
