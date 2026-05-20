/**
 * Camera session registry unit tests.
 *
 * Ported from canonical (`../haru3-reports`) — same create → commit
 * → consume round-trip + cancellation semantics.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetCameraSessionsForTests,
  commitCameraSession,
  consumeCameraSession,
  createCameraSession,
  getCameraSession,
} from './camera-session-registry';

afterEach(() => {
  __resetCameraSessionsForTests();
});

describe('camera-session-registry', () => {
  it('round-trips create → commit → consume', () => {
    const id = createCameraSession({ returnTo: '/r/abc', context: { reportId: 'r1' } }, 1);
    expect(getCameraSession(id)).toMatchObject({
      id,
      returnTo: '/r/abc',
      result: null,
    });
    commitCameraSession(id, ['file:///a.jpg', 'file:///b.jpg']);
    const uris = consumeCameraSession(id);
    expect(uris).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    // single-use
    expect(consumeCameraSession(id)).toBeUndefined();
    expect(getCameraSession(id)).toBeUndefined();
  });

  it('consume returns undefined on uncommitted (cancelled) sessions', () => {
    const id = createCameraSession({ returnTo: '/' }, 1);
    expect(consumeCameraSession(id)).toBeUndefined();
    expect(getCameraSession(id)).toBeUndefined();
  });

  it('commit + consume on an unknown id is a no-op', () => {
    expect(() => commitCameraSession('does-not-exist', [])).not.toThrow();
    expect(consumeCameraSession('does-not-exist')).toBeUndefined();
  });

  it('emits unique ids on each create', () => {
    const a = createCameraSession({ returnTo: '/' }, 1);
    const b = createCameraSession({ returnTo: '/' }, 1);
    expect(a).not.toBe(b);
  });
});
