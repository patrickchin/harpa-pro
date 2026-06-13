import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type OnboardingProps = {
  fullName: string;
  companyName: string;
  onChangeFullName: (value: string) => void;
  onChangeCompanyName: (value: string) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
};

const routerSpy = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const sessionState = vi.hoisted(() => ({
  status: 'needs-onboarding' as 'loading' | 'unauthenticated' | 'needs-onboarding' | 'authenticated',
  user: {
    id: 'u1',
    email: 'alice@example.com',
    displayName: null as string | null,
    companyName: null as string | null,
  },
  refresh: vi.fn(),
}));

const updateMeSpy = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

const screenState = vi.hoisted(() => ({
  props: null as OnboardingProps | null,
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerSpy,
}));

vi.mock('@/lib/auth', () => ({
  useAuthSession: () => sessionState,
}));

vi.mock('@/lib/api/hooks', () => ({
  useUpdateMeMutation: () => updateMeSpy,
}));

vi.mock('@/screens/onboarding', () => ({
  default: (props: OnboardingProps) => {
    screenState.props = props;
    return null;
  },
}));

import OnboardingPage from '@/app/(auth)/onboarding';

function renderPage(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<OnboardingPage />);
  });
  return tree;
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.status = 'needs-onboarding';
    sessionState.user.displayName = null;
    sessionState.user.companyName = null;
    sessionState.refresh.mockResolvedValue(undefined);
    updateMeSpy.mutateAsync.mockResolvedValue({ user: {} });
    updateMeSpy.isPending = false;
    screenState.props = null;
  });

  it('submits displayName without requiring a company name', async () => {
    renderPage();

    act(() => {
      screenState.props?.onChangeFullName(' Alice Smith ');
    });

    await act(async () => {
      await screenState.props?.onSubmit();
    });

    expect(updateMeSpy.mutateAsync).toHaveBeenCalledWith({
      body: { displayName: 'Alice Smith' },
    });
    expect(sessionState.refresh).toHaveBeenCalledTimes(1);
    expect(routerSpy.replace).toHaveBeenCalledWith('/');
  });
});
