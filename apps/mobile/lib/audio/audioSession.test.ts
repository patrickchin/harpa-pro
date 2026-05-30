/**
 * audioSession — unit tests for the refcounted audio-session helpers.
 *
 * The real iOS behaviour is exercised on-device; in node we verify
 * the public contract: `beginPlayback()` / `beginRecording()` call
 * `setAudioModeAsync` with the WhatsApp-style policy (doNotMix +
 * playsInSilentMode), they activate the session on the first call,
 * and only the LAST matching `end*()` deactivates it (the bit that
 * tells iOS to notify other audio apps to resume).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  __resetAudioSessionForTests,
  beginPlayback,
  beginRecording,
  endPlayback,
  endRecording,
} from './audioSession';

type Mode = {
  playsInSilentMode?: boolean;
  interruptionMode?: string;
  allowsRecording?: boolean;
  shouldRouteThroughEarpiece?: boolean;
};

function makeMockModule() {
  const modeCalls: Mode[] = [];
  const activeCalls: boolean[] = [];
  return {
    modeCalls,
    activeCalls,
    module: {
      setAudioModeAsync: vi.fn(async (m: Mode) => {
        modeCalls.push(m);
      }),
      setIsAudioActiveAsync: vi.fn(async (active: boolean) => {
        activeCalls.push(active);
      }),
    } as unknown as typeof import('expo-audio'),
  };
}

describe('audioSession', () => {
  beforeEach(() => {
    __resetAudioSessionForTests();
  });

  it('begin/endPlayback activates and deactivates the session', async () => {
    const { module, modeCalls, activeCalls } = makeMockModule();
    __resetAudioSessionForTests({ module });

    await beginPlayback();
    expect(modeCalls).toHaveLength(1);
    expect(modeCalls[0]).toMatchObject({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
    });
    expect(activeCalls).toEqual([true]);

    await endPlayback();
    expect(activeCalls).toEqual([true, false]);
  });

  it('refcounts overlapping playback clients so only the last endPlayback deactivates', async () => {
    const { module, activeCalls } = makeMockModule();
    __resetAudioSessionForTests({ module });

    await beginPlayback();
    await beginPlayback();
    expect(activeCalls).toEqual([true]);

    await endPlayback();
    expect(activeCalls).toEqual([true]); // still held by the second client

    await endPlayback();
    expect(activeCalls).toEqual([true, false]);
  });

  it('recording + playback overlap leaves the session active until both end', async () => {
    const { module, activeCalls } = makeMockModule();
    __resetAudioSessionForTests({ module });

    await beginPlayback();
    await beginRecording();
    expect(activeCalls).toEqual([true]);

    await endPlayback();
    expect(activeCalls).toEqual([true]);

    await endRecording();
    expect(activeCalls).toEqual([true, false]);
  });

  it('endRecording reverts allowsRecording=false even when other clients are still active', async () => {
    const { module, modeCalls } = makeMockModule();
    __resetAudioSessionForTests({ module });

    await beginRecording();
    expect(modeCalls.at(-1)).toMatchObject({ allowsRecording: true });

    // Another client (a playback session) is still active — endRecording
    // must still revert allowsRecording so the next play() runs in the
    // pure-playback category (not playAndRecord, which routes to the
    // ear receiver by default).
    await beginPlayback();
    await endRecording();
    expect(modeCalls.at(-1)).toMatchObject({ allowsRecording: false });
  });

  it('begin/end mismatch never goes negative', async () => {
    const { module, activeCalls } = makeMockModule();
    __resetAudioSessionForTests({ module });

    // endPlayback with no matching begin — should be a safe no-op,
    // not crash with a negative-refcount deactivate.
    await endPlayback();
    await endRecording();
    expect(activeCalls).toEqual([]);
  });

  it('swallows expo-audio errors so the recording/playback path stays alive', async () => {
    const broken = {
      setAudioModeAsync: vi.fn(async () => {
        throw new Error('AVAudioSession busy');
      }),
      setIsAudioActiveAsync: vi.fn(async () => {
        throw new Error('cannot deactivate');
      }),
    } as unknown as typeof import('expo-audio');
    __resetAudioSessionForTests({ module: broken });

    // Each of these would have thrown without the try/catch in audioSession.
    await expect(beginPlayback()).resolves.toBeUndefined();
    await expect(endPlayback()).resolves.toBeUndefined();
    await expect(beginRecording()).resolves.toBeUndefined();
    await expect(endRecording()).resolves.toBeUndefined();
  });
});
