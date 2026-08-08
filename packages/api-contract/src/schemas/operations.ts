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
const safeCount = z.number().int().nonnegative().safe();

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

export const neonUsageReasons = [
  'not_configured',
  'unsupported_plan',
  'unsafe_permissions',
  'timeout',
  'rate_limited',
  'forbidden',
  'not_found',
  'invalid_response',
  'provider_unavailable',
] as const;

export const neonUsageReason = z.enum(neonUsageReasons);

export const neonUsageProjectReasons = [
  'timeout',
  'rate_limited',
  'forbidden',
  'not_found',
  'invalid_response',
  'provider_unavailable',
] as const;

export const neonUsageProjectReason = z.enum(neonUsageProjectReasons);

export const neonUsageOrganizationTransferReasons = [
  'incomplete_project_coverage',
  'period_mismatch',
  'invalid_response',
  'no_projects',
] as const;

export const neonUsageOrganizationTransferReason = z.enum(neonUsageOrganizationTransferReasons);

export const neonUsageCaveats = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

export const neonUsageMetric = <
  const TAllowance extends 360_000 | 500_000_000,
  const TUnit extends 'cu_seconds' | 'bytes',
>(
  allowance: TAllowance,
  unit: TUnit,
) =>
  z
    .object({
      used: safeCount,
      allowance: z.literal(allowance),
      unit: z.literal(unit),
    })
    .strict();

export const availableNeonUsageProject = z
  .object({
    status: z.literal('available'),
    id: nonBlank,
    name: nonBlank,
    effectivePermission: z.literal('VIEWER'),
    periodStart: isoDateTime,
    periodEnd: isoDateTime,
    compute: neonUsageMetric(360_000, 'cu_seconds'),
    storage: neonUsageMetric(500_000_000, 'bytes'),
    transferBytes: safeCount,
  })
  .strict();

export const unknownNeonUsageProject = z
  .object({
    status: z.literal('unknown'),
    id: nonBlank,
    name: nonBlank,
    effectivePermission: z.literal('VIEWER'),
    reason: neonUsageProjectReason,
  })
  .strict();

export const neonUsageProject = z.discriminatedUnion('status', [
  availableNeonUsageProject,
  unknownNeonUsageProject,
]);

export const availableNeonUsageOrganizationTransfer = z
  .object({
    status: z.literal('available'),
    periodStart: isoDateTime,
    periodEnd: isoDateTime,
    used: safeCount,
    allowance: z.literal(5_000_000_000),
    unit: z.literal('bytes'),
  })
  .strict();

export const unknownNeonUsageOrganizationTransfer = z
  .object({
    status: z.literal('unknown'),
    reason: neonUsageOrganizationTransferReason,
  })
  .strict();

export const neonUsageOrganizationTransfer = z.discriminatedUnion('status', [
  availableNeonUsageOrganizationTransfer,
  unknownNeonUsageOrganizationTransfer,
]);

const exactNeonUsageCaveats = z.tuple([
  z.literal('provider_values_may_lag'),
  z.literal('free_plan_published_reference'),
  z.literal('storage_uses_published_reference'),
  z.literal('transfer_requires_complete_project_coverage'),
  z.literal('not_invoice_or_credit_balance'),
  z.literal('published_allowances_can_change'),
]);

export const availableNeonUsageObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    organizationId: nonBlank,
    plan: z.literal('free'),
    projectsTruncated: z.literal(false),
    unavailableProjectCount: z.literal(0),
    projects: z.array(availableNeonUsageProject).max(20),
    organizationTransfer: z.union([
      availableNeonUsageOrganizationTransfer,
      z.object({ status: z.literal('unknown'), reason: z.literal('no_projects') }).strict(),
    ]),
    caveats: exactNeonUsageCaveats,
  })
  .strict();

export const partialNeonUsageObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('partial'),
    organizationId: nonBlank,
    plan: z.literal('free'),
    projectsTruncated: z.boolean(),
    unavailableProjectCount: safeCount,
    projects: z.array(neonUsageProject).max(20),
    organizationTransfer: z.object({
      status: z.literal('unknown'),
      reason: z.enum(['incomplete_project_coverage', 'period_mismatch', 'invalid_response']),
    }),
    caveats: exactNeonUsageCaveats,
  })
  .strict();

export const unknownNeonUsageObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: neonUsageReason,
  })
  .strict();

export const neonUsageObservation = z
  .discriminatedUnion('status', [
    availableNeonUsageObservation,
    partialNeonUsageObservation,
    unknownNeonUsageObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status === 'unknown') return;

    const projects: z.infer<typeof neonUsageProject>[] = [...observation.projects];
    const availableProjects = projects.filter(
      (project): project is z.infer<typeof availableNeonUsageProject> =>
        project.status === 'available',
    );
    const unknownProjects = projects.filter(
      (project): project is z.infer<typeof unknownNeonUsageProject> => project.status === 'unknown',
    );
    const projectIds = projects.map((project) => project.id);
    if (new Set(projectIds).size !== projectIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projects'],
        message: 'project IDs must be unique',
      });
    }
    for (const project of availableProjects) {
      if (Date.parse(project.periodStart) <= Date.parse(project.periodEnd)) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projects', projects.indexOf(project), 'periodEnd'],
        message: 'periodEnd must be on or after periodStart',
      });
    }

    const hasTruncation = observation.projectsTruncated;
    const hasUnavailableProject = observation.unavailableProjectCount > 0;
    const hasUnknownProject = unknownProjects.length > 0;
    const hasIncompleteCoverage = hasTruncation || hasUnavailableProject || hasUnknownProject;
    const periods = availableProjects.map(
      (project) => `${project.periodStart}::${project.periodEnd}`,
    );
    const distinctPeriods = new Set(periods);
    const hasPeriodMismatch = availableProjects.length >= 2 && distinctPeriods.size > 1;
    const transferSum = availableProjects.reduce((sum, project) => sum + project.transferBytes, 0);
    const hasTransferOverflow = !Number.isSafeInteger(transferSum);

    if (observation.status === 'available') {
      if (unknownProjects.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projects'],
          message: 'available observations cannot include unknown projects',
        });
      }
      if (observation.organizationTransfer.status === 'unknown') {
        if (
          observation.organizationTransfer.reason === 'no_projects' &&
          observation.projects.length === 0
        ) {
          return;
        }
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer'],
          message: 'available observations require a complete organization transfer total',
        });
        return;
      }
      if (
        Date.parse(observation.organizationTransfer.periodStart) >
        Date.parse(observation.organizationTransfer.periodEnd)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer', 'periodEnd'],
          message: 'periodEnd must be on or after periodStart',
        });
      }
      if (hasPeriodMismatch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer'],
          message: 'available observations require aligned project periods',
        });
      }
      if (hasTransferOverflow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer'],
          message: 'available observations require a safe transfer sum',
        });
      }
      if (
        observation.organizationTransfer.periodStart !== availableProjects[0]?.periodStart ||
        observation.organizationTransfer.periodEnd !== availableProjects[0]?.periodEnd
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer'],
          message: 'organization transfer period must match project periods',
        });
      }
      if (observation.organizationTransfer.used !== transferSum) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['organizationTransfer', 'used'],
          message: 'organization transfer used must equal the summed project transfer',
        });
      }
      return;
    }

    switch (observation.organizationTransfer.reason) {
      case 'incomplete_project_coverage':
        if (hasIncompleteCoverage) return;
        break;
      case 'period_mismatch':
        if (!hasIncompleteCoverage && hasPeriodMismatch) return;
        break;
      case 'invalid_response':
        if (!hasIncompleteCoverage && !hasPeriodMismatch && hasTransferOverflow) return;
        break;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['organizationTransfer', 'reason'],
      message: 'organization transfer reason must match the returned evidence',
    });
  });

