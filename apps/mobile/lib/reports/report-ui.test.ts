import { describe, expect, it } from 'vitest';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { getReportStats } from './report-ui';

const baseReport: GeneratedSiteReport = {
  report: {
    meta: { title: '', summary: '', visitDate: null },
    weather: null,
    workers: null,
    materials: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
};

describe('getReportStats', () => {
  it('uses a qualitative worker count when no numeric total exists', () => {
    const stats = getReportStats({
      ...baseReport,
      report: {
        ...baseReport.report,
        workers: {
          totalWorkers: null,
          workerHours: null,
          notes: null,
          roles: [{ role: 'Contractors', count: 'a few', notes: null }],
        },
      },
    });

    expect(stats[0]).toMatchObject({
      value: 'a few',
      label: 'Workers',
    });
  });
});
