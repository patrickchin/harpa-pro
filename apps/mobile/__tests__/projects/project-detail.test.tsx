import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

const routerSpy = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(() => false),
}));

const searchParamsSpy = vi.hoisted(() => ({ projectSlug: 'my-cool-project' }));

vi.mock('expo-router', () => ({
  useRouter: () => routerSpy,
  useLocalSearchParams: () => searchParamsSpy,
}));

vi.mock('@/lib/api/hooks', () => ({
  useProjectQuery: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/lib/use-refresh', () => ({
  useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }),
}));

vi.mock('@/lib/use-clipboard', () => ({
  useCopyToClipboard: () => ({ copiedKey: null, copy: vi.fn() }),
}));

import ProjectHomeRoute from '@/app/(app)/projects/[projectSlug]/index';

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ProjectHomeRoute />); });
  return tree;
}

function getBackButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'btn-back' });
}

describe('ProjectHomeRoute — back navigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls router.back() after create flow (tab root remains beneath replace)', () => {
    routerSpy.canGoBack.mockReturnValue(true);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.back).toHaveBeenCalledTimes(1);
    expect(routerSpy.replace).not.toHaveBeenCalled();
  });

  it('replaces to /(app)/projects when there is no history (deep-link / cold start)', () => {
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects');
    expect(routerSpy.back).not.toHaveBeenCalled();
  });

  it('never navigates to the new-project form on back (regression)', () => {
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(String(routerSpy.replace.mock.calls[0]?.[0] ?? '')).not.toContain('new');
  });
});
