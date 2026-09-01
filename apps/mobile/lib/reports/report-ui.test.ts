import { describe, expect, it } from 'vitest';
import { reports } from '@harpa/api-contract';

import { getReportStats } from './report-ui';

const baseReport: reports.ReportBody = {
  meta: { title: null, summary: null, visitDate: null },
  weather: null,
  workers: [],
  materials: [],
  issues: [],
  nextSteps: [],
  summarySections: [],
};

describe('getReportStats', () => {
  it('uses a qualitative worker count when no numeric total exists', () => {
    const stats = getReportStats({
      ...baseReport,
      workers: [{ role: 'Contractors', count: 'a few', hours: null, notes: null }],
    });

    expect(stats[0]).toMatchObject({
      value: 'a few',
      label: 'Workers',
    });
  });

  it('sums numeric worker counts and warns when issues exist', () => {
    const stats = getReportStats({
      ...baseReport,
      workers: [
        { role: 'Electrician', count: '2', hours: '8', notes: null },
        { role: 'Carpenter', count: '3', hours: '9', notes: null },
      ],
      materials: [{ name: 'Cement', quantity: '10', unit: 'bags', status: null, condition: null, notes: null }],
      issues: [{ title: 'Leak', severity: 'high', description: 'Found in basement', action: null }],
    });

    expect(stats).toEqual([
      { value: 5, label: 'Workers', tone: 'default' },
      { value: 1, label: 'Material', tone: 'default' },
      { value: 1, label: 'Issue', tone: 'warning' },
    ]);
  });
});
