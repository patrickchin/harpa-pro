/**
 * Real `expo-audio` recorder factory. Wraps `createAudioRecorder` +
 * `requestRecordingPermissionsAsync` behind our `RecorderFactory`
 * abstraction so `VoiceRecorderModal` can be unit-tested via the
 * fixture backend.
 *
 * IMPORTANT: this module imports `expo-audio` at module scope and so
 * must NOT be imported from vitest unit tests. `pickRecorder()` performs
 * the dynamic require so the lazy load happens at the call site (which
 * vitest stubs via `EXPO_PUBLIC_USE_FIXTURES=true`).
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import {
  createAudioPlayer as _unused,
  // We instantiate the recorder imperatively (not via the
  // `useAudioRecorder` hook) so the modal can own the lifecycle across
  // mount/unmount without re-creating native resources.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  AudioModule,
} from 'expo-audio';
import type {
  PermissionState,
  RecorderFactory,
  RecorderHandle,
  RecorderResult,
  RecorderSnapshot,
} from './recorder-types';

void _unused;

const TICK_MS = 200;

function toPermissionState(granted: boolean | undefined, canAskAgain?: boolean): PermissionState {
  if (granted) return 'granted';
  if (canAskAgain === undefined) return 'unknown';
  return 'denied';
}

function createExpoAudioHandle(): RecorderHandle {
  // Lazily instantiate the native recorder on `start()` so a modal that
  // is dismissed without recording leaves no native handle behind.
  // `AudioModule.AudioRecorder` is the constructor used by
  // `createAudioRecorder` under the hood.
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  let snapshot: RecorderSnapshot = { status: 'idle', durationMs: 0, amplitude: 0 };
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<(s: RecorderSnapshot) => void>();

  function emit(next: Partial<RecorderSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l(snapshot);
  }

  function poll() {
    if (!recorder) return;
    try {
      const st = recorder.getStatus();
      emit({
        durationMs: Math.round((recorder.currentTime ?? 0) * 1000),
        amplitude:
          // metering is in dBFS [-160, 0]; map to [0, 1]
          typeof st.metering === 'number'
            ? Math.max(0, Math.min(1, (st.metering + 60) / 60))
            : snapshot.amplitude,
        status: recorder.isRecording ? 'recording' : snapshot.status,
      });
    } catch (err) {
      emit({ status: 'errored', error: String(err) });
    }
  }

  function clearTimer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return {
    subscribe(l) {
      listeners.add(l);
      l(snapshot);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    async start() {
      if (snapshot.status === 'recording') return;
      try {
        if (!recorder) {
          // iOS requires `allowsRecording: true` BEFORE prepare; Android
          // ignores. Mode is global, so we set then immediately revert on
          // stop().
          if (Platform.OS === 'ios') {
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          }
          recorder = new AudioModule.AudioRecorder({
            extension: '.m4a',
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
            android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
            ios: { extension: '.m4a', outputFormat: 'mpeg4aac', audioQuality: 0x40 },
            isMeteringEnabled: true,
          });
          await recorder.prepareToRecordAsync();
        }
        recorder.record();
        emit({ status: 'recording', error: undefined });
        pollTimer = setInterval(poll, TICK_MS);
      } catch (err) {
        emit({ status: 'errored', error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
    async pause() {
      if (!recorder || snapshot.status !== 'recording') return;
      recorder.pause();
      clearTimer();
      emit({ status: 'paused' });
    },
    async resume() {
      if (!recorder || snapshot.status !== 'paused') return;
      recorder.record();
      pollTimer = setInterval(poll, TICK_MS);
      emit({ status: 'recording' });
    },
    async stop(): Promise<RecorderResult> {
      if (!recorder) {
        throw new Error('expoAudioRecorder: stop() called before start()');
      }
      clearTimer();
      await recorder.stop();
      const uri = recorder.uri;
      const durationSec = recorder.currentTime ?? 0;
      if (!uri) throw new Error('expoAudioRecorder: recorder produced no uri');
      const info = await FileSystem.getInfoAsync(uri);
      const sizeBytes = info.exists && 'size' in info ? Number(info.size ?? 0) : 0;
      emit({ status: 'stopped', durationMs: Math.round(durationSec * 1000) });
      // Reset the global audio mode so playback in other parts of the
      // app doesn't get routed to the record-only profile.
      if (Platform.OS === 'ios') {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
      return { uri, mimeType: 'audio/m4a', sizeBytes, durationSec };
    },
    async cancel() {
      clearTimer();
      if (recorder) {
        try {
          await recorder.stop();
        } catch {
          // best-effort — recorder may not have been started yet
        }
        const uri = recorder.uri;
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
        recorder = null;
      }
      if (Platform.OS === 'ios') {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
      emit({ status: 'idle', durationMs: 0, amplitude: 0, error: undefined });
    },
    release() {
      clearTimer();
      listeners.clear();
      // Native handle is owned by JS object; allowing it to GC is enough.
      recorder = null;
    },
  };
}

export const expoAudioRecorderFactory: RecorderFactory = {
  name: 'expo-audio',
  async getPermission(): Promise<PermissionState> {
    const res = await getRecordingPermissionsAsync();
    return toPermissionState(res.granted, res.canAskAgain);
  },
  async requestPermission(): Promise<PermissionState> {
    const res = await requestRecordingPermissionsAsync();
    return toPermissionState(res.granted, res.canAskAgain);
  },
  create: createExpoAudioHandle,
};
