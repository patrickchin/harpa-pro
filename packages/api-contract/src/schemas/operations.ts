import { z } from 'zod';
import { email, isoDateTime } from './_shared.js';
import { projectId, reportId } from './ids.js';
import { plan } from './usage-limits.js';

export const neonInventoryReasons = [
  'not_configured',
  'unsafe_permissions',
  'timeout',
  'rate_limited',
  'forbidden',
  'not_found',
  'invalid_response',
  'provider_unavailable',
] as const;

export const neonInventoryReason = z.enum(neonInventoryReasons);

const nonBlank = z.string().trim().min(1);

export const neonBranch = z
  .object({
    id: nonBlank,
    name: nonBlank,
    parentId: nonBlank.nullable(),
    currentState: nonBlank,
    default: z.boolean(),
    protected: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();

export const availableNeonBranchCount = z
  .object({
    status: z.literal('available'),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const unknownNeonBranchCount = z
  .object({
    status: z.literal('unknown'),
    reason: neonInventoryReason,
  })
  .strict();

export const neonBranchCount = z.discriminatedUnion('status', [
  availableNeonBranchCount,
  unknownNeonBranchCount,
]);

export const availableNeonBranchDetails = z
  .object({
    status: z.literal('available'),
    truncated: z.boolean(),
    branches: z.array(neonBranch).max(100),
  })
  .strict();

export const unknownNeonBranchDetails = z
  .object({
    status: z.literal('unknown'),
    reason: neonInventoryReason,
  })
  .strict();

export const neonBranchDetails = z.discriminatedUnion('status', [
  availableNeonBranchDetails,
  unknownNeonBranchDetails,
]);

export const neonProject = z
  .object({
    id: nonBlank,
    name: nonBlank,
    regionId: nonBlank,
    pgVersion: z.number().int().positive(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    effectivePermission: z.literal('VIEWER'),
    branchCount: neonBranchCount,
    branchDetails: neonBranchDetails,
  })
  .strict();

const completeNeonProject = neonProject
  .extend({
    branchCount: availableNeonBranchCount,
    branchDetails: availableNeonBranchDetails.extend({ truncated: z.literal(false) }).strict(),
  })
  .strict();

export const availableNeonInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    projectsTruncated: z.literal(false),
    unavailableProjectCount: z.literal(0),
    projects: z.array(completeNeonProject).max(20),
  })
  .strict();

export const partialNeonInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('partial'),
    projectsTruncated: z.boolean(),
    unavailableProjectCount: z.number().int().nonnegative(),
    projects: z.array(neonProject).max(20),
  })
  .strict();

export const unknownNeonInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: neonInventoryReason,
  })
  .strict();

export const neonInventoryObservation = z
  .discriminatedUnion('status', [
    availableNeonInventoryObservation,
    partialNeonInventoryObservation,
    unknownNeonInventoryObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status !== 'partial') return;

    const hasIncompleteProject = observation.projects.some(
      (project) =>
        project.branchCount.status === 'unknown' ||
        project.branchDetails.status === 'unknown' ||
        (project.branchDetails.status === 'available' && project.branchDetails.truncated),
    );
    if (
      observation.projectsTruncated ||
      observation.unavailableProjectCount > 0 ||
      hasIncompleteProject
    ) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'partial observations require an incompleteness signal',
    });
  });

const diagnosticDurationMs = z.number().int().nonnegative().max(75_000);
const diagnosticText = z.string().trim().min(1).max(256);

export const reportGenerateDiagnosticWarnings = [
  'replay_only',
  'limits_unavailable',
  'sign_out_failed',
] as const;
export const reportGenerateDiagnosticWarning = z.enum(reportGenerateDiagnosticWarnings);

export const reportGenerateDiagnosticPhases = [
  'sign_in',
  'target_read',
  'generate',
  'proof_read',
  'limits',
  'sign_out',
] as const;
export const reportGenerateDiagnosticPhase = z.enum(reportGenerateDiagnosticPhases);

export const reportGenerateDiagnosticFailureReasons = [
  'sign_in_failed',
  'target_not_found',
  'target_not_draft',
  'conflict',
  'usage_limit_exceeded',
  'rate_limited',
  'provider_error',
  'timeout',
  'invalid_response',
  'upstream_unavailable',
] as const;
export const reportGenerateDiagnosticFailureReason = z.enum(reportGenerateDiagnosticFailureReasons);

export const reportGenerateDiagnosticTarget = z
  .object({
    accountEmail: email,
    projectId,
    reportId,
    reportNumber: z.number().int().positive(),
  })
  .strict();

