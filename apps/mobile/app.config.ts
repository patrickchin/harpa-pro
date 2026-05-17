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

type Variant = 'production' | 'preview' | 'development';

const rawVariant = (process.env.APP_VARIANT ?? 'development') as Variant;
const VARIANT: Variant =
  rawVariant === 'production' || rawVariant === 'preview' ? rawVariant : 'development';

const IS_PROD = VARIANT === 'production';

const NAME = IS_PROD ? 'Harpa Pro' : 'Harpa Pro Dev';
const BUNDLE_ID = IS_PROD ? 'com.harpa.pro' : 'com.harpa.pro.dev';

const config: ExpoConfig = {
  name: NAME,
  slug: 'harpa-pro-v4',
  owner: 'harpa-pro',
  version: '0.0.0',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/3b2f920d-b7ae-4c84-b9e9-b077b49f1602' },
  orientation: 'portrait',
  scheme: 'harpa',
  userInterfaceStyle: 'light',
  newArchEnabled: false,
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
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#e55d22',
    },
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow Harpa Pro to access your camera to capture site photos for your reports.',
        recordAudioAndroid: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: '3b2f920d-b7ae-4c84-b9e9-b077b49f1602' },
    appVariant: VARIANT,
  },
};

export default config;
