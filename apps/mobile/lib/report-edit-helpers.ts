/**
 * Pure immutable helpers for editing a `GeneratedSiteReport`.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/lib/report-edit-helpers.ts` on branch
 * `dev`. P3.7 shipped `createEmptyReport()` only; P3.8 adds the slice
 * patches, whole-array setters, and `blank*` factories the Edit-tab
 * form depends on.
 *
 * Every helper returns a NEW top-level wrapper AND a new inner `report`
 * object so React shallow-equality fires for any consumer holding
 * either reference.
 *
 * Slice patches (`updateMeta`, `updateWeather`, `updateWorkers`) accept
 * a `Partial<...>` to merge over the existing slice. Passing `null`
 * for nullable slices (weather, workers) clears them. A partial patch
 * applied to a currently null slice seeds an empty shape with the
 * patch overlaid — this is what every editable card needs when the
 * user starts populating an empty section.
 *
 * Whole-array setters (`setRoles`, `setMaterials`, …) replace the array.
 *
 * Factories (`blankRole`, `blankMaterial`, …) produce empty rows for
 * "Add row" buttons. Required string fields default to `""` so cards
 * must surface validation before commit; nullable fields default to
 * `null`.
 */
import type {
  GeneratedSiteReport,
  GeneratedReportWeather,
  GeneratedReportWorkers,
  GeneratedReportRole,
  GeneratedReportMaterial,
  GeneratedReportIssue,
  GeneratedReportSection,
} from '@harpa/report-core';

/**
 * `GeneratedReportMeta` isn't a top-level export from `@harpa/report-core`
 * (the meta object is anonymous inside the schema). Derive it here so
 * editable-meta call sites have a name to import.
 */
export type GeneratedReportMeta = GeneratedSiteReport['report']['meta'];

/**
 * Returns a fresh empty `GeneratedSiteReport` for manual entry flows.
 *
 * Every field is initialized to a value the zod schema accepts, so
 * the result round-trips cleanly through
 * `normalizeGeneratedReportPayload`. Required meta strings (`title`,
 * `summary`) start as `""`; required-but-defaulted `reportType` is
 * seeded with `"site_visit"`. `visitDate` defaults to today (local
 * YYYY-MM-DD) — the overwhelmingly common case is a report for the
 * day it's being created. Nullable slices (`weather`, `workers`)
 * start as `null` so consumers can detect "user hasn't touched this
 * slice yet".
 */
export function createEmptyReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: '',
        reportType: 'site_visit',
        summary: '',
        // `en-CA` locale formats as YYYY-MM-DD using the device's local
        // timezone — avoids the off-by-one-day surprise that
        // `toISOString().slice(0, 10)` causes near midnight.
        visitDate: new Date().toLocaleDateString('en-CA'),
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}

// ── Slice patches ──────────────────────────────────────────────

export function updateMeta(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportMeta>,
): GeneratedSiteReport {
  return {
    ...r,
    report: {
      ...r.report,
      meta: { ...r.report.meta, ...patch },
    },
  };
}

const EMPTY_WEATHER: GeneratedReportWeather = {
  conditions: null,
  temperature: null,
  wind: null,
  impact: null,
};

export function updateWeather(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportWeather> | null,
): GeneratedSiteReport {
  if (patch === null) {
    return { ...r, report: { ...r.report, weather: null } };
  }
  const base = r.report.weather ?? EMPTY_WEATHER;
  return {
    ...r,
    report: {
      ...r.report,
      weather: { ...base, ...patch },
    },
  };
}

const EMPTY_WORKERS: GeneratedReportWorkers = {
  totalWorkers: null,
  workerHours: null,
  notes: null,
  roles: [],
};

export function updateWorkers(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportWorkers> | null,
): GeneratedSiteReport {
  if (patch === null) {
    return { ...r, report: { ...r.report, workers: null } };
  }
  const base = r.report.workers ?? EMPTY_WORKERS;
  return {
    ...r,
    report: {
      ...r.report,
      workers: { ...base, ...patch },
    },
  };
}

// ── Whole-array setters ────────────────────────────────────────

export function setRoles(
  r: GeneratedSiteReport,
  roles: GeneratedReportRole[],
): GeneratedSiteReport {
  const base = r.report.workers ?? EMPTY_WORKERS;
  return {
    ...r,
    report: {
      ...r.report,
      workers: { ...base, roles },
    },
  };
}

export function setMaterials(
  r: GeneratedSiteReport,
  materials: GeneratedReportMaterial[],
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, materials } };
}

export function setIssues(
  r: GeneratedSiteReport,
  issues: GeneratedReportIssue[],
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, issues } };
}

export function setNextSteps(
  r: GeneratedSiteReport,
  steps: string[],
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, nextSteps: steps } };
}

export function setSections(
  r: GeneratedSiteReport,
  sections: GeneratedReportSection[],
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, sections } };
}

// ── Factories for "Add row" buttons ────────────────────────────

export function blankRole(): GeneratedReportRole {
  return { role: '', count: null, notes: null };
}

export function blankMaterial(): GeneratedReportMaterial {
  return {
    name: '',
    quantity: null,
    quantityUnit: null,
    condition: null,
    status: null,
    notes: null,
  };
}

export function blankIssue(): GeneratedReportIssue {
  return {
    title: '',
    category: 'other',
    severity: 'medium',
    status: 'open',
    details: '',
    actionRequired: null,
  };
}

export function blankSection(): GeneratedReportSection {
  return { title: '', content: '' };
}
