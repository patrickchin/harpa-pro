import { describe, expect, it } from 'vitest';

import { isDemoAccountEmail, isPasswordAccountEmail } from './demo-account';

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

describe('isPasswordAccountEmail', () => {
  it('adds explicitly configured preview accounts without widening normal sign-in', () => {
    const configured = [' test+1@harpapro.com ', 'TEST+2@harpapro.com'];

    expect(isPasswordAccountEmail('demo@harpapro.com', configured)).toBe(true);
    expect(isPasswordAccountEmail('test+1@harpapro.com', configured)).toBe(true);
    expect(isPasswordAccountEmail(' test+2@harpapro.com ', configured)).toBe(true);
    expect(isPasswordAccountEmail('manager@example.com', configured)).toBe(false);
  });
});