export const r2CapacityReasons = [
  'not_configured',
  'timeout',
  'rate_limited',
  'forbidden',
  'invalid_response',
  'provider_unavailable',
] as const;
export const r2CapacityReason = z.enum(r2CapacityReasons);

export const r2CapacityCaveats = [
  'storage_snapshot_not_gb_month',
  'storage_metrics_may_lag',
  'infrequent_access_not_covered_by_free_tier',
  'operations_estimated_from_analytics',
  'unclassified_operations_excluded',
  'bucket_inventory_truncated',
] as const;
export const r2CapacityCaveat = z.enum(r2CapacityCaveats);
const uniqueR2CapacityCaveats = z
  .array(r2CapacityCaveat)
  .min(3)
  .max(r2CapacityCaveats.length)
  .refine((caveats) => new Set(caveats).size === caveats.length, {
    message: 'R2 capacity caveats must be unique',
  });

export const r2Bucket = z
  .object({
    name: nonBlank,
    jurisdiction: z.enum(['default', 'eu', 'fedramp', 'unknown']),
    location: z.enum(['apac', 'eeur', 'enam', 'weur', 'wnam', 'oc']).nullable(),
    defaultStorageClass: z.enum(['standard', 'infrequent_access', 'unknown']),
    createdAt: isoDateTime.nullable(),
  })
  .strict();

export const availableR2BucketInventory = z
  .object({
    status: z.literal('available'),
    truncated: z.boolean(),
    items: z.array(r2Bucket).max(100),
  })
  .strict();

const completeR2BucketInventory = availableR2BucketInventory
  .extend({ truncated: z.literal(false) })
  .strict();

export const unknownR2BucketInventory = z
  .object({
    status: z.literal('unknown'),
    reason: r2CapacityReason,
  })
  .strict();

export const r2BucketInventory = z.discriminatedUnion('status', [
  availableR2BucketInventory,
  unknownR2BucketInventory,
]);

export const r2StorageClassSnapshot = z
  .object({
    publishedPayloadBytes: safeCount,
    publishedMetadataBytes: safeCount,
    publishedObjects: safeCount,
    uploadingPayloadBytes: safeCount,
    uploadingMetadataBytes: safeCount,
    uploadingObjects: safeCount,
  })
  .strict();

export const availableR2StorageObservation = z
  .object({
    status: z.literal('available'),
    standard: r2StorageClassSnapshot,
    infrequentAccess: r2StorageClassSnapshot,
  })
  .strict();

export const unknownR2StorageObservation = z
  .object({
    status: z.literal('unknown'),
    reason: r2CapacityReason,
  })
  .strict();

export const r2StorageObservation = z.discriminatedUnion('status', [
  availableR2StorageObservation,
  unknownR2StorageObservation,
]);

function r2OperationEstimate(allowance: 1_000_000 | 10_000_000) {
  return z
    .object({
      estimatedUsed: safeCount,
      publishedAllowance: z.literal(allowance),
      estimatedRemaining: safeCount,
    })
    .strict()
    .superRefine((value, ctx) => {
      const expectedRemaining = Math.max(0, allowance - value.estimatedUsed);
      if (value.estimatedRemaining === expectedRemaining) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimatedRemaining'],
        message: 'estimatedRemaining must match the published allowance minus estimatedUsed',
      });
    });
}

export const availableR2OperationsObservation = z
  .object({
    status: z.literal('available'),
    windowStart: isoDateTime,
    windowEnd: isoDateTime,
    classA: r2OperationEstimate(1_000_000),
    classB: r2OperationEstimate(10_000_000),
    freeRequests: safeCount,
    unclassifiedRequests: safeCount,
  })
  .strict();

const completeR2OperationsObservation = availableR2OperationsObservation
  .extend({ unclassifiedRequests: z.literal(0) })
  .strict();

export const unknownR2OperationsObservation = z
  .object({
    status: z.literal('unknown'),
    reason: r2CapacityReason,
  })
  .strict();

export const r2OperationsObservation = z.discriminatedUnion('status', [
  availableR2OperationsObservation,
  unknownR2OperationsObservation,
]);

export const r2FreeTierReference = z
  .object({
    storageGbMonth: z.literal(10),
    classAOperations: z.literal(1_000_000),
    classBOperations: z.literal(10_000_000),
    appliesTo: z.literal('standard_only'),
  })
  .strict();

export const availableR2CapacityObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    freeTierReference: r2FreeTierReference,
    buckets: completeR2BucketInventory,
    storage: availableR2StorageObservation,
    operations: completeR2OperationsObservation,
    caveats: uniqueR2CapacityCaveats,
  })
  .strict();

export const partialR2CapacityObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('partial'),
    freeTierReference: r2FreeTierReference,
    buckets: r2BucketInventory,
    storage: r2StorageObservation,
    operations: r2OperationsObservation,
    caveats: uniqueR2CapacityCaveats,
  })
  .strict();

export const unknownR2CapacityObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: r2CapacityReason,
  })
  .strict();

