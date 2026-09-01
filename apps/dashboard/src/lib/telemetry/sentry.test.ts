import { describe, expect, it, vi } from 'vitest';

import { initializeDashboardTelemetry } from './sentry';

describe('initializeDashboardTelemetry', () => {
  it('does nothing when no DSN is configured', () => {
    const init = vi.fn();

    expect(
      initializeDashboardTelemetry(
        {
          apiBaseUrl: 'https://api.harpapro.com',
          dsn: undefined,
          environment: 'test',
          release: undefined,
        },
        init,
      ),
    ).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes privacy-safe error and performance monitoring', () => {
    const init = vi.fn();

    expect(
      initializeDashboardTelemetry(
        {
          apiBaseUrl: 'https://api.harpapro.com',
          dsn: 'https://public@example.ingest.sentry.io/1',
          environment: 'preview',
          release: 'abc123',
        },
        init,
      ),
    ).toBe(true);

    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        environment: 'preview',
        release: 'abc123',
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        tracePropagationTargets: ['https://api.harpapro.com'],
      }),
    );
  });
});
