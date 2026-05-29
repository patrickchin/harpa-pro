import { z } from 'zod';

/**
 * AI model whitelist — single source of truth for both API validation
 * and mobile picker rendering. Each entry carries display metadata
 * (tagline, latency, cost) so the picker doesn't need a parallel
 * table.
 *
 * Latency is p50 from Fly Frankfurt (our prod region). Cost is USD
 * per report at ~1.2K input + 0.5K output tokens. See
 * docs/superpowers/specs/2026-05-29-user-model-selection-design.md.
 */
export const AI_MODELS = {
  openai: [
    {
      id: 'gpt-4.1-nano',
      label: 'GPT-4.1 nano',
      tagline: 'Fastest and cheapest',
      latencyMs: 2100,
      costPerReport: 0.0003,
    },
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini',
      tagline: 'Default — balanced',
      latencyMs: 4700,
      costPerReport: 0.001,
      isDefault: true,
    },
    {
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      tagline: 'Highest quality',
      latencyMs: 2600,
      costPerReport: 0.006,
    },
  ],
} as const;

export type AiVendor = keyof typeof AI_MODELS;
export type AiModelId = (typeof AI_MODELS)[AiVendor][number]['id'];

export const aiVendor = z.enum(['openai']);

/**
 * Settings shape. Both fields are nullable as a pair: `{null, null}`
 * means "use server default", `{vendor, model}` means "user picked".
 * Mixed `{vendor, null}` or `{null, model}` is rejected.
 */
export const aiSettings = z
  .object({
    vendor: aiVendor.nullable(),
    model: z.string().nullable(),
  })
  .refine(
    (v) => (v.vendor === null && v.model === null) || (v.vendor !== null && v.model !== null),
    { message: 'vendor and model must be both null or both set' },
  );

export const updateAiSettingsRequest = aiSettings;

/**
 * Validate a vendor/model pair against `AI_MODELS`. Both null is
 * valid (the "Default" state). Used by the API on PATCH to 400
 * unknown ids.
 */
export function isValidAiSelection(s: {
  vendor: AiVendor | null;
  model: string | null;
}): boolean {
  if (s.vendor === null && s.model === null) return true;
  if (s.vendor === null || s.model === null) return false;
  const list = AI_MODELS[s.vendor];
  if (!list) return false;
  return list.some((m) => m.id === s.model);
}
