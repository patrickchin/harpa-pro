/**
 * Selects the active recorder backend.
 *
 * Honours fixture input mode: `EXPO_PUBLIC_USE_FIXTURES === 'true'` or
 * `EXPO_PUBLIC_SCREENSHOT_MODE === 'true'`. In either case it returns the
 * canned `fixtureRecorderFactory` and never loads `expo-audio` (which would
 * require native modules that aren't present in unit-test / node
 * environments). Screenshot mode intentionally keeps seeded API data live
 * while using deterministic native-input replacements.
 *
 * Tests may pass a `factory` option to `useInlineRecorder`
 * directly, in which case this selector is bypassed.
 *
 * NOTE: reads the screenshot/fixture env flags directly (rather than the
 * parsed `lib/env`) because `fixtureRecorder.test.ts` mutates them at
 * runtime to exercise both backends from a single test file — `lib/env`
 * is parsed once at module load.
 */
import type { RecorderFactory } from './recorder-types';
import { fixtureRecorderFactory } from './fixtureRecorder';

let cached: RecorderFactory | null = null;

export function pickRecorderFactory(): RecorderFactory {
  if (cached) return cached;
  const useFixtureInputs =
    process.env.EXPO_PUBLIC_USE_FIXTURES === 'true' ||
    process.env.EXPO_PUBLIC_SCREENSHOT_MODE === 'true';
  if (useFixtureInputs) {
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