export const r2CapacityObservation = z
  .discriminatedUnion('status', [
    availableR2CapacityObservation,
    partialR2CapacityObservation,
    unknownR2CapacityObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status === 'unknown') return;

    const caveats = new Set(observation.caveats);
    const missingRequired = [
      'storage_snapshot_not_gb_month',
      'storage_metrics_may_lag',
      'operations_estimated_from_analytics',
    ].filter((caveat) => !caveats.has(caveat as (typeof r2CapacityCaveats)[number]));
    for (const caveat of missingRequired) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caveats'],
        message: `${caveat} is required on non-unknown R2 observations`,
      });
    }

    const infrequentAccessHasData =
      observation.storage.status === 'available' &&
      Object.values(observation.storage.infrequentAccess).some((value) => value > 0);
    if (infrequentAccessHasData && !caveats.has('infrequent_access_not_covered_by_free_tier')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caveats'],
        message: 'infrequent_access_not_covered_by_free_tier is required when IA data exists',
      });
    }

    const unclassifiedRequests =
      observation.operations.status === 'available'
        ? observation.operations.unclassifiedRequests
        : 0;
    if (unclassifiedRequests > 0 && !caveats.has('unclassified_operations_excluded')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caveats'],
        message: 'unclassified_operations_excluded is required when unclassified requests exist',
      });
    }

    const bucketsTruncated =
      observation.buckets.status === 'available' && observation.buckets.truncated;
    if (bucketsTruncated && !caveats.has('bucket_inventory_truncated')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caveats'],
        message: 'bucket_inventory_truncated is required when bucket inventory is truncated',
      });
    }

    if (observation.status === 'available') {
      return;
    }

    const hasIncompleteSignal =
      observation.buckets.status === 'unknown' ||
      observation.storage.status === 'unknown' ||
      observation.operations.status === 'unknown' ||
      bucketsTruncated ||
      unclassifiedRequests > 0;

    if (hasIncompleteSignal) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'partial observations require an incompleteness signal',
    });
  });

export const storageLifecycleReasons = [
  'rollout_state_missing',
  'timeout',
  'database_unavailable',
  'invalid_response',
] as const;
export const storageLifecycleReason = z.enum(storageLifecycleReasons);

export const storageLifecycleCaveats = [
  'db_state_not_worker_liveness',
  'queue_counts_not_provider_health',
  'empty_queue_not_execution_proof',
] as const;
export const storageLifecycleCaveat = z.enum(storageLifecycleCaveats);

export const storageLifecycleRollout = z
  .object({
    armedAt: isoDateTime.nullable(),
    enforceAfter: isoDateTime.nullable(),
    accountDeleteEnabled: z.boolean(),
    leaseEnforcementActive: z.boolean(),
    accountDeletionAvailable: z.boolean(),
    updatedAt: isoDateTime,
  })
  .strict();

export const storageLifecycleJobs = z
  .object({
    total: safeCount,
    initial: safeCount,
    final: safeCount,
    dueNow: safeCount,
    scheduled: safeCount,
    activeClaims: safeCount,
    staleClaims: safeCount,
    retrying: safeCount,
    maxAttemptCount: safeCount,
    oldestDueAt: isoDateTime.nullable(),
    nextRunAfter: isoDateTime.nullable(),
  })
  .strict();

const exactStorageLifecycleCaveats = z.tuple([
  z.literal('db_state_not_worker_liveness'),
  z.literal('queue_counts_not_provider_health'),
  z.literal('empty_queue_not_execution_proof'),
]);

export const availableStorageLifecycleObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    rollout: storageLifecycleRollout,
    jobs: storageLifecycleJobs,
    caveats: exactStorageLifecycleCaveats,
  })
  .strict();

export const unknownStorageLifecycleObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: storageLifecycleReason,
  })
  .strict();

export const storageLifecycleObservation = z
  .discriminatedUnion('status', [
    availableStorageLifecycleObservation,
    unknownStorageLifecycleObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status === 'unknown') return;

    const observedAt = Date.parse(observation.observedAt);
    const enforceAfter =
      observation.rollout.enforceAfter === null
        ? null
        : Date.parse(observation.rollout.enforceAfter);
    const expectedLeaseEnforcement = enforceAfter !== null && enforceAfter <= observedAt;
    if (observation.rollout.leaseEnforcementActive !== expectedLeaseEnforcement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollout', 'leaseEnforcementActive'],
        message: 'leaseEnforcementActive must match the database-clock enforcement threshold',
      });
    }

    const expectedAccountDeletion =
      observation.rollout.leaseEnforcementActive && observation.rollout.accountDeleteEnabled;
    if (observation.rollout.accountDeletionAvailable !== expectedAccountDeletion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollout', 'accountDeletionAvailable'],
        message: 'accountDeletionAvailable must match both rollout gates',
      });
    }

    const jobs = observation.jobs;
    if (jobs.initial + jobs.final !== jobs.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'total'],
        message: 'initial and final job counts must equal total',
      });
    }
    if (jobs.dueNow + jobs.scheduled !== jobs.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'total'],
        message: 'due-now and scheduled job counts must equal total',
      });
    }
    if (jobs.activeClaims + jobs.staleClaims > jobs.dueNow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'activeClaims'],
        message: 'active and stale claim counts cannot exceed due-now work',
      });
    }
    if (jobs.retrying > jobs.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'retrying'],
        message: 'retrying jobs cannot exceed total jobs',
      });
    }

    if ((jobs.oldestDueAt === null) !== (jobs.dueNow === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'oldestDueAt'],
        message: 'oldestDueAt must exist exactly when due-now work exists',
      });
    } else if (jobs.oldestDueAt !== null && Date.parse(jobs.oldestDueAt) > observedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'oldestDueAt'],
        message: 'oldestDueAt cannot be newer than the observation clock',
      });
    }

    if ((jobs.nextRunAfter === null) !== (jobs.scheduled === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'nextRunAfter'],
        message: 'nextRunAfter must exist exactly when scheduled work exists',
      });
    } else if (jobs.nextRunAfter !== null && Date.parse(jobs.nextRunAfter) <= observedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'nextRunAfter'],
        message: 'nextRunAfter must be newer than the observation clock',
      });
    }

    if (jobs.total === 0 && jobs.maxAttemptCount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs', 'maxAttemptCount'],
        message: 'an empty queue must have a zero maximum attempt count',
      });
    }
  });

