import { afterEach, describe, expect, it } from 'vitest';
import { errorEnvelope } from '@harpa/api-contract';
import { createApp } from '../app.js';
import { env } from '../env.js';

const KEYS = [
  'IOS_APP_ID_PREFIX',
  'IOS_BUNDLE_IDS',
  'ANDROID_PACKAGE_NAMES',
  'ANDROID_CERT_FINGERPRINTS_SHA256',
] as const;

type EnvKey = (typeof KEYS)[number];

describe('well-known universal-link manifests', () => {
  const original = Object.fromEntries(KEYS.map((k) => [k, env[k]])) as Record<
    EnvKey,
    string | undefined
  >;

  afterEach(() => {
    for (const k of KEYS) {
      (env as Record<string, unknown>)[k] = original[k];
    }
  });

  describe('apple-app-site-association', () => {
    it('404s with not_configured when IOS_APP_ID_PREFIX is unset', async () => {
      (env as Record<string, unknown>).IOS_APP_ID_PREFIX = undefined;
      (env as Record<string, unknown>).IOS_BUNDLE_IDS = 'com.harpa.pro';
      const app = createApp();
      const res = await app.request('/.well-known/apple-app-site-association');
      expect(res.status).toBe(404);
      const body = errorEnvelope.parse(await res.json());
      expect(body.error.code).toBe('not_configured');
      expect(body.requestId).toBe(res.headers.get('x-request-id'));
    });

    it('returns a manifest covering /p/* and /r/* for every bundle id', async () => {
      (env as Record<string, unknown>).IOS_APP_ID_PREFIX = 'ABCDE12345';
      (env as Record<string, unknown>).IOS_BUNDLE_IDS = 'com.harpa.pro,com.harpa.pro.dev';
      const app = createApp();
      const res = await app.request('/.well-known/apple-app-site-association');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      const body = (await res.json()) as {
        applinks: { apps: string[]; details: { appID: string; paths: string[] }[] };
      };
      expect(body.applinks.apps).toEqual([]);
      expect(body.applinks.details).toEqual([
        { appID: 'ABCDE12345.com.harpa.pro', paths: ['/p/*', '/r/*'] },
        { appID: 'ABCDE12345.com.harpa.pro.dev', paths: ['/p/*', '/r/*'] },
      ]);
    });

    it('404s when bundle ids are unset even with a team id', async () => {
      (env as Record<string, unknown>).IOS_APP_ID_PREFIX = 'ABCDE12345';
      (env as Record<string, unknown>).IOS_BUNDLE_IDS = undefined;
      const app = createApp();
      const res = await app.request('/.well-known/apple-app-site-association');
      expect(res.status).toBe(404);
    });
  });

  describe('assetlinks.json', () => {
    it('404s when ANDROID_PACKAGE_NAMES is unset', async () => {
      (env as Record<string, unknown>).ANDROID_PACKAGE_NAMES = undefined;
      const app = createApp();
      const res = await app.request('/.well-known/assetlinks.json');
      expect(res.status).toBe(404);
    });

    it('404s when fingerprint count mismatches package count', async () => {
      (env as Record<string, unknown>).ANDROID_PACKAGE_NAMES =
        'com.harpa.pro,com.harpa.pro.dev';
      (env as Record<string, unknown>).ANDROID_CERT_FINGERPRINTS_SHA256 = 'AA:BB';
      const app = createApp();
      const res = await app.request('/.well-known/assetlinks.json');
      expect(res.status).toBe(404);
      const body = errorEnvelope.parse(await res.json());
      expect(body.error.message).toMatch(/equal length/);
      expect(body.requestId).toBe(res.headers.get('x-request-id'));
    });

    it('emits one entry per package, index-aligned with fingerprints', async () => {
      (env as Record<string, unknown>).ANDROID_PACKAGE_NAMES =
        'com.harpa.pro,com.harpa.pro.dev';
      (env as Record<string, unknown>).ANDROID_CERT_FINGERPRINTS_SHA256 = 'AA:BB,CC:DD';
      const app = createApp();
      const res = await app.request('/.well-known/assetlinks.json');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{
        relation: string[];
        target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
      }>;
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.harpa.pro',
          sha256_cert_fingerprints: ['AA:BB'],
        },
      });
      expect(body[1]?.target.package_name).toBe('com.harpa.pro.dev');
      expect(body[1]?.target.sha256_cert_fingerprints).toEqual(['CC:DD']);
    });
  });
});
