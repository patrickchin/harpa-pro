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

// Legacy rows stored visitDate at the top level before the meta envelope
// landed. The weather temperatureC/windKph rename is handled in the DB
// by migration 0014, so no JS-side shim is needed for those keys.
type LegacyBodyShim = ReportBody & {
  visitDate?: string | null;
};

function normaliseLegacy(body: ReportBody | LegacyBodyShim): ReportBody {
  if ((body as ReportBody).meta) return body as ReportBody;
  const legacy = body as LegacyBodyShim;
  return {
    ...(legacy as ReportBody),
    meta: {
      title: null,
      summary: null,
      visitDate: legacy.visitDate ?? null,
    },
  };
}

/**
 * Strip a trailing display suffix that the UI may have appended, so
 * the wire value stays canonical (used for `materials[].quantity`
 * where the UI joins quantity + unit for display). If the string
 * starts with a number we keep the numeric prefix; otherwise we
 * preserve the user-typed text verbatim (the wire accepts free text
 * like "a few" / "around 20").
 */
function stripUnit(s: string | null): string | null {
  if (s == null) return null;
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const m = trimmed.match(/^-?\d+(\.\d+)?/);
  return m ? m[0] : trimmed;
}

/**
 * Parse a wire-side string into a number for UI math (totals,
 * bar-chart widths). Empty string / null / non-numeric text → 0,
 * matching the existing `?? 0` semantics callers used to rely on
 * when count/hours were `number | null`.
 */
function toNum(s: string | null): number {
  if (s == null) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce an arbitrary string into the API's `issues.severity`
 * preferred vocabulary. The wire now accepts any string, but the UI
 * still styles only the three known levels — unknown collapses to
 * 'medium' (the same default `report-core`'s schema uses on the way
 * in).
 */
function normaliseSeverity(s: string | null): 'low' | 'medium' | 'high' {
  const v = (s ?? '').toLowerCase().trim();
  if (v === 'low' || v === 'high' || v === 'medium') return v;
  return 'medium';
}

export function reportBodyToGeneratedReport(
  body: ReportBody,
): GeneratedSiteReport {
  body = normaliseLegacy(body);
  const m = body.meta;
  const totalWorkers = body.workers.reduce(
    (sum, w) => sum + toNum(w.count),
    0,
  );
  const totalHours = body.workers.reduce(
    (sum, w) => sum + toNum(w.hours),
    0,
  );

  return {
    report: {
      meta: {
        title: m.title ?? '',
        summary: m.summary ?? '',
        visitDate: m.visitDate,
      },
      weather: body.weather
        ? {
            conditions: body.weather.condition,
            temperature: body.weather.temperature,
            wind: body.weather.wind,
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
                // UI expects a number — coerce the wire string back.
                // Non-numeric values ("a few") collapse to 0; the
                // raw text survives in the notes column when present.
                count: toNum(w.count),
                notes: w.notes,
              })),
            }
          : null,
      materials: body.materials.map((m) => ({
        name: m.name,
        quantity: m.quantity,
        quantityUnit: m.unit,
        condition: m.condition,
        status: m.status,
        notes: m.notes,
      })),
      issues: body.issues.map((i) => ({
        title: i.title,
        category: 'other',
        severity: normaliseSeverity(i.severity),
        status: 'open',
        details: i.description ?? '',
        actionRequired: i.action,
        attachments: i.attachments,
      })),
      nextSteps: body.nextSteps,
      sections: body.summarySections.map((s) => ({
        title: s.title,
        content: s.body,
        attachments: s.attachments,
      })),
    },
  };
}

/**
 * Inverse adapter: UI `GeneratedSiteReport` → API `reportBody`.
 *
 * Used by the Edit-tab autosave to PATCH manual edits back to the
 * server. The wire is now string|null for every numeric field, so
 * the round-trip is mostly straight-through: we strip the display
 * suffixes we added on the way out (temperature "20°C" → "20"),
 * stringify the UI's numeric count, and normalise severity to one
 * of the three preferred values.
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
    },
    weather: r.weather
      ? {
          condition: r.weather.conditions ?? null,
          temperature: r.weather.temperature ?? null,
          wind: r.weather.wind ?? null,
          impact: r.weather.impact ?? null,
        }
      : null,
    workers: r.workers
      ? r.workers.roles.map((role) => ({
          role: role.role,
          count: role.count == null ? null : String(role.count),
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
      quantity: stripUnit(m.quantity),
      unit: m.quantityUnit ?? null,
      status: m.status ?? null,
      condition: m.condition ?? null,
      notes: m.notes ?? null,
    })),
    issues: r.issues.map((i) => ({
      title: i.title,
      severity: normaliseSeverity(i.severity),
      description: i.details ?? null,
      action: i.actionRequired ?? null,
      ...(i.attachments ? { attachments: i.attachments } : {}),
    })),
    nextSteps: [...r.nextSteps],
    summarySections: r.sections.map((s) => ({
      title: s.title,
      body: s.content,
      ...(s.attachments ? { attachments: s.attachments } : {}),
    })),
  };
}
