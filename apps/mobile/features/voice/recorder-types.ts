/**
 * Recorder abstraction used by `VoiceRecorderModal`.
 *
 * The modal does NOT import `expo-audio` directly. Instead it receives a
 * `RecorderFactory` (selected by `pickRecorder()`) so the same modal can
 * be driven by:
 *   • the real `expo-audio` recorder on device/simulator (live mode), or
 *   • the canned `fixtureRecorder` when `EXPO_PUBLIC_USE_FIXTURES === 'true'`,
 *     which fulfils the AGENTS.md fixture-mode promise without requiring a
 *     mic in CI / unit tests.
 *
 * Keeping the abstraction here (rather than reaching for `expo-audio`
 * inside React render) means vitest can exercise the modal under node
 * without needing a JNI shim — see `VoiceRecorderModal.test.tsx`.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4 ; pitfalls §13 (default wiring).
 */

export type RecorderStatus =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'errored';

export interface RecorderSnapshot {
  status: RecorderStatus;
  durationMs: number;
  /** Peak meter in [0, 1] for the most recent sample window. */
  amplitude: number;
  /** Set when status === 'errored'. */
  error?: string;
}

export interface RecorderResult {
  /** `file://…` URI of the finalised recording, suitable for upload. */
  uri: string;
  /** Best-effort mime; the API will sniff if absent. */
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
}

export interface RecorderHandle {
  /** Subscribes to amplitude / duration / status. Returns unsubscribe. */
  subscribe: (listener: (snap: RecorderSnapshot) => void) => () => void;
  /** Snapshot for first paint before any tick fires. */
  getSnapshot: () => RecorderSnapshot;
  /** Idempotent — calling start twice is a no-op after the first. */
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Finalises and returns the file. */
  stop: () => Promise<RecorderResult>;
  /** Discards in-progress audio and resets to `idle`. */
  cancel: () => Promise<void>;
  /**
   * Releases any native resources. Modal calls this on unmount even if
   * `stop()` already fired — implementations must tolerate double-release.
   */
  release: () => void;
}

export type PermissionState = 'granted' | 'denied' | 'unknown';

export interface RecorderFactory {
  /**
   * Returns the current OS-level mic-permission state without prompting.
   * Used to decide whether to render the permission gate or jump straight
   * to recording.
   */
  getPermission: () => Promise<PermissionState>;
  /**
   * Prompts for permission if not already granted. Resolves with the
   * post-prompt state.
   */
  requestPermission: () => Promise<PermissionState>;
  /**
   * Creates a fresh recorder. The modal owns the lifecycle — exactly one
   * recorder per modal-open cycle.
   */
  create: () => RecorderHandle;
  /** Identifies the backend in test snapshots / debug telemetry. */
  readonly name: 'expo-audio' | 'fixture';
}
