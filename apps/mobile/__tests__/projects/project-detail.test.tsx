/**
 * Route-level tests for `app/(app)/projects/[projectSlug]/index.tsx`.
 *
 * Focuses on the navigation wiring — in particular the "create-then-land"
 * path:
 *
 *   projects/new  →  router.replace('/(app)/projects/<slug>')
 *                       ↳  replaces 'new' in the stack; tab root remains
 *                       ↳  canGoBack() is TRUE (tab root is beneath)
 *   projects/<slug>  →  back button
 *                       ↳  safeBack: router.back() → goes to tab root (list)
 *
 * The deep-link / no-history case (canGoBack: false) is also covered:
 *   projects/<slug>  →  back button with no history
 *                       ↳  safeBack: router.replace('/(app)/projects')
 *
 * Why canGoBack is TRUE after the create flow:
 *   router.replace swaps /projects/new with /projects/<slug> in the stack,
 *   leaving the tab root (projects/index) beneath. So there IS history to
 *   go back to, and back() correctly lands on the list.
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
  });

  it('calls router.back() after arriving from the create-new-project flow (canGoBack is true)', () => {
    // After router.replace('/(app)/projects/<slug>') in new.tsx, the tab root
    // (projects/index) is still beneath in the stack. canGoBack() is true,
    // so back() correctly goes to the projects list — NOT the creation form.
    routerSpy.canGoBack.mockReturnValue(true);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.back).toHaveBeenCalledTimes(1);
    expect(routerSpy.replace).not.toHaveBeenCalled();
  });

  it('calls router.replace("/(app)/projects") when there is no back history (deep-link / cold start)', () => {
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects');
    expect(routerSpy.back).not.toHaveBeenCalled();
  });

  it('does NOT navigate to the new-project form on back (regression)', () => {
    // Whether going back or replacing, the target must never be the create form.
    routerSpy.canGoBack.mockReturnValue(false);
    const tree = render();
    act(() => getBackButton(tree).props.onPress());
    const replaceArg = routerSpy.replace.mock.calls[0]?.[0] ?? '';
    expect(String(replaceArg)).not.toContain('new');
  });
});