export const flyInventoryReasons = [
  'not_configured',
  'timeout',
  'rate_limited',
  'forbidden',
  'not_found',
  'invalid_response',
  'provider_unavailable',
] as const;
export const flyInventoryReason = z.enum(flyInventoryReasons);

const flyProcessGroup = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'must be a lowercase DNS label of at most 63 characters',
  );

export const flyMachine = z
  .object({
    id: nonBlank,
    name: nonBlank,
    state: nonBlank,
    processGroup: flyProcessGroup.nullable(),
    region: nonBlank,
    cpuKind: nonBlank,
    cpus: safeCount,
    memoryMb: safeCount,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();

export const availableFlyMachineInventory = z
  .object({
    status: z.literal('available'),
    truncated: z.boolean(),
    items: z.array(flyMachine).max(50),
  })
  .strict();

const completeFlyMachineInventory = availableFlyMachineInventory
  .extend({ truncated: z.literal(false) })
  .strict();

export const unknownFlyMachineInventory = z
  .object({
    status: z.literal('unknown'),
    reason: flyInventoryReason,
  })
  .strict();

export const flyMachineInventory = z.discriminatedUnion('status', [
  availableFlyMachineInventory,
  unknownFlyMachineInventory,
]);

export const flyVolume = z
  .object({
    id: nonBlank,
    name: nonBlank,
    state: nonBlank,
    sizeGb: safeCount,
    region: nonBlank,
    encrypted: z.boolean(),
    attachedMachineId: nonBlank.nullable(),
    createdAt: isoDateTime,
    snapshotRetentionDays: safeCount.nullable(),
    autoBackupEnabled: z.boolean().nullable(),
  })
  .strict();

function validateFlyVolumeSum(
  inventory: { returnedAllocatedGb: number; items: Array<{ sizeGb: number }> },
  ctx: z.RefinementCtx,
): void {
  let returnedSum = 0;
  for (const item of inventory.items) {
    returnedSum += item.sizeGb;
    if (!Number.isSafeInteger(returnedSum)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['returnedAllocatedGb'],
        message: 'returned Volume allocation sum must remain a safe integer',
      });
      return;
    }
  }

  if (inventory.returnedAllocatedGb === returnedSum) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['returnedAllocatedGb'],
    message: 'returnedAllocatedGb must equal the sum of returned Volume sizes',
  });
}

export const availableFlyVolumeInventory = z
  .object({
    status: z.literal('available'),
    truncated: z.boolean(),
    returnedAllocatedGb: safeCount,
    items: z.array(flyVolume).max(50),
  })
  .strict()
  .superRefine(validateFlyVolumeSum);

const completeFlyVolumeInventory = z
  .object({
    status: z.literal('available'),
    truncated: z.literal(false),
    returnedAllocatedGb: safeCount,
    items: z.array(flyVolume).max(50),
  })
  .strict()
  .superRefine(validateFlyVolumeSum);

export const unknownFlyVolumeInventory = z
  .object({
    status: z.literal('unknown'),
    reason: flyInventoryReason,
  })
  .strict();

export const flyVolumeInventory = z.union([availableFlyVolumeInventory, unknownFlyVolumeInventory]);

export const flyApp = z
  .object({
    id: nonBlank,
    name: nonBlank,
    status: nonBlank,
    network: nonBlank.nullable(),
    reportedMachineCount: safeCount,
    reportedVolumeCount: safeCount,
    machines: flyMachineInventory,
    volumes: flyVolumeInventory,
  })
  .strict();

const completeFlyApp = z
  .object({
    id: nonBlank,
    name: nonBlank,
    status: nonBlank,
    network: nonBlank.nullable(),
    reportedMachineCount: safeCount,
    reportedVolumeCount: safeCount,
    machines: completeFlyMachineInventory,
    volumes: completeFlyVolumeInventory,
  })
  .strict();

const configuredFlyAppCount = z.number().int().min(1).max(10).safe();

export const availableFlyInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    organizationSlug: nonBlank,
    configuredAppCount: configuredFlyAppCount,
    unavailableConfiguredAppCount: z.literal(0),
    apps: z.array(completeFlyApp).min(1).max(10),
  })
  .strict();

export const partialFlyInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('partial'),
    organizationSlug: nonBlank,
    configuredAppCount: configuredFlyAppCount,
    unavailableConfiguredAppCount: safeCount.max(10),
    apps: z.array(flyApp).min(1).max(10),
  })
  .strict();

export const unknownFlyInventoryObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: flyInventoryReason,
  })
  .strict();

export const flyInventoryObservation = z
  .discriminatedUnion('status', [
    availableFlyInventoryObservation,
    partialFlyInventoryObservation,
    unknownFlyInventoryObservation,
  ])
  .superRefine((observation, ctx) => {
    if (observation.status === 'unknown') return;

    if (
      observation.apps.length + observation.unavailableConfiguredAppCount !==
      observation.configuredAppCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['configuredAppCount'],
        message: 'configured app count must equal returned plus unavailable configured apps',
      });
    }

    if (observation.status !== 'partial') return;
    const hasIncompleteApp = observation.apps.some(
      (app) =>
        app.machines.status === 'unknown' ||
        app.volumes.status === 'unknown' ||
        (app.machines.status === 'available' && app.machines.truncated) ||
        (app.volumes.status === 'available' && app.volumes.truncated),
    );
    if (observation.unavailableConfiguredAppCount > 0 || hasIncompleteApp) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'partial observations require an incompleteness signal',
    });
  });

const diagnosticDurationMs = z.number().int().nonnegative().max(75_000).safe();
const diagnosticObservationDurationMs = z.number().int().nonnegative().max(80_000).safe();
const diagnosticIdentifier = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const diagnosticPreviewText = z.string().refine((value) => [...value].length <= 400, {
  message: 'preview text must contain at most 400 Unicode code points',
});
const nullableDiagnosticPreviewText = diagnosticPreviewText.nullable();

export const aiUsageReasons = [
  'schema_unavailable',
  'database_unavailable',
  'timeout',
  'invalid_response',
] as const;
export const aiUsageReason = z.enum(aiUsageReasons);

export const aiUsageWarnings = [
  'unclassified_vendor_events',
  'missing_transcription_duration',
] as const;
export const aiUsageWarning = z.enum(aiUsageWarnings);

