import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type AccountRouteProps = {
  deletionPreview: unknown;
  isDeletionPreviewLoading: boolean;
  isDeletingAccount: boolean;
  deleteAccountError: string | null;
  onRequestDeletionPreview: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
};

const routerSpy = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => false),
}));

const sessionState = vi.hoisted(() => ({
  user: {
    email: 'jordan@example.com',
    displayName: 'Jordan Sims',
    companyName: 'Sims Construction',
  },
  refresh: vi.fn(),
  signOut: vi.fn(),
}));

const updateMeSpy = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

const deleteMeSpy = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

const deletionPreviewSpy = vi.hoisted(() => ({
  data: {
    email: 'jordan@example.com',
    soloProjectsDeleted: [],
    sharedProjectsTransferred: [],
    sharedProjectsLeft: [],
    personalFilesDeleted: 0,
  },
  isFetching: false,
  refetch: vi.fn(),
}));

const queryClientSpy = vi.hoisted(() => ({
  clear: vi.fn(),
}));

const clearImageCachesSpy = vi.hoisted(() => vi.fn());

const billingState = vi.hoisted(() => ({
  enabled: false,
  status: 'disabled' as const,
  presentPaywall: vi.fn(),
  presentCustomerCenter: vi.fn(),
  restorePurchases: vi.fn(),
  refresh: vi.fn(),
}));

const screenState = vi.hoisted(() => ({
  props: null as AccountRouteProps | null,
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerSpy,
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQueryClient: () => queryClientSpy,
  };
});

vi.mock('@/lib/auth/session', () => ({
  useAuthSession: () => sessionState,
}));

vi.mock('@/lib/util/use-refresh', () => ({
  useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }),
}));

vi.mock('@/lib/api/hooks', () => ({
  useUpdateMeMutation: () => updateMeSpy,
  useDeleteMeMutation: () => deleteMeSpy,
  useAccountDeletionPreviewQuery: () => deletionPreviewSpy,
}));

vi.mock('@/lib/files/image-cache', () => ({
  clearImageCachesOnSignOut: clearImageCachesSpy,
}));

vi.mock('@/lib/billing', () => ({
  useBilling: () => billingState,
}));

vi.mock('@/components/account/AvatarUploader', () => ({
  AvatarUploader: () => null,
}));

vi.mock('@/components/ui/AppHeaderActions', () => ({
  AppHeaderActions: () => null,
}));

vi.mock('@/screens/account', () => ({
  Account: (props: AccountRouteProps) => {
    screenState.props = props;
    return null;
  },
}));

import AccountRoute from '@/app/(app)/account';

function renderRoute(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<AccountRoute />);
  });
  return tree;
}

describe('AccountRoute account deletion wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    screenState.props = null;
    updateMeSpy.mutateAsync.mockResolvedValue({ user: {} });
    deleteMeSpy.mutateAsync.mockResolvedValue(undefined);
    deleteMeSpy.isPending = false;
    deletionPreviewSpy.isFetching = false;
    deletionPreviewSpy.refetch.mockResolvedValue({
      data: deletionPreviewSpy.data,
    });
    sessionState.refresh.mockResolvedValue(undefined);
    sessionState.signOut.mockResolvedValue(undefined);
    clearImageCachesSpy.mockResolvedValue(undefined);
    billingState.presentCustomerCenter.mockResolvedValue(undefined);
    billingState.restorePurchases.mockResolvedValue(false);
    billingState.refresh.mockResolvedValue(undefined);
  });

  it('requests the latest deletion preview when the screen opens the dialog', async () => {
    renderRoute();

    await act(async () => {
      await screenState.props?.onRequestDeletionPreview();
    });

    expect(deletionPreviewSpy.refetch).toHaveBeenCalledTimes(1);
    expect(screenState.props?.deletionPreview).toBe(deletionPreviewSpy.data);
  });

  it('exposes a themed error when deletion preview loading fails', async () => {
    deletionPreviewSpy.refetch.mockResolvedValueOnce({
      error: new Error('Preview failed'),
    });
    renderRoute();

    await act(async () => {
      await screenState.props?.onRequestDeletionPreview();
    });

    expect(screenState.props?.deleteAccountError).toBe('Preview failed');
  });

  it('deletes the account, clears local caches, and signs out on success', async () => {
    renderRoute();

    await act(async () => {
      await screenState.props?.onDeleteAccount();
    });

    expect(deleteMeSpy.mutateAsync).toHaveBeenCalledTimes(1);
    expect(queryClientSpy.clear).toHaveBeenCalledTimes(1);
    expect(clearImageCachesSpy).toHaveBeenCalledTimes(1);
    expect(sessionState.signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and exposes a themed error when deletion fails', async () => {
    deleteMeSpy.mutateAsync.mockRejectedValueOnce(new Error('Server said no'));
    renderRoute();

    await act(async () => {
      await screenState.props?.onDeleteAccount();
    });

    expect(queryClientSpy.clear).not.toHaveBeenCalled();
    expect(sessionState.signOut).not.toHaveBeenCalled();
    expect(screenState.props?.deleteAccountError).toBe('Server said no');
  });
});
