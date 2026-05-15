/**
 * Unit tests for the immutable Edit-tab helpers.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/lib/report-edit-helpers.test.ts` on
 * branch `dev` and adapted to import shared types from
 * `@harpa/report-core`.
 */
import { describe, expect, it } from 'vitest';

import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from '@harpa/report-core';
import {
  blankIssue,
  blankMaterial,
  blankRole,
  blankSection,
  createEmptyReport,
  setIssues,
  setMaterials,
  setNextSteps,
  setRoles,
  setSections,
  updateMeta,
  updateWeather,
  updateWorkers,
} from './report-edit-helpers';

function makeReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: 'Daily site visit',
        reportType: 'site_visit',
        summary: 'All going well.',
        visitDate: '2026-04-30',
      },
      weather: {
        conditions: 'Sunny',
        temperature: '22C',
        wind: null,
        impact: null,
      },
      workers: {
        totalWorkers: 4,
        workerHours: '8',
        notes: null,
        roles: [{ role: 'Electrician', count: 2, notes: null }],
      },
      materials: [
        {
          name: 'Cement',
          quantity: '10',
          quantityUnit: 'bags',
          condition: null,
          status: 'delivered',
          notes: null,
        },
      ],
      issues: [
        {
          title: 'Leaky pipe',
          category: 'plumbing',
          severity: 'medium',
          status: 'open',
          details: 'Found in basement',
          actionRequired: null,
        },
      ],
      nextSteps: ['Order more cement'],
      sections: [{ title: 'Progress', content: 'Walls up.' }],
    },
  };
}

describe('report-edit-helpers', () => {
  it('updateMeta returns new wrapper + new report + new meta and merges patch', () => {
    const r = makeReport();
    const out = updateMeta(r, { summary: 'Updated summary' });
    expect(out).not.toBe(r);
    expect(out.report).not.toBe(r.report);
    expect(out.report.meta).not.toBe(r.report.meta);
    expect(out.report.meta.summary).toBe('Updated summary');
    expect(out.report.meta.title).toBe(r.report.meta.title);
    // Other slices preserved by reference.
    expect(out.report.workers).toBe(r.report.workers);
  });

  it('updateWeather merges patch into existing slice', () => {
    const r = makeReport();
    const out = updateWeather(r, { wind: '10 km/h' });
    expect(out.report.weather).not.toBe(r.report.weather);
    expect(out.report.weather?.wind).toBe('10 km/h');
    expect(out.report.weather?.conditions).toBe('Sunny');
  });

  it('updateWeather(null) clears the slice', () => {
    const r = makeReport();
    const out = updateWeather(r, null);
    expect(out).not.toBe(r);
    expect(out.report.weather).toBeNull();
  });

  it('updateWeather seeds empty shape when slice is null', () => {
    const r = makeReport();
    r.report.weather = null;
    const out = updateWeather(r, { conditions: 'Rain' });
    expect(out.report.weather).toEqual({
      conditions: 'Rain',
      temperature: null,
      wind: null,
      impact: null,
    });
  });

  it('updateWorkers seeds empty shape when slice is null', () => {
    const r = makeReport();
    r.report.workers = null;
    const out = updateWorkers(r, { totalWorkers: 3 });
    expect(out.report.workers).toEqual({
      totalWorkers: 3,
      workerHours: null,
      notes: null,
      roles: [],
    });
  });

  it('updateWorkers(null) clears the slice', () => {
    const r = makeReport();
    const out = updateWorkers(r, null);
    expect(out.report.workers).toBeNull();
  });

  it('setRoles replaces the roles array on workers', () => {
    const r = makeReport();
    const next = [blankRole()];
    const out = setRoles(r, next);
    expect(out.report.workers?.roles).toBe(next);
    expect(out.report.workers).not.toBe(r.report.workers);
  });

  it('setRoles seeds workers when null', () => {
    const r = makeReport();
    r.report.workers = null;
    const next = [{ role: 'Foreman', count: 1, notes: null }];
    const out = setRoles(r, next);
    expect(out.report.workers?.roles).toBe(next);
    expect(out.report.workers?.totalWorkers).toBeNull();
  });

  it('setMaterials replaces the materials array', () => {
    const r = makeReport();
    const next = [blankMaterial()];
    const out = setMaterials(r, next);
    expect(out.report.materials).toBe(next);
    expect(out.report).not.toBe(r.report);
  });

  it('setIssues replaces the issues array', () => {
    const r = makeReport();
    const next = [blankIssue()];
    const out = setIssues(r, next);
    expect(out.report.issues).toBe(next);
  });

  it('setNextSteps replaces the next-steps array', () => {
    const r = makeReport();
    const out = setNextSteps(r, ['A', 'B']);
    expect(out.report.nextSteps).toEqual(['A', 'B']);
    expect(out.report).not.toBe(r.report);
  });

  it('setSections replaces the sections array', () => {
    const r = makeReport();
    const next = [blankSection()];
    const out = setSections(r, next);
    expect(out.report.sections).toBe(next);
  });

  it('blankRole/blankMaterial/blankIssue/blankSection produce expected empty shapes', () => {
    expect(blankRole()).toEqual({ role: '', count: null, notes: null });
    expect(blankMaterial()).toEqual({
      name: '',
      quantity: null,
      quantityUnit: null,
      condition: null,
      status: null,
      notes: null,
    });
    expect(blankIssue()).toEqual({
      title: '',
      category: 'other',
      severity: 'medium',
      status: 'open',
      details: '',
      actionRequired: null,
    });
    expect(blankSection()).toEqual({ title: '', content: '' });
  });

  it('each call produces a fresh factory object (no shared refs)', () => {
    expect(blankRole()).not.toBe(blankRole());
    expect(blankIssue()).not.toBe(blankIssue());
  });
});