export const aiUsageProviderCategories = ['openai', 'groq', 'kimi', 'other'] as const;
export const aiUsageProviderCategory = z.enum(aiUsageProviderCategories);

export const aiUsageCaveats = [
  'best_effort_ledger',
  'not_provider_billing',
  'replay_not_provider_usage',
  'record_mode_calls_provider',
  'deleted_history_excluded',
] as const;

const aiUsageCount = z.number().int().nonnegative().safe();
const positiveAiUsageCount = z.number().int().positive().safe();
const aiUsageSeconds = z
  .number()
  .finite()
  .nonnegative()
  .multipleOf(0.001, 'AI usage seconds must have at most three decimal places');

function isExactSafeIntegerSum(values: number[], expected: number): boolean {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return false;
  }
  return total === expected;
}

function isZeroAiUsage(usage: {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputSeconds: number;
}): boolean {
  return (
    usage.inputTokens === 0 &&
    usage.outputTokens === 0 &&
    usage.cachedTokens === 0 &&
    usage.inputSeconds === 0
  );
}

export const aiCallOutcome = z
  .object({
    succeeded: aiUsageCount,
    failed: aiUsageCount,
    total: aiUsageCount,
  })
  .strict()
  .superRefine((outcome, ctx) => {
    if (isExactSafeIntegerSum([outcome.succeeded, outcome.failed], outcome.total)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total'],
      message: 'AI call total must equal succeeded plus failed',
    });
  });

export const aiSuccessfulProviderUsage = z
  .object({
    inputTokens: aiUsageCount,
    outputTokens: aiUsageCount,
    cachedTokens: aiUsageCount,
    inputSeconds: aiUsageSeconds,
  })
  .strict()
  .superRefine((usage, ctx) => {
    if (usage.cachedTokens <= usage.inputTokens) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cachedTokens'],
      message: 'cached tokens cannot exceed input tokens',
    });
  });

export const aiOperationUsage = z
  .object({
    liveSucceeded: aiUsageCount,
    liveFailed: aiUsageCount,
    recordSucceeded: aiUsageCount,
    recordFailed: aiUsageCount,
    replaySucceeded: aiUsageCount,
    replayFailed: aiUsageCount,
  })
  .strict();

const aiUsageCalls = z
  .object({
    live: aiCallOutcome,
    record: aiCallOutcome,
    replay: aiCallOutcome,
  })
  .strict();

export const aiUsageProvider = z
  .object({
    provider: aiUsageProviderCategory,
    recordedEventCount: positiveAiUsageCount,
    calls: aiUsageCalls,
    successfulProviderUsage: aiSuccessfulProviderUsage,
    lastRecordedAt: isoDateTime,
  })
  .strict()
  .superRefine((provider, ctx) => {
    if (
      !isExactSafeIntegerSum(
        [provider.calls.live.total, provider.calls.record.total, provider.calls.replay.total],
        provider.recordedEventCount,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recordedEventCount'],
        message: 'provider event count must equal live, record, and replay call totals',
      });
    }

    const successfulProviderCalls = provider.calls.live.succeeded + provider.calls.record.succeeded;
    if (successfulProviderCalls === 0 && !isZeroAiUsage(provider.successfulProviderUsage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage'],
        message: 'replay-only and failed calls cannot contribute provider usage',
      });
    }
  });

const uniqueAiUsageWarnings = z
  .array(aiUsageWarning)
  .max(aiUsageWarnings.length)
  .refine((warnings) => new Set(warnings).size === warnings.length, {
    message: 'AI usage warnings must be unique',
  });

const aiUsageOperationFields = [
  'liveSucceeded',
  'liveFailed',
  'recordSucceeded',
  'recordFailed',
  'replaySucceeded',
  'replayFailed',
] as const;

