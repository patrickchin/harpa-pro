/**
 * Server-backed AI model selection.
 *
 * Reads from AND writes to `/settings/ai`. The server is the single
 * source of truth — AsyncStorage and the dead-wired
 * `useAvailableProviders` static probe were removed in this rewrite.
 * Catalogue lives in `@harpa/api-contract`'s `AI_MODELS` constant; this
 * file only owns the I/O.
 *
 * `selection === null` means the user has not picked — server falls
 * back to LIVE_DEFAULT_MODELS (currently gpt-4.1-mini for both
 * report generation and voice summarization).
 *
 * The previous version persisted the picked vendor + model to
 * AsyncStorage and never sent them to the API, so /generate quietly
 * ran the server default no matter what the user picked. See
 * docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md.
 */
import { settings as settingsSchemas } from '@harpa/api-contract';
import { useQueryClient } from '@tanstack/react-query';

import {
  useAiSettingsQuery,
  useUpdateAiSettingsMutation,
} from '@/lib/api/hooks';

export const AI_MODELS = settingsSchemas.AI_MODELS;
export type AiVendor = settingsSchemas.AiVendor;

export interface AiSelection {
  vendor: AiVendor;
  model: string;
}

export interface UseAiProviderApi {
  /** `null` means "use server default". */
  selection: AiSelection | null;
  /** Pass `null` to clear back to default. */
  setSelection: (next: AiSelection | null) => Promise<void>;
  isLoading: boolean;
  isUpdating: boolean;
}

/**
 * Convert the server's nullable-pair shape to the client's
 * `AiSelection | null`. The contract enforces both-null-or-both-set
 * server side; on the client we treat any half-set row defensively as
 * null (= use server default) rather than crash.
 */
function toSelection(
  raw: { vendor: AiVendor | null; model: string | null } | undefined,
): AiSelection | null {
  if (!raw) return null;
  if (raw.vendor === null || raw.model === null) return null;
  return { vendor: raw.vendor, model: raw.model };
}

export function useAiProvider(): UseAiProviderApi {
  const qc = useQueryClient();
  const query = useAiSettingsQuery();
  const mutation = useUpdateAiSettingsMutation({
    onSuccess: (data) => {
      // Write through to the cache so the picker reflects the new
      // selection without a refetch round-trip.
      qc.setQueryData(['aiSettings', undefined], data);
    },
  });

  return {
    selection: toSelection(query.data),
    setSelection: async (next) => {
      const body = next ?? { vendor: null, model: null };
      await mutation.mutateAsync({ body });
    },
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
  };
}
