/**
 * Expo app config — varies bundle id / display name by APP_VARIANT so
 * the prod and dev backends ship as two side-by-side apps on a device.
 *
 *   APP_VARIANT=production  →  "Harpa Pro"      com.harpa.pro       (App Store)
 *   APP_VARIANT=preview     →  "Harpa Pro Dev"  com.harpa.pro.dev   (TestFlight / internal, dev backend)
 *   APP_VARIANT=development →  "Harpa Pro Dev"  com.harpa.pro.dev   (Metro dev-client)
 *
 * APP_VARIANT is set per-profile in eas.json. Locally, falls back to
 * 'development'. See lib/env.ts — APP_VARIANT is also surfaced to JS
 * via EXPO_PUBLIC_APP_VARIANT to gate dev-only UI (API URL override).
 */
import type { ExpoConfig } from 'expo/config';
import { execSync } from 'node:child_process';
import { version } from '../../package.json';

type Variant = 'production' | 'preview' | 'development';

const rawVariant = (process.env.APP_VARIANT ?? 'development') as Variant;
const VARIANT: Variant =
  rawVariant === 'production' || rawVariant === 'preview' ? rawVariant : 'development';

const IS_PROD = VARIANT === 'production';

const NAME = IS_PROD ? 'Harpa Pro' : 'Harpa Pro Dev';
const BUNDLE_ID = IS_PROD ? 'com.harpa.pro' : 'com.harpa.pro.dev';
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

const GIT_COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
})();
const BUILD_TIME = new Date().toISOString();

/**
 * Universal-link host that serves AASA + assetlinks.json.
 * The API origin is the canonical resolver host (see
 * `docs/v4/plan-p4-hardening.md` §P4.6) so share links resolve
 * the same way over universal links and over the in-app web view.
 *
 * Variant-aware so the dev app verifies against the dev API and
 * the prod app against prod (otherwise iOS' SWC daemon would refuse
 * the association on a cert mismatch during TestFlight rollout).
 *
 * Uses Fly's HTTPS-by-default `*.fly.dev` hostnames today. Switch to
 * `api.harpapro.com` once the custom domain + ACME cert are wired on
 * Fly — keep both entries in `associatedDomains` during the cutover
 * so existing builds keep working.
 */
const UNIVERSAL_LINK_HOST = IS_PROD ? 'harpa-pro-api.fly.dev' : 'harpa-pro-api-dev.fly.dev';

const config: ExpoConfig = {
  name: NAME,
  slug: 'harpa-pro-v4',
  owner: 'harpa-pro',
  version,
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/3b2f920d-b7ae-4c84-b9e9-b077b49f1602' },
  orientation: 'portrait',
  scheme: 'harpa',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#e55d22',
  },
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    icon: './assets/icon.png',
    // Universal Links — iOS verifies via AASA at
    // https://<host>/.well-known/apple-app-site-association.
    // See packages/api/src/routes/well-known.ts.
    associatedDomains: [`applinks:${UNIVERSAL_LINK_HOST}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryAddUsageDescription:
        'Allow Harpa Pro to save captured site photos to your camera roll.',
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#e55d22',
    },
    // Android App Links — verified via
    // https://<host>/.well-known/assetlinks.json.
    // `autoVerify=true` makes the system check the manifest on install;
    // unverified links still open the app but show a chooser. Both /p
    // and /r path prefixes are covered so cold taps land on the slug
    // resolver routes in app/(app)/p,r/[slug].tsx.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: UNIVERSAL_LINK_HOST, pathPrefix: '/p/' },
          { scheme: 'https', host: UNIVERSAL_LINK_HOST, pathPrefix: '/r/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    // Permanently hide the floating gear-icon dev-menu button on all builds.
    // Requires a native rebuild to take effect. Resolves FAB-overlap issues in
    // E2E tests and avoids Maestro workarounds. (expo-dev-launcher ≥55.0.30)
    ['expo-dev-client', { toolsButton: false }],
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow Harpa Pro to access your camera to capture site photos for your reports.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: false,
        savePhotosPermission:
          'Allow Harpa Pro to save captured site photos to your camera roll.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    'expo-image',
    'expo-secure-store',
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        url: process.env.SENTRY_URL,
        disableAutoUpload: !SENTRY_AUTH_TOKEN,
      },
    ],
    './plugins/with-fix-build-warnings',
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: '3b2f920d-b7ae-4c84-b9e9-b077b49f1602' },
    appVariant: VARIANT,
    gitCommit: GIT_COMMIT,
    buildTime: BUILD_TIME,
  },
};

export default config;