export const aiUsageWindow = z
  .object({
    windowStart: isoDateTime,
    windowEnd: isoDateTime,
    recordedEventCount: aiUsageCount,
    calls: aiUsageCalls,
    successfulProviderUsage: aiSuccessfulProviderUsage,
    operations: z
      .object({
        chat: aiOperationUsage,
        generateReport: aiOperationUsage,
        transcribe: aiOperationUsage,
      })
      .strict(),
    providers: z.array(aiUsageProvider).max(aiUsageProviderCategories.length),
    unclassifiedVendorEventCount: aiUsageCount,
    missingInputSecondsEventCount: aiUsageCount,
    lastRecordedAt: isoDateTime.nullable(),
    warnings: uniqueAiUsageWarnings,
  })
  .strict()
  .superRefine((window, ctx) => {
    const startMs = Date.parse(window.windowStart);
    const endMs = Date.parse(window.windowEnd);
    if (startMs >= endMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowStart'],
        message: 'AI usage window must be non-empty',
      });
    }

    if (
      !isExactSafeIntegerSum(
        [window.calls.live.total, window.calls.record.total, window.calls.replay.total],
        window.recordedEventCount,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recordedEventCount'],
        message: 'recorded event count must equal live, record, and replay call totals',
      });
    }

    const expectedOperationCounts = {
      liveSucceeded: window.calls.live.succeeded,
      liveFailed: window.calls.live.failed,
      recordSucceeded: window.calls.record.succeeded,
      recordFailed: window.calls.record.failed,
      replaySucceeded: window.calls.replay.succeeded,
      replayFailed: window.calls.replay.failed,
    };
    for (const field of aiUsageOperationFields) {
      if (
        isExactSafeIntegerSum(
          [
            window.operations.chat[field],
            window.operations.generateReport[field],
            window.operations.transcribe[field],
          ],
          expectedOperationCounts[field],
        )
      ) {
        continue;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operations', field],
        message: 'operation outcomes must equal the overall call outcomes',
      });
    }

    const providerNames = window.providers.map((provider) => provider.provider);
    if (new Set(providerNames).size !== providerNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providers'],
        message: 'AI usage providers must be unique',
      });
    }

    if (
      !isExactSafeIntegerSum(
        window.providers.map((provider) => provider.recordedEventCount),
        window.recordedEventCount,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providers'],
        message: 'provider event counts must equal the overall recorded event count',
      });
    }

    for (const mode of ['live', 'record', 'replay'] as const) {
      for (const outcome of ['succeeded', 'failed', 'total'] as const) {
        if (
          isExactSafeIntegerSum(
            window.providers.map((provider) => provider.calls[mode][outcome]),
            window.calls[mode][outcome],
          )
        ) {
          continue;
        }
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['providers', mode, outcome],
          message: 'provider call outcomes must equal overall call outcomes',
        });
      }
    }

    for (const field of ['inputTokens', 'outputTokens', 'cachedTokens'] as const) {
      if (
        isExactSafeIntegerSum(
          window.providers.map((provider) => provider.successfulProviderUsage[field]),
          window.successfulProviderUsage[field],
        )
      ) {
        continue;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage', field],
        message: 'provider token totals must equal the overall token total',
      });
    }

    const providerSeconds = window.providers.reduce(
      (total, provider) => total + provider.successfulProviderUsage.inputSeconds,
      0,
    );
    const roundedProviderSeconds = Math.round(providerSeconds * 1_000) / 1_000;
    if (
      !Number.isFinite(providerSeconds) ||
      roundedProviderSeconds !== window.successfulProviderUsage.inputSeconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage', 'inputSeconds'],
        message: 'provider seconds must equal the overall seconds total',
      });
    }

    const otherProviderCount = window.providers
      .filter((provider) => provider.provider === 'other')
      .reduce((total, provider) => total + provider.recordedEventCount, 0);
    if (otherProviderCount !== window.unclassifiedVendorEventCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unclassifiedVendorEventCount'],
        message: 'unclassified vendor count must equal other-provider events',
      });
    }

    const successfulTokenOperations =
      window.operations.chat.liveSucceeded +
      window.operations.chat.recordSucceeded +
      window.operations.generateReport.liveSucceeded +
      window.operations.generateReport.recordSucceeded;
    if (
      successfulTokenOperations === 0 &&
      (window.successfulProviderUsage.inputTokens !== 0 ||
        window.successfulProviderUsage.outputTokens !== 0 ||
        window.successfulProviderUsage.cachedTokens !== 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage'],
        message: 'only successful chat and report provider calls contribute tokens',
      });
    }

    const successfulTranscriptions =
      window.operations.transcribe.liveSucceeded + window.operations.transcribe.recordSucceeded;
    if (
      successfulTranscriptions === 0 &&
      (window.successfulProviderUsage.inputSeconds !== 0 ||
        window.missingInputSecondsEventCount !== 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage', 'inputSeconds'],
        message: 'only successful transcription provider calls contribute duration',
      });
    }
    if (window.missingInputSecondsEventCount > successfulTranscriptions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['missingInputSecondsEventCount'],
        message: 'missing duration events cannot exceed successful provider transcriptions',
      });
    }
    if (
      successfulTranscriptions > 0 &&
      window.missingInputSecondsEventCount === successfulTranscriptions &&
      window.successfulProviderUsage.inputSeconds !== 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['successfulProviderUsage', 'inputSeconds'],
        message: 'all-missing transcription durations cannot contribute input seconds',
      });
    }

    const expectedWarnings: Array<z.infer<typeof aiUsageWarning>> = [];
    if (window.unclassifiedVendorEventCount > 0) {
      expectedWarnings.push('unclassified_vendor_events');
    }
    if (window.missingInputSecondsEventCount > 0) {
      expectedWarnings.push('missing_transcription_duration');
    }
    if (
      expectedWarnings.length !== window.warnings.length ||
      !expectedWarnings.every((warning) => window.warnings.includes(warning))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warnings'],
        message: 'AI usage warnings must exactly match their evidence',
      });
    }

    const providerTimes = window.providers.map((provider, index) => {
      const recordedMs = Date.parse(provider.lastRecordedAt);
      if (recordedMs < startMs || recordedMs >= endMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['providers', index, 'lastRecordedAt'],
          message: 'provider last-recorded time must fall within the observation window',
        });
      }
      return recordedMs;
    });

    if (window.recordedEventCount === 0) {
      if (window.lastRecordedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lastRecordedAt'],
          message: 'empty AI usage windows cannot have a last-recorded time',
        });
      }
      return;
    }

    if (window.lastRecordedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastRecordedAt'],
        message: 'non-empty AI usage windows require a last-recorded time',
      });
      return;
    }

    const lastRecordedMs = Date.parse(window.lastRecordedAt);
    if (lastRecordedMs < startMs || lastRecordedMs >= endMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastRecordedAt'],
        message: 'last-recorded time must fall within the observation window',
      });
    }
    if (providerTimes.length === 0 || lastRecordedMs !== Math.max(...providerTimes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastRecordedAt'],
        message: 'last-recorded time must equal the latest provider event time',
      });
    }
  });

export const aiProviderCapacity = z
  .object({
    openai: z.object({ status: z.literal('unknown'), reason: z.literal('not_observed') }).strict(),
    groq: z.object({ status: z.literal('unknown'), reason: z.literal('not_observed') }).strict(),
    kimi: z.object({ status: z.literal('unknown'), reason: z.literal('not_observed') }).strict(),
  })
  .strict();

const fixedAiUsageCaveats = z.tuple([
  z.literal('best_effort_ledger'),
  z.literal('not_provider_billing'),
  z.literal('replay_not_provider_usage'),
  z.literal('record_mode_calls_provider'),
  z.literal('deleted_history_excluded'),
]);

export const availableAiUsageObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('available'),
    source: z.literal('harpa_usage_ledger'),
    monthToDate: aiUsageWindow,
    last24Hours: aiUsageWindow,
    providerCapacity: aiProviderCapacity,
    caveats: fixedAiUsageCaveats,
  })
  .strict();

export const unknownAiUsageObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('unknown'),
    reason: aiUsageReason,
  })
  .strict();

export const aiUsageObservation = z
  .discriminatedUnion('status', [availableAiUsageObservation, unknownAiUsageObservation])
  .superRefine((observation, ctx) => {
    if (observation.status === 'unknown') return;

    for (const [field, window] of [
      ['monthToDate', observation.monthToDate],
      ['last24Hours', observation.last24Hours],
    ] as const) {
      if (window.windowEnd === observation.observedAt) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, 'windowEnd'],
        message: 'AI usage window end must equal observedAt',
      });
    }

    const observed = new Date(observation.observedAt);
    const expectedMonthStart = new Date(
      Date.UTC(observed.getUTCFullYear(), observed.getUTCMonth(), 1),
    ).toISOString();
    if (observation.monthToDate.windowStart !== expectedMonthStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthToDate', 'windowStart'],
        message: 'month-to-date window must start at the first UTC instant of the month',
      });
    }

    const expectedLast24HoursStart = new Date(
      observed.getTime() - 24 * 60 * 60 * 1_000,
    ).toISOString();
    if (observation.last24Hours.windowStart !== expectedLast24HoursStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['last24Hours', 'windowStart'],
        message: 'last-24-hour window must start exactly 24 hours before observedAt',
      });
    }
  });

