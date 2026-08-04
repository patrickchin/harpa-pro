import { describe, expect, it } from 'vitest';

import config from '../app.config';

describe('app config', () => {
  it('keeps the initial App Store build phone-only until iPad screenshots exist', () => {
    expect(config.ios?.supportsTablet).toBe(false);
  });

  it('declares the expo-audio recording permission without background audio modes', () => {
    const audioPlugin = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio',
    );

    expect(audioPlugin).toEqual([
      'expo-audio',
      {
        microphonePermission:
          'Allow Harpa Pro to record voice notes for your site reports.',
        recordAudioAndroid: true,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ]);
  });

  it('pins the SDK 56 minimum iOS deployment target in generated projects', () => {
    const buildPropertiesPlugin = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildPropertiesPlugin).toEqual([
      'expo-build-properties',
      { ios: { deploymentTarget: '16.4' } },
    ]);
  });

  it('preserves the branded splash screen through the SDK 56 config plugin', () => {
    const splashPlugin = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(splashPlugin).toEqual([
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#e55d22',
      },
    ]);
  });
});
