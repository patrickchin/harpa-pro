/**
 * `processImageForUpload` — quality/dimension ladder behaviour.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_BYTES,
  MAX_DIMENSION,
  SERVER_MAX_BYTES,
  processImageForUpload,
  type ProcessImageDeps,
} from './process-image';

function makeDeps(plan: Array<{ size: number }>) {
  const sizes = [...plan];
  const calls: Array<{ width: number | undefined; quality: number }> = [];
  const deps: ProcessImageDeps = {
    manipulate: vi.fn(async (uri: string, actions, options) => {
      const resize = (actions as Array<{ resize?: { width?: number } }>).find(
        (a) => 'resize' in a,
      );
      calls.push({
        width: resize?.resize?.width,
        quality: (options as { compress: number }).compress,
      });
      return { uri: `${uri}.${calls.length}.jpg`, width: 100, height: 100 };
    }),
    statSize: vi.fn(() => {
      const next = sizes.shift();
      if (next === undefined) throw new Error('no more sizes');
      return next.size;
    }),
  };
  return { deps, calls };
}

describe('processImageForUpload', () => {
  it('returns the first pass that fits the ≤2 MB target', async () => {
    const { deps, calls } = makeDeps([{ size: MAX_BYTES - 1 }]);
    const out = await processImageForUpload('file:///orig.jpg', deps);
    expect(out.sizeBytes).toBe(MAX_BYTES - 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.width).toBe(MAX_DIMENSION);
    expect(calls[0]?.quality).toBe(0.85);
  });

  it('walks the quality ladder until the target is met', async () => {
    const { deps, calls } = makeDeps([
      { size: MAX_BYTES + 1000 }, // q=0.85 still too big
      { size: MAX_BYTES + 100 }, // q=0.7 still too big
      { size: MAX_BYTES - 5 }, // q=0.55 fits
    ]);
    const out = await processImageForUpload('file:///orig.jpg', deps);
    expect(out.sizeBytes).toBe(MAX_BYTES - 5);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55]);
    expect(calls.every((c) => c.width === MAX_DIMENSION)).toBe(true);
  });

  it('shrinks width once the quality ladder bottoms out', async () => {
    const { deps, calls } = makeDeps(
      Array.from({ length: 6 }, () => ({ size: MAX_BYTES + 1 })),
    );
    // All passes exceed the soft target; the function returns the
    // smallest (last) result without throwing because we're under the
    // server's hard 50 MB ceiling.
    const out = await processImageForUpload('file:///orig.jpg', deps);
    expect(out.sizeBytes).toBe(MAX_BYTES + 1);
    expect(calls).toHaveLength(6);
    // First 4 share the 2048 width; passes 5+ shrink.
    const widths = calls.map((c) => c.width!);
    expect(widths.slice(0, 4)).toEqual([
      MAX_DIMENSION,
      MAX_DIMENSION,
      MAX_DIMENSION,
      MAX_DIMENSION,
    ]);
    expect(widths[4]!).toBeLessThan(MAX_DIMENSION);
    expect(widths[5]!).toBeLessThan(widths[4]!);
  });

  it('throws when the smallest result still exceeds the 50 MB server cap', async () => {
    const { deps } = makeDeps(
      Array.from({ length: 6 }, () => ({ size: SERVER_MAX_BYTES + 1 })),
    );
    await expect(processImageForUpload('file:///orig.jpg', deps)).rejects.toThrow(
      /50 MB server limit/,
    );
  });
});
