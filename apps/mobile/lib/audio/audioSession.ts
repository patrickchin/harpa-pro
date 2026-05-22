/**
 * audioSession — central iOS audio-session policy for the app.
 *
 * Voice notes (record + playback) want WhatsApp/Telegram semantics:
 *
 * - Recording **pauses** any music playing in another app (Spotify,
 *   Apple Music, podcasts) and resumes it when recording stops.
 * - Voice-note playback also pauses background music (you don't want
 *   Spotify mixed into your transcript review) and resumes when the
 *   note ends or the user pauses / stops it.
 * - Voice notes play **through the speaker** (not the ear receiver)
 *   and play **even when the iPhone silent switch is on** — same
 *   contract as every other voice-messaging app.
 *
 * iOS achieves "pause Spotify then resume" via two ingredients:
 *   1. `setAudioModeAsync({ interruptionMode: 'doNotMix' })` so our
 *      AVAudioSession category requests **exclusive** audio focus.
 *   2. `setIsAudioActiveAsync(false)` when we're done. iOS sends the
 *      `AVAudioSessionInterruptionTypeEnded` notification with
 *      `.notifyOthersOnDeactivation`, which is the cue Spotify et al.
 *      use to resume.
 *
 * Without (2) — i.e. leaving the session active "just in case" —
 * Spotify will resume only when the app is fully killed.
 *
 * **Android** uses the same `interruptionMode` knob; we don't gate
 * the calls per-platform because expo-audio already no-ops the
 * iOS-only fields on Android. We do skip the calls in the fixture
 * mock recorder path (which doesn't load expo-audio at all) by
 * lazy-requiring the module.
 *
 * Reference-counted: `beginPlayback()` + `beginRecording()` increment
 * an active-clients counter; the matching `end*()` decrements. Only
 * the last `end*()` deactivates the session. This keeps overlapping
 * lifecycles (e.g. starting a new recording before the previous
 * playback has fully torn down) from leaving Spotify paused
 * indefinitely.
 */
import { Platform } from 'react-native';

type AudioModule = typeof import('expo-audio');

let cachedModule: AudioModule | null = null;
function loadModule(): AudioModule | null {
  if (cachedModule) return cachedModule;
  try {
    cachedModule = require('expo-audio') as AudioModule;
    return cachedModule;
  } catch {
    // Tests / fixture mode that never load the native module — skip.
    return null;
  }
}

/** Test seam: reset module cache + active counter. */
export function __resetAudioSessionForTests(overrides?: {
  module?: AudioModule | null;
}) {
  cachedModule = overrides?.module ?? null;
  activePlaybackClients = 0;
  activeRecordingClients = 0;
}

let activePlaybackClients = 0;
let activeRecordingClients = 0;

function totalActive(): number {
  return activePlaybackClients + activeRecordingClients;
}

/**
 * Acquire the playback audio session. Safe to call multiple times
 * (refcounted); each call must be paired with `endPlayback()`.
 */
export async function beginPlayback(): Promise<void> {
  const wasIdle = totalActive() === 0;
  activePlaybackClients += 1;
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.setAudioModeAsync({
      // Play voice notes even when the iPhone silent switch is on —
      // matches WhatsApp / Telegram / Voice Memos behaviour.
      playsInSilentMode: true,
      // Take exclusive audio focus so Spotify et al. pause.
      interruptionMode: 'doNotMix',
      // Pure playback: no mic, route through speaker.
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
    if (wasIdle) {
      await mod.setIsAudioActiveAsync(true);
    }
  } catch {
    // Don't let an audio-session config error break playback itself.
  }
}

/**
 * Release the playback audio session. When the last
 * playback/recording client ends, deactivates the session so iOS
 * notifies other audio apps to resume.
 */
export async function endPlayback(): Promise<void> {
  if (activePlaybackClients === 0) return;
  activePlaybackClients -= 1;
  if (totalActive() > 0) return;
  await deactivateSession();
}

/**
 * Acquire the recording audio session. Switches the AVAudioSession
 * category to `.playAndRecord` (required for the mic) and takes
 * exclusive focus so background music pauses for the duration of
 * the recording.
 */
export async function beginRecording(): Promise<void> {
  const wasIdle = totalActive() === 0;
  activeRecordingClients += 1;
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: true,
      // Even though `.playAndRecord` defaults to the ear receiver,
      // we want the level-meter preview audible through the speaker
      // (if we ever play it back without removing the mic first).
      shouldRouteThroughEarpiece: false,
    });
    if (wasIdle) {
      await mod.setIsAudioActiveAsync(true);
    }
  } catch {
    // Recorder will surface a clearer error if start() actually fails.
  }
}

/**
 * Release the recording audio session. Reverts to the playback
 * profile so any voice-note playback that follows uses the right
 * category; when the last client ends, deactivates the session so
 * background music resumes.
 */
export async function endRecording(): Promise<void> {
  if (activeRecordingClients === 0) return;
  activeRecordingClients -= 1;
  const mod = loadModule();
  if (mod) {
    try {
      // Revert allowsRecording so the next playback isn't stuck in
      // the playAndRecord category (which routes through the ear
      // receiver by default on iOS).
      await mod.setAudioModeAsync({ allowsRecording: false });
    } catch {
      // Best-effort.
    }
  }
  if (totalActive() > 0) return;
  await deactivateSession();
}

async function deactivateSession(): Promise<void> {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.setIsAudioActiveAsync(false);
  } catch {
    // Best-effort. Don't crash the app if iOS rejects the deactivate
    // (it does occasionally during fast play→pause→play cycles).
  }
  // Android no-op on these calls historically; nothing to revert.
  void Platform.OS;
}
