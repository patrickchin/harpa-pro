/**
 * Route-level tests for `app/(app)/projects/new.tsx`.
 *
 * These tests target the **navigation wiring**, not the form's visual
 * behaviour (those live in `screens/project-new.test.tsx`). Specifically:
 *
 *   1. onBack → safeBack: replace('/(app)/projects') when there is no history.
 *   2. onBack → safeBack: back() when history exists.
 *   3. onSubmit success → router.replace('/(app)/projects/<slug>'), which
 *      replaces the /projects/new screen in the Tabs+Stack so back goes to
 *      the project list, not the creation form.
 *
 * Why router.replace (not router.dismissTo):
 *   dismissTo only works for modal presentations. In our Tabs+Stack setup,
 *   /projects/new is a regular stack push. dismissTo pushes the project
 *   detail on TOP (leaving new in the stack), so back still returns to the
 *   form. router.replace correctly swaps /projects/new in place.
 *
 * Why /(app)/projects/<slug>:
 *   Within the (app) Tabs navigator, bare /projects/<slug> is not resolvable
 *   by the nested navigator's route registry. The group-qualified path
 *   /(app)/projects/<slug> bypasses relative lookup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Mutable router stub (per-test overridable via vi.mocked or direct mutation)
// ---------------------------------------------------------------------------
const routerSpy = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(() => false), // default: no history
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerSpy,
}));

// ---------------------------------------------------------------------------
// Mutation stub — captures the mutate call so we can trigger onSuccess
// ---------------------------------------------------------------------------
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

// Import AFTER mocks are wired.
import NewProjectRoute from '@/app/(app)/projects/new';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<NewProjectRoute />);
  });
  return tree;
}

function getBackButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'btn-back' });
}

function pressSubmit(tree: TestRenderer.ReactTestRenderer, name = 'Test Project') {
  // Fill in the project name so validation passes.
  const nameInput = tree.root.findByProps({ testID: 'input-project-name' });
  act(() => nameInput.props.onChangeText(name));
  const submitBtn = tree.root.findByProps({ testID: 'btn-submit-project' });
  act(() => submitBtn.props.onPress());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('NewProjectRoute — navigation wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerSpy.canGoBack.mockReturnValue(false);
  });

  describe('back button (safeBack)', () => {
    it('calls router.replace("/(app)/projects") when there is no back history', () => {
      routerSpy.canGoBack.mockReturnValue(false);
      const tree = render();
      act(() => getBackButton(tree).props.onPress());
      expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects');
      expect(routerSpy.back).not.toHaveBeenCalled();
    });

    it('calls router.back() when there is back history', () => {
      routerSpy.canGoBack.mockReturnValue(true);
      const tree = render();
      act(() => getBackButton(tree).props.onPress());
      expect(routerSpy.back).toHaveBeenCalledTimes(1);
      expect(routerSpy.replace).not.toHaveBeenCalled();
    });
  });

  describe('successful project creation', () => {
    it('calls router.replace with the group-qualified project slug URL', () => {
      const tree = render();
      pressSubmit(tree);

      expect(mutateSpy).toHaveBeenCalledTimes(1);
      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'my-cool-project' }));

      expect(routerSpy.replace).toHaveBeenCalledWith('/(app)/projects/my-cool-project');
    });

    it('does NOT call router.dismissTo on success (dismissTo does not work for stack screens)', () => {
      const tree = render();
      pressSubmit(tree);

      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'any-project' }));

      expect(routerSpy.dismissTo).not.toHaveBeenCalled();
    });

    it('does NOT call router.back on success', () => {
      const tree = render();
      pressSubmit(tree);

      const [, callbacks] = mutateSpy.mock.calls[0]!;
      act(() => callbacks.onSuccess?.({ slug: 'any-project' }));

      expect(routerSpy.back).not.toHaveBeenCalled();
    });
  });
});
