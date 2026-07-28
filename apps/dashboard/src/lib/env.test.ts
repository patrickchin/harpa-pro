import { describe, expect, it } from 'vitest';

import { parseDashboardEnv } from './env';

describe('parseDashboardEnv', () => {
  it('fails fast when the API URL is missing', () => {
    expect(() => parseDashboardEnv({})).toThrow(/VITE_API_BASE_URL/);
  });

  it('rejects a malformed API URL', () => {
    expect(() => parseDashboardEnv({ VITE_API_BASE_URL: 'api.harpapro.com' })).toThrow(
      /VITE_API_BASE_URL/,
    );
  });

  it('normalizes a valid API URL once at the app boundary', () => {
    expect(
      parseDashboardEnv({
        VITE_API_BASE_URL: 'https://api.harpapro.com/',
        VITE_SENTRY_DSN: '',
      }),
    ).toEqual({
      VITE_API_BASE_URL: 'https://api.harpapro.com',
      VITE_SENTRY_DSN: undefined,
    });
  });

  it('validates optional dashboard telemetry settings', () => {
    expect(
      parseDashboardEnv({
        VITE_API_BASE_URL: 'https://api.harpapro.com',
        VITE_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
        VITE_SENTRY_ENVIRONMENT: 'preview',
        VITE_SENTRY_RELEASE: 'abc123',
      }),
    ).toMatchObject({
      VITE_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'preview',
      VITE_SENTRY_RELEASE: 'abc123',
    });

    expect(() =>
      parseDashboardEnv({
        VITE_API_BASE_URL: 'https://api.harpapro.com',
        VITE_SENTRY_DSN: 'not-a-url',
      }),
    ).toThrow(/VITE_SENTRY_DSN/);
  });
});
