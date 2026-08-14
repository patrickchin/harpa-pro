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
 * across the repo. The active Maestro voice coverage lives in
 * `modules/09-voice-notes.yaml`, which covers the rendered behaviour
 * end-to-end on a real device/simulator.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4–§D6, pitfalls §13.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

import type { RecorderFactory, RecorderHandle, RecorderSnapshot } from './recorder-types';
import type { UseInlineRecorderApi } from './useInlineRecorder';

const sentryMock = vi.hoisted(() => ({
  captureRecorderStartFailure: vi.fn(),
}));

vi.mock('@/lib/telemetry/Sentry', () => sentryMock);

vi.mock('expo-asset', () => ({
  Asset: {
    loadAsync: async () => [
      { localUri: 'file:///fixtures/voice-sample.m4a', uri: 'asset:///voice-sample.m4a' },
    ],
  },
}));
vi.mock('@/assets/fixtures/voice-sample.m4a', () => ({ default: 1 }));

const { fixtureRecorderFactory } = await import('./fixtureRecorder');
const {
  HISTORY_SIZE,
  RECORDER_START_FAILED_MESSAGE,
  useInlineRecorder,
} = await import('./useInlineRecorder');

let tree: TestRenderer.ReactTestRenderer | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (tree) {
    act(() => {
      tree!.unmount();
    });
    tree = null;
  }
});

function failingStartFactory(error: unknown): RecorderFactory {
  let snapshot: RecorderSnapshot = { status: 'idle', durationMs: 0, amplitude: 0 };
  let listener: ((snap: RecorderSnapshot) => void) | null = null;
  const handle: RecorderHandle = {
    subscribe(l) {
      listener = l;
      l(snapshot);
      return () => {
        listener = null;
      };
    },
    getSnapshot() {
      return snapshot;
    },
    async start() {
      snapshot = {
        status: 'errored',
        durationMs: 0,
        amplitude: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      listener?.(snapshot);
      throw error;
    },
    async pause() {},
    async resume() {},
    async stop() {
      throw new Error('stop should not be called');
    },
    async cancel() {},
    release: vi.fn(),
  };

  return {
    name: 'expo-audio',
    async getPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
    create() {
      return handle;
    },
  };
}

function renderInlineRecorder(factory: RecorderFactory): { current: () => UseInlineRecorderApi } {
  let api: UseInlineRecorderApi | null = null;
  function Probe() {
    api = useInlineRecorder({ factory });
    return null;
  }
  act(() => {
    tree = TestRenderer.create(React.createElement(Probe));
  });
  return {
    current() {
      if (!api) throw new Error('recorder api not rendered');
      return api;
    },
  };
}

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

  it('maps native start failures to friendly copy while preserving diagnostics', async () => {
    const nativeError = new Error(
      "Calling the 'prepareToRecordAsync' function has failed → Caused by: Audio recording error: Failed to prepare recorder",
    );
    const probe = renderInlineRecorder(failingStartFactory(nativeError));

    await act(async () => {
      await probe.current().start();
    });

    expect(probe.current().isRecording).toBe(false);
    expect(probe.current().userErrorMessage).toBe(RECORDER_START_FAILED_MESSAGE);
    expect(probe.current().error).toContain('prepareToRecordAsync');
    expect(probe.current().error).toContain('Failed to prepare recorder');
    expect(sentryMock.captureRecorderStartFailure).toHaveBeenCalledWith(nativeError, {
      permission: 'granted',
      recorderFactory: 'expo-audio',
    });
  });
});
