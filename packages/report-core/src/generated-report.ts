import { z } from 'zod';

// ── Zod primitives ─────────────────────────────────────────────

// Coerce numbers/booleans to string. LLMs frequently emit `"quantity": 50`
// rather than `"50"`; rejecting these would break the whole payload.
function coerceToString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}

const trimmedString = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => coerceToString(v) ?? '');

const nonEmptyTrimmed = trimmedString.pipe(z.string().min(1));

const nullableTrimmed = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .nullable()
  .optional()
  .transform((v) => coerceToString(v));

const coercedNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });

const stringArray = z
  .array(z.unknown())
  .optional()
  .default([])
  .transform((arr) =>
    arr
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean),
  );

// ── Schema definitions ─────────────────────────────────────────

// Note: schemas intentionally use the default "strip" mode (no `.strict()`),
// so that unknown keys emitted by the LLM are silently dropped instead of
// failing the whole payload.

const RoleSchema = z.object({
  role: nonEmptyTrimmed,
  count: coercedNumber,
  notes: nullableTrimmed,
});

const WorkersSchema = z.object({
  totalWorkers: coercedNumber,
  workerHours: nullableTrimmed,
  notes: nullableTrimmed,
  roles: z
    .array(RoleSchema.catch(undefined as never))
    .default([])
    .transform((arr) => arr.filter(Boolean)),
});

const MaterialSchema = z.object({
  name: nonEmptyTrimmed,
  quantity: nullableTrimmed,
  quantityUnit: nullableTrimmed,
  condition: nullableTrimmed,
  status: nullableTrimmed,
  notes: nullableTrimmed,
});

const IssueSchema = z.object({
  title: nonEmptyTrimmed,
  category: trimmedString.pipe(z.string().min(1)).catch('other'),
  severity: trimmedString.pipe(z.string().min(1)).catch('medium'),
  status: trimmedString.pipe(z.string().min(1)).catch('open'),
  details: nonEmptyTrimmed,
  actionRequired: nullableTrimmed,
});

const SectionSchema = z.object({
  title: nonEmptyTrimmed,
  content: nonEmptyTrimmed,
});

const WeatherSchema = z.object({
  conditions: nullableTrimmed,
  temperature: nullableTrimmed,
  wind: nullableTrimmed,
  impact: nullableTrimmed,
});

const GeneratedSiteReportSchema = z.object({
  report: z.object({
    meta: z.object({
      title: trimmedString,
      reportType: trimmedString.transform((s) => s || 'site_visit'),
      summary: trimmedString,
      visitDate: nullableTrimmed,
    }),
    weather: WeatherSchema.nullable().optional().default(null).catch(null),
    workers: WorkersSchema.nullable().optional().default(null).catch(null),
    materials: z
      .array(MaterialSchema.catch(undefined as never))
      .default([])
      .transform((arr) => arr.filter(Boolean)),
    issues: z
      .array(IssueSchema.catch(undefined as never))
      .default([])
      .transform((arr) => arr.filter(Boolean)),
    nextSteps: stringArray,
    sections: z
      .array(SectionSchema.catch(undefined as never))
      .default([])
      .transform((arr) => arr.filter(Boolean)),
  }),
  usage: z.unknown().optional(),
});

// ── Exported types (inferred from schemas) ─────────────────────

export type GeneratedReportSection = z.infer<typeof SectionSchema>;
export type GeneratedReportRole = z.infer<typeof RoleSchema>;
export type GeneratedReportWorkers = z.infer<typeof WorkersSchema>;
export type GeneratedReportMaterial = z.infer<typeof MaterialSchema>;
export type GeneratedReportIssue = z.infer<typeof IssueSchema>;
export type GeneratedReportWeather = z.infer<typeof WeatherSchema>;
export type GeneratedSiteReport = z.infer<typeof GeneratedSiteReportSchema>;

// ── Public API ─────────────────────────────────────────────────

export function normalizeGeneratedReportPayload(
  value: unknown,
): GeneratedSiteReport | null {
  const result = GeneratedSiteReportSchema.safeParse(value);
  return result.success ? result.data : null;
}
