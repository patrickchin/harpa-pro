/**
 * Route-level tests for `app/(app)/projects/[projectSlug]/index.tsx`.
 *
 * Focuses on the navigation wiring — in particular the "create-then-land"
 * path:
 *
 *   projects/new  →  router.dismissTo('/projects/<slug>')
 *                       ↳  stack now has NO prior history
 *   projects/<slug>  →  back button
 *                       ↳  safeBack: router.replace('/(app)/projects')
 *
 * The fact that dismissTo removes the creation form from the back stack
 * is tested in `__tests__/projects/new.test.tsx`. This file tests the
 * other half: that the project detail page routes the user to the list
 * when there is nothing to go back to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Mutable router stub
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// API / utility hook stubs
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/hooks', () => ({
  useProjectQuery: () => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/use-refresh', () => ({
  useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }),
}));

vi.mock('@/lib/use-clipboard', () => ({
  useCopyToClipboard: () => ({ copiedKey: null, copy: vi.fn() }),
}));

import ProjectHomeRoute from '@/app/(app)/projects/[projectSlug]/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ProjectHomeRoute />);
  });
  return tree;
}

function getBackButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'btn-back' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ProjectHomeRoute — back navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerSpy.canGoBack.mockReturnValue(false);
  });

  it('calls router.replace("/(app)/projects") when there is no back history', () => {
    // Simulates arriving via router.dismissTo (from create-new-project flow)
    // or a deep link — both result in canGoBack() === false.
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects');
    expect(routerSpy.back).not.toHaveBeenCalled();
  });

  it('calls router.back() when navigated to normally (history exists)', () => {
    // Simulates arriving via router.push from the projects list.
    routerSpy.canGoBack.mockReturnValue(true);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.back).toHaveBeenCalledTimes(1);
    expect(routerSpy.replace).not.toHaveBeenCalled();
  });

  it('does NOT navigate to the new-project form on back (regression)', () => {
    // The new-project form must not appear in the back stack after dismissTo.
    // From the route's perspective: on back, the target is /(app)/projects,
    // never /projects/new.
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    const replaceArg = routerSpy.replace.mock.calls[0]?.[0] ?? '';
    expect(String(replaceArg)).not.toContain('new');
  });
});
