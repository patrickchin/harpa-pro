import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readManifest(relativePath: string): PackageManifest {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

describe('better-auth dependency policy', () => {
  it('pins every runtime and CLI package to one exact release', () => {
    const api = readManifest('../../package.json');
    const mobile = readManifest('../../../../apps/mobile/package.json');
    const version = api.dependencies?.['better-auth'];

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(api.dependencies?.['@better-auth/expo']).toBe(version);
    expect(mobile.dependencies?.['better-auth']).toBe(version);
    expect(mobile.dependencies?.['@better-auth/expo']).toBe(version);
    expect(api.dependencies).not.toHaveProperty('@better-auth/cli');
    expect(api.dependencies).not.toHaveProperty('jose');
    expect(api.devDependencies?.auth).toBe(version);
    expect(api.scripts?.['auth:schema:generate']).toBe(
      'auth generate --config src/auth/auth.ts --output src/db/auth-schema.ts --yes',
    );
  });

  it('keeps the Expo client on Better Auth compatible Zod types', () => {
    const mobile = readManifest('../../../../apps/mobile/package.json');

    expect(mobile.dependencies?.zod).toMatch(/^4\.\d+\.\d+$/);
  });
});
