/**
 * Unit tests for the per-target apply/delete/seed mappers used by the
 * report edit modal. These wrap `lib/reports/report-edit-helpers.ts`
 * so the modal owns no schema knowledge.
 */
import { describe, expect, it } from 'vitest';

import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';

import { applyDelete, applyEdit, seedDraft } from './apply';

describe('apply.ts', () => {
  describe('seedDraft', () => {
    it('returns the meta slice', () => {
      const seeded = seedDraft(SAMPLE_GENERATED_REPORT, { kind: 'meta' });
      expect(seeded).toEqual(SAMPLE_GENERATED_REPORT.report.meta);
    });

    it('returns a default weather shape when weather is null', () => {
      const blank = {
        ...SAMPLE_GENERATED_REPORT,
        report: { ...SAMPLE_GENERATED_REPORT.report, weather: null },
      };
      expect(seedDraft(blank, { kind: 'weather' })).toEqual({
        conditions: null,
        temperature: null,
        wind: null,
        impact: null,
      });
    });

    it('returns a default workers shape when workers is null', () => {
      const blank = {
        ...SAMPLE_GENERATED_REPORT,
        report: { ...SAMPLE_GENERATED_REPORT.report, workers: null },
      };
      expect(seedDraft(blank, { kind: 'workers' })).toEqual({
        totalWorkers: null,
        workerHours: null,
        notes: null,
        roles: [],
      });
    });

    it('returns shallow copies for list slices', () => {
      const materials = seedDraft(SAMPLE_GENERATED_REPORT, {
        kind: 'materials',
      });
      expect(materials).toEqual(SAMPLE_GENERATED_REPORT.report.materials);
      expect(materials).not.toBe(SAMPLE_GENERATED_REPORT.report.materials);

      const nextSteps = seedDraft(SAMPLE_GENERATED_REPORT, {
        kind: 'nextSteps',
      });
      expect(nextSteps).toEqual(SAMPLE_GENERATED_REPORT.report.nextSteps);
      expect(nextSteps).not.toBe(SAMPLE_GENERATED_REPORT.report.nextSteps);
    });

    it('returns the addressed issue and section by index', () => {
      const issue = seedDraft(SAMPLE_GENERATED_REPORT, {
        kind: 'issue',
        index: 0,
      });
      expect(issue).toBe(SAMPLE_GENERATED_REPORT.report.issues[0]);

      const section = seedDraft(SAMPLE_GENERATED_REPORT, {
        kind: 'section',
        index: 0,
      });
      expect(section).toBe(SAMPLE_GENERATED_REPORT.report.sections[0]);
    });
  });

  describe('applyEdit', () => {
    it('updates meta in-place', () => {
      const next = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'meta' },
        {
          ...SAMPLE_GENERATED_REPORT.report.meta,
          title: 'New title',
        },
      );
      expect(next.report.meta.title).toBe('New title');
      expect(next).not.toBe(SAMPLE_GENERATED_REPORT);
    });

    it('replaces materials wholesale', () => {
      const next = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'materials' },
        [
          {
            name: 'Steel rebar',
            quantity: '100',
            quantityUnit: 'pcs',
            condition: null,
            status: null,
            notes: null,
          },
        ],
      );
      expect(next.report.materials).toHaveLength(1);
      expect(next.report.materials[0]?.name).toBe('Steel rebar');
    });

    it('replaces nextSteps wholesale', () => {
      const next = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'nextSteps' },
        ['Pour foundation tomorrow'],
      );
      expect(next.report.nextSteps).toEqual(['Pour foundation tomorrow']);
    });

    it('updates a single issue by index', () => {
      const original = SAMPLE_GENERATED_REPORT.report.issues[0]!;
      const next = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'issue', index: 0 },
        { ...original, title: 'Edited issue title' },
      );
      expect(next.report.issues[0]?.title).toBe('Edited issue title');
      expect(next.report.issues.length).toBe(
        SAMPLE_GENERATED_REPORT.report.issues.length,
      );
    });

    it('updates a single section by index', () => {
      const original = SAMPLE_GENERATED_REPORT.report.sections[0]!;
      const next = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'section', index: 0 },
        { ...original, title: 'Edited section title' },
      );
      expect(next.report.sections[0]?.title).toBe('Edited section title');
      expect(next.report.sections.length).toBe(
        SAMPLE_GENERATED_REPORT.report.sections.length,
      );
    });

    it('updates weather and workers slices', () => {
      const w = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'weather' },
        {
          conditions: 'Rainy',
          temperature: '15°C',
          wind: null,
          impact: null,
        },
      );
      expect(w.report.weather?.conditions).toBe('Rainy');

      const wk = applyEdit(
        SAMPLE_GENERATED_REPORT,
        { kind: 'workers' },
        {
          totalWorkers: 12,
          workerHours: '96',
          notes: null,
          roles: [],
        },
      );
      expect(wk.report.workers?.totalWorkers).toBe(12);
    });
  });

  describe('applyDelete', () => {
    it('removes an issue by index', () => {
      const before = SAMPLE_GENERATED_REPORT.report.issues.length;
      const next = applyDelete(SAMPLE_GENERATED_REPORT, {
        kind: 'issue',
        index: 0,
      });
      expect(next.report.issues.length).toBe(before - 1);
    });

    it('removes a section by index', () => {
      const before = SAMPLE_GENERATED_REPORT.report.sections.length;
      const next = applyDelete(SAMPLE_GENERATED_REPORT, {
        kind: 'section',
        index: 0,
      });
      expect(next.report.sections.length).toBe(before - 1);
    });

    it('returns the report unchanged for non-per-item targets', () => {
      const next = applyDelete(SAMPLE_GENERATED_REPORT, { kind: 'meta' });
      expect(next).toBe(SAMPLE_GENERATED_REPORT);
    });
  });
});
