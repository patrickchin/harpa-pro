import { describe, it, expect } from 'vitest';
import { reportBodyToGeneratedReport } from './report-body-adapter';

const emptyMeta = {
  title: null, summary: null, reportType: null,
  visitDate: null, location: null, projectPhase: null,
  riskLevel: null, tags: [],
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
        reportType: 'inspection',
        visitDate: '2026-05-28T00:00:00Z',
        location: 'Block C',
        projectPhase: 'foundation',
        riskLevel: 'medium',
        tags: ['rebar', 'delay'],
      },
    });
    expect(out.report.meta.title).toBe('My Title');
    expect(out.report.meta.summary).toBe('My summary.');
    expect(out.report.meta.reportType).toBe('inspection');
    expect(out.report.meta.visitDate).toBe('2026-05-28T00:00:00Z');
    expect(out.report.meta.location).toBe('Block C');
    expect(out.report.meta.projectPhase).toBe('foundation');
    expect(out.report.meta.riskLevel).toBe('medium');
    expect(out.report.meta.tags).toEqual(['rebar', 'delay']);
  });

  it('renders all-null meta as empty UI fields with empty tags', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.meta.title).toBe('');
    expect(out.report.meta.summary).toBe('');
    expect(out.report.meta.reportType).toBe('site_visit');
    expect(out.report.meta.location).toBeNull();
    expect(out.report.meta.projectPhase).toBeNull();
    expect(out.report.meta.riskLevel).toBeNull();
    expect(out.report.meta.tags).toEqual([]);
  });

  it('shims a legacy body with top-level visitDate', () => {
    const legacyBody: any = {
      visitDate: '2026-04-01T00:00:00Z',
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    };
    const out = reportBodyToGeneratedReport(legacyBody);
    expect(out.report.meta.visitDate).toBe('2026-04-01T00:00:00Z');
    expect(out.report.meta.tags).toEqual([]);
  });
});
