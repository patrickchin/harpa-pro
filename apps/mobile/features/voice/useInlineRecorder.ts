/**
 * `useInlineRecorder` — Phase H state owner for the WhatsApp/Telegram
 * style inline voice recorder.
 *
 * Replaces the modal-driven `VoiceRecorderModal` capture flow with a
 * tap-to-start / tap-to-send / tap-to-cancel surface that lives inside
 * `GenerateReportInputBar`. The recorder lifecycle (factory, handle,
 * permission, snapshot, error, scrolling amplitude history) is owned
 * here so the inline strip is a pure presentation component and the
 * provider can also surface a single permission-denied `AppDialogSheet`
 * without re-implementing the state machine.
 *
 * State machine:
 *
 *   idle
 *     └─ start()
 *        ├─ permission already granted → recording
 *        ├─ permission unknown → prompt → granted? → recording
 *        └─ denied → idle + permission='denied' (provider opens dialog)
 *   recording
 *     ├─ stopAndCapture() → returns RecorderResult, → idle
 *     └─ cancel()          → discards local audio, → idle
 *   errored (start() threw)
 *     └─ dismissError() → idle
 *
 * Amplitude history: a ring buffer of the last `HISTORY_SIZE`
 * amplitude samples (0..1). The recorder polls amplitude every
 * ~200 ms; 30 samples ≈ 6 s of visible waveform — enough to give the
 * "audio is alive" feedback that WhatsApp's scrolling bars provide,
 * while keeping re-renders cheap.
 *
 * Default wiring (AGENTS.md hard rule #5 / Pitfall 13): the integration
 * test (`useInlineRecorder.test.ts`) drives the real fixture factory
 * — no stubs on the happy path. The `factory` parameter exists only so
 * tests can install a faulty factory to exercise the errored branch.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4–§D6.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  PermissionState,
  RecorderFactory,
  RecorderHandle,
  RecorderResult,
  RecorderSnapshot,
} from './recorder-types';
import { pickRecorderFactory } from './pickRecorder';

export const HISTORY_SIZE = 30;

const IDLE_SNAPSHOT: RecorderSnapshot = {
  status: 'idle',
  durationMs: 0,
  amplitude: 0,
};

export interface UseInlineRecorderOptions {
  /** Test-only seam. Defaults to `pickRecorderFactory()`. */
  factory?: RecorderFactory;
}

export interface UseInlineRecorderApi {
  /** True while a recording is in progress (after permission grant). */
  isRecording: boolean;
  /** Latest snapshot from the underlying recorder handle. */
  snapshot: RecorderSnapshot;
  /**
   * Most recent amplitude samples, oldest → newest. Length is bounded
   * by `HISTORY_SIZE`; while idle the array is empty.
   */
  historyBars: readonly number[];
  /** Permission state, updated on every `start()` attempt. */
  permission: PermissionState;
  /** Set when `start()` throws or the recorder errors mid-capture. */
  error: string | null;
  /**
   * Begin recording. Idempotent — calling while already recording is a
   * no-op. Updates `permission`; if not granted, leaves the recorder
   * `idle` and lets the caller render the permission dialog.
   */
  start: () => Promise<void>;
  /**
   * Stop and finalise the recording. Resolves with the file the
   * caller can hand to `useVoiceNotePipeline.capture()`. Resolves
   * with `null` if called while not recording (defensive — UI
   * should disable Send in that case anyway).
   */
  stopAndCapture: () => Promise<RecorderResult | null>;
  /** Discard the in-flight recording and return to `idle`. */
  cancel: () => Promise<void>;
  /** Clear `error` (e.g. after the user dismisses the dialog). */
  dismissError: () => void;
}

export function useInlineRecorder(
  options: UseInlineRecorderOptions = {},
): UseInlineRecorderApi {
  const factory = useMemo<RecorderFactory>(
    () => options.factory ?? pickRecorderFactory(),
    [options.factory],
  );

  const handleRef = useRef<RecorderHandle | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(IDLE_SNAPSHOT);
  const [historyBars, setHistoryBars] = useState<readonly number[]>([]);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [error, setError] = useState<string | null>(null);

  // Cleanup on unmount: release handle so native resources don't leak
  // if the provider unmounts mid-recording (e.g. user backs out of the
  // generate screen). The discarded file lives in the recorder cache
  // dir until the OS reaps it — we don't reach for expo-file-system
  // (deprecated) to delete it eagerly.
  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      handleRef.current?.release();
      handleRef.current = null;
    };
  }, []);

  function teardown() {
    unsubRef.current?.();
    unsubRef.current = null;
    handleRef.current?.release();
    handleRef.current = null;
  }

  const start = useCallback(async () => {
    if (isRecording) return;
    setError(null);
    setHistoryBars([]);
    setSnapshot(IDLE_SNAPSHOT);

    let current = await factory.getPermission();
    if (current !== 'granted') {
      current = await factory.requestPermission();
    }
    setPermission(current);
    if (current !== 'granted') {
      // Leave recorder idle; provider will render the permission dialog.
      return;
    }

    try {
      const handle = factory.create();
      handleRef.current = handle;
      // Subscribe before start() so the very first poll lands in our
      // history buffer. Each `recording` snapshot pushes one bar.
      unsubRef.current = handle.subscribe((snap) => {
        setSnapshot(snap);
        if (snap.status === 'recording') {
          setHistoryBars((prev) => {
            const next = prev.length >= HISTORY_SIZE
              ? prev.slice(prev.length - HISTORY_SIZE + 1)
              : prev.slice();
            next.push(snap.amplitude);
            return next;
          });
        }
        if (snap.status === 'errored' && snap.error) {
          setError(snap.error);
          setIsRecording(false);
        }
      });
      await handle.start();
      setIsRecording(true);
    } catch (err) {
      teardown();
      setIsRecording(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [factory, isRecording]);

  const stopAndCapture = useCallback(async (): Promise<RecorderResult | null> => {
    const handle = handleRef.current;
    if (!handle || !isRecording) return null;
    try {
      const result = await handle.stop();
      teardown();
      setIsRecording(false);
      setSnapshot(IDLE_SNAPSHOT);
      setHistoryBars([]);
      return result;
    } catch (err) {
      teardown();
      setIsRecording(false);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [isRecording]);

  const cancel = useCallback(async () => {
    const handle = handleRef.current;
    if (handle) {
      try {
        await handle.cancel();
      } catch {
        // Best effort — recorder may not have actually started yet.
      }
    }
    teardown();
    setIsRecording(false);
    setSnapshot(IDLE_SNAPSHOT);
    setHistoryBars([]);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isRecording,
    snapshot,
    historyBars,
    permission,
    error,
    start,
    stopAndCapture,
    cancel,
    dismissError,
  };
}
