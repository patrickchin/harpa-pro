import { reports } from '@harpa/api-contract';
import { produce, type Draft } from 'immer';

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
