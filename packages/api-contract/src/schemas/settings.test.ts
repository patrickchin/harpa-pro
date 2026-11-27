import { describe, it, expect } from 'vitest';
import {
  AI_MODELS,
  aiSettings,
  updateAiSettingsRequest,
  isValidAiSelection,
  reasoningEffortFor,
} from './settings.js';

describe('AI_MODELS', () => {
  it('lists only openai with GPT-6 Luna', () => {
    expect(Object.keys(AI_MODELS)).toEqual(['openai']);
    expect(AI_MODELS.openai.map((m) => m.id)).toEqual(['gpt-6-luna']);
  });

  it('every entry has label + tagline + costPerReport + reasoningEffort', () => {
    for (const m of AI_MODELS.openai) {
      expect(typeof m.label).toBe('string');
      expect(typeof m.tagline).toBe('string');
      expect(typeof m.costPerReport).toBe('number');
      expect(['none', 'low', 'medium', 'high']).toContain(m.reasoningEffort);
    }
  });

  it('rejects retired and held-back OpenAI models', () => {
    const ids = ['gpt-6.1-terra', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'];
    for (const id of ids) {
      expect(isValidAiSelection({ vendor: 'openai', model: id })).toBe(false);
    }
  });

  it('exactly one entry is marked isDefault', () => {
    const defaults = AI_MODELS.openai.filter(
      (m): m is typeof m & { isDefault: true } => 'isDefault' in m && m.isDefault === true,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe('gpt-6-luna');
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
    expect(aiSettings.parse({ vendor: 'openai', model: 'gpt-6-luna' })).toEqual({
      vendor: 'openai',
      model: 'gpt-6-luna',
    });
  });

  it('rejects vendor without model', () => {
    expect(() => aiSettings.parse({ vendor: 'openai', model: null })).toThrow();
  });

  it('rejects model without vendor', () => {
    expect(() => aiSettings.parse({ vendor: null, model: 'gpt-6-luna' })).toThrow();
  });
});

describe('isValidAiSelection', () => {
  it('returns true for null/null (default)', () => {
    expect(isValidAiSelection({ vendor: null, model: null })).toBe(true);
  });

  it('returns true for any whitelisted pair', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: 'gpt-6-luna' })).toBe(true);
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
    expect(isValidAiSelection({ vendor: null, model: 'gpt-6-luna' })).toBe(false);
  });
});

describe('reasoningEffortFor', () => {
  it('returns the catalogued effort', () => {
    expect(reasoningEffortFor('gpt-6-luna')).toBe('none');
  });

  it('returns undefined for uncatalogued models', () => {
    expect(reasoningEffortFor('gpt-4o')).toBeUndefined();
    expect(reasoningEffortFor('gpt-6.1-terra')).toBeUndefined();
  });
});

describe('updateAiSettingsRequest', () => {
  it('accepts {vendor, model} pair', () => {
    expect(
      updateAiSettingsRequest.parse({ vendor: 'openai', model: 'gpt-6-luna' }),
    ).toBeTruthy();
  });

  it('accepts {vendor: null, model: null} (clear to default)', () => {
    expect(updateAiSettingsRequest.parse({ vendor: null, model: null })).toBeTruthy();
  });
});
