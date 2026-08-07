import { describe, expect, it } from 'vitest';
import { redact, redactFixture } from './redact.js';

describe('redactFixture', () => {
  it('carries identifiers from private source context across request and response', () => {
    const result = redactFixture({
      request: {
        userPrompt: '<canonical replay prompt>',
      },
      response: {
        text: 'Northstar modular unit is ready at 42 Quarry Road.',
      },
      privateContext:
        'The customer is Northstar Construction Ltd and the site is 42 Quarry Road, Bristol BS1 2AB.',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/Northstar/i);
    expect(serialized).not.toMatch(/42 Quarry Road/i);
    expect(serialized).not.toMatch(/BS1 2AB/i);
    expect(result).not.toHaveProperty('privateContext');
  });

  it('normalizes organization edges without polynomial backtracking', () => {
    const customerName = `x${'\t'.repeat(20_000)}y`;
    const started = performance.now();

    const result = redact({ customerName });

    expect(performance.now() - started).toBeLessThan(250);
    expect(result).toEqual({ customerName: '<redacted-organization>' });
  });
});
