/**
 * Tests for the layout-shift probe.
 *
 * We exercise the imperative recorder directly (no RN layout engine
 * needed). Hook coverage is implicit via the screens that consume it.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  dumpShiftReport,
  getMeasurements,
  recordLayout,
  resetShiftReport,
  summariseShiftReport,
} from './layout-shift-probe';

describe('layout-shift-probe', () => {
  beforeEach(() => {
    resetShiftReport();
  });

  it('records sequential frames per id', () => {
    recordLayout('a', { x: 0, y: 100, width: 320, height: 40 });
    recordLayout('a', { x: 0, y: 188, width: 320, height: 40 });
    const frames = getMeasurements('a');
    expect(frames).toHaveLength(2);
    expect(frames[0]?.frame).toBe(0);
    expect(frames[1]?.frame).toBe(1);
  });

  it('summarises Δy / Δheight and computes a weighted score', () => {
    recordLayout('hdr', { x: 0, y: 0, width: 320, height: 56 });
    recordLayout('hdr', { x: 0, y: 0, width: 320, height: 56 });
    recordLayout('row', { x: 0, y: 100, width: 320, height: 40 });
    recordLayout('row', { x: 0, y: 188, width: 320, height: 48 });

    const summaries = summariseShiftReport();
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));
    expect(byId.hdr?.maxDeltaY).toBe(0);
    expect(byId.row?.maxDeltaY).toBe(88);
    expect(byId.row?.maxDeltaHeight).toBe(8);
    expect(byId.row?.score).toBe(88 * 320);

    // Sorted desc by score → the offending row comes first.
    expect(summaries[0]?.id).toBe('row');
  });

  it('dumpShiftReport produces a CSV with a header and one row per id', () => {
    recordLayout('a', { x: 0, y: 0, width: 100, height: 10 });
    recordLayout('a', { x: 0, y: 4, width: 100, height: 10 });
    const csv = dumpShiftReport();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,frames,maxDeltaY,maxDeltaHeight,score');
    expect(lines[1]).toBe('a,2,4.00,0.00,400.00');
  });

  it('resetShiftReport wipes recorded frames', () => {
    recordLayout('a', { x: 0, y: 0, width: 10, height: 10 });
    resetShiftReport();
    expect(getMeasurements('a')).toEqual([]);
  });
});
