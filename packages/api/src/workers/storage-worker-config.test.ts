import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const configs = ['fly.toml', 'fly.dev.toml'] as const;

describe.each(configs)('storage-worker maintenance config in %s', (config) => {
  const contents = readFileSync(
    new URL(`../../../../infra/fly/${config}`, import.meta.url),
    'utf8',
  );

  it('disables background maintenance by default in Fly', () => {
    expect(contents).toContain('BACKGROUND_MAINTENANCE_ENABLED = "0"');
  });
});
