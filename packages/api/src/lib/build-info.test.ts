import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FULL_SHA = 'abc1234567890abcdef1234567890abcdef12345';
const KEYS = ['GIT_COMMIT', 'BUILD_TIME'] as const;

let snapshot: Record<(typeof KEYS)[number], string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(KEYS.map((key) => [key, process.env[key]])) as typeof snapshot;
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
  vi.resetModules();
});

async function freshBuildInfo() {
  vi.resetModules();
  return (await import('./build-info.js')).buildInfo;
}

describe('buildInfo', () => {
  it('falls back to local outside an image build', async () => {
    await expect(freshBuildInfo()).resolves.toMatchObject({ gitCommit: 'local' });
  });

  it('accepts and normalizes a full 40-character Git commit', async () => {
    process.env.GIT_COMMIT = FULL_SHA.toUpperCase();
    process.env.BUILD_TIME = '2026-07-28T12:34:56Z';

    await expect(freshBuildInfo()).resolves.toMatchObject({
      gitCommit: FULL_SHA,
      buildTime: '2026-07-28T12:34:56Z',
    });
  });

  it('rejects an abbreviated Git commit', async () => {
    process.env.GIT_COMMIT = FULL_SHA.slice(0, 7);

    await expect(freshBuildInfo()).rejects.toThrow(/GIT_COMMIT.*40-character/i);
  });
});
