import { z } from 'zod';
import { isoDateTime, reportNumber } from './_shared.js';
import { noteId, projectId, reportId } from './ids.js';
import { noteFile, noteKind } from './notes.js';

export const reportStatus = z.enum(['draft', 'finalized']);
export type ReportStatus = z.infer<typeof reportStatus>;

/**
 * Photo / document batches attached to a specific issue or detailed
 * section of the report. Keyed by note ID (`not_xxxxxxxxxx`).
 *
 * - `images`    — note IDs whose kind is `image`.
 * - `documents` — reserved for future kind=`document` placement.
 *
 * Render-time silently drops unknown IDs (deleted notes); the server's
 * `sanitiseAttachments` validator strips them on the next `setReportBody`
 * write. Each note ID may appear in at most one attachments array
 * across the entire `report.body` (sanitiser de-dupes first-occurrence-wins).
 *
 * See docs/v4/design-photo-placement.md.
 */
export const reportAttachments = z
  .object({
    images: z.array(z.string()).optional(),
    documents: z.array(z.string()).optional(),
  })
  .strict();
export type ReportAttachments = z.infer<typeof reportAttachments>;

export const reportMeta = z.object({
  title:     z.string().nullable(),
  summary:   z.string().nullable(),
  visitDate: isoDateTime.nullable(),
});
export type ReportMeta = z.infer<typeof reportMeta>;

/**
 * Report body — meta envelope first, then matches mobile-old composition order:
 * StatBar / WeatherStrip / Summary / Issues / Workers / Materials / NextSteps / SummarySections.
 * See docs/legacy-v3/realignment/01-investigation.md.
 *
 * Wire shape — string|null for every numeric / categorical field
 * (workers[].count, workers[].hours, materials[].quantity,
 * weather.temperature, weather.wind, issues[].severity).
 *
 * Why strings: this is LLM output extracted from voice transcripts.
 * The model frequently sees "a few electricians", "around 20°C",
 * "delivered 30 of cement (no unit)", "critical issue" — all of
 * which used to 502 against strict number/enum schemas (HARPA-PRO-6
 * and friends; see docs/bugs/2026-06-06-report-body-string-wire.md).
 * Strings let us preserve the model's intent and parse on read in
 * the 1–2 consumers that actually need a number. Severity stays
 * advisory low|medium|high but is no longer enforced; the UI maps
 * unknown values to "medium" via normaliseSeverity().
 *
 * Weather fields are `temperature` / `wind` (no unit suffix on the
 * key). Units live in the value itself ("18°C", "75°F", "12 kph",
 * "5 mph", "20") so the report preserves what the user actually
 * said. The renderer prints the value verbatim — no conversion.
 */
