import { z } from 'zod';
import { isoDateTime } from './_shared.js';

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

export type NeonInventoryReason = z.infer<typeof neonInventoryReason>;
export type NeonBranch = z.infer<typeof neonBranch>;
export type NeonBranchCount = z.infer<typeof neonBranchCount>;
export type NeonBranchDetails = z.infer<typeof neonBranchDetails>;
export type NeonProject = z.infer<typeof neonProject>;
export type NeonInventoryObservation = z.infer<typeof neonInventoryObservation>;
