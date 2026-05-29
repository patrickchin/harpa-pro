import { describe, it, expect } from 'vitest';
import { reportBody } from './reports.js';

describe('reportBody with meta envelope', () => {
  it('accepts a populated meta object', () => {
    const result = reportBody.safeParse({
      meta: {
        title: 'Site Visit — Wet Weather',
        summary: 'Wet conditions delayed concrete pour.',
        visitDate: '2026-05-28T00:00:00Z',
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts all-null meta fields', () => {
    const result = reportBody.safeParse({
      meta: { title: null, summary: null, visitDate: null },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('strips top-level visitDate (moved into meta)', () => {
    const result = reportBody.safeParse({
      visitDate: '2026-05-28T00:00:00Z',
      meta: { title: null, summary: null, visitDate: null },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).visitDate).toBeUndefined();
    }
  });
});
