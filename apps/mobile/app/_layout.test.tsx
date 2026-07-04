import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';

function provider(name: string) {
  return ({ children }: { children?: React.ReactNode }) =>
    React.createElement(name, null, children);
}

async function renderRootLayout({ screenshotMode }: { screenshotMode: boolean }) {
  vi.resetModules();

  vi.doMock('expo-router', () => ({
    Slot: () => React.createElement('rn-Slot', null, null),
  }));

  vi.doMock('expo-status-bar', () => ({
    StatusBar: (props: Record<string, unknown>) =>
      React.createElement('rn-status-bar', props, null),
  }));

  vi.doMock('@tanstack/react-query-persist-client', () => ({
    PersistQueryClientProvider: provider('PersistQueryClientProvider'),
  }));

  vi.doMock('@/lib/auth/session', () => ({
    AuthSessionProvider: provider('AuthSessionProvider'),
  }));

  vi.doMock('@/lib/dialogs/DialogSheetProvider', () => ({
    DialogSheetProvider: provider('DialogSheetProvider'),
  }));

  vi.doMock('@/lib/billing', () => ({
    BillingProvider: provider('BillingProvider'),
  }));

  vi.doMock('@/lib/uploads/QueueProvider', () => ({
    QueueProvider: provider('QueueProvider'),
  }));

  vi.doMock('@/lib/audio/AudioPlaybackProvider', () => ({
    AudioPlaybackProvider: provider('AudioPlaybackProvider'),
  }));

  vi.doMock('@/lib/telemetry/Sentry', () => ({
    SentryProvider: provider('SentryProvider'),
    captureReactError: vi.fn(),
    initSentry: vi.fn(),
  }));

  vi.doMock('@/lib/api/query-client', () => ({
    queryClient: {},
    queryPersister: { persister: {}, maxAge: 1, buster: 'test' },
  }));

  vi.doMock('@/lib/api/query-persister', () => ({
    shouldDehydrateQuery: vi.fn(),
  }));

  vi.doMock('@/lib/config/env', () => ({
    env: { EXPO_PUBLIC_SCREENSHOT_MODE: screenshotMode },
  }));

  const { default: RootLayout } = await import('./_layout');

  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<RootLayout />);
  });
  return tree;
}

describe('RootLayout', () => {
  it('keeps the system status bar visible in screenshot mode', async () => {
    const tree = await renderRootLayout({ screenshotMode: true });

    const [statusBar] = tree.root.findAll((node) => String(node.type) === 'rn-status-bar');
    if (!statusBar) {
      throw new Error('Expected RootLayout to render a StatusBar');
    }
    expect(statusBar.props.hidden).toBe(false);
    expect(statusBar.props.style).toBe('dark');
  });

  it('mounts billing once between auth and app services', async () => {
    const tree = await renderRootLayout({ screenshotMode: false });
    const auth = tree.root.find((node) => String(node.type) === 'AuthSessionProvider');
    const billing = auth.find((node) => String(node.type) === 'BillingProvider');

    expect(
      billing.find((node) => String(node.type) === 'DialogSheetProvider'),
    ).toBeTruthy();
  });
});
