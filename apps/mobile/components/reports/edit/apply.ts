/**
 * Pure mappers between an edit modal's draft value and a new
 * `GeneratedSiteReport`. Both `applyEdit` and `applyDelete` wrap the
 * existing immutable helpers in `lib/reports/report-edit-helpers.ts`
 * so the modal owns no schema knowledge — it just hands a typed draft
 * back to the screen.
 */
import type {
  GeneratedReportIssue,
  GeneratedReportMaterial,
  GeneratedReportSection,
  GeneratedReportWeather,
  GeneratedReportWorkers,
  GeneratedSiteReport,
} from '@harpa/report-core';

import {
  setIssues,
  setMaterials,
  setNextSteps,
  setSections,
  updateMeta,
  updateWeather,
  updateWorkers,
  type GeneratedReportMeta,
} from '@/lib/reports/report-edit-helpers';

import type { ReportEditTarget } from './types';

/**
 * Per-target draft type. Bodies declare the slice they edit; this map
 * keeps the modal switcher honest (the discriminated `target` and the
 * draft type stay in sync).
 */
export interface DraftByKind {
  meta: GeneratedReportMeta;
  weather: GeneratedReportWeather;
  workers: GeneratedReportWorkers;
  materials: GeneratedReportMaterial[];
  nextSteps: string[];
  issue: GeneratedReportIssue;
  section: GeneratedReportSection;
}

export function applyEdit(
  report: GeneratedSiteReport,
  target: ReportEditTarget,
  draft: DraftByKind[ReportEditTarget['kind']],
): GeneratedSiteReport {
  switch (target.kind) {
    case 'meta':
      return updateMeta(report, draft as DraftByKind['meta']);
    case 'weather':
      return updateWeather(report, draft as DraftByKind['weather']);
    case 'workers':
      return updateWorkers(report, draft as DraftByKind['workers']);
    case 'materials':
      return setMaterials(report, draft as DraftByKind['materials']);
    case 'nextSteps':
      return setNextSteps(report, draft as DraftByKind['nextSteps']);
    case 'issue': {
      const next = report.report.issues.slice();
      next[target.index] = draft as DraftByKind['issue'];
      return setIssues(report, next);
    }
    case 'section': {
      const next = report.report.sections.slice();
      next[target.index] = draft as DraftByKind['section'];
      return setSections(report, next);
    }
  }
}

/**
 * Remove a per-item entry. Only valid for `issue` and `section`
 * targets — the whole-list targets don't have a delete affordance
 * (the user removes individual rows from inside the body).
 */
export function applyDelete(
  report: GeneratedSiteReport,
  target: ReportEditTarget,
): GeneratedSiteReport {
  switch (target.kind) {
    case 'issue':
      return setIssues(
        report,
        report.report.issues.filter((_, i) => i !== target.index),
      );
    case 'section':
      return setSections(
        report,
        report.report.sections.filter((_, i) => i !== target.index),
      );
    default:
      return report;
  }
}

/**
 * Read the slice the modal is going to edit out of the report. Body
 * components are pure controlled inputs, so the modal seeds their
 * `initialValue` from this getter and the body never reaches into
 * the report itself.
 */
export function seedDraft(
  report: GeneratedSiteReport,
  target: ReportEditTarget,
): DraftByKind[ReportEditTarget['kind']] {
  const r = report.report;
  switch (target.kind) {
    case 'meta':
      return r.meta;
    case 'weather':
      return (
        r.weather ?? {
          conditions: null,
          temperature: null,
          wind: null,
          impact: null,
        }
      );
    case 'workers':
      return (
        r.workers ?? {
          totalWorkers: null,
          workerHours: null,
          notes: null,
          roles: [],
        }
      );
    case 'materials':
      return r.materials.slice();
    case 'nextSteps':
      return r.nextSteps.slice();
    case 'issue':
      return r.issues[target.index]!;
    case 'section':
      return r.sections[target.index]!;
  }
}
