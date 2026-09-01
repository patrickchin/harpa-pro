/**
 * Pure mappers between an edit modal's draft value and a new
 * canonical `reports.ReportBody`.
 */
import { reports } from '@harpa/api-contract';

import { updateReportBody } from '@/lib/reports/report-body';

import type { ReportEditTarget } from './types';

type ReportBody = reports.ReportBody;
type ReportMeta = ReportBody['meta'];
type ReportWeather = NonNullable<ReportBody['weather']>;
type ReportWorker = ReportBody['workers'][number];
type ReportMaterial = ReportBody['materials'][number];
type ReportIssue = ReportBody['issues'][number];
type ReportSection = ReportBody['summarySections'][number];

/**
 * Per-target draft type. Bodies declare the slice they edit; this map
 * keeps the modal switcher honest (the discriminated `target` and the
 * draft type stay in sync).
 */
export interface DraftByKind {
  meta: ReportMeta;
  weather: ReportWeather;
  workers: ReportWorker[];
  materials: ReportMaterial[];
  nextSteps: string[];
  issue: ReportIssue;
  section: ReportSection;
}

export function applyEdit(
  report: ReportBody,
  target: ReportEditTarget,
  draft: DraftByKind[ReportEditTarget['kind']],
): ReportBody {
  switch (target.kind) {
    case 'meta':
      return updateReportBody(report, (next) => {
        next.meta = draft as DraftByKind['meta'];
      });
    case 'weather':
      return updateReportBody(report, (next) => {
        next.weather = draft as DraftByKind['weather'];
      });
    case 'workers':
      return updateReportBody(report, (next) => {
        next.workers = draft as DraftByKind['workers'];
      });
    case 'materials':
      return updateReportBody(report, (next) => {
        next.materials = draft as DraftByKind['materials'];
      });
    case 'nextSteps':
      return updateReportBody(report, (next) => {
        next.nextSteps = draft as DraftByKind['nextSteps'];
      });
    case 'issue': {
      const next = report.issues.slice();
      next[target.index] = draft as DraftByKind['issue'];
      return updateReportBody(report, (body) => {
        body.issues = next;
      });
    }
    case 'section': {
      const next = report.summarySections.slice();
      next[target.index] = draft as DraftByKind['section'];
      return updateReportBody(report, (body) => {
        body.summarySections = next;
      });
    }
  }
}

/**
 * Remove a per-item entry. Only valid for `issue` and `section`
 * targets — the whole-list targets don't have a delete affordance
 * (the user removes individual rows from inside the body).
 */
export function applyDelete(
  report: ReportBody,
  target: ReportEditTarget,
): ReportBody {
  switch (target.kind) {
    case 'issue':
      return updateReportBody(report, (next) => {
        next.issues = report.issues.filter((_, i) => i !== target.index);
      });
    case 'section':
      return updateReportBody(report, (next) => {
        next.summarySections = report.summarySections.filter((_, i) => i !== target.index);
      });
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
  report: ReportBody,
  target: ReportEditTarget,
): DraftByKind[ReportEditTarget['kind']] {
  switch (target.kind) {
    case 'meta':
      return report.meta;
    case 'weather':
      return (
        report.weather ?? {
          condition: null,
          temperature: null,
          wind: null,
          impact: null,
        }
      );
    case 'workers':
      return report.workers.map((worker) => ({ ...worker }));
    case 'materials':
      return report.materials.map((material) => ({ ...material }));
    case 'nextSteps':
      return report.nextSteps.slice();
    case 'issue':
      return report.issues[target.index]!;
    case 'section':
      return report.summarySections[target.index]!;
  }
}