export const reportGenerateDiagnosticWarnings = ['limits_unavailable', 'sign_out_failed'] as const;
export const reportGenerateDiagnosticWarning = z.enum(reportGenerateDiagnosticWarnings);

export const reportGenerateDiagnosticPhases = [
  'sign_in',
  'target_read',
  'mode_gate',
  'generate',
  'proof_read',
  'usage_window',
  'usage_proof',
  'preview',
  'limits',
  'sign_out',
] as const;
export const reportGenerateDiagnosticPhase = z.enum(reportGenerateDiagnosticPhases);

export const reportGenerateDiagnosticFailureReasons = [
  'sign_in_failed',
  'target_not_found',
  'target_not_draft',
  'conflict',
  'live_mode_required',
  'live_proof_failed',
  'usage_proof_missing',
  'usage_proof_ambiguous',
  'preview_invalid',
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
    reportNumber: z.number().int().positive().safe(),
  })
  .strict();

export const reportGenerateDiagnosticGeneration = z
  .object({
    httpStatus: z.literal(200),
    requestId: diagnosticIdentifier.nullable(),
    durationMs: diagnosticDurationMs,
    requestedAt: isoDateTime,
    finishedAt: isoDateTime,
    reportUpdatedAt: isoDateTime,
    generatedAt: isoDateTime,
    vendor: diagnosticIdentifier,
    model: diagnosticIdentifier,
    fixtureMode: z.literal('live'),
    idempotentReplay: z.literal(false),
  })
  .strict()
  .superRefine((generation, ctx) => {
    const generatedAt = Date.parse(generation.generatedAt);
    const requestedAt = Date.parse(generation.requestedAt);
    const finishedAt = Date.parse(generation.finishedAt);
    const reportUpdatedAt = Date.parse(generation.reportUpdatedAt);

    if (generatedAt > requestedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['generatedAt'],
        message: 'generation proof must not be newer than the request lower bound',
      });
    }
    if (finishedAt < requestedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finishedAt'],
        message: 'request completion must not precede the request lower bound',
      });
    }
    if (reportUpdatedAt < finishedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reportUpdatedAt'],
        message: 'report update must not precede request completion',
      });
    }
  });

export const reportGenerateDiagnosticUsage = z
  .object({
    inputTokens: safeCount,
    outputTokens: safeCount,
    cachedTokens: safeCount,
    latencyMs: diagnosticDurationMs,
    matched: z.literal(true),
  })
  .strict()
  .superRefine((usage, ctx) => {
    if (usage.inputTokens + usage.outputTokens === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputTokens'],
        message: 'live usage proof must contain at least one token',
      });
    }
    if (usage.cachedTokens > usage.inputTokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cachedTokens'],
        message: 'cached tokens must not exceed input tokens',
      });
    }
  });

export const reportGenerateDiagnosticPreviewWorker = z
  .object({
    role: diagnosticPreviewText,
    count: nullableDiagnosticPreviewText,
    hours: nullableDiagnosticPreviewText,
    notes: nullableDiagnosticPreviewText,
  })
  .strict();

export const reportGenerateDiagnosticPreviewMaterial = z
  .object({
    name: diagnosticPreviewText,
    quantity: nullableDiagnosticPreviewText,
    unit: nullableDiagnosticPreviewText,
    status: nullableDiagnosticPreviewText,
    condition: nullableDiagnosticPreviewText,
    notes: nullableDiagnosticPreviewText,
  })
  .strict();

export const reportGenerateDiagnosticPreviewIssue = z
  .object({
    title: diagnosticPreviewText,
    severity: nullableDiagnosticPreviewText,
    description: nullableDiagnosticPreviewText,
    action: nullableDiagnosticPreviewText,
  })
  .strict();

export const reportGenerateDiagnosticPreviewSection = z
  .object({
    title: diagnosticPreviewText,
    body: diagnosticPreviewText,
  })
  .strict();

export const reportGenerateDiagnosticPreviewSample = z
  .object({
    title: nullableDiagnosticPreviewText,
    summary: nullableDiagnosticPreviewText,
    weather: z
      .object({
        condition: nullableDiagnosticPreviewText,
        temperature: nullableDiagnosticPreviewText,
        wind: nullableDiagnosticPreviewText,
        impact: nullableDiagnosticPreviewText,
      })
      .strict()
      .nullable(),
    workers: z.array(reportGenerateDiagnosticPreviewWorker).max(5),
    materials: z.array(reportGenerateDiagnosticPreviewMaterial).max(5),
    issues: z.array(reportGenerateDiagnosticPreviewIssue).max(5),
    nextSteps: z.array(diagnosticPreviewText).max(5),
    summarySections: z.array(reportGenerateDiagnosticPreviewSection).max(5),
  })
  .strict();

export const reportGenerateDiagnosticPreviewCounts = z
  .object({
    workers: safeCount,
    materials: safeCount,
    issues: safeCount,
    nextSteps: safeCount,
    summarySections: safeCount,
    imageAttachments: safeCount,
    documentAttachments: safeCount,
  })
  .strict();

const diagnosticPreviewArrayNames = [
  'workers',
  'materials',
  'issues',
  'nextSteps',
  'summarySections',
] as const;

export const reportGenerateDiagnosticPreview = z
  .object({
    schemaValid: z.literal(true),
    sample: reportGenerateDiagnosticPreviewSample,
    counts: reportGenerateDiagnosticPreviewCounts,
    truncated: z.boolean(),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((preview, ctx) => {
    let requiresTruncation =
      preview.counts.imageAttachments > 0 || preview.counts.documentAttachments > 0;

    for (const name of diagnosticPreviewArrayNames) {
      const expectedSampleSize = Math.min(preview.counts[name], 5);
      if (preview.sample[name].length !== expectedSampleSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sample', name],
          message: 'preview sample size must match the bounded structural count',
        });
      }
      if (preview.counts[name] > preview.sample[name].length) requiresTruncation = true;
    }

    if (requiresTruncation && !preview.truncated) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['truncated'],
        message: 'preview must disclose omitted structural or attachment data',
      });
    }
  });

