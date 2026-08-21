import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type ProfileRouteProps = { showDeveloperSection: boolean };

const gateState = vi.hoisted(() => ({ visible: false }));
const routeState = vi.hoisted(() => ({
  params: { project: 'harbour-tower', number: '7' },
}));
const screenState = vi.hoisted(() => ({
  profileProps: null as ProfileRouteProps | null,
}));
const hookSpies = vi.hoisted(() => ({
  useRouter: vi.fn(),
  useLocalSearchParams: vi.fn(),
  useAiProvider: vi.fn((_options?: { enabled?: boolean }) => ({
    selection: null,
    setSelection: vi.fn(),
    isLoading: false,
    isUpdating: false,
  })),
  useDeveloperFlags: vi.fn(() => ({
    showGenerateDebugTab: true,
    setShowGenerateDebugTab: vi.fn(),
    isLoaded: true,
  })),
  useReportDebugQuery: vi.fn((_input: unknown, _options?: { enabled?: boolean }) => ({
    data: undefined,
    error: null,
    isLoading: false,
  })),
}));

vi.mock('@/lib/config/developer-tools', () => {
  const exports: Record<string, unknown> = {};
  Object.defineProperty(exports, 'SHOW_DEVELOPER_TOOLS', {
    enumerable: true,
    get: () => gateState.visible,
  });
  return exports;
});

vi.mock('expo-router', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
  };
  return {
    Redirect: ({ href }: { href: string }) => React.createElement('rn-Redirect', { href }),
    useRouter: () => {
      React.useState(null);
      hookSpies.useRouter();
      return router;
    },
    useLocalSearchParams: () => {
      React.useState(null);
      hookSpies.useLocalSearchParams();
      return routeState.params;
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => {
    React.useState(null);
    return { clear: vi.fn(), refetchQueries: vi.fn() };
  },
}));

vi.mock('expo-linking', () => ({ openURL: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  useAuthSession: () => {
    React.useState(null);
    return {
      status: 'authenticated',
      user: {
        displayName: 'Jordan',
        companyName: 'Harpa',
        email: 'jordan@example.com',
      },
      signOut: vi.fn(),
    };
  },
}));
vi.mock('@/lib/util/use-refresh', () => ({
  useRefresh: () => {
    React.useState(null);
    return { refreshing: false, onRefresh: vi.fn() };
  },
}));
vi.mock('@/lib/files/image-cache', () => ({
  clearImageCachesOnSignOut: vi.fn(),
}));
vi.mock('@/components/ui/AppHeaderActions', () => ({
  AppHeaderActions: () => null,
}));

vi.mock('@/lib/ai/useAiProvider', () => ({
  AI_MODELS: { openai: [] },
  useAiProvider: (options?: { enabled?: boolean }) => {
    React.useState(null);
    return hookSpies.useAiProvider(options);
  },
}));
vi.mock('@/lib/config/dev-flags', () => ({
  useDeveloperFlags: () => {
    React.useState(null);
    return hookSpies.useDeveloperFlags();
  },
}));
vi.mock('@/lib/api/hooks', () => ({
  useReportDebugQuery: (input: unknown, options?: { enabled?: boolean }) => {
    React.useState(null);
    return hookSpies.useReportDebugQuery(input, options);
  },
}));

vi.mock('@/screens/profile', () => ({
  Profile: (props: ProfileRouteProps) => {
    screenState.profileProps = props;
    return React.createElement('mock-Profile', props);
  },
}));
vi.mock('@/screens/developer', () => ({
  Developer: () => React.createElement('mock-Developer'),
}));
vi.mock('@/screens/report-debug', () => ({
  ReportDebug: () => React.createElement('mock-ReportDebug', { testID: 'mock-report-debug' }),
}));

import ProfileRoute from '@/app/(app)/profile';
import DeveloperRoute from '@/app/(app)/developer';
import ReportDebugRoute from '@/app/(app)/projects/[project]/reports/[number]/debug';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('mobile developer-tools route gate', () => {
  beforeEach(() => {
    gateState.visible = false;
    routeState.params.project = 'harbour-tower';
    routeState.params.number = '7';
    screenState.profileProps = null;
    vi.clearAllMocks();
  });

  it('passes the shared policy to Profile instead of exposing Developer unconditionally', () => {
    const tree = render(<ProfileRoute />);
    expect(screenState.profileProps?.showDeveloperSection).toBe(false);

    gateState.visible = true;
    act(() => tree.update(<ProfileRoute />));
    expect(screenState.profileProps?.showDeveloperSection).toBe(true);
  });

  it('redirects /developer without fetching settings and preserves hook order when enabled', () => {
    const tree = render(<DeveloperRoute />);
    expect(JSON.stringify(tree.toJSON())).toContain('rn-Redirect');
    expect(hookSpies.useAiProvider).toHaveBeenLastCalledWith({
      enabled: false,
    });
    expect(hookSpies.useRouter).toHaveBeenCalledTimes(1);
    expect(hookSpies.useDeveloperFlags).toHaveBeenCalledTimes(1);

    gateState.visible = true;
    expect(() => {
      act(() => tree.update(<DeveloperRoute />));
    }).not.toThrow();
    expect(JSON.stringify(tree.toJSON())).toContain('mock-Developer');
    expect(hookSpies.useAiProvider).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('redirects report debug with its query disabled and preserves hook order when enabled', () => {
    const tree = render(<ReportDebugRoute />);
    expect(JSON.stringify(tree.toJSON())).toContain('rn-Redirect');
    expect(hookSpies.useReportDebugQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
    expect(hookSpies.useRouter).toHaveBeenCalledTimes(1);
    expect(hookSpies.useLocalSearchParams).toHaveBeenCalledTimes(1);

    gateState.visible = true;
    expect(() => {
      act(() => tree.update(<ReportDebugRoute />));
    }).not.toThrow();
    expect(JSON.stringify(tree.toJSON())).toContain('mock-ReportDebug');
    expect(hookSpies.useReportDebugQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: true }),
    );
  });

  it.each(['', '0', '-1', '01', '1.5', '7junk', '9007199254740992'])(
    'redirects invalid report number %j without starting the debug query',
    (number) => {
      gateState.visible = true;
      routeState.params.number = number;

      const tree = render(<ReportDebugRoute />);

      expect(tree.root.findByProps({ href: '/(app)/projects' })).toBeTruthy();
      expect(tree.root.findAllByProps({ testID: 'mock-report-debug' })).toHaveLength(0);
      expect(hookSpies.useReportDebugQuery).toHaveBeenLastCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: false }),
      );
    },
  );
});
