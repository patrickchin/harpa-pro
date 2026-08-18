import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  devDependencies?: Record<string, string>;
};

describe('Testcontainers dependency policy', () => {
  it('keeps the PostgreSQL module and core package on the same release range', () => {
    const path = fileURLToPath(new URL('../../package.json', import.meta.url));
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
    const postgresql = manifest.devDependencies?.['@testcontainers/postgresql'];

    expect(postgresql).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(manifest.devDependencies?.testcontainers).toBe(postgresql);
  });
});
