/**
 * AI provider + model selection — AsyncStorage round-trip + availability probe.
 *
 * Ported from `../haru3-reports/apps/mobile/hooks/useAiProvider.ts` on
 * branch `dev`. The v3 backend exposed a `generate-report` GET that
 * returned the set of provider keys with API credentials configured.
 * The v4 API does NOT yet expose an equivalent endpoint — `useAvailableProviders`
 * defers to a static "all available" list with a `TODO(P3.15.4-contract)`
 * marker, so the UI stays useful while the backend ships its own probe.
 *
 * Persistence rules (match canonical):
 *   - Provider + model are stored in AsyncStorage under stable keys.
 *   - First mount reads both keys; invalid combinations snap to the
 *     provider default. Switching providers also snaps the model if
 *     the current one isn't valid for the new provider.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDER_STORAGE_KEY = 'harpa.ai_provider.v1';
const MODEL_STORAGE_KEY = 'harpa.ai_model.v1';

export const AI_PROVIDERS = [
  { key: 'kimi', label: 'Kimi', desc: 'Cheapest, good for dev' },
  { key: 'openai', label: 'OpenAI', desc: 'Balanced quality / price' },
  { key: 'anthropic', label: 'Anthropic', desc: 'Strong instruction following' },
  { key: 'google', label: 'Google', desc: 'Fast, large context' },
  { key: 'zai', label: 'Z.AI', desc: 'Strong reasoning (GLM)' },
  { key: 'deepseek', label: 'DeepSeek', desc: 'Cheap, capable' },
] as const;

export type AiProviderKey = (typeof AI_PROVIDERS)[number]['key'];

/**
 * Catalogue of selectable models per provider. First entry is the default.
 * Kept in sync with the canonical v3 catalogue
 * (`hooks/useAiProvider.ts:PROVIDER_MODELS` at `../haru3-reports@dev`).
 */
export const PROVIDER_MODELS: Record<AiProviderKey, { id: string; label: string }[]> = {
  kimi: [
    { id: 'kimi-k2-0905-preview', label: 'Kimi K2 (preview, 0905)' },
    { id: 'kimi-k2-0711-preview', label: 'Kimi K2 (preview, 0711)' },
    { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
  ],
  google: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  zai: [
    { id: 'glm-4.6', label: 'GLM-4.6' },
    { id: 'glm-4-air', label: 'GLM-4 Air' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3 (chat)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoner)' },
  ],
};

export const DEFAULT_PROVIDER: AiProviderKey = 'kimi';

function defaultModelFor(provider: AiProviderKey): string {
  return PROVIDER_MODELS[provider]?.[0]?.id ?? '';
}

function isValidModel(provider: AiProviderKey, model: string): boolean {
  return PROVIDER_MODELS[provider]?.some((m) => m.id === model) ?? false;
}

function isValidProvider(value: string | null): value is AiProviderKey {
  return !!value && AI_PROVIDERS.some((p) => p.key === value);
}

export interface UseAiProviderApi {
  provider: AiProviderKey;
  setProvider: (key: AiProviderKey) => void;
  model: string;
  setModel: (modelId: string) => void;
  /** True once the AsyncStorage round-trip completes. */
  isLoaded: boolean;
}

export function useAiProvider(): UseAiProviderApi {
  const [provider, setProviderState] = useState<AiProviderKey>(DEFAULT_PROVIDER);
  const [model, setModelState] = useState<string>(() => defaultModelFor(DEFAULT_PROVIDER));
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(PROVIDER_STORAGE_KEY),
      AsyncStorage.getItem(MODEL_STORAGE_KEY),
    ]).then(([providerVal, modelVal]) => {
      if (cancelled) return;
      const validProvider = isValidProvider(providerVal) ? providerVal : DEFAULT_PROVIDER;
      const validModel =
        modelVal && isValidModel(validProvider, modelVal)
          ? modelVal
          : defaultModelFor(validProvider);
      setProviderState(validProvider);
      setModelState(validModel);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProvider = useCallback((key: AiProviderKey) => {
    setProviderState(key);
    void AsyncStorage.setItem(PROVIDER_STORAGE_KEY, key);
    setModelState((current) => {
      const next = isValidModel(key, current) ? current : defaultModelFor(key);
      void AsyncStorage.setItem(MODEL_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setModel = useCallback((modelId: string) => {
    setModelState(modelId);
    void AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }, []);

  return { provider, setProvider, model, setModel, isLoaded };
}

export interface UseAvailableProvidersApi {
  /** Provider keys with API credentials configured server-side. */
  availableKeys: ReadonlyArray<AiProviderKey>;
  isLoading: boolean;
}

/**
 * Returns the providers the backend has credentials for. Canonical
 * v3 called `GET /generate-report` for this; v4's API does not yet
 * expose an equivalent — until it lands, we default to ALL providers
 * available so the picker stays usable.
 *
 * TODO(P3.15.4-contract): swap the static list for a real
 * `useAvailableProvidersQuery` once the API ships
 * `GET /ai/providers` (or extends `/generate-report` with the v3
 * shape). Keep the return contract — caller code consumes
 * `availableKeys` as a `ReadonlyArray<AiProviderKey>`.
 */
export function useAvailableProviders(): UseAvailableProvidersApi {
  return {
    availableKeys: AI_PROVIDERS.map((p) => p.key),
    isLoading: false,
  };
}
