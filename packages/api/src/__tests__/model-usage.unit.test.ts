import { describe, expect, it } from 'vitest';
import { settings } from '@harpa/api-contract';

import {
  MODEL_TOKEN_MULTIPLIERS,
  assertMultiplierCoverage,
  weightTokenGroups,
} from '../services/model-usage.js';

describe('model token multipliers', () => {
  it('pins the approved OpenAI ratios relative to GPT-4.1 mini', () => {
    expect(MODEL_TOKEN_MULTIPLIERS).toEqual({
      'openai:gpt-4.1-nano': { input: 0.25, output: 0.25 },
      'openai:gpt-4.1-mini': { input: 1, output: 1 },
      'openai:gpt-4.1': { input: 5, output: 5 },
    });
  });

  it('covers every selectable model in the shared catalogue', () => {
    expect(() => assertMultiplierCoverage(settings.AI_MODELS)).not.toThrow();
  });

  it('rejects a selectable model without an explicit multiplier', () => {
    const catalogue = {
      openai: [{ id: 'future-model' }],
    } as unknown as typeof settings.AI_MODELS;

    expect(() => assertMultiplierCoverage(catalogue)).toThrow(/openai:future-model/);
  });

  it('weights each vendor/model group and rounds final totals up', () => {
    expect(weightTokenGroups([
      { vendor: 'openai', model: 'gpt-4.1-nano', inputTokens: 3, outputTokens: 1 },
      { vendor: 'openai', model: 'gpt-4.1', inputTokens: 2, outputTokens: 2 },
    ])).toEqual({ inputTokens: 11, outputTokens: 11 });
  });

  it('uses a 1x fallback for historical models that are no longer selectable', () => {
    expect(weightTokenGroups([
      { vendor: 'legacy', model: 'retired-model', inputTokens: 7, outputTokens: 4 },
    ])).toEqual({ inputTokens: 7, outputTokens: 4 });
  });

  it('does not mutate raw usage rows', () => {
    const groups = [
      { vendor: 'openai', model: 'gpt-4.1', inputTokens: 2, outputTokens: 3 },
    ];
    const before = structuredClone(groups);

    weightTokenGroups(groups);

    expect(groups).toEqual(before);
  });
});
