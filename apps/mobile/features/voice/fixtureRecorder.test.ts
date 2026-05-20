/**
 * fixtureRecorder unit tests.
 *
 * Exercises the state machine (start → pause → resume → stop)
 * without touching expo-audio. The asset resolver is mocked because
 * `expo-asset` requires an Expo runtime to actually load `require()`d
 * assets; we only care that the contract returns a usable URI string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('expo-asset', () => ({
  Asset: {
    loadAsync: async () => [
      { localUri: 'file:///fixtures/voice-sample.m4a', uri: 'asset:///voice-sample.m4a' },
    ],
  },
}));

// Stub the binary asset require — vitest can't resolve `.m4a` modules.
vi.mock('@/assets/fixtures/voice-sample.m4a', () => ({ default: 1 }));

const { fixtureRecorderFactory } = await import('./fixtureRecorder');
const { __resetPickedRecorderForTests, pickRecorderFactory } = await import('./pickRecorder');

beforeEach(() => {
  __resetPickedRecorderForTests();
});

describe('fixtureRecorderFactory', () => {
  it('reports granted permission without prompting', async () => {
    expect(await fixtureRecorderFactory.getPermission()).toBe('granted');
    expect(await fixtureRecorderFactory.requestPermission()).toBe('granted');
  });

  it('transitions idle → recording → paused → recording → stopped', async () => {
    const handle = fixtureRecorderFactory.create();
    expect(handle.getSnapshot().status).toBe('idle');

    await handle.start();
    expect(handle.getSnapshot().status).toBe('recording');

    await handle.pause();
    expect(handle.getSnapshot().status).toBe('paused');
    const pausedAt = handle.getSnapshot().durationMs;

    await handle.resume();
    expect(handle.getSnapshot().status).toBe('recording');

    const result = await handle.stop();
    expect(handle.getSnapshot().status).toBe('stopped');
    expect(result.uri).toBe('file:///fixtures/voice-sample.m4a');
    expect(result.mimeType).toBe('audio/m4a');
    expect(result.durationSec).toBe(2);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(handle.getSnapshot().durationMs).toBeGreaterThanOrEqual(pausedAt);
    handle.release();
  });

  it('cancel resets to idle and discards in-progress recording', async () => {
    const handle = fixtureRecorderFactory.create();
    await handle.start();
    await new Promise((r) => setTimeout(r, 50));
    await handle.cancel();
    const snap = handle.getSnapshot();
    expect(snap.status).toBe('idle');
    expect(snap.durationMs).toBe(0);
    handle.release();
  });

  it('emits updates to subscribers and stops emitting after unsubscribe', async () => {
    const handle = fixtureRecorderFactory.create();
    const seen: string[] = [];
    const unsub = handle.subscribe((s) => seen.push(s.status));
    await handle.start();
    expect(seen).toContain('recording');
    unsub();
    const before = seen.length;
    await handle.pause();
    // No new emissions after unsubscribe.
    expect(seen.length).toBe(before);
    handle.release();
  });
});

describe('pickRecorderFactory', () => {
  it('returns the fixture backend when EXPO_PUBLIC_USE_FIXTURES is true', () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    __resetPickedRecorderForTests();
    const f = pickRecorderFactory();
    expect(f.name).toBe('fixture');
  });

  it('memoises the selected backend across calls', () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    __resetPickedRecorderForTests();
    expect(pickRecorderFactory()).toBe(pickRecorderFactory());
  });
});
