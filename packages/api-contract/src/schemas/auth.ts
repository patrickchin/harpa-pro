import { z } from 'zod';
import { cursor, isoDateTime, email } from './_shared.js';
import { projectId, reportId, userId } from './ids.js';
import { limitState, plan } from './usage-limits.js';

export const userPublic = z.object({
  id: userId,
  email,
  displayName: z.string().nullable(),
  companyName: z.string().nullable(),
  createdAt: isoDateTime,
});
export type UserPublic = z.infer<typeof userPublic>;

export const meResponse = z.object({ user: userPublic });

export const updateMeRequest = z.object({
  displayName: z.string().min(1).max(120).optional(),
  companyName: z.string().min(1).max(120).optional(),
});

const accountDeletionProject = z.object({
  id: projectId,
  name: z.string(),
});

export const accountDeletionPreviewResponse = z.object({
  email,
  soloProjectsDeleted: z.array(accountDeletionProject),
  sharedProjectsTransferred: z.array(
    accountDeletionProject.extend({
      newOwnerId: userId,
      newOwnerEmail: email,
    }),
  ),
  sharedProjectsLeft: z.array(accountDeletionProject),
  personalFilesDeleted: z.number().int().nonnegative(),
});
export type AccountDeletionPreviewResponse = z.infer<
  typeof accountDeletionPreviewResponse
>;

export const usageMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reports: z.number().int().nonnegative(),
  voiceNotes: z.number().int().nonnegative(),
});

/** Per-month LLM token totals (sum across all vendor/model/operation). */
export const usageTokenMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  /** Audio duration (seconds) of transcribe calls in the month. */
  inputSeconds: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
});

/** Per-(vendor,model,operation) usage breakdown across the full window. */
export const usageByModelRow = z.object({
  vendor: z.string(),
  model: z.string(),
  operation: z.enum(['chat', 'transcribe', 'generate_report']),
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  /** Audio seconds for transcribe rows. 0 for chat / generate_report. */
  inputSeconds: z.number().nonnegative(),
});

export const usageResponse = z.object({
  months: z.array(usageMonth),
  totals: z.object({
    reports: z.number().int().nonnegative(),
    voiceNotes: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative(),
    inputSeconds: z.number().nonnegative(),
    calls: z.number().int().nonnegative(),
  }),
  usageTokens: z.array(usageTokenMonth),
  usageByModel: z.array(usageByModelRow),
  /**
   * Effective per-bucket caps + current usage. Optional for
   * backwards-compatibility with pre-v0.2 mobile clients; new
   * clients always render it. See docs/v4/arch-usage-limits.md §5.4.
   */
  plan: plan.optional(),
  limits: z.array(limitState).optional(),
  fileSizeLimitBytes: z.number().int().positive().optional(),
});

/**
 * Single LLM usage event row. Shape mirrors `app.llm_usage_events`
 * minus internal-only columns. Token-count semantics by `operation`
 * match `services/ai-usage.ts` JSDoc: transcribe rows have zero
 * tokens and a non-null `inputSeconds`; chat / generate_report have
 * non-zero token counts and `inputSeconds === null`.
 */
export const usageEventItem = z.object({
  id: z.string(),
  createdAt: isoDateTime,
  vendor: z.string(),
  model: z.string(),
  operation: z.enum(['chat', 'transcribe', 'generate_report']),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  inputSeconds: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
  fixtureMode: z.enum(['live', 'replay', 'record']),
  status: z.enum(['ok', 'error']),
  projectId: projectId.nullable(),
  reportId: reportId.nullable(),
});

export const usageEventsQuery = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  operation: z.enum(['chat', 'transcribe', 'generate_report']).optional(),
  vendor: z.string().min(1).max(64).optional(),
});

export const usageEventsResponse = z.object({
  items: z.array(usageEventItem),
  nextCursor: cursor.nullable(),
});
