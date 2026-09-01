import { afterEach, describe, expect, it, vi } from 'vitest';

const startup = vi.hoisted(() => ({
  app: { fetch: vi.fn() },
  createApp: vi.fn(),
  serve: vi.fn(),
  startAdminRateLimitGc: vi.fn(),
  startIdempotencyGc: vi.fn(),
  startRateLimitGc: vi.fn(),
}));

vi.mock('@hono/node-server', () => ({
  serve: startup.serve,
}));

vi.mock('../app.js', () => ({
  createApp: startup.createApp,
}));

vi.mock('../env.js', () => ({
  env: { PORT: 4321, BACKGROUND_MAINTENANCE_ENABLED: '1' },
}));

vi.mock('../lib/adminRateLimiter.js', () => ({
  startAdminRateLimitGc: startup.startAdminRateLimitGc,
}));

vi.mock('../lib/idempotencyStore.js', () => ({
  startIdempotencyGc: startup.startIdempotencyGc,
}));

vi.mock('../lib/rateLimiter.js', () => ({
  startRateLimitGc: startup.startRateLimitGc,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('server background maintenance wiring', () => {
  it('starts every database-backed cleanup scheduler during server boot', async () => {
    startup.createApp.mockReturnValue(startup.app);

    await import('../server.js');

    expect(startup.startAdminRateLimitGc).toHaveBeenCalledOnce();
    expect(startup.startIdempotencyGc).toHaveBeenCalledOnce();
    expect(startup.startRateLimitGc).toHaveBeenCalledOnce();
    expect(startup.serve).toHaveBeenCalledWith(
      { fetch: startup.app.fetch, port: 4321 },
      expect.any(Function),
    );
  });

  it('skips database-backed cleanup schedulers when background maintenance is disabled', async () => {
    startup.createApp.mockReturnValue(startup.app);
    const { env } = await import('../env.js');
    env.BACKGROUND_MAINTENANCE_ENABLED = '0';

    await import('../server.js');

    expect(startup.startAdminRateLimitGc).not.toHaveBeenCalled();
    expect(startup.startIdempotencyGc).not.toHaveBeenCalled();
    expect(startup.startRateLimitGc).not.toHaveBeenCalled();
    expect(startup.serve).toHaveBeenCalledWith(
      { fetch: startup.app.fetch, port: 4321 },
      expect.any(Function),
    );
  });
});
