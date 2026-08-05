import { describe, expect, it } from 'vitest';

import { coerceReportBody, createEmptyReportBody, updateReportBody } from '../report-body';
import { reportBodyFixture } from './fixtures';

describe('canonical ReportBody helpers', () => {
  it('creates the exact canonical wire shape for an empty report', () => {
    expect(createEmptyReportBody('2026-07-29T00:00:00.000Z')).toEqual({
      meta: {
        title: null,
        summary: null,
        visitDate: '2026-07-29T00:00:00.000Z',
      },
      weather: null,
      workers: [],
      materials: [],
      issues: [],
      nextSteps: [],
      summarySections: [],
    });
  });

  it('does not introduce a desktop-only document shape while editing', () => {
    const next = updateReportBody(reportBodyFixture, (draft) => {
      draft.meta.summary = 'Keyboard-edited summary';
      draft.workers.push({
        role: 'Electrician',
        count: 'a few',
        hours: null,
        notes: null,
      });
    });

    expect(next.meta.summary).toBe('Keyboard-edited summary');
    expect(next.workers[1]?.count).toBe('a few');
    expect(Object.keys(next).sort()).toEqual(
      ['issues', 'materials', 'meta', 'nextSteps', 'summarySections', 'weather', 'workers'].sort(),
    );
    expect(reportBodyFixture.meta.summary).not.toBe('Keyboard-edited summary');
  });

  it('keeps untouched large-report branches structurally shared', () => {
    const largeBody = {
      ...reportBodyFixture,
      issues: Array.from({ length: 200 }, (_, index) => ({
        title: `Issue ${index + 1}`,
        severity: 'medium' as const,
        description: `Site observation ${index + 1}`,
        action: null,
      })),
      summarySections: Array.from({ length: 200 }, (_, index) => ({
        title: `Section ${index + 1}`,
        body: `Detailed report copy ${index + 1}`,
      })),
    };
    const next = updateReportBody(largeBody, (draft) => {
      draft.meta.title = 'A focused title edit';
    });

    expect(next).not.toBe(largeBody);
    expect(next.meta).not.toBe(largeBody.meta);
    expect(next.workers).toBe(largeBody.workers);
    expect(next.materials).toBe(largeBody.materials);
    expect(next.issues).toBe(largeBody.issues);
    expect(next.summarySections).toBe(largeBody.summarySections);
  });

  it('keeps valid bodies and safely replaces malformed payloads', () => {
    expect(coerceReportBody(reportBodyFixture, null)).toEqual({
      body: reportBodyFixture,
      malformed: false,
    });

    const coerced = coerceReportBody(
      {
        meta: { title: 'Broken partial body' },
        workers: 'not-an-array',
      },
      '2026-07-29T00:00:00.000Z',
    );
    expect(coerced.malformed).toBe(true);
    expect(coerced.body.meta.visitDate).toBe('2026-07-29T00:00:00.000Z');
    expect(coerced.body.workers).toEqual([]);
  });
});
