import { describe, it, expect } from 'vitest';
import {
  buildReportsSections,
  getReportTitle,
  getReportMeta,
  type ReportListItem,
} from './project-reports-list';

const base: ReportListItem = {
  id: 'rep_1',
  number: 7,
  status: 'draft',
  visitDate: '2026-05-20T00:00:00.000Z',
  createdAt: '2026-05-19T12:00:00.000Z',
  updatedAt: '2026-05-21T09:30:00.000Z',
};

describe('getReportTitle', () => {
  it('falls back to "Report #N" when body is absent', () => {
    expect(getReportTitle(base)).toBe('Report #7');
  });

  it('falls back to "Report #N" when meta.title is empty / whitespace', () => {
    expect(
      getReportTitle({ ...base, body: { meta: { title: '   ' } } }),
    ).toBe('Report #7');
  });

  it('uses meta.title when present', () => {
    expect(
      getReportTitle({
        ...base,
        body: { meta: { title: 'Highland Tower — Phase 2' } },
      }),
    ).toBe('Highland Tower — Phase 2');
  });

  it('trims a non-empty meta.title', () => {
    expect(
      getReportTitle({
        ...base,
        body: { meta: { title: '  Highland Tower  ' } },
      }),
    ).toBe('Highland Tower');
  });
});

describe('getReportMeta', () => {
  it('shows "#N · {visit date} · Draft" for a draft with visit date', () => {
    expect(getReportMeta(base)).toBe('#7 · May 20, 2026 · Draft');
  });

  it('falls back to createdAt when visitDate is null', () => {
    expect(
      getReportMeta({ ...base, visitDate: null }),
    ).toBe('#7 · May 19, 2026 · Draft');
  });

  it('shows "#N · {visit date} · Finalized {updatedAt}" for finalized', () => {
    expect(
      getReportMeta({ ...base, status: 'finalized' }),
    ).toBe('#7 · May 20, 2026 · Finalized May 21, 2026');
  });
});

describe('buildReportsSections', () => {
  const row = (overrides: Partial<ReportListItem>): ReportListItem => ({
    ...base,
    ...overrides,
  });

  it('sorts each section by createdAt desc, ignoring updatedAt', () => {
    const reports: ReportListItem[] = [
      // Older createdAt but newer updatedAt — must NOT jump to the top.
      row({
        id: 'd-old',
        number: 1,
        status: 'draft',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
      }),
      row({
        id: 'd-new',
        number: 2,
        status: 'draft',
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      }),
      row({
        id: 'f-old',
        number: 3,
        status: 'finalized',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      }),
      row({
        id: 'f-new',
        number: 4,
        status: 'finalized',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      }),
    ];
    const sections = buildReportsSections(reports);
    expect(sections.map((s) => s.title)).toEqual(['Drafts', 'Finalized']);
    expect(sections[0]?.data.map((r) => r.id)).toEqual(['d-new', 'd-old']);
    expect(sections[1]?.data.map((r) => r.id)).toEqual(['f-new', 'f-old']);
  });

  it('omits empty sections', () => {
    const sections = buildReportsSections([
      row({ id: 'd1', status: 'draft' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Drafts');
  });
});
