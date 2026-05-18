/**
 * Adapter: API `reportBody` (flat, persisted) → UI `GeneratedSiteReport`
 * (wrapped, consumed by ReportView / CompletenessCard / EditTab).
 *
 * The API stores the AI-generated report in a flat shape defined by
 * `packages/api-contract/src/schemas/reports.ts#reportBody`; the
 * mobile UI was built against `@harpa/report-core`'s
 * `GeneratedSiteReport` which uses a different field set and nests
 * everything under `report.*`. Until the two schemas converge (P4),
 * the mobile layer adapts here.
 *
 * Field map (unmapped fields fall back to safe defaults so the UI
 * renders an empty-state row rather than crashing):
 *
 *   - visitDate          → report.meta.visitDate
 *   - weather.*          → report.weather.* (renamed; numbers stringified)
 *   - workers[]          → report.workers.roles[] + aggregate totals
 *   - materials[]        → report.materials[]  (quantity stringified)
 *   - issues[]           → report.issues[]     (category/status defaulted)
 *   - summarySections[]  → report.sections[]   ({title, body} → {title, content})
 *   - nextSteps          → report.nextSteps
 *
 * `meta.title`, `meta.summary`, `meta.reportType` have no API
 * counterpart and are seeded as `''` / `'site_visit'`.
 */
import { reports } from '@harpa/api-contract';
import type { GeneratedSiteReport } from '@harpa/report-core';

type ReportBody = reports.ReportBody;

function num(n: number | null, suffix = ''): string | null {
  return n == null ? null : `${n}${suffix}`;
}

export function reportBodyToGeneratedReport(
  body: ReportBody,
  meta?: { title?: string | null; summary?: string | null; reportType?: string | null },
): GeneratedSiteReport {
  const totalWorkers = body.workers.reduce((sum, w) => sum + w.count, 0);
  const totalHours = body.workers.reduce(
    (sum, w) => sum + (w.hours ?? 0),
    0,
  );

  return {
    report: {
      meta: {
        title: meta?.title ?? '',
        reportType: meta?.reportType ?? 'site_visit',
        summary: meta?.summary ?? '',
        visitDate: body.visitDate,
      },
      weather: body.weather
        ? {
            conditions: body.weather.condition,
            temperature: num(body.weather.temperatureC, '°C'),
            wind: num(body.weather.windKph, ' km/h'),
            impact: body.weather.impact,
          }
        : null,
      workers:
        body.workers.length > 0
          ? {
              totalWorkers,
              workerHours: totalHours > 0 ? `${totalHours}h total` : null,
              notes: null,
              roles: body.workers.map((w) => ({
                role: w.role,
                count: w.count,
                notes: w.notes,
              })),
            }
          : null,
      materials: body.materials.map((m) => ({
        name: m.name,
        quantity: m.quantity == null ? null : String(m.quantity),
        quantityUnit: m.unit,
        condition: m.condition,
        status: m.status,
        notes: m.notes,
      })),
      issues: body.issues.map((i) => ({
        title: i.title,
        category: 'other',
        severity: i.severity,
        status: 'open',
        details: i.description ?? '',
        actionRequired: i.action,
      })),
      nextSteps: body.nextSteps,
      sections: body.summarySections.map((s) => ({
        title: s.title,
        content: s.body,
      })),
    },
  };
}
