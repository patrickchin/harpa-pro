import { describe, it, expect } from 'vitest';
import {
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
