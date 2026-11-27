import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type CameraRouteProps = {
  permissionOverride?: { granted: boolean; canAskAgain: boolean };
  renderPreview?: (options: { facing: 'back'; flash: 'off'; zoom: number }) => unknown;
  takePicture?: () => Promise<unknown>;
};

const fixtureFlag = vi.hoisted(() => ({ enabled: true }));
const cameraState = vi.hoisted(() => ({ props: null as CameraRouteProps | null }));
const fixturePictureSpy = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@/lib/config/env', () => ({
  env: {
    get EXPO_PUBLIC_USE_FIXTURES() {
      return fixtureFlag.enabled;
    },
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
  }),
  useLocalSearchParams: () => ({ sessionId: 'session-1' }),
}));

vi.mock('expo-media-library', () => ({
  requestPermissionsAsync: vi.fn(),
  saveToLibraryAsync: vi.fn(),
}));

vi.mock('@/lib/camera/camera-session-registry', () => ({
  commitCameraSession: vi.fn(() => true),
  getCameraSession: vi.fn(() => ({ returnTo: '/return' })),
}));

vi.mock('@/lib/camera/save-to-roll-pref', () => ({
  readSaveToRollPref: () => new Promise<boolean>(() => {}),
  writeSaveToRollPref: vi.fn(),
}));

vi.mock('@/lib/nav/safe-back', () => ({ safeBack: vi.fn() }));
vi.mock('@/lib/camera/fixture-camera', () => ({
  takeFixtureCameraPicture: fixturePictureSpy,
}));
vi.mock('@/components/primitives/AppDialogSheet', () => ({
  AppDialogSheet: () => null,
}));
vi.mock('@/screens/camera-capture', () => ({
  CameraCapture: (props: CameraRouteProps) => {
    cameraState.props = props;
    return null;
  },
}));

import CaptureRoute from '@/app/(camera)/capture';

function renderRoute(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<CaptureRoute />);
  });
  return tree;
}

describe('CaptureRoute fixture camera wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtureFlag.enabled = true;
    cameraState.props = null;
  });

  it('injects deterministic permission, preview, and capture inputs in fixture mode', () => {
    const tree = renderRoute();

    expect(cameraState.props?.permissionOverride).toEqual({
      granted: true,
      canAskAgain: true,
    });
    expect(cameraState.props?.takePicture).toBe(fixturePictureSpy);
    expect(cameraState.props?.renderPreview).toBeTypeOf('function');

    const preview = cameraState.props?.renderPreview?.({
      facing: 'back',
      flash: 'off',
      zoom: 0,
    }) as { props?: { testID?: string } };
    expect(preview.props?.testID).toBe('camera-fixture-preview');
    tree.unmount();
  });

  it('leaves CameraCapture on its default native wiring outside fixture mode', () => {
    fixtureFlag.enabled = false;
    const tree = renderRoute();

    expect(cameraState.props?.permissionOverride).toBeUndefined();
    expect(cameraState.props?.renderPreview).toBeUndefined();
    expect(cameraState.props?.takePicture).toBeUndefined();
    tree.unmount();
  });
});
