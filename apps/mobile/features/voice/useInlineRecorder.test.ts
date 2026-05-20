/**
 * `useInlineRecorder` default-wiring integration test (node-only).
 *
 * Pitfall 13 compliance: this drives the real `fixtureRecorderFactory`
 * end-to-end (no DI stubs on the happy path) and asserts the contract
 * the hook depends on:
 *
 *   - permission flows resolve before `start()` opens the handle
 *   - `start()` emits a `recording` snapshot that the hook turns into
 *     bars
 *   - `stop()` resolves a `RecorderResult` whose fields are what
 *     `useVoiceNotePipeline.runVoiceNotePipeline` expects (uri,
 *     mimeType, durationSec, sizeBytes > 0)
 *   - `cancel()` rewinds to idle without throwing
 *
 * The React state plumbing in `useInlineRecorder` itself is intentionally
 * NOT exercised here — react-test-renderer is broken on React 19.2
 * across the repo. The Maestro flow `p3-15-voice-record.yaml` covers
 * the rendered behaviour end-to-end on a real device/simulator.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4–§D6, pitfalls §13.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('expo-asset', () => ({
  Asset: {
    loadAsync: async () => [
      { localUri: 'file:///fixtures/voice-sample.m4a', uri: 'asset:///voice-sample.m4a' },
    ],
  },
}));
vi.mock('@/assets/fixtures/voice-sample.m4a', () => ({ default: 1 }));

const { fixtureRecorderFactory } = await import('./fixtureRecorder');
const { HISTORY_SIZE } = await import('./useInlineRecorder');
import type { RecorderSnapshot } from './recorder-types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useInlineRecorder default wiring (recorder factory contract)', () => {
  it('start → stop produces a RecorderResult consumable by the pipeline', async () => {
    expect(await fixtureRecorderFactory.getPermission()).toBe('granted');
    const handle = fixtureRecorderFactory.create();
    await handle.start();
    const result = await handle.stop();
    expect(result.uri).toBe('file:///fixtures/voice-sample.m4a');
    expect(result.mimeType).toBe('audio/m4a');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.durationSec).toBeGreaterThan(0);
    handle.release();
  });

  it('subscribe → start feeds a bounded ring of amplitude samples', async () => {
    const handle = fixtureRecorderFactory.create();
    const bars: number[] = [];
    const unsub = handle.subscribe((snap: RecorderSnapshot) => {
      if (snap.status === 'recording') {
        // Mirror useInlineRecorder.start()'s subscriber: push amp,
        // bound at HISTORY_SIZE.
        const next = bars.length >= HISTORY_SIZE
          ? bars.slice(bars.length - HISTORY_SIZE + 1)
          : bars.slice();
        next.push(snap.amplitude);
        bars.length = 0;
        bars.push(...next);
      }
    });
    await handle.start();
    // Let the fixture emit ~HISTORY_SIZE+10 samples (TICK_MS=100ms).
    await new Promise((r) => setTimeout(r, (HISTORY_SIZE + 10) * 100));
    unsub();
    await handle.cancel();
    handle.release();
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.length).toBeLessThanOrEqual(HISTORY_SIZE);
    // Every bar lives in [0, 1] so the waveform layout never crashes.
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('cancel after start rewinds to idle without leaking the handle', async () => {
    const handle = fixtureRecorderFactory.create();
    await handle.start();
    await handle.cancel();
    expect(handle.getSnapshot().status).toBe('idle');
    expect(handle.getSnapshot().durationMs).toBe(0);
    // Double-release must be a no-op (useInlineRecorder may call it
    // on both an explicit cancel and unmount cleanup).
    handle.release();
    handle.release();
  });

  it('HISTORY_SIZE is a sane positive integer the waveform can render', () => {
    expect(Number.isInteger(HISTORY_SIZE)).toBe(true);
    expect(HISTORY_SIZE).toBeGreaterThan(0);
    expect(HISTORY_SIZE).toBeLessThanOrEqual(100);
  });
});