export const reportGenerateDiagnosticLimitSummary = z
  .object({
    limit: safeCount.nullable(),
    used: safeCount,
    remaining: safeCount.nullable(),
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
    reason: z.enum(['not_configured', 'not_enabled']),
  })
  .strict();

export const passedReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('pass'),
    durationMs: diagnosticObservationDurationMs,
    target: reportGenerateDiagnosticTarget,
    generation: reportGenerateDiagnosticGeneration,
    preview: reportGenerateDiagnosticPreview,
    usage: reportGenerateDiagnosticUsage,
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
    durationMs: diagnosticObservationDurationMs,
    target: reportGenerateDiagnosticTarget,
    generation: reportGenerateDiagnosticGeneration,
    preview: reportGenerateDiagnosticPreview,
    usage: reportGenerateDiagnosticUsage,
    limits: reportGenerateDiagnosticLimits.nullable(),
    cleanup: z.enum(['succeeded', 'failed']),
    warnings: uniqueReportGenerateDiagnosticWarnings,
  })
  .strict();

export const failedReportGenerateDiagnosticObservation = z
  .object({
    observedAt: isoDateTime,
    status: z.literal('fail'),
    durationMs: diagnosticObservationDurationMs,
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
export type NeonUsageReason = z.infer<typeof neonUsageReason>;
export type NeonUsageProjectReason = z.infer<typeof neonUsageProjectReason>;
export type NeonUsageOrganizationTransferReason = z.infer<
  typeof neonUsageOrganizationTransferReason
>;
export type NeonUsageMetric = z.infer<typeof availableNeonUsageProject>['compute' | 'storage'];
export type NeonUsageProject = z.infer<typeof neonUsageProject>;
export type NeonUsageOrganizationTransfer = z.infer<typeof neonUsageOrganizationTransfer>;
export type NeonUsageObservation = z.infer<typeof neonUsageObservation>;
export type R2CapacityReason = z.infer<typeof r2CapacityReason>;
export type R2CapacityCaveat = z.infer<typeof r2CapacityCaveat>;
export type R2Bucket = z.infer<typeof r2Bucket>;
export type R2BucketInventory = z.infer<typeof r2BucketInventory>;
export type R2StorageClassSnapshot = z.infer<typeof r2StorageClassSnapshot>;
export type R2StorageObservation = z.infer<typeof r2StorageObservation>;
export type R2OperationEstimate = z.infer<ReturnType<typeof r2OperationEstimate>>;
export type R2OperationsObservation = z.infer<typeof r2OperationsObservation>;
export type R2FreeTierReference = z.infer<typeof r2FreeTierReference>;
export type R2CapacityObservation = z.infer<typeof r2CapacityObservation>;
export type StorageLifecycleReason = z.infer<typeof storageLifecycleReason>;
export type StorageLifecycleCaveat = z.infer<typeof storageLifecycleCaveat>;
export type StorageLifecycleRollout = z.infer<typeof storageLifecycleRollout>;
export type StorageLifecycleJobs = z.infer<typeof storageLifecycleJobs>;
export type StorageLifecycleObservation = z.infer<typeof storageLifecycleObservation>;
export type FlyInventoryReason = z.infer<typeof flyInventoryReason>;
export type FlyMachine = z.infer<typeof flyMachine>;
export type FlyMachineInventory = z.infer<typeof flyMachineInventory>;
export type FlyVolume = z.infer<typeof flyVolume>;
export type FlyVolumeInventory = z.infer<typeof flyVolumeInventory>;
export type FlyApp = z.infer<typeof flyApp>;
export type FlyInventoryObservation = z.infer<typeof flyInventoryObservation>;
export type AiUsageReason = z.infer<typeof aiUsageReason>;
export type AiUsageWarning = z.infer<typeof aiUsageWarning>;
export type AiUsageProviderCategory = z.infer<typeof aiUsageProviderCategory>;
export type AiCallOutcome = z.infer<typeof aiCallOutcome>;
export type AiSuccessfulProviderUsage = z.infer<typeof aiSuccessfulProviderUsage>;
export type AiOperationUsage = z.infer<typeof aiOperationUsage>;
export type AiUsageProvider = z.infer<typeof aiUsageProvider>;
export type AiUsageWindow = z.infer<typeof aiUsageWindow>;
export type AiProviderCapacity = z.infer<typeof aiProviderCapacity>;
export type AiUsageObservation = z.infer<typeof aiUsageObservation>;
export type ReportGenerateDiagnosticWarning = z.infer<typeof reportGenerateDiagnosticWarning>;
export type ReportGenerateDiagnosticPhase = z.infer<typeof reportGenerateDiagnosticPhase>;
export type ReportGenerateDiagnosticFailureReason = z.infer<
  typeof reportGenerateDiagnosticFailureReason
>;
export type ReportGenerateDiagnosticTarget = z.infer<typeof reportGenerateDiagnosticTarget>;
export type ReportGenerateDiagnosticGeneration = z.infer<typeof reportGenerateDiagnosticGeneration>;
export type ReportGenerateDiagnosticUsage = z.infer<typeof reportGenerateDiagnosticUsage>;
export type ReportGenerateDiagnosticPreviewWorker = z.infer<
  typeof reportGenerateDiagnosticPreviewWorker
>;
export type ReportGenerateDiagnosticPreviewMaterial = z.infer<
  typeof reportGenerateDiagnosticPreviewMaterial
>;
export type ReportGenerateDiagnosticPreviewIssue = z.infer<
  typeof reportGenerateDiagnosticPreviewIssue
>;
export type ReportGenerateDiagnosticPreviewSection = z.infer<
  typeof reportGenerateDiagnosticPreviewSection
>;
export type ReportGenerateDiagnosticPreviewSample = z.infer<
  typeof reportGenerateDiagnosticPreviewSample
>;
export type ReportGenerateDiagnosticPreviewCounts = z.infer<
  typeof reportGenerateDiagnosticPreviewCounts
>;
export type ReportGenerateDiagnosticPreview = z.infer<typeof reportGenerateDiagnosticPreview>;
export type ReportGenerateDiagnosticLimitSummary = z.infer<
  typeof reportGenerateDiagnosticLimitSummary
>;
export type ReportGenerateDiagnosticLimits = z.infer<typeof reportGenerateDiagnosticLimits>;
export type ReportGenerateDiagnosticObservation = z.infer<
  typeof reportGenerateDiagnosticObservation
>;
