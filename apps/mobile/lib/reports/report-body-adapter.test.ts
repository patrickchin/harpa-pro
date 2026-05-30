import { describe, it, expect } from 'vitest';
import { reportBodyToGeneratedReport } from './report-body-adapter';

const emptyMeta = {
  title: null, summary: null, visitDate: null,
};

const baseBody = {
  meta: emptyMeta,
  weather: null, workers: [], materials: [], issues: [],
  nextSteps: [], summarySections: [],
};

describe('reportBodyToGeneratedReport — meta mapping', () => {
  it('copies populated meta 1:1 into the UI shape', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      meta: {
        title: 'My Title',
        summary: 'My summary.',
        visitDate: '2026-05-28T00:00:00Z',
      },
    });
    expect(out.report.meta.title).toBe('My Title');
    expect(out.report.meta.summary).toBe('My summary.');
    expect(out.report.meta.visitDate).toBe('2026-05-28T00:00:00Z');
  });

  it('renders all-null meta as empty UI fields', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.meta.title).toBe('');
    expect(out.report.meta.summary).toBe('');
  });

  it('shims a legacy body with top-level visitDate', () => {
    const legacyBody: any = {
      visitDate: '2026-04-01T00:00:00Z',
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    };
    const out = reportBodyToGeneratedReport(legacyBody);
    expect(out.report.meta.visitDate).toBe('2026-04-01T00:00:00Z');
  });
});
