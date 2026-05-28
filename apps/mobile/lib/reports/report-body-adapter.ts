/**
 * Adapter: API `reportBody` (persisted) → UI `GeneratedSiteReport`
 * (wrapped, consumed by ReportView / CompletenessCard / EditTab).
 *
 * The API stores the AI-generated report in a shape defined by
 * `packages/api-contract/src/schemas/reports.ts#reportBody`; the
 * mobile UI was built against `@harpa/report-core`'s
 * `GeneratedSiteReport` which nests everything under `report.*`.
 * The mobile layer adapts here.
 *
 * Field map (unmapped fields fall back to safe defaults so the UI
 * renders an empty-state row rather than crashing):
 *
 *   - meta.*             → report.meta.* (body.meta is the source of truth)
 *   - weather.*          → report.weather.* (renamed; numbers stringified)
 *   - workers[]          → report.workers.roles[] + aggregate totals
 *   - materials[]        → report.materials[]  (quantity stringified)
 *   - issues[]           → report.issues[]     (category/status defaulted)
 *   - summarySections[]  → report.sections[]   ({title, body} → {title, content})
 *   - nextSteps          → report.nextSteps
 *
 * Legacy bodies that pre-date the meta envelope (missing `body.meta`)
 * are shimmed: a synthetic meta is constructed with visitDate lifted
 * from the old top-level `visitDate` field, and all other fields null.
 */
import { reports } from '@harpa/api-contract';
import type { GeneratedSiteReport } from '@harpa/report-core';

type ReportBody = reports.ReportBody;

// Legacy rows stored visitDate at the top level before the meta envelope landed.
type LegacyBodyShim = ReportBody & { visitDate?: string | null };

function normaliseLegacy(body: ReportBody | LegacyBodyShim): ReportBody {
  if ((body as ReportBody).meta) return body as ReportBody;
  const legacy = body as LegacyBodyShim;
  return {
    ...legacy,
    meta: {
      title: null,
      summary: null,
      visitDate: legacy.visitDate ?? null,
      tags: [],
    },
  };
}

function num(n: number | null, suffix = ''): string | null {
  return n == null ? null : `${n}${suffix}`;
}

/**
 * Parse a leading number out of a free-form display string. Used by the
 * inverse adapter so the API's `reportBody` round-trips through the UI
 * `GeneratedSiteReport` shape without losing the numeric weather/quantity
 * fields. Returns null when the string is empty or doesn't start with a
 * number — matches what the cold-start adapter does with null inputs.
 */
function parseLeadingNumber(s: string | null): number | null {
  if (s == null) return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerce an arbitrary string into the API's `issues.severity` enum.
 * The UI surface accepts any non-empty string (defaults to 'medium'
 * via the zod `.catch(...)` in report-core), but the API contract
 * rejects anything outside { low, medium, high }. Unknown values
 * collapse to 'medium' — same default the report-core schema uses
 * on the way in.
 */
function normaliseSeverity(s: string): 'low' | 'medium' | 'high' {
  if (s === 'low' || s === 'high' || s === 'medium') return s;
  return 'medium';
}

export function reportBodyToGeneratedReport(
  body: ReportBody,
): GeneratedSiteReport {
  body = normaliseLegacy(body);
  const m = body.meta;
  const totalWorkers = body.workers.reduce((sum, w) => sum + w.count, 0);
  const totalHours = body.workers.reduce(
    (sum, w) => sum + (w.hours ?? 0),
    0,
  );

  return {
    report: {
      meta: {
        title: m.title ?? '',
        summary: m.summary ?? '',
        visitDate: m.visitDate,
        tags: m.tags ?? [],
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

/**
 * Inverse adapter: UI `GeneratedSiteReport` → API `reportBody`.
 *
 * Used by the Edit-tab autosave to PATCH manual edits back to the
 * server. Lossy by design — the UI has aggregate-only fields the API
 * doesn't store (workers totals) and the API has numeric fields the UI
 * renders as display strings (temperatureC, windKph, materials.quantity).
 * We parse leading numbers out of the display strings; if a user typed
 * prose the field round-trips as null.
 *
 * `issues.category` and `issues.status` are dropped (no API field
 * today); category="other" + status="open" survive only on the
 * client until the contract expands.
 */
export function generatedReportToReportBody(g: GeneratedSiteReport): ReportBody {
  const r = g.report;
  return {
    meta: {
      title: r.meta.title || null,
      summary: r.meta.summary || null,
      visitDate: r.meta.visitDate ?? null,
      tags: r.meta.tags ?? [],
    },
    weather: r.weather
      ? {
          condition: r.weather.conditions ?? null,
          temperatureC: parseLeadingNumber(r.weather.temperature),
          windKph: parseLeadingNumber(r.weather.wind),
          impact: r.weather.impact ?? null,
        }
      : null,
    workers: r.workers
      ? r.workers.roles.map((role) => ({
          role: role.role,
          count: role.count ?? 0,
          // The UI aggregates worker hours at the workers-level
          // (workers.workerHours), not per role; we don't try to
          // reverse-allocate. Persist null per-role; the AI will
          // repopulate on next regenerate if notes provide it.
          hours: null,
          notes: role.notes ?? null,
        }))
      : [],
    materials: r.materials.map((m) => ({
      name: m.name,
      quantity: parseLeadingNumber(m.quantity),
      unit: m.quantityUnit ?? null,
      status: m.status ?? null,
      condition: m.condition ?? null,
      notes: m.notes ?? null,
    })),
    issues: r.issues.map((i) => ({
      title: i.title,
      // API's severity enum is { low, medium, high }. The UI accepts
      // any non-empty string (defaulting to 'medium') so users could
      // type a value the API rejects. Coerce to the nearest enum
      // member here so autosave doesn't 400.
      severity: normaliseSeverity(i.severity),
      description: i.details ?? null,
      action: i.actionRequired ?? null,
    })),
    nextSteps: [...r.nextSteps],
    summarySections: r.sections.map((s) => ({
      title: s.title,
      body: s.content,
    })),
  };
}
