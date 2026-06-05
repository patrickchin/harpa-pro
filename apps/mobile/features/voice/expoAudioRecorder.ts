/**
 * Real `expo-audio` recorder factory. Wraps `createAudioRecorder` +
 * `requestRecordingPermissionsAsync` behind our `RecorderFactory`
 * abstraction so `InlineVoiceRecorder` can be unit-tested via the
 * fixture backend.
 *
 * IMPORTANT: this module imports `expo-audio` at module scope and so
 * must NOT be imported from vitest unit tests. `pickRecorder()` performs
 * the dynamic require so the lazy load happens at the call site (which
 * vitest stubs via `EXPO_PUBLIC_USE_FIXTURES=true`).
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4.
 */
// eslint plugin @typescript-eslint not loaded for these checks; the
// inlined unused identifiers are intentional documentation of the
// public surface we deliberately do not call from this wrapper.
import {
  createAudioPlayer as _unused,
  // We instantiate the recorder imperatively (not via the
  // `useAudioRecorder` hook) so the modal can own the lifecycle across
  // mount/unmount without re-creating native resources.
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  AudioModule,
} from 'expo-audio';
import type {
  PermissionState,
  RecorderFactory,
  RecorderHandle,
  RecorderResult,
  RecorderSnapshot,
} from './recorder-types';

import { beginRecording, endRecording } from '@/lib/audio/audioSession';

void _unused;

const TICK_MS = 200;

/**
 * Read the byte size of a file:// URI without `expo-file-system`
 * (deprecated). RN's `fetch()` supports file URIs and the resulting
 * Blob exposes `.size`. Returns `0` on any failure so the upstream
 * statSize guard can short-circuit with a clear error instead of
 * crashing the recorder.
 */
async function readFileSize(uri: string): Promise<number> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blob.size;
  } catch {
    return 0;
  }
}

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
          // Acquire the recording audio session — pauses background
          // music (Spotify et al.) and switches iOS into the
          // playAndRecord category so the mic actually works. Must
          // happen BEFORE constructing the recorder on iOS.
          await beginRecording();
          // We pass the same options object to BOTH the constructor
          // AND `prepareToRecordAsync()`:
          //
          //   • The constructor configures the native recorder's
          //     top-level flags. CRITICAL: `isMeteringEnabled` is
          //     captured at construction time on BOTH platforms —
          //     iOS sets `AVAudioRecorder.meteringEnabled = YES`,
          //     Android stashes it into `AudioRecorder.kt:41
          //     `private var meteringEnabled = options.isMeteringEnabled`
          //     (and the prepare path builds a fresh MediaRecorder
          //     but never re-reads it). `prepareToRecordAsync()`
          //     therefore can't turn metering on after the fact, and
          //     without it `status.metering` is undefined and the
          //     waveform bars stay flat (HARPA-PRO-D follow-up,
          //     2026-06-06).
          //
          //   • `prepareToRecordAsync()` is the only path where the
          //     `expo-audio` JS shim runs `createRecordingOptions()`,
          //     flattening `{ android: { audioEncoder: 'aac' } }` to
          //     a top-level `audioEncoder` the native module reads.
          //     Without this the Android `MediaRecorder` falls through
          //     to its `AudioEncoder.DEFAULT` (AMR-NB / 3GPP) and
          //     Groq Whisper rejects the upload with HTTP 500
          //     (HARPA-PRO-D, 2026-06-05). Matches the
          //     `arch-voice-pipeline.md` §D5 contract ("audio/m4a
          //     (AAC-LC), 16 kHz mono").
          const recordingOptions = {
            extension: '.m4a',
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
            android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
            ios: { extension: '.m4a', outputFormat: 'mpeg4aac', audioQuality: 0x40 },
            isMeteringEnabled: true,
          } as const;
          recorder = new AudioModule.AudioRecorder(recordingOptions);
          await recorder.prepareToRecordAsync(recordingOptions);
        }
        recorder.record();
        emit({ status: 'recording', error: undefined });
        pollTimer = setInterval(poll, TICK_MS);
      } catch (err) {
        // If session acquisition succeeded but recorder construction
        // failed, release the session so background music can resume.
        await endRecording().catch(() => undefined);
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
      const rawDurationSec = recorder.currentTime ?? 0;
      // API contract requires int seconds ≥ 1 (createVoiceNoteRequest);
      // recorder.currentTime is fractional, and iOS simulators sometimes
      // report ~0 for very short taps. Clamp + round so the upload
      // pipeline doesn't 400 on validation.
      const durationSec = Math.max(1, Math.round(rawDurationSec));
      if (!uri) throw new Error('expoAudioRecorder: recorder produced no uri');
      const sizeBytes = await readFileSize(uri);
      emit({ status: 'stopped', durationMs: durationSec * 1000 });
      // Release the recording audio session — reverts allowsRecording
      // so subsequent playback uses the right category, and (when no
      // other audio client is active) deactivates the session with
      // notifyOthersOnDeactivation so background music resumes.
      await endRecording().catch(() => undefined);
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
        // No file deletion: `expo-file-system` is deprecated and the
        // OS cleans the recorder's cache directory eventually. A few
        // KB of discarded m4a is an acceptable trade.
        recorder = null;
      }
      await endRecording().catch(() => undefined);
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
