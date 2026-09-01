import { describe, expect, it } from 'vitest';
import type { reports } from '@harpa/api-contract';

import {
  coerceReportBody,
  createEmptyReportBody,
  dateInputValue,
  displayReportTitle,
  getWorkerDisplaySummary,
  isoDateFromInput,
  updateReportBody,
} from './report-body';

const reportBodyFixture: reports.ReportBody = {
  meta: {
    title: 'Highland Tower progress report',
    summary: 'East footing work continued and the concrete pour remains on schedule.',
    visitDate: '2026-07-28T00:00:00.000Z',
  },
  weather: {
    condition: 'Cloudy',
    temperature: '18°C',
    wind: '5 mph',
    impact: 'No material impact.',
  },
  workers: [
    {
      role: 'Carpenter',
      count: '4',
      hours: '8',
      notes: 'Formwork on grid B.',
    },
  ],
  materials: [
    {
      name: 'Concrete C30',
      quantity: '12',
      unit: 'm³',
      status: 'Delivered',
      condition: 'Good',
      notes: 'Arrived at 09:15.',
    },
  ],
  issues: [
    {
      title: 'Delivery access',
      severity: 'medium',
      description: 'Gate access is narrow for the next delivery.',
      action: 'Confirm the smaller truck.',
    },
  ],
  nextSteps: ['Complete the east footing pour.'],
  summarySections: [
    {
      title: 'Site conditions',
      body: 'The access road was wet but remained passable.',
    },
  ],
};

describe('canonical mobile ReportBody helpers', () => {
  it('creates the exact canonical wire shape for an empty report body', () => {
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

  it('preserves pre-meta persisted bodies while lifting their legacy visit date', () => {
    const { meta: _meta, ...legacyBody } = reportBodyFixture;
    const legacyPersistedBody = {
      ...legacyBody,
      visitDate: '2026-07-27T00:00:00.000Z',
    };

    expect(coerceReportBody(legacyPersistedBody, '2026-07-29T00:00:00.000Z')).toEqual({
      body: {
        ...legacyBody,
        meta: {
          title: null,
          summary: null,
          visitDate: '2026-07-27T00:00:00.000Z',
        },
      },
      malformed: false,
    });
  });

  it('keeps untouched large-report branches structurally shared while editing', () => {
    const largeBody: reports.ReportBody = {
      ...reportBodyFixture,
      issues: Array.from({ length: 200 }, (_, index) => ({
        title: `Issue ${index + 1}`,
        severity: 'medium',
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

  it('derives worker display state from canonical rows without a second model', () => {
    expect(
      getWorkerDisplaySummary({
        ...reportBodyFixture,
        workers: [
          { role: 'Foreman', count: '4', hours: '8', notes: null },
          { role: 'Contractor', count: 'a few', hours: null, notes: null },
          { role: 'Welder', count: null, hours: '6.5', notes: null },
        ],
      }),
    ).toEqual({
      totalWorkers: 4,
      totalWorkersLabel: '4',
      workerHours: '14.5h total',
      hasQualitativeCounts: true,
    });
  });

  it('preserves qualitative worker counts when no numeric total exists', () => {
    expect(
      getWorkerDisplaySummary({
        ...reportBodyFixture,
        workers: [{ role: 'Contractor', count: 'a few', hours: null, notes: 'Waiting on crew' }],
      }),
    ).toEqual({
      totalWorkers: null,
      totalWorkersLabel: 'a few',
      workerHours: null,
      hasQualitativeCounts: true,
    });
  });

  it('formats title and visit date from the canonical body', () => {
    expect(displayReportTitle(reportBodyFixture)).toBe('Highland Tower progress report');
    expect(displayReportTitle(null)).toBe('Untitled report');
    expect(dateInputValue('2026-07-28T00:00:00.000Z')).toBe('2026-07-28');
    expect(isoDateFromInput('2026-07-29')).toBe('2026-07-29T00:00:00.000Z');
  });
});
