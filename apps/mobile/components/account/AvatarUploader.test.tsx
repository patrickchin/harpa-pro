/**
 * `AvatarUploader` integration tests.
 *
 * Pitfall 13 compliance: we exercise the real upload pipeline. The
 * component mounts inside the **real** `<QueueProvider>` (default
 * deps from `defaultUploadDeps`) and a `<QueryClientProvider>`. Only
 * `fetch` + `AsyncStorage` are stubbed — `expo-image-picker` /
 * `expo-image-manipulator` / `expo-file-system` are the project-wide
 * defaults from `vitest.setup.ts`.
 *
 * Covers:
 *  - empty state renders a User glyph
 *  - tap → pick → manipulate → enqueue → AsyncStorage persists fileId
 *  - permission denied path surfaces the error message
 *  - hydration from AsyncStorage on mount when no `initialFileId`
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { AvatarUploader } from './AvatarUploader';
import { QueueProvider } from '@/lib/uploads';

const photoLibraryPolicyMock = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/lib/camera/photo-library-policy', () => ({
  isPhotoLibraryPickingEnabled: () => photoLibraryPolicyMock.enabled,
}));

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

let calls: RecordedCall[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function defaultFetch(): typeof fetch {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    let body: unknown = undefined;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({
      url,
      method: String(init.method ?? 'GET').toUpperCase(),
      body,
      headers,
    });
    if (url.endsWith('/files/presign') && init.method === 'POST') {
      return jsonResponse(200, {
        uploadUrl: 'https://r2.test.invalid/upload/image/avatar?sig=x',
        fileKey: 'users/usr_test/image/avatar',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    }
    if (url.startsWith('https://r2.test.invalid/upload/')) {
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/files') && init.method === 'POST') {
      return jsonResponse(201, {
        id: 'fil_avatar0001',
        ownerId: 'usr_test',
        kind: 'image',
        fileKey: 'users/usr_test/image/avatar',
        sizeBytes: 80_000,
        contentType: 'image/jpeg',
        createdAt: new Date().toISOString(),
      });
    }
    if (/\/files\/[^/]+\/url$/.test(url) && (init.method ?? 'GET') === 'GET') {
      return jsonResponse(200, {
        url: 'https://r2.test.invalid/signed-get?token=abc',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    }
    throw new Error(`Unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  }) as unknown as typeof fetch;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function renderWithProviders(el: React.ReactElement) {
  const qc = makeQueryClient();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <QueryClientProvider client={qc}>
        <QueueProvider>{el}</QueueProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  calls = [];
  photoLibraryPolicyMock.enabled = true;
  await AsyncStorage.clear();
  vi.stubGlobal('fetch', defaultFetch());
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AvatarUploader', () => {
  it('renders an empty avatar placeholder when no fileId is stored', async () => {
    const tree = renderWithProviders(<AvatarUploader />);
    await flush();
    // No CachedImage rendered (no fileId → no signedUrl call).
    expect(
      tree.root.findAllByProps({ testID: 'avatar-image' }),
    ).toHaveLength(0);
  });

  it('uploads through the real queue and persists fileId to AsyncStorage', async () => {
    const onUploaded = vi.fn();
    const tree = renderWithProviders(<AvatarUploader onUploaded={onUploaded} />);
    await flush();

    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-avatar-upload' }).props.onPress();
    });
    await flush(8);

    // All three upload hops fired against the real default deps.
    const urls = calls.map((c) => `${c.method} ${c.url}`);
    expect(urls.some((u) => u.includes('/files/presign'))).toBe(true);
    expect(urls.some((u) => u.startsWith('PUT https://r2.test.invalid/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/files') && u.startsWith('POST'))).toBe(true);

    expect(onUploaded).toHaveBeenCalledWith('fil_avatar0001');
    expect(await AsyncStorage.getItem('harpa.avatarFileId.v1')).toBe('fil_avatar0001');
  });

  it('shows an error when photo permission is denied', async () => {
    vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: 'denied',
      expires: 'never',
    } as never);

    const tree = renderWithProviders(<AvatarUploader />);
    await flush();
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-avatar-upload' }).props.onPress();
    });
    await flush(8);

    const err = tree.root.findByProps({ testID: 'avatar-error' });
    expect(err.props.children).toContain('Photos access is off');
  });

  it('hydrates the persisted avatarFileId on mount', async () => {
    await AsyncStorage.setItem('harpa.avatarFileId.v1', 'fil_existing0002');
    const tree = renderWithProviders(<AvatarUploader />);
    await flush(12);
    // The signed-URL query was kicked off against the hydrated fileId.
    const hits = calls.filter((c) =>
      /\/files\/fil_existing0002\/url$/.test(c.url),
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it('renders an existing avatar without an upload control on iOS', async () => {
    photoLibraryPolicyMock.enabled = false;
    await AsyncStorage.setItem('harpa.avatarFileId.v1', 'fil_existing0002');

    const tree = renderWithProviders(<AvatarUploader />);
    await flush(12);

    expect(
      tree.root.findAllByProps({ testID: 'avatar-image' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-avatar-upload' }),
    ).toHaveLength(0);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is canceled', async () => {
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    } as never);

    const tree = renderWithProviders(<AvatarUploader />);
    await flush();
    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-avatar-upload' }).props.onPress();
    });
    await flush();
    // No upload hops fired.
    expect(calls.filter((c) => c.url.includes('/files'))).toHaveLength(0);
    expect(await AsyncStorage.getItem('harpa.avatarFileId.v1')).toBeNull();
  });
});
