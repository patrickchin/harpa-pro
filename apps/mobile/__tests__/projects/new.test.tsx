import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

const routerSpy = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(() => false),
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerSpy,
}));

type MutateArgs = [
  input: { body: Record<string, unknown> },
  callbacks: { onSuccess?: (result: unknown) => void },
];

const mutateSpy = vi.fn<MutateArgs, void>();

vi.mock('@/lib/api/hooks', () => ({
  useCreateProjectMutation: () => ({
    mutate: mutateSpy,
    isPending: false,
    error: null,
  }),
}));

import NewProjectRoute from '@/app/(app)/projects/new';

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<NewProjectRoute />); });
  return tree;
}

function getBackButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'btn-back' });
}

function pressSubmit(tree: TestRenderer.ReactTestRenderer, name = 'Test Project') {
  act(() => tree.root.findByProps({ testID: 'input-project-name' }).props.onChangeText(name));
  act(() => tree.root.findByProps({ testID: 'btn-submit-project' }).props.onPress());
}

describe('NewProjectRoute — navigation wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerSpy.canGoBack.mockReturnValue(false);
  });

  describe('back button', () => {
    it('replaces to /(app)/projects when there is no history', () => {
      const tree = render();
      act(() => getBackButton(tree).props.onPress());
      expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects');
      expect(routerSpy.back).not.toHaveBeenCalled();
    });

    it('calls router.back() when history exists', () => {
      routerSpy.canGoBack.mockReturnValue(true);
      const tree = render();
      act(() => getBackButton(tree).props.onPress());
      expect(routerSpy.back).toHaveBeenCalledTimes(1);
      expect(routerSpy.replace).not.toHaveBeenCalled();
    });
  });

  describe('successful project creation', () => {
    it('replaces to /(app)/projects/<slug> so back goes to the list not the form', () => {
      const tree = render();
      pressSubmit(tree);
      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'my-cool-project' }));
      expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects/my-cool-project');
    });

    it('does not call dismissTo (only works for modals, not stack screens)', () => {
      const tree = render();
      pressSubmit(tree);
      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'any-project' }));
      expect(routerSpy.dismissTo).not.toHaveBeenCalled();
    });

    it('does not call router.back on success', () => {
      const tree = render();
      pressSubmit(tree);
      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'any-project' }));
      expect(routerSpy.back).not.toHaveBeenCalled();
    });
  });
});
