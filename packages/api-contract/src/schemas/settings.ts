import { z } from 'zod';

/**
 * AI model whitelist — single source of truth for both API validation
 * and mobile picker rendering. Each entry carries display metadata
 * (tagline, cost, optional latency) so the picker doesn't need a
 * parallel table.
 *
 * Hard-coded: retiring a model means editing this list. Saved user
 * selections that fall off the list resolve to the server default
 * (see packages/api/src/services/settings.ts `getAiSettings`).
 *
 * `reasoningEffort` is sent as `reasoning_effort` on live calls.
 * `latencyMs` is p50 from Fly Frankfurt (our prod region) and is
 * omitted until measured. `costPerReport` is USD per report at ~1.2K
 * input + 0.5K output tokens at OpenAI list price. See
 * docs/superpowers/specs/2026-05-29-user-model-selection-design.md.
 */
export const AI_MODELS = {
  openai: [
    {
      id: 'gpt-6-luna',
      label: 'GPT-6 Luna',
      tagline: 'Fast and low cost',
      costPerReport: 0.0004,
      reasoningEffort: 'none',
      isDefault: true,
    },
  ],
} as const;

export type AiReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/** Reasoning effort for a catalogued model, or undefined if unknown. */
export function reasoningEffortFor(model: string): AiReasoningEffort | undefined {
  for (const list of Object.values(AI_MODELS)) {
    const hit = list.find((m) => m.id === model);
    if (hit) return hit.reasoningEffort;
  }
  return undefined;
}

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
