import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
};

function readManifest(relativePath: string): PackageManifest {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

describe('better-auth dependency policy', () => {
  it('pins every runtime and CLI package to one exact release', () => {
    const api = readManifest('../../package.json');
    const mobile = readManifest('../../../../apps/mobile/package.json');
    const dashboard = readManifest('../../../../apps/dashboard/package.json');
    const version = api.dependencies?.['better-auth'];

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(api.dependencies?.['@better-auth/expo']).toBe(version);
    expect(mobile.dependencies?.['better-auth']).toBe(version);
    expect(mobile.dependencies?.['@better-auth/expo']).toBe(version);
    expect(dashboard.dependencies?.['better-auth']).toBe(version);
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

describe('mobile framework dependency policy', () => {
  it('keeps Expo SDK 55 on its tested React Native matrix', () => {
    const root = readManifest('../../../../package.json');
    const mobile = readManifest('../../../../apps/mobile/package.json');

    expect(root.dependencies?.expo).toMatch(/^~55\./);
    expect(root.dependencies).toMatchObject({
      react: '19.2.0',
      'react-native': '0.83.6',
    });
    expect(root.pnpm?.overrides).toMatchObject({
      'react-native': '0.83.6',
      'react-native-reanimated': '4.2.1',
      'react-native-safe-area-context': '5.6.2',
      'react-native-screens': '4.23.0',
      'react-native-svg': '15.15.3',
      'react-native-worklets': '0.7.4',
    });
    expect(mobile.dependencies?.expo).toMatch(/^~55\./);
    expect(mobile.dependencies).toMatchObject({
      react: '19.2.0',
      'react-dom': '19.2.0',
      'react-native': '0.83.6',
      'react-native-reanimated': '4.2.1',
      'react-native-safe-area-context': '5.6.2',
      'react-native-screens': '~4.23.0',
      'react-native-svg': '15.15.3',
      'react-native-worklets': '~0.7.4',
    });
  });

  it('keeps every React renderer on the Expo-compatible release', () => {
    const root = readManifest('../../../../package.json');
    const mobile = readManifest('../../../../apps/mobile/package.json');
    const site = readManifest('../../../../apps/site/package.json');
    const admin = readManifest('../../../../apps/admin/package.json');
    const dashboard = readManifest('../../../../apps/dashboard/package.json');
    const reactVersion = '19.2.0';

    expect(root.pnpm?.overrides).toMatchObject({
      react: reactVersion,
      'react-dom': reactVersion,
      'react-test-renderer': reactVersion,
    });
    for (const manifest of [mobile, site, admin, dashboard]) {
      expect(manifest.dependencies?.react).toBe(reactVersion);
      expect(manifest.dependencies?.['react-dom']).toBe(reactVersion);
    }
    expect(mobile.devDependencies?.['react-test-renderer']).toBe(reactVersion);
  });
});
