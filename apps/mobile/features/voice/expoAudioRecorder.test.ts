import { describe, expect, it, vi } from 'vitest';

const expoAudioMock = vi.hoisted(() => {
  const constants = require('expo-audio/build/RecordingConstants.js') as typeof import('expo-audio/build/RecordingConstants');
  return {
    createAudioPlayer: vi.fn(),
    RecordingPresets: constants.RecordingPresets,
    IOSOutputFormat: constants.IOSOutputFormat,
    AudioQuality: constants.AudioQuality,
    requestRecordingPermissionsAsync: vi.fn(),
    getRecordingPermissionsAsync: vi.fn(),
    AudioModule: {
      AudioRecorder: class {
        prepareToRecordAsync = vi.fn(async () => {});
        record = vi.fn();
        pause = vi.fn();
        stop = vi.fn(async () => {});
        getStatus = vi.fn(() => ({ metering: -30 }));
        isRecording = false;
        currentTime = 0;
        uri = 'file:///recording.m4a';
      },
    },
  };
});

vi.mock('expo-audio', () => expoAudioMock);
vi.mock('@/lib/audio/audioSession', () => ({
  beginRecording: vi.fn(async () => {}),
  endRecording: vi.fn(async () => {}),
}));

const { HARPA_RECORDING_OPTIONS } = await import('./expoAudioRecorder');
const { IOSOutputFormat } = await import('expo-audio/build/RecordingConstants.js');

describe('expoAudioRecorder recording options', () => {
  it('uses the Expo SDK AAC iOS output format constant', () => {
    expect(HARPA_RECORDING_OPTIONS.ios.outputFormat).toBe(IOSOutputFormat.MPEG4AAC);
    expect(HARPA_RECORDING_OPTIONS.ios.outputFormat).toBe('aac ');
    expect(HARPA_RECORDING_OPTIONS.ios.outputFormat).not.toBe('mpeg4aac');
  });
});