describe('createEmptyReport', () => {
  it('produces a report that round-trips through the zod schema', () => {
    const empty = createEmptyReport();
    const parsed = normalizeGeneratedReportPayload(empty);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(empty);
  });

  it('has the expected empty shape', () => {
    const today = new Date().toLocaleDateString('en-CA');
    expect(createEmptyReport()).toEqual({
      report: {
        meta: {
          title: '',
          reportType: 'site_visit',
          summary: '',
          visitDate: today,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    });
  });

  it('defaults visitDate to today (local YYYY-MM-DD)', () => {
    const empty = createEmptyReport();
    expect(empty.report.meta.visitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(empty.report.meta.visitDate).toBe(
      new Date().toLocaleDateString('en-CA'),
    );
  });

  it('round-trips through every existing helper without throwing', () => {
    const empty = createEmptyReport();

    const m = updateMeta(empty, { title: 'Hello' });
    expect(m.report.meta.title).toBe('Hello');

    const w = updateWeather(empty, { conditions: 'Sunny' });
    expect(w.report.weather).toEqual({
      conditions: 'Sunny',
      temperature: null,
      wind: null,
      impact: null,
    });
    expect(updateWeather(empty, null).report.weather).toBeNull();

    const wk = updateWorkers(empty, { totalWorkers: 3 });
    expect(wk.report.workers?.totalWorkers).toBe(3);
    expect(updateWorkers(empty, null).report.workers).toBeNull();

    const r1 = setRoles(empty, [blankRole()]);
    expect(r1.report.workers?.roles).toHaveLength(1);

    const r2 = setMaterials(empty, [blankMaterial()]);
    expect(r2.report.materials).toHaveLength(1);

    const r3 = setIssues(empty, [blankIssue()]);
    expect(r3.report.issues).toHaveLength(1);

    const r4 = setNextSteps(empty, ['Order materials']);
    expect(r4.report.nextSteps).toEqual(['Order materials']);

    const r5 = setSections(empty, [blankSection()]);
    expect(r5.report.sections).toHaveLength(1);
  });

  it('two consecutive calls produce equal-shaped objects with independent refs', () => {
    const a: GeneratedSiteReport = createEmptyReport();
    const b: GeneratedSiteReport = createEmptyReport();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.report).not.toBe(b.report);
    expect(a.report.materials).not.toBe(b.report.materials);
  });
});
