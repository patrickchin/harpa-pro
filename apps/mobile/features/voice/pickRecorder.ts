/**
 * Selects the active recorder backend.
 *
 * Honours `EXPO_PUBLIC_USE_FIXTURES === 'true'` — when set, returns the
 * canned `fixtureRecorderFactory` and never loads `expo-audio` (which
 * would require native modules that aren't present in unit-test / node
 * environments). This is the runtime end of the AGENTS.md fixture-mode
 * promise; see `docs/v4/arch-voice-pipeline.md §D6`.
 *
 * Tests may pass a `factory` option to `useInlineRecorder`
 * directly, in which case this selector is bypassed.
 */
import type { RecorderFactory } from './recorder-types';
import { fixtureRecorderFactory } from './fixtureRecorder';
import { env } from '../../lib/env';

let cached: RecorderFactory | null = null;

export function pickRecorderFactory(): RecorderFactory {
  if (cached) return cached;
  if (env.EXPO_PUBLIC_USE_FIXTURES) {
    cached = fixtureRecorderFactory;
    return cached;
  }
  const { expoAudioRecorderFactory } = require('./expoAudioRecorder') as typeof import('./expoAudioRecorder');
  cached = expoAudioRecorderFactory;
  return cached;
}

/** Test-only: reset the memoised factory between test cases. */
export function __resetPickedRecorderForTests(): void {
  cached = null;
}
