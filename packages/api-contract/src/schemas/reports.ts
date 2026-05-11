import { z } from 'zod';
import { isoDateTime, uuid } from './_shared.js';

export const reportStatus = z.enum(['draft', 'finalized']);
export type ReportStatus = z.infer<typeof reportStatus>;

/**
 * Report body — matches mobile-old composition order:
 * StatBar / WeatherStrip / Summary / Issues / Workers / Materials / NextSteps / SummarySections.
 * See docs/legacy-v3/realignment/01-investigation.md.
 */
export const reportBody = z.object({
  visitDate: isoDateTime.nullable(),
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
  id: uuid,
  projectId: uuid,
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
});

export const generateReportRequest = z.object({
  fixtureName: z.string().optional(), // test-only override
});
export const generateReportResponse = z.object({
  report,
});

export const finalizeReportResponse = z.object({ report });

export const renderPdfResponse = z.object({
  url: z.string().url(),
  expiresAt: isoDateTime,
});
