import { describe, expect, it } from 'vitest';
import { redactFixture } from './redact.js';

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
});
