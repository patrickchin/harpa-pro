/**
 * Selects the active recorder backend.
 *
 * Honours `EXPO_PUBLIC_USE_FIXTURES === 'true'` — when set, returns the
 * canned `fixtureRecorderFactory` and never loads `expo-audio` (which
 * would require native modules that aren't present in unit-test / node
 * environments). This is the runtime end of the AGENTS.md fixture-mode
 * promise; see `docs/v4/arch-voice-pipeline.md §D6`.
 *
 * Tests may pass a `recorderFactory` prop to `VoiceRecorderModal`
 * directly, in which case this selector is bypassed.
 */
import type { RecorderFactory } from './recorder-types';
import { fixtureRecorderFactory } from './fixtureRecorder';

let cached: RecorderFactory | null = null;

export function pickRecorderFactory(): RecorderFactory {
  if (cached) return cached;
  const useFixtures = process.env.EXPO_PUBLIC_USE_FIXTURES === 'true';
  if (useFixtures) {
    cached = fixtureRecorderFactory;
    return cached;
  }
  // Defer the expo-audio require to keep node test environments clean.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { expoAudioRecorderFactory } = require('./expoAudioRecorder') as typeof import('./expoAudioRecorder');
  cached = expoAudioRecorderFactory;
  return cached;
}

/** Test-only: reset the memoised factory between test cases. */
export function __resetPickedRecorderForTests(): void {
  cached = null;
}
