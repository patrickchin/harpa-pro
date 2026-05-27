import { z } from 'zod';
import { isoDateTime, reportNumber } from './_shared.js';
import { noteId, projectId, reportId } from './ids.js';
import { noteKind } from './notes.js';

export const reportStatus = z.enum(['draft', 'finalized']);
export type ReportStatus = z.infer<typeof reportStatus>;

export const reportType = z.enum([
  'site_visit', 'daily', 'inspection', 'safety', 'incident', 'progress',
]);
export type ReportTypeValue = z.infer<typeof reportType>;

export const projectPhase = z.enum([
  'planning', 'foundation', 'structure', 'envelope',
  'services', 'interior', 'finishing', 'handover', 'other',
]);
export type ProjectPhaseValue = z.infer<typeof projectPhase>;

export const riskLevel = z.enum(['low', 'medium', 'high']);
export type RiskLevelValue = z.infer<typeof riskLevel>;

export const reportMeta = z.object({
  title:        z.string().nullable(),
  summary:      z.string().nullable(),
  reportType:   reportType.nullable(),
  visitDate:    isoDateTime.nullable(),
  location:     z.string().nullable(),
  projectPhase: projectPhase.nullable(),
  riskLevel:    riskLevel.nullable(),
  tags:         z.array(z.string()).max(7).default([]),
});
export type ReportMeta = z.infer<typeof reportMeta>;

/**
 * Report body — meta envelope first, then matches mobile-old composition order:
 * StatBar / WeatherStrip / Summary / Issues / Workers / Materials / NextSteps / SummarySections.
 * See docs/legacy-v3/realignment/01-investigation.md.
 */
export const reportBody = z.object({
  meta: reportMeta,
  weather: z
    .object({
      condition: z.string().nullable(),
      temperatureC: z.number().nullable(),
      windKph: z.number().nullable(),
      impact: z.string().nullable(),
    })
    .nullable(),
  workers: z.array(
    z.object({
      role: z.string(),
      count: z.number().int().nonnegative(),
      hours: z.number().nonnegative().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  materials: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      status: z.string().nullable(),
      condition: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  issues: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string().nullable(),
      action: z.string().nullable(),
    }),
  ),
  nextSteps: z.array(z.string()),
  summarySections: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
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
  notesSinceLastGeneration: z.number().int().nonnegative(),
  generatedAt: isoDateTime.nullable(),
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
  // `reports.body` column the AI writes — single source of truth. Patching
  // body does NOT reset `notes_since_last_generation` (that counter
  // belongs to the AI loop, not manual edits). See
  // docs/v4/design-p3x-generate-update-finalize.md §3.4.
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
