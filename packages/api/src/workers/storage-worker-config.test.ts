import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const configs = ['fly.toml', 'fly.dev.toml'] as const;

describe.each(configs)('storage-worker resource policy in %s', (config) => {
  const contents = readFileSync(
    new URL(`../../../../infra/fly/${config}`, import.meta.url),
    'utf8',
  );

  it('uses the direct Node loader without resident package-manager wrappers', () => {
    expect(contents).toContain(
      'storage-worker = "node --import tsx packages/api/src/workers/storage-delete.ts"',
    );
  });

  it('disables background maintenance by default in the Fly deploy config', () => {
    expect(contents).toContain('BACKGROUND_MAINTENANCE_ENABLED = "0"');
  });

  it('reserves 512 MB for the storage worker', () => {
    expect(contents).toMatch(
      /\[\[vm\]\]\s+processes = \["storage-worker"\]\s+size = "shared-cpu-1x"\s+memory = "512mb"/,
    );
  });
});
