import { describe, it, expect } from 'vitest';
import { getPublicEnv } from './env';

describe('getPublicEnv', () => {
  it('falls back to harpapro.com API base URL when PUBLIC_API_BASE_URL unset', () => {
    const e = getPublicEnv();
    expect(e.apiBaseUrl).toMatch(/^https?:\/\//);
    // Default in tests (no .env) is the prod URL.
    expect(e.apiBaseUrl).toBe('https://api.harpapro.com');
  });

  it('returns Cloudflare always-passes test sitekey when PUBLIC_TURNSTILE_SITE_KEY unset', () => {
    const e = getPublicEnv();
    expect(e.turnstileSiteKey).toBe('1x00000000000000000000AA');
  });

  it('never returns undefined for either field', () => {
    const e = getPublicEnv();
    expect(typeof e.apiBaseUrl).toBe('string');
    expect(typeof e.turnstileSiteKey).toBe('string');
    expect(e.apiBaseUrl.length).toBeGreaterThan(0);
    expect(e.turnstileSiteKey.length).toBeGreaterThan(0);
  });
});
