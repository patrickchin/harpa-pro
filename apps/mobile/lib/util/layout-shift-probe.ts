/**
 * Layout-shift probe — dev-only instrumentation for measuring how far
 * landmark nodes move when a screen transitions from its skeleton
 * state to its loaded state.
 *
 * Pattern (per `docs/v4/arch-mobile-skeletons.md`):
 *
 *   const onLayout = useLayoutShiftProbe('reports-list:first-row');
 *   <Card onLayout={onLayout} ... />
 *
 * The same `id` is attached to the landmark on both the skeleton tree
 * and the loaded tree. After two paints, `dumpShiftReport()` returns a
 * CSV summary of `{id, frames, maxDeltaY, maxDeltaHeight, score}` per
 * landmark. A "shift score" of ~0 means the loaded frame lands on top
 * of the skeleton frame.
 *
 * Recording always runs (so tests can assert deterministically); the
 * `console.log` per-frame trace is gated on `__DEV__` AND
 * `EXPO_PUBLIC_LAYOUT_PROBE=true` so normal dev sessions stay quiet.
 *
 * Production builds compile this out as dead code — `__DEV__` is a
 * Metro / Hermes constant — except for the bookkeeping map, which is
 * tiny and only populated if a screen happens to call the hook.
 */
import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { env } from '@/lib/config/env';

export interface Measurement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Frame index for this id, starting at 0. */
  frame: number;
}

export interface ShiftSummary {
  id: string;
  frames: number;
  maxDeltaY: number;
  maxDeltaHeight: number;
  /** |maxDeltaY| * width — a rough perceptual weight. */
  score: number;
}

const measurements = new Map<string, Measurement[]>();

function loggingEnabled(): boolean {
  // `__DEV__` is a Metro/Hermes global. In vitest it's defined as the
  // string `'false'` via vitest.config.ts → `define: { __DEV__: ... }`.
  // Reading it through `globalThis` keeps this file portable.
  const devFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
  return Boolean(devFlag) && env.EXPO_PUBLIC_LAYOUT_PROBE;
}

/** Hook: returns an `onLayout` handler that records a measurement. */
export function useLayoutShiftProbe(
  id: string,
): (event: LayoutChangeEvent) => void {
  // Keep the same callback identity across renders so attaching it to
  // an `onLayout` prop doesn't re-trigger layout on every render.
  const idRef = useRef(id);
  idRef.current = id;
  return useCallback((event: LayoutChangeEvent) => {
    recordLayout(idRef.current, event.nativeEvent.layout);
  }, []);
}

/**
 * Imperative recorder used by `useLayoutShiftProbe` and exposed for
 * tests + manual instrumentation (e.g. dev tools).
 */
export function recordLayout(
  id: string,
  layout: { x: number; y: number; width: number; height: number },
): Measurement {
  const list = measurements.get(id) ?? [];
  const next: Measurement = {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    frame: list.length,
  };
  list.push(next);
  measurements.set(id, list);

  if (loggingEnabled() && list.length >= 2) {
    const prev = list[list.length - 2]!;
    const dy = next.y - prev.y;
    const dh = next.height - prev.height;
    if (Math.abs(dy) > 0.5 || Math.abs(dh) > 0.5) {
      // eslint-disable-next-line no-console
      console.log(
        `[layout-shift] ${id} frame=${next.frame} Δy=${dy.toFixed(1)} Δh=${dh.toFixed(1)}`,
      );
    }
  }
  return next;
}

/** Returns a snapshot of all recorded measurements (test helper). */
export function getMeasurements(id: string): readonly Measurement[] {
  return measurements.get(id) ?? [];
}

/** Wipes the module-level store. Call between scenarios in tests. */
export function resetShiftReport(): void {
  measurements.clear();
}

/** Computes per-id summary across all currently recorded frames. */
export function summariseShiftReport(): ShiftSummary[] {
  const summaries: ShiftSummary[] = [];
  for (const [id, frames] of measurements.entries()) {
    let maxDeltaY = 0;
    let maxDeltaHeight = 0;
    let maxWidth = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      const dy = Math.abs(b.y - a.y);
      const dh = Math.abs(b.height - a.height);
      if (dy > maxDeltaY) maxDeltaY = dy;
      if (dh > maxDeltaHeight) maxDeltaHeight = dh;
      if (b.width > maxWidth) maxWidth = b.width;
    }
    summaries.push({
      id,
      frames: frames.length,
      maxDeltaY,
      maxDeltaHeight,
      score: maxDeltaY * maxWidth,
    });
  }
  summaries.sort((a, b) => b.score - a.score);
  return summaries;
}

/** Returns a CSV blob suitable for pasting into the audit doc. */
export function dumpShiftReport(): string {
  const rows = summariseShiftReport();
  const header = 'id,frames,maxDeltaY,maxDeltaHeight,score';
  const body = rows
    .map(
      (r) =>
        `${r.id},${r.frames},${r.maxDeltaY.toFixed(2)},${r.maxDeltaHeight.toFixed(2)},${r.score.toFixed(2)}`,
    )
    .join('\n');
  return `${header}\n${body}`;
}