export const reportGenerateDiagnosticGeneration = z
  .object({
    httpStatus: z.literal(200),
    requestId: diagnosticText.nullable(),
    durationMs: diagnosticDurationMs,
    requestedAt: isoDateTime,
    finishedAt: isoDateTime,
    reportUpdatedAt: isoDateTime,
    generatedAt: isoDateTime,
    vendor: diagnosticText,
    model: diagnosticText,
    fixtureMode: z.enum(['live', 'replay']),
    idempotentReplay: z.boolean(),
  })
  .strict();

export const reportGenerateDiagnosticLimitSummary = z
  .object({
    limit: z.number().int().nonnegative().nullable(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative().nullable(),
    resetAt: isoDateTime,
    overridden: z.boolean(),
  })
  .strict();

export const reportGenerateDiagnosticLimits = z
  .object({
    plan,
    reportGenerate: reportGenerateDiagnosticLimitSummary,
    aiInputTokens: reportGenerateDiagnosticLimitSummary,
    aiOutputTokens: reportGenerateDiagnosticLimitSummary,
  })
  .strict();

export const unknownReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: z.literal('not_configured'),
  })
  .strict();

const reportGenerateDiagnosticPassGeneration = reportGenerateDiagnosticGeneration
  .extend({
    fixtureMode: z.literal('live'),
    idempotentReplay: z.literal(false),
  })
  .strict();

export const passedReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('pass'),
    durationMs: diagnosticDurationMs,
    target: reportGenerateDiagnosticTarget,
    generation: reportGenerateDiagnosticPassGeneration,
    limits: reportGenerateDiagnosticLimits,
    cleanup: z.literal('succeeded'),
  })
  .strict();

const uniqueReportGenerateDiagnosticWarnings = z
  .array(reportGenerateDiagnosticWarning)
  .min(1)
  .max(reportGenerateDiagnosticWarnings.length)
  .refine((warnings) => new Set(warnings).size === warnings.length, {
    message: 'diagnostic warnings must be unique',
  });

export const warningReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('warning'),
    durationMs: diagnosticDurationMs,
    target: reportGenerateDiagnosticTarget,
    generation: reportGenerateDiagnosticGeneration,
    limits: reportGenerateDiagnosticLimits.nullable(),
    cleanup: z.enum(['succeeded', 'failed']),
    warnings: uniqueReportGenerateDiagnosticWarnings,
  })
  .strict();

export const failedReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('fail'),
    durationMs: diagnosticDurationMs,
    phase: reportGenerateDiagnosticPhase,
    reason: reportGenerateDiagnosticFailureReason,
    cleanup: z.enum(['not_started', 'succeeded', 'failed']),
  })
  .strict();

export const reportGenerateDiagnosticObservation = z
  .discriminatedUnion('status', [
    unknownReportGenerateDiagnosticObservation,
    passedReportGenerateDiagnosticObservation,
    warningReportGenerateDiagnosticObservation,
    failedReportGenerateDiagnosticObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status !== 'warning') return;

    const expectedWarnings: ReportGenerateDiagnosticWarning[] = [];
    if (observation.generation.fixtureMode !== 'live' || observation.generation.idempotentReplay) {
      expectedWarnings.push('replay_only');
    }
    if (observation.limits === null) expectedWarnings.push('limits_unavailable');
    if (observation.cleanup === 'failed') expectedWarnings.push('sign_out_failed');

    const hasExactWarnings =
      expectedWarnings.length === observation.warnings.length &&
      expectedWarnings.every((warning) => observation.warnings.includes(warning));
    if (hasExactWarnings) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['warnings'],
      message: 'diagnostic warnings must exactly match the observation evidence',
    });
  });

export type NeonInventoryReason = z.infer<typeof neonInventoryReason>;
export type NeonBranch = z.infer<typeof neonBranch>;
export type NeonBranchCount = z.infer<typeof neonBranchCount>;
export type NeonBranchDetails = z.infer<typeof neonBranchDetails>;
export type NeonProject = z.infer<typeof neonProject>;
export type NeonInventoryObservation = z.infer<typeof neonInventoryObservation>;
export type ReportGenerateDiagnosticWarning = z.infer<typeof reportGenerateDiagnosticWarning>;
export type ReportGenerateDiagnosticPhase = z.infer<typeof reportGenerateDiagnosticPhase>;
export type ReportGenerateDiagnosticFailureReason = z.infer<
  typeof reportGenerateDiagnosticFailureReason
>;
export type ReportGenerateDiagnosticTarget = z.infer<typeof reportGenerateDiagnosticTarget>;
export type ReportGenerateDiagnosticGeneration = z.infer<typeof reportGenerateDiagnosticGeneration>;
export type ReportGenerateDiagnosticLimitSummary = z.infer<
  typeof reportGenerateDiagnosticLimitSummary
>;
export type ReportGenerateDiagnosticLimits = z.infer<typeof reportGenerateDiagnosticLimits>;
export type ReportGenerateDiagnosticObservation = z.infer<
  typeof reportGenerateDiagnosticObservation
>;
