/**
 * Unit tests for the per-target apply/delete/seed mappers used by the
 * report edit modal. These keep the modal ignorant of report-body
 * mutation details.
 */
import { describe, expect, it } from 'vitest';
import { reports } from '@harpa/api-contract';

import { applyDelete, applyEdit, seedDraft } from './apply';

const SAMPLE_REPORT_BODY: reports.ReportBody = {
  meta: {
    title: 'Highland Tower — Visit 1',
    summary: 'Steady progress.',
    visitDate: '2026-05-12T00:00:00.000Z',
  },
  weather: {
    condition: 'Cloudy with afternoon showers',
    temperature: '14°C',
    wind: '12 km/h SW',
    impact: 'Light rain shifted pour window.',
  },
  workers: [
    { role: 'Steel fixer', count: '3', hours: '24', notes: 'East footing rebar' },
    { role: 'Carpenter', count: '2', hours: '16', notes: 'Formwork prep' },
  ],
  materials: [
    {
      name: 'Concrete C30',
      quantity: '12',
      unit: 'm³',
      status: 'Delivered',
      condition: 'OK',
      notes: 'Delivery 30 min late.',
    },
  ],
  issues: [
    {
      title: 'Concrete delivery delay',
      severity: 'medium',
      description: 'Delivery 30 min late; pour pushed back.',
      action: 'Confirm tomorrow’s delivery slot with supplier.',
    },
  ],
  nextSteps: ['Close east footing pour.'],
  summarySections: [{ title: 'Site Conditions', body: 'Access road wet but passable.' }],
};

describe('apply.ts', () => {
  describe('seedDraft', () => {
    it('returns the meta slice', () => {
      const seeded = seedDraft(SAMPLE_REPORT_BODY, { kind: 'meta' });
      expect(seeded).toEqual(SAMPLE_REPORT_BODY.meta);
    });

    it('returns a default weather shape when weather is null', () => {
      const blank = {
        ...SAMPLE_REPORT_BODY,
        weather: null,
      };
      expect(seedDraft(blank, { kind: 'weather' })).toEqual({
        condition: null,
        temperature: null,
        wind: null,
        impact: null,
      });
    });

    it('returns an empty workers list when workers are absent', () => {
      const blank = {
        ...SAMPLE_REPORT_BODY,
        workers: [],
      };
      expect(seedDraft(blank, { kind: 'workers' })).toEqual([]);
    });

    it('returns shallow copies for list slices', () => {
      const materials = seedDraft(SAMPLE_REPORT_BODY, {
        kind: 'materials',
      });
      expect(materials).toEqual(SAMPLE_REPORT_BODY.materials);
      expect(materials).not.toBe(SAMPLE_REPORT_BODY.materials);

      const nextSteps = seedDraft(SAMPLE_REPORT_BODY, {
        kind: 'nextSteps',
      });
      expect(nextSteps).toEqual(SAMPLE_REPORT_BODY.nextSteps);
      expect(nextSteps).not.toBe(SAMPLE_REPORT_BODY.nextSteps);
    });

    it('returns the addressed issue and section by index', () => {
      const issue = seedDraft(SAMPLE_REPORT_BODY, {
        kind: 'issue',
        index: 0,
      });
      expect(issue).toBe(SAMPLE_REPORT_BODY.issues[0]);

      const section = seedDraft(SAMPLE_REPORT_BODY, {
        kind: 'section',
        index: 0,
      });
      expect(section).toBe(SAMPLE_REPORT_BODY.summarySections[0]);
    });
  });

  describe('applyEdit', () => {
    it('updates meta in-place', () => {
      const next = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'meta' },
        {
          ...SAMPLE_REPORT_BODY.meta,
          title: 'New title',
        },
      );
      expect(next.meta.title).toBe('New title');
      expect(next).not.toBe(SAMPLE_REPORT_BODY);
    });

    it('replaces materials wholesale', () => {
      const next = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'materials' },
        [
          {
            name: 'Steel rebar',
            quantity: '100',
            unit: 'pcs',
            condition: null,
            status: null,
            notes: null,
          },
        ],
      );
      expect(next.materials).toHaveLength(1);
      expect(next.materials[0]?.name).toBe('Steel rebar');
    });

    it('replaces nextSteps wholesale', () => {
      const next = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'nextSteps' },
        ['Pour foundation tomorrow'],
      );
      expect(next.nextSteps).toEqual(['Pour foundation tomorrow']);
    });

    it('updates a single issue by index', () => {
      const original = SAMPLE_REPORT_BODY.issues[0]!;
      const next = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'issue', index: 0 },
        { ...original, title: 'Edited issue title' },
      );
      expect(next.issues[0]?.title).toBe('Edited issue title');
      expect(next.issues.length).toBe(SAMPLE_REPORT_BODY.issues.length);
    });

    it('updates a single section by index', () => {
      const original = SAMPLE_REPORT_BODY.summarySections[0]!;
      const next = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'section', index: 0 },
        { ...original, title: 'Edited section title' },
      );
      expect(next.summarySections[0]?.title).toBe('Edited section title');
      expect(next.summarySections.length).toBe(SAMPLE_REPORT_BODY.summarySections.length);
    });

    it('updates weather and workers slices', () => {
      const w = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'weather' },
        {
          condition: 'Rainy',
          temperature: '15°C',
          wind: null,
          impact: null,
        },
      );
      expect(w.weather?.condition).toBe('Rainy');

      const wk = applyEdit(
        SAMPLE_REPORT_BODY,
        { kind: 'workers' },
        [{ role: 'Electrician', count: '12', hours: '96', notes: null }],
      );
      expect(wk.workers[0]?.count).toBe('12');
    });
  });

  describe('applyDelete', () => {
    it('removes an issue by index', () => {
      const before = SAMPLE_REPORT_BODY.issues.length;
      const next = applyDelete(SAMPLE_REPORT_BODY, {
        kind: 'issue',
        index: 0,
      });
      expect(next.issues.length).toBe(before - 1);
    });

    it('removes a section by index', () => {
      const before = SAMPLE_REPORT_BODY.summarySections.length;
      const next = applyDelete(SAMPLE_REPORT_BODY, {
        kind: 'section',
        index: 0,
      });
      expect(next.summarySections.length).toBe(before - 1);
    });

    it('returns the report unchanged for non-per-item targets', () => {
      const next = applyDelete(SAMPLE_REPORT_BODY, { kind: 'meta' });
      expect(next).toBe(SAMPLE_REPORT_BODY);
    });
  });
});
