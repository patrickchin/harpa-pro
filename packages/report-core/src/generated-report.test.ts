import { describe, it, expect } from 'vitest';
import { normalizeGeneratedReportPayload } from './generated-report';

describe('GeneratedSiteReportSchema — meta envelope', () => {
  it('accepts populated meta with tags', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: 'T',
          summary: 'S',
          visitDate: null,
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
    expect(out!.report.meta.title).toBe('T');
    expect(out!.report.meta.summary).toBe('S');
    expect(out!.report.meta.tags).toEqual(['a', 'b']);
  });

  it('defaults tags to empty array when omitted', () => {
    const out = normalizeGeneratedReportPayload({
      report: {
        meta: { title: 'T', summary: '', visitDate: null },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.report.meta.tags).toEqual([]);
  });
});
