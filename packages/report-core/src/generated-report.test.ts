import { describe, it, expect } from 'vitest';
import { normalizeGeneratedReportPayload } from './generated-report';

describe('GeneratedSiteReportSchema — meta envelope', () => {
  it('accepts populated meta', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: 'T',
          summary: 'S',
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
    expect(out!.report.meta.title).toBe('T');
    expect(out!.report.meta.summary).toBe('S');
  });

  it('strips unknown keys (e.g. legacy tags)', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: { title: 'T', summary: '', visitDate: null, tags: ['a', 'b'] },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
    expect(out).not.toBeNull();
    expect((out!.report.meta as Record<string, unknown>).tags).toBeUndefined();
  });
});

describe('GeneratedSiteReportSchema — workers', () => {
  it('preserves free-text role counts from generated reports', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: { title: 'T', summary: '', visitDate: null },
        weather: null,
        workers: {
          totalWorkers: null,
          workerHours: null,
          notes: null,
          roles: [{ role: 'Contractors', count: 'a few', notes: null }],
        },
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.report.workers!.roles[0]!.count).toBe('a few');
  });
});
