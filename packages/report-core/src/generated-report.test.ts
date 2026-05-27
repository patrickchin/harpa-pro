import { describe, it, expect } from 'vitest';
import { normalizeGeneratedReportPayload } from './generated-report';

describe('GeneratedSiteReportSchema — meta extensions', () => {
  it('accepts location/projectPhase/riskLevel/tags', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: 'T',
          summary: 'S',
          reportType: 'site_visit',
          visitDate: null,
          location: 'Site A',
          projectPhase: 'foundation',
          riskLevel: 'medium',
          tags: ['a', 'b'],
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.report.meta.location).toBe('Site A');
    expect(out!.report.meta.projectPhase).toBe('foundation');
    expect(out!.report.meta.riskLevel).toBe('medium');
    expect(out!.report.meta.tags).toEqual(['a', 'b']);
  });

  it('defaults missing extended fields to null / empty array', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: 'T',
          summary: '',
          reportType: 'site_visit',
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.report.meta.location).toBeNull();
    expect(out!.report.meta.projectPhase).toBeNull();
    expect(out!.report.meta.riskLevel).toBeNull();
    expect(out!.report.meta.tags).toEqual([]);
  });
});
