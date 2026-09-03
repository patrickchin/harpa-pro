import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';

vi.mock('@/lib/api/base-url', () => ({
  getApiBaseUrl: vi.fn(async () => 'https://harpa-pro-api-dev.fly.dev'),
}));

import { __resetBackendVersionCache } from '@/lib/api/backend-version';
import { BuildBadge } from './BuildBadge';

const FULL_SHA = '1234567890abcdef1234567890abcdef12345678';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('BuildBadge', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetBackendVersionCache();
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://harpa-pro-api-dev.fly.dev/healthz') {
        return new Response(
          JSON.stringify({
            service: 'api',
            ok: true,
            version: '1.2.3',
            gitCommit: FULL_SHA,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders a short backend hash but copies the full commit', async () => {
    const tree = render(<BuildBadge />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const versionText = tree.root.findByProps({ testID: 'build-badge-version' });
    expect(versionText.props.accessibilityLabel).toContain('api v1.2.3+1234567');
    expect(versionText.props.accessibilityLabel).not.toContain(`api v1.2.3+${FULL_SHA}`);
    expect(JSON.stringify(tree.toJSON())).toContain(
      'v0.0.0+testsha · api v1.2.3+1234567 · dev',
    );

    await act(async () => {
      await versionText.props.onLongPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      `front testsha · back ${FULL_SHA}`,
    );
  });
});
