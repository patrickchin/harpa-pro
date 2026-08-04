/**
 * @vitest-environment node
 *
 * Tests for dismissOrReplaceTo: happy path calls router.dismissTo,
 * failure path falls back to router.replace. The fallback branch is
 * the one that actually matters in production (cold-deep-link stacks
 * where the target frame doesn't exist) so we exercise it with the
 * real failure mode — `dismissTo` throwing — not a DI stub.
 * See pitfall 13.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ImperativeRouter } from 'expo-router';
import { dismissOrReplaceTo } from './dismiss-or-replace';

function makeRouter(overrides: Partial<ImperativeRouter> = {}): ImperativeRouter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => true),
    navigate: vi.fn(),
    setParams: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
    dismissTo: vi.fn(),
    canDismiss: vi.fn(() => true),
    prefetch: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  } as unknown as ImperativeRouter;
}

describe('dismissOrReplaceTo', () => {
  it('calls router.dismissTo when the target is on the stack', () => {
    const router = makeRouter();
    dismissOrReplaceTo(router, '/projects' as never);
    expect(router.dismissTo).toHaveBeenCalledWith('/projects');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('falls back to router.replace when dismissTo throws (cold deep-link stack)', () => {
    const router = makeRouter({
      dismissTo: vi.fn(() => {
        throw new Error('Cannot dismiss to a route that is not on the stack');
      }),
    });
    dismissOrReplaceTo(router, '/projects' as never);
    expect(router.dismissTo).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/projects');
  });
});
