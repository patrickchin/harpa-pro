import { describe, expect, it } from 'vitest';

import { isDemoAccountEmail } from './demo-account';

describe('isDemoAccountEmail', () => {
  it('accepts only the supported demo account addresses', () => {
    expect(isDemoAccountEmail('demo@harpapro.com')).toBe(true);
    expect(isDemoAccountEmail(' DEMO2@harpapro.com ')).toBe(true);
    expect(isDemoAccountEmail('demo3@harpapro.com')).toBe(true);
    expect(isDemoAccountEmail('demo4@harpapro.com')).toBe(false);
    expect(isDemoAccountEmail('demo@harpapro.com.evil.example')).toBe(false);
    expect(isDemoAccountEmail('manager@example.com')).toBe(false);
  });
});
