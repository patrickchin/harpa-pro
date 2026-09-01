import { describe, expect, it } from 'vitest';

import { parsePublicEnv } from './env';

const markerOriginKeys = ['PUBLIC_SITE_BASE_URL', 'PUBLIC_DASHBOARD_URL'] as const;

const unsafeOrigins = [
  ['an empty value', ''],
  ['only whitespace', '   '],
  ['credentials', 'https://operator:secret@harpa-pro.pages.dev'],
  ['surrounding whitespace', ' https://harpa-pro.pages.dev '],
  ['a trailing slash', 'https://harpa-pro.pages.dev/'],
  ['a path', 'https://harpa-pro.pages.dev/deployments'],
  ['a query', 'https://harpa-pro.pages.dev?branch=main'],
  ['a fragment', 'https://harpa-pro.pages.dev#deployment'],
  ['a non-HTTP scheme', 'ftp://harpa-pro.pages.dev'],
  ['non-loopback HTTP', 'http://harpa-pro.pages.dev'],
] as const;

const validPublicEnv: Record<string, string | undefined> = {
  PUBLIC_API_BASE_URL: 'https://api.harpapro.com',
  PUBLIC_SITE_BASE_URL: 'https://harpa-pro.pages.dev',
  PUBLIC_DASHBOARD_URL: 'https://harpa-pro-dashboard.pages.dev',
};

describe('parsePublicEnv', () => {
  it('returns the exact configured HTTPS marker origins', () => {
    expect(parsePublicEnv(validPublicEnv)).toEqual({
      apiBaseUrl: 'https://api.harpapro.com',
      siteBaseUrl: 'https://harpa-pro.pages.dev',
      dashboardUrl: 'https://harpa-pro-dashboard.pages.dev',
    });
  });

  it('accepts exact loopback HTTP origins for local development', () => {
    expect(
      parsePublicEnv({
        ...validPublicEnv,
        PUBLIC_SITE_BASE_URL: 'http://localhost:4321',
        PUBLIC_DASHBOARD_URL: 'http://127.0.0.1:5173',
      }),
    ).toMatchObject({
      siteBaseUrl: 'http://localhost:4321',
      dashboardUrl: 'http://127.0.0.1:5173',
    });
  });

  it.each(markerOriginKeys)('fails fast when %s is absent', (key) => {
    const input = { ...validPublicEnv, [key]: undefined };

    expect(() => parsePublicEnv(input)).toThrow(new RegExp(key));
  });

  describe.each(markerOriginKeys)('%s', (key) => {
    it.each(unsafeOrigins)('rejects an origin with %s', (_case, value) => {
      const input = { ...validPublicEnv, [key]: value };

      expect(() => parsePublicEnv(input)).toThrow(new RegExp(key));
    });
  });
});
