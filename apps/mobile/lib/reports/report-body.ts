import { reports } from '@harpa/api-contract';
import { produce, type Draft } from 'immer';

export type ReportBody = reports.ReportBody;
export type ReportMeta = ReportBody['meta'];
export type ReportWeather = NonNullable<ReportBody['weather']>;
export type ReportWorker = ReportBody['workers'][number];
export type ReportMaterial = ReportBody['materials'][number];
export type ReportIssue = ReportBody['issues'][number];
export type ReportSummarySection = ReportBody['summarySections'][number];

export function createEmptyReportBody(visitDate: string | null = null): reports.ReportBody {
  return {
    meta: {
      title: null,
      summary: null,
      visitDate,
    },
    weather: null,
    workers: [],
    materials: [],
    issues: [],
    nextSteps: [],
    summarySections: [],
  };
}

export function updateReportBody(
  body: reports.ReportBody,
  update: (draft: Draft<reports.ReportBody>) => void,
): reports.ReportBody {
  return produce(body, update);
}

export function coerceReportBody(
  value: unknown,
  fallbackVisitDate: string | null,
): { body: reports.ReportBody; malformed: boolean } {
  const parsed = reports.reportBody.safeParse(value);
  if (parsed.success) {
    return { body: parsed.data, malformed: false };
  }
  return {
    body: createEmptyReportBody(fallbackVisitDate),
    malformed: value !== null && value !== undefined,
  };
}

export function displayReportTitle(body: reports.ReportBody | null): string {
  return body?.meta.title?.trim() || 'Untitled report';
}

export function dateInputValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toISOString().slice(0, 10);
}

export function isoDateFromInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getItemMeta(values: Array<string | null | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' • ');
}

function textOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toNum(value: string | null): number | null {
  const text = textOrNull(value);
  if (text == null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTotalHours(totalHours: number): string | null {
  if (!Number.isFinite(totalHours) || totalHours <= 0) return null;
  return `${totalHours}h total`;
}

export interface WorkerDisplaySummary {
  totalWorkers: number | null;
  totalWorkersLabel: string | null;
  workerHours: string | null;
  notes: string | null;
  hasQualitativeCounts: boolean;
}

export function getWorkerDisplaySummaryFromWorkers(
  workers: reports.ReportBody['workers'],
): WorkerDisplaySummary {
  const numericCounts = workers
    .map((worker) => toNum(worker.count))
    .filter((count): count is number => count !== null);
  const qualitativeCounts = workers
    .map((worker) => textOrNull(worker.count))
    .filter((count): count is string => count !== null && toNum(count) === null);
  const notes = workers
    .map((worker) => textOrNull(worker.notes))
    .filter((note): note is string => note !== null);
  const totalHours = workers.reduce((sum, worker) => sum + (toNum(worker.hours) ?? 0), 0);

  return {
    totalWorkers: numericCounts.length > 0 ? numericCounts.reduce((sum, count) => sum + count, 0) : null,
    totalWorkersLabel:
      numericCounts.length > 0
        ? String(numericCounts.reduce((sum, count) => sum + count, 0))
        : (qualitativeCounts[0] ?? null),
    workerHours: formatTotalHours(totalHours),
    notes: notes.length > 0 ? Array.from(new Set(notes)).join('\n') : null,
    hasQualitativeCounts: qualitativeCounts.length > 0,
  };
}

export function getWorkerDisplaySummary(body: reports.ReportBody): WorkerDisplaySummary {
  return getWorkerDisplaySummaryFromWorkers(body.workers);
}
