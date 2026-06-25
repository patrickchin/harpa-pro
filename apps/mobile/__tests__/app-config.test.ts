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
});