export const reportBody = z.object({
  meta: reportMeta,
  weather: z
    .object({
      condition: z.string().nullable(),
      temperature: z.string().nullable(),
      wind: z.string().nullable(),
      impact: z.string().nullable(),
    })
    .nullable(),
  workers: z.array(
    z.object({
      role: z.string(),
      count: z.string().nullable(),
      hours: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  materials: z.array(
    z.object({
      name: z.string(),
      quantity: z.string().nullable(),
      unit: z.string().nullable(),
      status: z.string().nullable(),
      condition: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  issues: z.array(
    z.object({
      title: z.string(),
      severity: z.string().nullable(),
      description: z.string().nullable(),
      action: z.string().nullable(),
      attachments: reportAttachments.optional(),
    }),
  ),
  nextSteps: z.array(z.string()),
  summarySections: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      attachments: reportAttachments.optional(),
    }),
  ),
});
export type ReportBody = z.infer<typeof reportBody>;

export const report = z.object({
  id: reportId,
  number: reportNumber,
  projectId: projectId,
  status: reportStatus,
  visitDate: isoDateTime.nullable(),
  body: reportBody.nullable(),
  /**
   * @deprecated Legacy counter kept on the wire during the
   * expand-contract window so mobile clients on an older bundle
   * keep rendering correctly while the API rolls out. New
   * consumers MUST read `needsRegeneration` instead. Removed in
   * the contract PR that drops `reports.notes_since_last_generation`.
   */
  notesSinceLastGeneration: z.number().int().nonnegative(),
  /**
   * Raw timestamp set by the service on every note add/edit/delete
   * (NULL until the first note mutation lands). Exposed for
   * debugging and tests; clients should derive auto-regen state
   * from `needsRegeneration`, not from comparing this themselves.
   */
  notesChangedAt: isoDateTime.nullable(),
  generatedAt: isoDateTime.nullable(),
  /**
   * True when the report needs to be regenerated because notes
   * have changed since the last AI generation. Server-derived via
   * `notes_changed_at > generated_at` (with legacy fallback to
   * the counter for rows not yet touched by the new code path —
   * see services/reports.ts#needsRegenerationOf). Manual edits
   * from the Edit tab autosave do NOT flip this to true.
   */
  needsRegeneration: z.boolean(),
  finalizedAt: isoDateTime.nullable(),
  pdfUrl: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Report = z.infer<typeof report>;

export const createReportRequest = z.object({
  visitDate: isoDateTime.optional(),
});
export const updateReportRequest = z.object({
  visitDate: isoDateTime.nullable().optional(),
  // Manual edits from the Edit tab autosave. Persisted into the same
  // `reports.body` column the AI writes — single source of truth. The
  // autosave path does NOT touch `notes_changed_at`, so manual edits
  // never flip `needsRegeneration` to true. See
  // docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.
  body: reportBody.nullable().optional(),
});

/**
 * fixtureName is forwarded to @harpa/ai-fixtures FixtureStore which uses
 * `path.join(dir, name + '.json')`. Restrict to a safe charset to prevent
 * path traversal at the contract boundary (mirrors voice schemas).
 */
const fixtureNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, 'fixtureName must match /^[a-zA-Z0-9._-]+$/');

export const generateReportRequest = z.object({
  fixtureName: fixtureNameSchema.optional(), // test-only fixture pin
});
export const generateReportDebug = z
  .object({
    systemPrompt: z.string(),
    userPrompt: z.string(),
    rawText: z.string(),
    model: z.string(),
    vendor: z.string(),
  })
  .partial();
export const generateReportResponse = z.object({
  report,
  debug: generateReportDebug.optional(),
});

// regenerate is operationally identical to generate at the wire level;
// the route distinguishes intent (replace existing body) but the request
// shape is the same.
export const regenerateReportRequest = generateReportRequest;
export const regenerateReportResponse = generateReportResponse;

export const finalizeReportResponse = z.object({ report });
export const unfinalizeReportResponse = z.object({ report });

export const renderPdfResponse = z.object({
  url: z.string().url(),
  expiresAt: isoDateTime,
});

/**
 * Photo / document placement endpoint
 * (`PATCH /projects/{project}/reports/{number}/attachments`).
 *
 * Moves the batch attached to `noteId` to the chosen `target`, or
 * unplaces it when `target` is null. Idempotent — the service strips
 * the noteId from any other attachments array first.
 *
 * `expectedBodyVersion` is the client's last-seen `report.generatedAt`
 * (ISO string). When mismatched (e.g. a regen landed mid-edit), the
 * server returns 409 with the current report so the client can refresh
 * and re-pick.
 *
 * Per docs/v4/design-photo-placement.md §"API surface".
 */
export const placementTarget = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('issue'),
    index: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('section'),
    index: z.number().int().min(0),
  }),
]);
export type PlacementTarget = z.infer<typeof placementTarget>;

export const placeAttachmentRequest = z.object({
  noteId,
  target: placementTarget.nullable(),
  expectedBodyVersion: isoDateTime.nullable(),
});
export type PlaceAttachmentRequest = z.infer<typeof placeAttachmentRequest>;

export const placeAttachmentResponse = z.object({ report });
export const placeAttachmentConflictResponse = z.object({
  code: z.literal('body_version_mismatch'),
  conflict: report,
});

/**
 * Report Debug surface (P4.8). Read-only view of the data behind the
 * last AI generation: the prompt fed to the LLM, the notes that
 * composed it, and the raw response. Surfaced in the mobile dev
 * "Report Debug" screen and gated by the showDeveloperSection flag on
 * the client. Server-side RLS is identical to GET /reports/{n}.
 *
 * See docs/v4/design-maestro-full-regression.md §3.4.
 */
export const reportDebugNote = z.object({
  id: noteId,
  kind: noteKind,
  body: z.string().nullable(),
  transcript: z.string().nullable(),
  /** Files attached to this note (only populated for image notes). Mirrors
   *  the same shape returned by GET /reports/{report}/notes so the debug
   *  screen can show how many photos are batched on each note. */
  files: z.array(noteFile).default([]),
  createdAt: isoDateTime,
});

export const reportLastGeneration = z.object({
  requestedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  vendor: z.string(),
  model: z.string(),
  fixtureMode: z.enum(['live', 'replay', 'record']),
  systemPrompt: z.string(),
  userPrompt: z.string(),
  response: z.string(),
  // Token counts — currently unwired (the AI service does not surface
  // these). Reserved for the follow-up commit that extends the
  // provider interface.
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      cachedTokens: z.number().int().nonnegative().optional(),
    })
    .nullable(),
});

export const reportDebugResponse = z.object({
  prompt: z.object({ system: z.string(), user: z.string() }),
  notes: z.array(reportDebugNote),
  lastGeneration: reportLastGeneration.nullable(),
});
