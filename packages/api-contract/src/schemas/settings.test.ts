import { describe, it, expect } from 'vitest';
import {
  AI_MODELS,
  aiSettings,
  updateAiSettingsRequest,
  isValidAiSelection,
} from './settings.js';

describe('AI_MODELS', () => {
  it('lists only openai with the GPT-4.1 family', () => {
    expect(Object.keys(AI_MODELS)).toEqual(['openai']);
    expect(AI_MODELS.openai.map((m) => m.id)).toEqual([
      'gpt-4.1-nano',
      'gpt-4.1-mini',
      'gpt-4.1',
    ]);
  });

  it('every entry has tagline + latencyMs + costPerReport', () => {
    for (const m of AI_MODELS.openai) {
      expect(typeof m.label).toBe('string');
      expect(typeof m.tagline).toBe('string');
      expect(typeof m.latencyMs).toBe('number');
      expect(typeof m.costPerReport).toBe('number');
    }
  });

  it('exactly one entry is marked isDefault', () => {
    const defaults = AI_MODELS.openai.filter(
      (m): m is typeof m & { isDefault: true } => 'isDefault' in m && m.isDefault === true,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe('gpt-4.1-mini');
  });
});

describe('aiSettings', () => {
  it('accepts {vendor: null, model: null} (the "Default" state)', () => {
    expect(aiSettings.parse({ vendor: null, model: null })).toEqual({
      vendor: null,
      model: null,
    });
  });

  it('accepts a valid pair', () => {
    expect(aiSettings.parse({ vendor: 'openai', model: 'gpt-4.1-nano' })).toEqual({
      vendor: 'openai',
      model: 'gpt-4.1-nano',
    });
  });

  it('rejects vendor without model', () => {
    expect(() => aiSettings.parse({ vendor: 'openai', model: null })).toThrow();
  });

  it('rejects model without vendor', () => {
    expect(() => aiSettings.parse({ vendor: null, model: 'gpt-4.1-nano' })).toThrow();
  });
});

describe('isValidAiSelection', () => {
  it('returns true for null/null (default)', () => {
    expect(isValidAiSelection({ vendor: null, model: null })).toBe(true);
  });

  it('returns true for any whitelisted pair', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: 'gpt-4.1-mini' })).toBe(true);
  });

  it('returns false for a model not in the whitelist', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: 'gpt-4o' })).toBe(false);
  });

  it('returns false for an unknown vendor', () => {
    expect(
      isValidAiSelection({ vendor: 'kimi' as unknown as 'openai', model: 'kimi-k2.5' }),
    ).toBe(false);
  });

  it('returns false for mixed null/non-null', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: null })).toBe(false);
    expect(isValidAiSelection({ vendor: null, model: 'gpt-4.1-mini' })).toBe(false);
  });
});

describe('updateAiSettingsRequest', () => {
  it('accepts {vendor, model} pair', () => {
    expect(
      updateAiSettingsRequest.parse({ vendor: 'openai', model: 'gpt-4.1-mini' }),
    ).toBeTruthy();
  });

  it('accepts {vendor: null, model: null} (clear to default)', () => {
    expect(updateAiSettingsRequest.parse({ vendor: null, model: null })).toBeTruthy();
  });
});
