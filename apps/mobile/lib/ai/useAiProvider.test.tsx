/**
 * `useAiProvider` + `useAvailableProviders` behaviour tests.
 *
 * Pitfall 13 compliance: AsyncStorage is the integration boundary —
 * we stub the real module with an in-memory map (the project-wide
 * default mock from `vitest.setup.ts`) and exercise the hook through
 * its public API. We do NOT inject a fake storage.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AI_PROVIDERS,
  PROVIDER_MODELS,
  useAiProvider,
  useAvailableProviders,
  type UseAiProviderApi,
  type UseAvailableProvidersApi,
} from './useAiProvider';

function flush() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderHook<T>(useHook: () => T): { current: { value: T } } {
  const ref: { value: T } = { value: undefined as unknown as T };
  function Probe() {
    ref.value = useHook();
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return { current: ref };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('useAiProvider', () => {
  it('defaults to kimi + its first model when AsyncStorage is empty', async () => {
    const { current } = renderHook(() => useAiProvider());
    await flush();
    expect(current.value.provider).toBe('kimi');
    expect(current.value.model).toBe(PROVIDER_MODELS.kimi[0]!.id);
    expect(current.value.isLoaded).toBe(true);
  });

  it('hydrates from AsyncStorage when valid values are stored', async () => {
    await AsyncStorage.setItem('harpa.ai_provider.v1', 'anthropic');
    await AsyncStorage.setItem('harpa.ai_model.v1', 'claude-haiku-4-5');
    const { current } = renderHook(() => useAiProvider());
    await flush();
    expect(current.value.provider).toBe('anthropic');
    expect(current.value.model).toBe('claude-haiku-4-5');
  });

  it('falls back to the provider default when the stored model is invalid', async () => {
    await AsyncStorage.setItem('harpa.ai_provider.v1', 'openai');
    await AsyncStorage.setItem('harpa.ai_model.v1', 'not-a-real-model');
    const { current } = renderHook(() => useAiProvider());
    await flush();
    expect(current.value.provider).toBe('openai');
    expect(current.value.model).toBe(PROVIDER_MODELS.openai[0]!.id);
  });

  it('falls back to kimi when the stored provider is unknown', async () => {
    await AsyncStorage.setItem('harpa.ai_provider.v1', 'totally-made-up');
    const { current } = renderHook(() => useAiProvider());
    await flush();
    expect(current.value.provider).toBe('kimi');
  });

  it('persists provider + snaps model to default when switching providers', async () => {
    const { current } = renderHook(() => useAiProvider());
    await flush();
    await act(async () => {
      (current.value as UseAiProviderApi).setProvider('google');
    });
    expect(current.value.provider).toBe('google');
    expect(current.value.model).toBe(PROVIDER_MODELS.google[0]!.id);
    expect(await AsyncStorage.getItem('harpa.ai_provider.v1')).toBe('google');
    expect(await AsyncStorage.getItem('harpa.ai_model.v1')).toBe(
      PROVIDER_MODELS.google[0]!.id,
    );
  });

  it('persists model selection without changing provider', async () => {
    const { current } = renderHook(() => useAiProvider());
    await flush();
    await act(async () => {
      (current.value as UseAiProviderApi).setModel('kimi-k2-thinking');
    });
    expect(current.value.model).toBe('kimi-k2-thinking');
    expect(await AsyncStorage.getItem('harpa.ai_model.v1')).toBe('kimi-k2-thinking');
  });
});

describe('useAvailableProviders', () => {
  it('returns the full provider catalogue as available (static default)', () => {
    const { current } = renderHook(() => useAvailableProviders());
    const api = current.value as UseAvailableProvidersApi;
    expect(api.isLoading).toBe(false);
    expect(api.availableKeys).toEqual(AI_PROVIDERS.map((p) => p.key));
  });
});
