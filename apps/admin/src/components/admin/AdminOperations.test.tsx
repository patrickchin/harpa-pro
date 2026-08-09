// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../lib/admin-auth', () => ({
  adminAuthClient: authMock,
}));

vi.mock('../../lib/env', () => ({
  getPublicEnv: () => ({
    apiBaseUrl: 'https://api.example.test',
    siteBaseUrl: 'https://site.example.test',
    dashboardUrl: 'https://dashboard.example.test',
  }),
}));

import AdminOperations from './AdminOperations';

const adminSession = {
  authenticated: true as const,
  email: 'admin@harpapro.com',
  csrfToken: 'csrf-current-admin-session-token',
};

const observedAt = '2026-08-08T05:30:00.000Z';
const resetAt = '2026-09-01T00:00:00.000Z';
const apiGitCommit = '1111111111111111111111111111111111111111';
const adminPagesCommit = '2222222222222222222222222222222222222222';
const publicPagesCommit = '3333333333333333333333333333333333333333';
const dashboardPagesCommit = '4444444444444444444444444444444444444444';
const productMigrationHead = '0028_report_version_monotonic.sql';
const adminMigrationHead = '0002_admin_rate_limit_buckets.sql';

const apiIdentity = {
  ok: true as const,
  service: 'api' as const,
  version: '0.1.65',
  gitCommit: apiGitCommit,
  buildTime: '2026-08-08T04:45:00.000Z',
};

const productReadiness = {
  ok: true as const,
  db: 'up' as const,
  head: productMigrationHead,
};

const adminReadiness = {
  ok: true as const,
  db: 'up' as const,
  head: adminMigrationHead,
};

const adminPagesMarker = {
  commit: adminPagesCommit,
  branch: 'pr-315',
};

const publicPagesMarker = {
  commit: publicPagesCommit,
  branch: 'main',
};

const dashboardPagesMarker = {
  commit: dashboardPagesCommit,
  branch: 'dev',
};

const escapedPreviewTitle = '<script>window.canaryPreviewLeak = true</script>';
const escapedPreviewSummary = '<img src=x onerror="window.canaryImageLeak = true">';

const passCanary = {
  observedAt,
  status: 'pass' as const,
  durationMs: 1_842,
  target: {
    accountEmail: 'report-canary@e2e.harpapro.com',
    projectId: 'prj_01234567',
    reportId: 'rpt_01234567',
    reportNumber: 42,
  },
  generation: {
    httpStatus: 200,
    requestId: 'req-report-canary-1',
    durationMs: 1_300,
    requestedAt: '2026-08-08T05:29:58.000Z',
    finishedAt: '2026-08-08T05:29:59.300Z',
    reportUpdatedAt: '2026-08-08T05:29:59.500Z',
    generatedAt: '2026-08-08T05:29:57.000Z',
    vendor: 'openai',
    model: 'gpt-5.1',
    fixtureMode: 'live' as const,
    idempotentReplay: false,
  },
  preview: {
    schemaValid: true as const,
    sample: {
      title: escapedPreviewTitle,
      summary: escapedPreviewSummary,
      weather: {
        condition: 'Light rain',
        temperature: '18 C',
        wind: '12 km/h',
        impact: 'External work paused',
      },
      workers: Array.from({ length: 5 }, (_, index) => ({
        role: `Synthetic worker role ${index + 1}`,
        count: `Synthetic worker count ${index + 1}`,
        hours: `Synthetic worker hours ${index + 1}`,
        notes: `Synthetic worker notes ${index + 1}`,
      })),
      materials: Array.from({ length: 5 }, (_, index) => ({
        name: `Synthetic material ${index + 1}`,
        quantity: `Synthetic material quantity ${index + 1}`,
        unit: `Synthetic material unit ${index + 1}`,
        status: `Synthetic material status ${index + 1}`,
        condition: `Synthetic material condition ${index + 1}`,
        notes: `Synthetic material notes ${index + 1}`,
      })),
      issues: Array.from({ length: 5 }, (_, index) => ({
        title: `Synthetic issue ${index + 1}`,
        severity: `Synthetic issue severity ${index + 1}`,
        description: `Synthetic issue description ${index + 1}`,
        action: `Synthetic issue action ${index + 1}`,
      })),
      nextSteps: Array.from({ length: 5 }, (_, index) => `Synthetic next step ${index + 1}`),
      summarySections: Array.from({ length: 5 }, (_, index) => ({
        title: `Synthetic summary title ${index + 1}`,
        body: `Synthetic summary body ${index + 1}`,
      })),
    },
    counts: {
      workers: 8,
      materials: 7,
      issues: 6,
      nextSteps: 9,
      summarySections: 6,
      imageAttachments: 2,
      documentAttachments: 1,
    },
    truncated: true,
    bodySha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  usage: {
    inputTokens: 321,
    outputTokens: 123,
    cachedTokens: 45,
    latencyMs: 876,
    matched: true as const,
  },
  limits: {
    plan: 'free' as const,
    reportGenerate: {
      limit: 10,
      used: 2,
      remaining: 8,
      resetAt,
      overridden: false,
    },
    aiInputTokens: {
      limit: 1_000_000,
      used: 125_000,
      remaining: 875_000,
      resetAt,
      overridden: true,
    },
    aiOutputTokens: {
      limit: null,
      used: 4_200,
      remaining: null,
      resetAt,
      overridden: false,
    },
  },
  cleanup: 'succeeded' as const,
};

const unknownCanary = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const applicationProject = {
  id: 'prj_application',
  name: 'Application database',
  regionId: 'aws-ap-southeast-1',
  pgVersion: 17,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-08-08T04:00:00.000Z',
  effectivePermission: 'VIEWER' as const,
  branchCount: { status: 'available' as const, count: 147 },
  branchDetails: {
    status: 'available' as const,
    truncated: false,
    branches: [
      {
        id: 'br_main',
        name: 'main',
        parentId: null,
        currentState: 'ready',
        default: true,
        protected: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-08-08T04:00:00.000Z',
      },
      {
        id: 'br_dev',
        name: 'dev',
        parentId: 'br_main',
        currentState: 'ready',
        default: false,
        protected: false,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-08-08T03:00:00.000Z',
      },
    ],
  },
};

const availableInventory = {
  observedAt,
  status: 'available' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [applicationProject],
};

const emptyInventory = {
  observedAt,
  status: 'available' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [],
};

const neonUsageCaveats = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

const availableNeonUsageProject = {
  id: 'tiny-tree-06262558',
  name: 'Application database',
  status: 'available' as const,
  effectivePermission: 'VIEWER' as const,
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: resetAt,
  compute: {
    used: 90_000,
    allowance: 360_000 as const,
    unit: 'cu_seconds' as const,
  },
  storage: {
    used: 125_000_000,
    allowance: 500_000_000 as const,
    unit: 'bytes' as const,
  },
  transferBytes: 1_250_000_000,
};

const availableNeonUsage = {
  observedAt,
  status: 'available' as const,
  organizationId: 'org-harpa-pro-12345678',
  plan: 'free' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [availableNeonUsageProject],
  organizationTransfer: {
    status: 'available' as const,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: resetAt,
    used: availableNeonUsageProject.transferBytes,
    allowance: 5_000_000_000 as const,
    unit: 'bytes' as const,
  },
  caveats: neonUsageCaveats,
};

const overAllowanceNeonUsage = {
  ...availableNeonUsage,
  projects: [
    {
      ...availableNeonUsageProject,
      compute: {
        ...availableNeonUsageProject.compute,
        used: 400_000,
      },
      storage: {
        ...availableNeonUsageProject.storage,
        used: 600_000_000,
      },
      transferBytes: 6_000_000_000,
    },
  ],
  organizationTransfer: {
    ...availableNeonUsage.organizationTransfer,
    used: 6_000_000_000,
  },
};

const unknownNeonUsage = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const emptyNeonUsage = {
  ...availableNeonUsage,
  projects: [],
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'no_projects' as const,
  },
};

const partialEmptyNeonUsage = {
  ...emptyNeonUsage,
  status: 'partial' as const,
  projectsTruncated: true,
  unavailableProjectCount: 1,
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'incomplete_project_coverage' as const,
  },
};

const partialNeonUsage = {
  ...availableNeonUsage,
  status: 'partial' as const,
  projects: [
    availableNeonUsageProject,
    {
      id: 'floral-brook-39718990',
      name: 'Admin database',
      status: 'unknown' as const,
      effectivePermission: 'VIEWER' as const,
      reason: 'timeout' as const,
    },
  ],
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'incomplete_project_coverage' as const,
  },
};

const availableR2Capacity = {
  observedAt,
  status: 'available' as const,
  freeTierReference: {
    storageGbMonth: 10 as const,
    classAOperations: 1_000_000 as const,
    classBOperations: 10_000_000 as const,
    appliesTo: 'standard_only' as const,
  },
  buckets: {
    status: 'available' as const,
    truncated: false,
    items: [
      {
        name: 'harpa-pro',
        jurisdiction: 'default' as const,
        location: 'apac' as const,
        defaultStorageClass: 'standard' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      {
        name: 'harpa-pro-archive',
        jurisdiction: 'eu' as const,
        location: 'weur' as const,
        defaultStorageClass: 'infrequent_access' as const,
        createdAt: null,
      },
    ],
  },
  storage: {
    status: 'available' as const,
    standard: {
      publishedPayloadBytes: 61_000_000,
      publishedMetadataBytes: 596_713,
      publishedObjects: 138,
      uploadingPayloadBytes: 1_024,
      uploadingMetadataBytes: 128,
      uploadingObjects: 1,
    },
    infrequentAccess: {
      publishedPayloadBytes: 12_000_000,
      publishedMetadataBytes: 120_000,
      publishedObjects: 7,
      uploadingPayloadBytes: 0,
      uploadingMetadataBytes: 0,
      uploadingObjects: 0,
    },
  },
  operations: {
    status: 'available' as const,
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: observedAt,
    classA: {
      estimatedUsed: 125_000,
      publishedAllowance: 1_000_000 as const,
      estimatedRemaining: 875_000,
    },
    classB: {
      estimatedUsed: 4_200_000,
      publishedAllowance: 10_000_000 as const,
      estimatedRemaining: 5_800_000,
    },
    freeRequests: 32_000,
    unclassifiedRequests: 0,
  },
  caveats: [
    'storage_snapshot_not_gb_month',
    'storage_metrics_may_lag',
    'infrequent_access_not_covered_by_free_tier',
    'operations_estimated_from_analytics',
  ] as const,
};

const unknownR2Capacity = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const availableStorageLifecycle = {
  observedAt,
  status: 'available' as const,
  rollout: {
    armedAt: '2026-08-08T05:00:00.000Z',
    enforceAfter: '2026-08-08T05:10:00.000Z',
    accountDeleteEnabled: false,
    leaseEnforcementActive: true,
    accountDeletionAvailable: false,
    updatedAt: '2026-08-08T05:20:00.000Z',
  },
  jobs: {
    total: 7,
    initial: 4,
    final: 3,
    dueNow: 5,
    scheduled: 2,
    activeClaims: 1,
    staleClaims: 2,
    retrying: 3,
    maxAttemptCount: 5,
    oldestDueAt: '2026-08-08T05:15:00.000Z',
    nextRunAfter: '2026-08-08T05:45:00.000Z',
  },
  caveats: [
    'db_state_not_worker_liveness',
    'queue_counts_not_provider_health',
    'empty_queue_not_execution_proof',
  ] as const,
};

const missingArmingMarkerStorageLifecycle = {
  ...availableStorageLifecycle,
  rollout: {
    ...availableStorageLifecycle.rollout,
    armedAt: null,
    accountDeleteEnabled: true,
    accountDeletionAvailable: true,
  },
};

const unknownStorageLifecycle = {
  observedAt,
  status: 'unknown' as const,
  reason: 'rollout_state_missing' as const,
};

const productionFlyApp = {
  id: 'app_harpa_pro_api',
  name: 'harpa-pro-api',
  status: 'deployed',
  network: 'default',
  reportedMachineCount: 2,
  reportedVolumeCount: 1,
  machines: {
    status: 'available' as const,
    truncated: false,
    items: [
      {
        id: 'machine_prod_1',
        name: 'harpa-prod-1',
        state: 'started',
        processGroup: 'app',
        region: 'hkg',
        cpuKind: 'shared',
        cpus: 1,
        memoryMb: 512,
        createdAt: '2026-08-08T05:00:00.000Z',
        updatedAt: '2026-08-08T05:10:00.000Z',
      },
    ],
  },
  volumes: {
    status: 'available' as const,
    truncated: false,
    returnedAllocatedGb: 3,
    items: [
      {
        id: 'vol_prod_1',
        name: 'data',
        state: 'created',
        sizeGb: 3,
        region: 'hkg',
        encrypted: true,
        attachedMachineId: 'machine_prod_1',
        createdAt: '2026-08-08T05:01:00.000Z',
        snapshotRetentionDays: 5,
        autoBackupEnabled: true,
      },
    ],
  },
};

const availableFlyInventory = {
  observedAt,
  status: 'available' as const,
  organizationSlug: 'harpa-pro',
  configuredAppCount: 1,
  unavailableConfiguredAppCount: 0,
  apps: [productionFlyApp],
};

const partialFlyInventory = {
  observedAt,
  status: 'partial' as const,
  organizationSlug: 'harpa-pro',
  configuredAppCount: 2,
  unavailableConfiguredAppCount: 1,
  apps: [
    {
      ...productionFlyApp,
      machines: {
        status: 'unknown' as const,
        reason: 'timeout' as const,
      },
    },
  ],
};

const sentryCaveats = [
  'issue_groups_not_events',
  'mobile_sessions_only',
  'telemetry_coverage_applies',
] as const;

const availableSentryObservation = {
  observedAt,
  status: 'available' as const,
  unresolvedErrors: {
    status: 'available' as const,
    count: 3,
    countKind: 'exact' as const,
    cap: 100 as const,
  },
  mobileSessions: {
    status: 'available' as const,
    window: 'last_24_hours' as const,
    windowStart: '2026-08-07T05:30:00.000Z',
    windowEnd: observedAt,
    totalSessions: 12,
    healthySessions: 9,
    erroredSessions: 2,
    abnormalSessions: 0,
    crashedSessions: 1,
  },
  caveats: sentryCaveats,
};

const lowerBoundSentryObservation = {
  ...availableSentryObservation,
  status: 'partial' as const,
  unresolvedErrors: {
    status: 'available' as const,
    count: 100,
    countKind: 'lower_bound' as const,
    cap: 100 as const,
  },
  caveats: [...sentryCaveats, 'issue_count_truncated'] as const,
};

const partialSentryObservation = {
  ...availableSentryObservation,
  status: 'partial' as const,
  mobileSessions: {
    status: 'unknown' as const,
    reason: 'no_session_data' as const,
  },
};

const issueUnknownSentryObservation = {
  ...availableSentryObservation,
  status: 'partial' as const,
  unresolvedErrors: {
    status: 'unknown' as const,
    reason: 'timeout' as const,
  },
};

const unknownSentryObservation = {
  observedAt,
  status: 'unknown' as const,
  reason: 'forbidden' as const,
};

function sentryTopLevelLeak(field: string, value: unknown) {
  return { ...availableSentryObservation, [field]: value };
}

function sentryIssueLeak(field: string, value: unknown) {
  return {
    ...availableSentryObservation,
    unresolvedErrors: { ...availableSentryObservation.unresolvedErrors, [field]: value },
  };
}

function sentrySessionLeak(field: string, value: unknown) {
  return {
    ...availableSentryObservation,
    mobileSessions: { ...availableSentryObservation.mobileSessions, [field]: value },
  };
}

const sentryRedactionCases = [
  {
    label: 'top-level organization identifier',
    value: 'private-organization-slug',
    observation: sentryTopLevelLeak('organizationSlug', 'private-organization-slug'),
  },
  {
    label: 'top-level project identifiers',
    value: 'private-top-level-project-slug',
    observation: sentryTopLevelLeak('projectSlugs', ['private-top-level-project-slug']),
  },
  {
    label: 'top-level observer token',
    value: 'sentry-read-token-must-never-render',
    observation: sentryTopLevelLeak('token', 'sentry-read-token-must-never-render'),
  },
  {
    label: 'top-level provider headers',
    value: 'private provider header must never render',
    observation: sentryTopLevelLeak('providerHeaders', {
      link: 'private provider header must never render',
    }),
  },
  {
    label: 'top-level raw provider error',
    value: 'raw Sentry error detail must never render',
    observation: sentryTopLevelLeak('rawError', 'raw Sentry error detail must never render'),
  },
  {
    label: 'issue id',
    value: 'ISSUE-PRIVATE-123',
    observation: sentryIssueLeak('id', 'ISSUE-PRIVATE-123'),
  },
  {
    label: 'issue short id',
    value: 'PRIVATE-456',
    observation: sentryIssueLeak('shortId', 'PRIVATE-456'),
  },
  {
    label: 'issue title',
    value: 'private issue title must never render',
    observation: sentryIssueLeak('title', 'private issue title must never render'),
  },
  {
    label: 'issue culprit',
    value: 'private culprit must never render',
    observation: sentryIssueLeak('culprit', 'private culprit must never render'),
  },
  {
    label: 'issue message',
    value: 'private event message must never render',
    observation: sentryIssueLeak('message', 'private event message must never render'),
  },
  {
    label: 'issue stack trace',
    value: 'private stack trace must never render',
    observation: sentryIssueLeak('stackTrace', 'private stack trace must never render'),
  },
  {
    label: 'issue tags',
    value: 'private tag value must never render',
    observation: sentryIssueLeak('tags', [{ value: 'private tag value must never render' }]),
  },
  {
    label: 'issue user',
    value: 'usr_private_sentry_person',
    observation: sentryIssueLeak('user', { id: 'usr_private_sentry_person' }),
  },
  {
    label: 'issue email',
    value: 'private-customer@example.test',
    observation: sentryIssueLeak('email', 'private-customer@example.test'),
  },
  {
    label: 'issue URL',
    value: 'https://private.example.test/customer/path',
    observation: sentryIssueLeak('url', 'https://private.example.test/customer/path'),
  },
  {
    label: 'issue project identifier',
    value: 'private-issue-project-slug',
    observation: sentryIssueLeak('projectSlug', 'private-issue-project-slug'),
  },
  {
    label: 'mobile project identifier',
    value: 'private-mobile-project-slug',
    observation: sentrySessionLeak('projectSlug', 'private-mobile-project-slug'),
  },
  {
    label: 'mobile release identifier',
    value: 'private-mobile-release',
    observation: sentrySessionLeak('release', 'private-mobile-release'),
  },
  {
    label: 'raw mobile session groups',
    value: 'raw session group must never render',
    observation: sentrySessionLeak('rawSessionGroups', [
      { status: 'raw session group must never render', sessions: 12 },
    ]),
  },
  {
    label: 'legacy mobile session counts',
    value: 'private legacy session status',
    observation: sentrySessionLeak('sessionCounts', [
      { status: 'private legacy session status', sessions: 12 },
    ]),
  },
] as const;

const unknownFlyInventory = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const zeroAiCallOutcome = {
  succeeded: 0,
  failed: 0,
  total: 0,
};

const zeroAiOperationUsage = {
  liveSucceeded: 0,
  liveFailed: 0,
  recordSucceeded: 0,
  recordFailed: 0,
  replaySucceeded: 0,
  replayFailed: 0,
};

const providerCapacityUnknown = {
  openai: { status: 'unknown' as const, reason: 'not_observed' as const },
  groq: { status: 'unknown' as const, reason: 'not_observed' as const },
  kimi: { status: 'unknown' as const, reason: 'not_observed' as const },
};

const aiUsageCaveats = [
  'best_effort_ledger',
  'not_provider_billing',
  'replay_not_provider_usage',
  'record_mode_calls_provider',
  'deleted_history_excluded',
] as const;

function emptyAiUsageWindow(windowStart: string) {
  return {
    windowStart,
    windowEnd: observedAt,
    recordedEventCount: 0,
    calls: {
      live: zeroAiCallOutcome,
      record: zeroAiCallOutcome,
      replay: zeroAiCallOutcome,
    },
    successfulProviderUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      inputSeconds: 0,
    },
    operations: {
      chat: zeroAiOperationUsage,
      generateReport: zeroAiOperationUsage,
      transcribe: zeroAiOperationUsage,
    },
    providers: [],
    unclassifiedVendorEventCount: 0,
    missingInputSecondsEventCount: 0,
    lastRecordedAt: null,
    warnings: [],
  };
}

const availableAiUsage = {
  observedAt,
  status: 'available' as const,
  source: 'harpa_usage_ledger' as const,
  monthToDate: {
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: observedAt,
    recordedEventCount: 19,
    calls: {
      live: { succeeded: 7, failed: 3, total: 10 },
      record: { succeeded: 3, failed: 1, total: 4 },
      replay: { succeeded: 4, failed: 1, total: 5 },
    },
    successfulProviderUsage: {
      inputTokens: 114_200,
      outputTokens: 22_800,
      cachedTokens: 31_000,
      inputSeconds: 45.125,
    },
    operations: {
      chat: {
        liveSucceeded: 3,
        liveFailed: 1,
        recordSucceeded: 1,
        recordFailed: 0,
        replaySucceeded: 2,
        replayFailed: 0,
      },
      generateReport: {
        liveSucceeded: 2,
        liveFailed: 1,
        recordSucceeded: 2,
        recordFailed: 1,
        replaySucceeded: 2,
        replayFailed: 1,
      },
      transcribe: {
        liveSucceeded: 2,
        liveFailed: 1,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
    },
    providers: [
      {
        provider: 'openai' as const,
        recordedEventCount: 8,
        calls: {
          live: { succeeded: 4, failed: 1, total: 5 },
          record: { succeeded: 1, failed: 0, total: 1 },
          replay: { succeeded: 2, failed: 0, total: 2 },
        },
        successfulProviderUsage: {
          inputTokens: 100_000,
          outputTokens: 20_000,
          cachedTokens: 30_000,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T05:20:00.000Z',
      },
      {
        provider: 'groq' as const,
        recordedEventCount: 3,
        calls: {
          live: { succeeded: 2, failed: 1, total: 3 },
          record: zeroAiCallOutcome,
          replay: zeroAiCallOutcome,
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 45.125,
        },
        lastRecordedAt: '2026-08-08T05:10:00.000Z',
      },
      {
        provider: 'kimi' as const,
        recordedEventCount: 5,
        calls: {
          live: { succeeded: 1, failed: 0, total: 1 },
          record: { succeeded: 1, failed: 1, total: 2 },
          replay: { succeeded: 1, failed: 1, total: 2 },
        },
        successfulProviderUsage: {
          inputTokens: 13_000,
          outputTokens: 2_500,
          cachedTokens: 1_000,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T04:30:00.000Z',
      },
      {
        provider: 'other' as const,
        recordedEventCount: 3,
        calls: {
          live: { succeeded: 0, failed: 1, total: 1 },
          record: { succeeded: 1, failed: 0, total: 1 },
          replay: { succeeded: 1, failed: 0, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 1_200,
          outputTokens: 300,
          cachedTokens: 0,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T03:00:00.000Z',
      },
    ],
    unclassifiedVendorEventCount: 3,
    missingInputSecondsEventCount: 1,
    lastRecordedAt: '2026-08-08T05:20:00.000Z',
    warnings: ['unclassified_vendor_events', 'missing_transcription_duration'] as const,
  },
  last24Hours: {
    windowStart: '2026-08-07T05:30:00.000Z',
    windowEnd: observedAt,
    recordedEventCount: 5,
    calls: {
      live: { succeeded: 2, failed: 1, total: 3 },
      record: zeroAiCallOutcome,
      replay: { succeeded: 2, failed: 0, total: 2 },
    },
    successfulProviderUsage: {
      inputTokens: 2_500,
      outputTokens: 500,
      cachedTokens: 200,
      inputSeconds: 12.5,
    },
    operations: {
      chat: {
        liveSucceeded: 1,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 1,
        replayFailed: 0,
      },
      generateReport: {
        liveSucceeded: 0,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 1,
        replayFailed: 0,
      },
      transcribe: {
        liveSucceeded: 1,
        liveFailed: 1,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
    },
    providers: [
      {
        provider: 'openai' as const,
        recordedEventCount: 2,
        calls: {
          live: { succeeded: 1, failed: 0, total: 1 },
          record: zeroAiCallOutcome,
          replay: { succeeded: 1, failed: 0, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 2_500,
          outputTokens: 500,
          cachedTokens: 200,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T05:20:00.000Z',
      },
      {
        provider: 'groq' as const,
        recordedEventCount: 2,
        calls: {
          live: { succeeded: 1, failed: 1, total: 2 },
          record: zeroAiCallOutcome,
          replay: zeroAiCallOutcome,
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 12.5,
        },
        lastRecordedAt: '2026-08-08T05:10:00.000Z',
      },
      {
        provider: 'other' as const,
        recordedEventCount: 1,
        calls: {
          live: zeroAiCallOutcome,
          record: zeroAiCallOutcome,
          replay: { succeeded: 1, failed: 0, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T03:00:00.000Z',
      },
    ],
    unclassifiedVendorEventCount: 1,
    missingInputSecondsEventCount: 0,
    lastRecordedAt: '2026-08-08T05:20:00.000Z',
    warnings: ['unclassified_vendor_events'] as const,
  },
  providerCapacity: providerCapacityUnknown,
  caveats: aiUsageCaveats,
};

const emptyAiUsage = {
  observedAt,
  status: 'available' as const,
  source: 'harpa_usage_ledger' as const,
  monthToDate: emptyAiUsageWindow('2026-08-01T00:00:00.000Z'),
  last24Hours: emptyAiUsageWindow('2026-08-07T05:30:00.000Z'),
  providerCapacity: providerCapacityUnknown,
  caveats: aiUsageCaveats,
};

const githubCommits = {
  dev: [
    {
      sha: '0d0a841fed2fe44a2233ccf2eb58052672f54932',
      commit: {
        message: 'Merge pull request #305 from patrickchin/codex/rebuild-wrangler-4',
        committer: { date: '2026-08-07T20:00:01Z' },
      },
    },
  ],
  main: [
    {
      sha: '1ca389ac8f28c6cf8fbf0c7f5eca072f8670c129',
      commit: {
        message: 'chore(release): v0.1.65',
        committer: { date: '2026-08-02T03:27:22Z' },
      },
    },
  ],
};

const githubPulls = [
  {
    number: 304,
    title: 'fix(site): fit screenshot dialog in Firefox',
    draft: true,
    updated_at: '2026-08-07T13:21:37Z',
    head: {
      ref: 'codex/fix-firefox-screenshot-dialog',
      sha: '430b00c745173929727666e13d1190de76e433f5',
    },
    base: { ref: 'dev' },
  },
  {
    number: 299,
    title: 'chore(deps): bump the npm_and_yarn group',
    draft: false,
    updated_at: '2026-08-06T22:31:00Z',
    head: {
      ref: 'dependabot/npm_and_yarn/npm_and_yarn-39a367a8a6',
      sha: 'b97f6885e869549568b3a24fa8bff1bdbfaf5042',
    },
    base: { ref: 'main' },
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function githubJson(body: unknown, remaining: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': '1786140366',
    },
  });
}

function defaultDeploymentResponse(url: string): Response | null {
  if (url === 'https://api.example.test/healthz') return jsonResponse(apiIdentity);
  if (url === 'https://api.example.test/readyz') return jsonResponse(productReadiness);
  if (url === 'https://api.example.test/admin/readyz') return jsonResponse(adminReadiness);
  if (url === 'https://site.example.test/_cf-pages-deployment.json') {
    return jsonResponse(publicPagesMarker);
  }
  if (url === '/_cf-pages-deployment.json') return jsonResponse(adminPagesMarker);
  if (url === 'https://dashboard.example.test/_cf-pages-deployment.json') {
    return jsonResponse(dashboardPagesMarker);
  }
  if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
    return jsonResponse(availableStorageLifecycle);
  }
  if (url === 'https://api.example.test/admin/operations/fly-inventory') {
    return jsonResponse(availableFlyInventory);
  }
  if (url === 'https://api.example.test/admin/operations/sentry') {
    return jsonResponse(availableSentryObservation);
  }
  if (url === 'https://api.example.test/admin/operations/neon-usage') {
    return jsonResponse(unknownNeonUsage);
  }
  if (url === 'https://api.example.test/admin/operations/ai-usage') {
    return jsonResponse(availableAiUsage);
  }
  if (url.includes('/commits?sha=dev&per_page=1')) return githubJson(githubCommits.dev, 59);
  if (url.includes('/commits?sha=main&per_page=1')) return githubJson(githubCommits.main, 58);
  if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
    return githubJson(githubPulls, 57);
  }
  return null;
}

function mockOperationsFetch(
  inventory: unknown = availableInventory,
  r2Capacity: unknown = availableR2Capacity,
  neonUsage: unknown = availableNeonUsage,
  storageLifecycle: unknown = availableStorageLifecycle,
  flyInventory: unknown = availableFlyInventory,
  sentryObservation: unknown = availableSentryObservation,
  aiUsage: unknown = availableAiUsage,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/neon') {
      return jsonResponse(inventory);
    }
    if (url === 'https://api.example.test/admin/operations/r2-capacity') {
      return jsonResponse(r2Capacity);
    }
    if (url === 'https://api.example.test/admin/operations/neon-usage') {
      return jsonResponse(neonUsage);
    }
    if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
      return jsonResponse(storageLifecycle);
    }
    if (url === 'https://api.example.test/admin/operations/fly-inventory') {
      return jsonResponse(flyInventory);
    }
    if (url === 'https://api.example.test/admin/operations/sentry') {
      return jsonResponse(sentryObservation);
    }
    if (url === 'https://api.example.test/admin/operations/ai-usage') {
      return jsonResponse(aiUsage);
    }
    const deploymentResponse = defaultDeploymentResponse(url);
    if (deploymentResponse) return deploymentResponse;
    throw new Error(`Unexpected request: ${url}`);
  });
}

function mockDiagnosticFetch(
  diagnostic: () => Response | Promise<Response>,
  inventory: unknown = availableInventory,
  r2Capacity: unknown = availableR2Capacity,
  neonUsage: unknown = availableNeonUsage,
  storageLifecycle: unknown = availableStorageLifecycle,
  flyInventory: unknown = availableFlyInventory,
  sentryObservation: unknown = availableSentryObservation,
  aiUsage: unknown = availableAiUsage,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/report-generate') {
      return diagnostic();
    }
    if (url === 'https://api.example.test/admin/operations/neon') {
      return jsonResponse(inventory);
    }
    if (url === 'https://api.example.test/admin/operations/r2-capacity') {
      return jsonResponse(r2Capacity);
    }
    if (url === 'https://api.example.test/admin/operations/neon-usage') {
      return jsonResponse(neonUsage);
    }
    if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
      return jsonResponse(storageLifecycle);
    }
    if (url === 'https://api.example.test/admin/operations/fly-inventory') {
      return jsonResponse(flyInventory);
    }
    if (url === 'https://api.example.test/admin/operations/sentry') {
      return jsonResponse(sentryObservation);
    }
    if (url === 'https://api.example.test/admin/operations/ai-usage') {
      return jsonResponse(aiUsage);
    }
    const deploymentResponse = defaultDeploymentResponse(url);
    if (deploymentResponse) return deploymentResponse;
    throw new Error(`Unexpected request: ${url}`);
  });
}

function deploymentRequests(fetchMock: MockInstance<typeof globalThis.fetch>, url: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url);
}

function diagnosticRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/report-generate',
  );
}

function r2CapacityRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/r2-capacity',
  );
}

function neonUsageRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/neon-usage',
  );
}

function storageLifecycleRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/storage-lifecycle',
  );
}

function flyInventoryRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/fly-inventory',
  );
}

function sentryRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/sentry',
  );
}

function aiUsageRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/ai-usage',
  );
}

async function getStorageLifecycleSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Storage lifecycle',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getFlyInventorySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Fly inventory',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getSentrySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Sentry errors and mobile crashes',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getR2CapacitySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'R2 capacity',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getAiUsageSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Harpa-recorded AI usage',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getNeonUsageSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Neon Free usage',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

function expectPaintedProgressbar(
  container: HTMLElement,
  accessibleName: string,
  clampedPercent: number,
) {
  const progressbar = within(container).getByRole('progressbar', { name: accessibleName });
  expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
  expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
  expect(progressbar.getAttribute('aria-valuenow')).toBe(String(clampedPercent));
  expect(progressbar.getAttribute('aria-valuetext')).toBe(
    accessibleName.slice(accessibleName.indexOf(': ') + 2),
  );
  expect(progressbar.style.width).toBe(`${clampedPercent}%`);
  return progressbar;
}
async function getCanarySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: /^Report generation (?:diagnostic|live canary)$/,
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getDeploymentCard(name: string) {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  expect(card).toBeTruthy();
  return card!;
}

function getRunCanaryButton(section: HTMLElement) {
  return within(section).getByRole('button', { name: /^Run (?:diagnostic|live canary)$/ });
}

function expectDefinitionValue(container: HTMLElement, label: string | RegExp, value: string) {
  const term = within(container).getByText(label, { selector: 'dt' });
  const definition = term.nextElementSibling;
  expect(definition?.tagName).toBe('DD');
  expect(definition?.textContent).toBe(value);
}

function expectSuccessfulCanaryProof(section: HTMLElement) {
  expect(within(section).getByText('Completed in 1,842 ms.')).toBeTruthy();

  const httpTerm = within(section).getByText(/^HTTP(?: status)?$/i, { selector: 'dt' });
  const generationDetails = httpTerm.closest('dl');
  expect(generationDetails).toBeTruthy();
  expectDefinitionValue(generationDetails!, /^HTTP(?: status)?$/i, '200');
  expectDefinitionValue(generationDetails!, /^(?:Generation )?(?:duration|latency)$/i, '1,300 ms');

  const inputTokensTerm = within(section).getByText('Input tokens', { selector: 'dt' });
  const usageDetails = inputTokensTerm.closest('dl');
  expect(usageDetails).toBeTruthy();
  expectDefinitionValue(usageDetails!, 'Input tokens', '321');
  expectDefinitionValue(usageDetails!, 'Output tokens', '123');
  expectDefinitionValue(usageDetails!, 'Cached tokens', '45');
  expectDefinitionValue(usageDetails!, /^(?:Usage )?(?:duration|latency)$/i, '876 ms');
  expect(within(section).getByText('Usage row matched.')).toBeTruthy();

  const previewRegion = within(section).getByRole('region', {
    name: 'Synthetic report response preview',
  });
  expect(previewRegion.className).toMatch(/max-h-/);
  expect(previewRegion.className).toMatch(/overflow-y-auto/);

  const sample = passCanary.preview.sample;
  const previewValues = [
    sample.title,
    sample.summary,
    sample.weather?.condition,
    sample.weather?.temperature,
    sample.weather?.wind,
    sample.weather?.impact,
    ...sample.workers.flatMap((worker) => [worker.role, worker.count, worker.hours, worker.notes]),
    ...sample.materials.flatMap((material) => [
      material.name,
      material.quantity,
      material.unit,
      material.status,
      material.condition,
      material.notes,
    ]),
    ...sample.issues.flatMap((issue) => [
      issue.title,
      issue.severity,
      issue.description,
      issue.action,
    ]),
    ...sample.nextSteps,
    ...sample.summarySections.flatMap((summarySection) => [
      summarySection.title,
      summarySection.body,
    ]),
  ].filter((value): value is string => typeof value === 'string');
  for (const value of previewValues) {
    expect(within(previewRegion).getByText(value)).toBeTruthy();
  }

  expect(previewRegion.querySelector('script')).toBeNull();
  expect(previewRegion.querySelector('img')).toBeNull();
  expect(previewRegion.innerHTML).toContain('&lt;script&gt;');
  expect(previewRegion.innerHTML).toContain('&lt;img');

  for (const [label, value] of [
    ['Workers', '8'],
    ['Materials', '7'],
    ['Issues', '6'],
    ['Next steps', '9'],
    ['Summary sections', '6'],
    ['Image attachments', '2'],
    ['Document attachments', '1'],
  ] as const) {
    expectDefinitionValue(previewRegion, label, value);
  }
  expectDefinitionValue(
    previewRegion,
    /^(?:Report (?:body )?)?SHA-256$/i,
    passCanary.preview.bodySha256,
  );
  expect(within(previewRegion).getByText('Preview truncated')).toBeTruthy();
}

async function renderAndRunCanary(body: unknown, status = 200) {
  const fetchMock = mockDiagnosticFetch(() => jsonResponse(body, status));
  const user = userEvent.setup();
  render(<AdminOperations />);
  const section = await getCanarySection();
  await user.click(getRunCanaryButton(section));
  return { fetchMock, section };
}

beforeEach(() => {
  vi.restoreAllMocks();
  authMock.getSession.mockReset();
  authMock.getSession.mockResolvedValue(adminSession);
  authMock.logout.mockReset();
  authMock.logout.mockResolvedValue(undefined);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AdminOperations', () => {
  it('checks Harpa deployments, GitHub, Neon inventory and usage, R2, storage lifecycle, Fly, Sentry, and AI usage and links every provider console', async () => {
    const fetchMock = mockOperationsFetch();

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Service monitoring' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(16));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'https://api.example.test/healthz',
        'https://api.example.test/readyz',
        'https://api.example.test/admin/readyz',
        'https://site.example.test/_cf-pages-deployment.json',
        '/_cf-pages-deployment.json',
        'https://dashboard.example.test/_cf-pages-deployment.json',
        'https://api.example.test/admin/operations/storage-lifecycle',
        'https://api.example.test/admin/operations/fly-inventory',
        'https://api.example.test/admin/operations/sentry',
        'https://api.example.test/admin/operations/neon',
        'https://api.example.test/admin/operations/neon-usage',
        'https://api.example.test/admin/operations/r2-capacity',
        'https://api.example.test/admin/operations/ai-usage',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
      ]),
    );

    const githubCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        new URL(String(url), 'https://admin.example.test').origin === 'https://api.github.com',
    );
    expect(githubCalls.map(([url]) => String(url))).toEqual([
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
    ]);
    for (const [, init] of githubCalls) {
      expect(init).toMatchObject({
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
      });
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
    }
    expect(
      screen.getByRole('heading', { level: 2, name: 'GitHub public repository' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'dev' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /0d0a841f/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/commit/0d0a841fed2fe44a2233ccf2eb58052672f54932',
    );
    expect(screen.getByRole('link', { name: /1ca389ac/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/commit/1ca389ac8f28c6cf8fbf0c7f5eca072f8670c129',
    );
    const pullRequests = screen.getByRole('list', { name: 'Open pull requests' });
    expect(within(pullRequests).getByRole('link', { name: /#304/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/pull/304',
    );
    expect(within(pullRequests).getByRole('link', { name: /#299/ })).toBeTruthy();
    expect(screen.getByText('57 of 60 requests remain')).toBeTruthy();
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 5.0% used, 95.0% remaining',
      5,
    );
    expect(githubSection.textContent).toContain('95.0% remaining');
    expect(githubSection.textContent).toContain('5.0% used');
    expect(githubSection.querySelector('time[datetime="2026-08-07T22:06:06.000Z"]')).toBeTruthy();
    expect(
      within(githubSection).queryByText(/plan usage|billing credit|account-wide quota/i),
    ).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
    expect(screen.getByTestId('github-pr-scroller').className).toContain('overflow-y-auto');

    for (const service of [
      'Fly.io',
      'Neon',
      'Cloudflare',
      'Sentry',
      'Better Stack',
      'GitHub Actions',
      'Doppler',
      'Expo / EAS',
      'Resend',
      'Zoho Mail',
      'App Store Connect',
      'Google Play Console',
      'OpenAI',
      'Groq',
      'Kimi / Moonshot',
      'Firecrawl',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: service })).toBeTruthy();
    }
    const sentrySection = await getSentrySection();
    expect(within(sentrySection).getByText('Available')).toBeTruthy();
    expect(within(sentrySection).getByText('3')).toBeTruthy();
    expect(within(sentrySection).getByText('12')).toBeTruthy();
    expect(within(sentrySection).getByText('1', { selector: 'dd' })).toBeTruthy();
    expect(
      within(sentrySection).getByRole('link', { name: 'Open Sentry issues ↗' }),
    ).toHaveProperty('href', 'https://sentry.io/issues/');
    expect(screen.getAllByRole('link', { name: 'Open dashboard ↗' })).toHaveLength(16);
  });

  it('uses sixteen fixed reads on load and thirty-two after shared Refresh without polling or live-canary autorun', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockOperationsFetch();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const noPollWindowMs = 24 * 60 * 60_000;
    const expectedRequests = [
      {
        url: 'https://api.example.test/healthz',
        credentials: 'omit',
      },
      {
        url: 'https://api.example.test/readyz',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/readyz',
        credentials: 'include',
      },
      {
        url: 'https://site.example.test/_cf-pages-deployment.json',
        credentials: 'omit',
      },
      {
        url: '/_cf-pages-deployment.json',
        credentials: 'same-origin',
      },
      {
        url: 'https://dashboard.example.test/_cf-pages-deployment.json',
        credentials: 'omit',
      },
      {
        url: 'https://api.example.test/admin/operations/storage-lifecycle',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/neon',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/fly-inventory',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/sentry',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/neon-usage',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/r2-capacity',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/operations/ai-usage',
        credentials: 'include',
      },
      {
        url: 'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
        credentials: 'omit',
      },
      {
        url: 'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
        credentials: 'omit',
      },
      {
        url: 'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
        credentials: 'omit',
      },
    ] as const;
    expect(expectedRequests).toHaveLength(16);

    render(<AdminOperations />);

    let canarySection = await getCanarySection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(16));
    expect(
      fetchMock.mock.calls.every(([, requestInit]) => (requestInit?.method ?? 'GET') === 'GET'),
    ).toBe(true);
    await waitFor(() => {
      for (const { url } of expectedRequests) {
        expect(deploymentRequests(fetchMock, url)).toHaveLength(1);
      }
    });
    for (const { url, credentials } of expectedRequests) {
      const [, requestInit] = deploymentRequests(fetchMock, url)[0]!;
      expect(requestInit).toMatchObject({ credentials, cache: 'no-store' });
      expect(requestInit?.method ?? 'GET').toBe('GET');
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    expect(within(canarySection).getByText('Not run yet in this browser session.')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(noPollWindowMs));
    expect(fetchMock).toHaveBeenCalledTimes(16);
    expect(
      fetchMock.mock.calls.every(([, requestInit]) => (requestInit?.method ?? 'GET') === 'GET'),
    ).toBe(true);
    for (const { url } of expectedRequests) {
      expect(deploymentRequests(fetchMock, url)).toHaveLength(1);
    }
    expect(sentryRequests(fetchMock)).toHaveLength(1);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(32));
    expect(
      fetchMock.mock.calls.every(([, requestInit]) => (requestInit?.method ?? 'GET') === 'GET'),
    ).toBe(true);
    await waitFor(() => {
      for (const { url } of expectedRequests) {
        expect(deploymentRequests(fetchMock, url)).toHaveLength(2);
      }
    });
    canarySection = await getCanarySection();
    expect(canarySection.isConnected).toBe(true);
    expect(within(canarySection).getByText('Not run yet in this browser session.')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(noPollWindowMs));
    expect(fetchMock).toHaveBeenCalledTimes(32);
    expect(
      fetchMock.mock.calls.every(([, requestInit]) => (requestInit?.method ?? 'GET') === 'GET'),
    ).toBe(true);
    expect(sentryRequests(fetchMock)).toHaveLength(2);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('shows a distinct loading state until the storage lifecycle observation arrives', async () => {
    let resolveStorageLifecycle!: (response: Response) => void;
    const storageLifecycleResponse = new Promise<Response>((resolve) => {
      resolveStorageLifecycle = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
        return storageLifecycleResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(within(section).getByText('Loading storage lifecycle…')).toBeTruthy();

    await act(async () => {
      resolveStorageLifecycle(jsonResponse(availableStorageLifecycle));
      await storageLifecycleResponse;
    });
    expect(await within(section).findByText('Recorded')).toBeTruthy();
  });

  it('renders storage lifecycle gate state, queue labels, and the explicit no-worker-liveness caveat', async () => {
    mockOperationsFetch(
      emptyInventory,
      availableR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
    );

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(await within(section).findByText('Recorded')).toBeTruthy();
    expect(within(section).getByText('Active')).toBeTruthy();
    expect(within(section).getByText('Blocked')).toBeTruthy();
    expect(within(section).queryByText(/^Available$/)).toBeNull();
    for (const timestamp of [
      '2026-08-08T05:00:00.000Z',
      '2026-08-08T05:10:00.000Z',
      '2026-08-08T05:20:00.000Z',
      '2026-08-08T05:15:00.000Z',
      '2026-08-08T05:45:00.000Z',
    ]) {
      expect(section.querySelector(`time[datetime="${timestamp}"]`)).toBeTruthy();
    }
    for (const label of [
      'Due now',
      'Scheduled',
      'Active claims',
      'Stale claims',
      'Retrying',
      'Maximum attempts',
    ]) {
      expect(within(section).getByText(label)).toBeTruthy();
    }
    for (const value of ['7', '4', '3', '2', '1', '5']) {
      expect(section.textContent).toContain(value);
    }
    expect(within(section).getByText('Database state is not worker liveness.')).toBeTruthy();
    expect(within(section).getByText('Queue counts do not prove provider health.')).toBeTruthy();
    expect(within(section).getByText('An empty queue does not prove execution.')).toBeTruthy();
    expect(section.textContent).toContain(
      'This database state does not prove a storage worker is running now. Use Fly worker verification and deployment evidence for executor proof.',
    );
  });

  it('shows a missing arming marker while preserving active enforcement and exact account-deletion availability', async () => {
    mockOperationsFetch(
      emptyInventory,
      availableR2Capacity,
      availableNeonUsage,
      missingArmingMarkerStorageLifecycle,
    );

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(await within(section).findByText('Missing')).toBeTruthy();
    expect(within(section).getByText('Active')).toBeTruthy();
    expect(within(section).getByText('Available')).toBeTruthy();
    expect(within(section).queryByText(/^Blocked$/)).toBeNull();
    expect(
      section.querySelector(
        `time[datetime="${missingArmingMarkerStorageLifecycle.rollout.enforceAfter}"]`,
      ),
    ).toBeTruthy();
    expect(
      section.querySelector(
        `time[datetime="${missingArmingMarkerStorageLifecycle.rollout.updatedAt}"]`,
      ),
    ).toBeTruthy();
  });

  it('renders unknown storage lifecycle state without implying worker or provider health', async () => {
    mockOperationsFetch(
      emptyInventory,
      availableR2Capacity,
      availableNeonUsage,
      unknownStorageLifecycle,
    );

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Storage lifecycle rollout state is missing.')).toBeTruthy();
    expect(within(section).queryByText(/worker is running/i)).toBeNull();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
  });

  it('keeps a storage lifecycle failure independent from the other evidence surfaces', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
        return jsonResponse({ observedAt, status: 'unknown', reason: 'database_unavailable' });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Storage lifecycle is temporarily unavailable.')).toBeTruthy();
    for (const preservedValue of [
      apiGitCommit,
      productMigrationHead,
      adminMigrationHead,
      adminPagesCommit,
    ]) {
      expect(await screen.findByText(preservedValue)).toBeTruthy();
    }
    expect(await screen.findByRole('heading', { level: 2, name: 'Neon Free usage' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'R2 capacity' })).toBeTruthy();
  });

  it('returns the whole page to sign-in when the storage lifecycle observer rejects an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-storage-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Storage lifecycle' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-storage-cookie-detail');
    expect(document.documentElement.outerHTML).not.toContain('expired-storage-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts storage lifecycle payloads, raw errors, and malformed gate correlations', async () => {
    const forbiddenValues = [
      'usr_sensitive_123',
      'users/usr_sensitive_123/avatar/',
      'projects/prj_sensitive_456/',
      'storage delete failed for private/object-key.jpg',
      'raw SQL detail must never render',
    ];
    const poisonedStorageLifecycle = {
      ...availableStorageLifecycle,
      rollout: {
        ...availableStorageLifecycle.rollout,
        accountDeleteEnabled: true,
        accountDeletionAvailable: false,
      },
      jobs: {
        ...availableStorageLifecycle.jobs,
        staleClaims: -1,
      },
      queue: {
        rows: [
          {
            userId: forbiddenValues[0],
            exactKeys: [forbiddenValues[1]],
            sweepPrefixes: [forbiddenValues[2]],
            lastError: forbiddenValues[3],
          },
        ],
      },
      sqlError: forbiddenValues[4],
    };
    mockOperationsFetch(
      emptyInventory,
      availableR2Capacity,
      availableNeonUsage,
      poisonedStorageLifecycle,
    );

    render(<AdminOperations />);

    const section = await getStorageLifecycleSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(
      within(section).getByText('Storage lifecycle returned an invalid response.'),
    ).toBeTruthy();
    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of forbiddenValues) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('does not let an older overlapping storage lifecycle refresh overwrite newer evidence', async () => {
    let lifecycleAttempt = 0;
    let resolveOlderRefresh!: (response: Response) => void;
    let resolveNewerRefresh!: (response: Response) => void;
    const olderRefresh = new Promise<Response>((resolve) => {
      resolveOlderRefresh = resolve;
    });
    const newerRefresh = new Promise<Response>((resolve) => {
      resolveNewerRefresh = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/storage-lifecycle') {
        lifecycleAttempt += 1;
        if (lifecycleAttempt === 2) return olderRefresh;
        if (lifecycleAttempt === 3) return newerRefresh;
        return jsonResponse(unknownStorageLifecycle);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);
    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(await screen.findByText('Storage lifecycle rollout state is missing.')).toBeTruthy();

    act(() => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(storageLifecycleRequests(fetchMock)).toHaveLength(3));

    await act(async () => {
      resolveNewerRefresh(jsonResponse(availableStorageLifecycle));
      await newerRefresh;
    });
    expect(await screen.findByText('Recorded')).toBeTruthy();

    await act(async () => {
      resolveOlderRefresh(jsonResponse(unknownStorageLifecycle));
      await olderRefresh;
    });
    await waitFor(() =>
      expect(screen.queryByText('Storage lifecycle rollout state is missing.')).toBeNull(),
    );
    expect(screen.getByText('Recorded')).toBeTruthy();
  });

  it('keeps repository data but marks a contradictory GitHub request budget Unknown', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/commits?sha=dev&per_page=1')) {
        return new Response(JSON.stringify(githubCommits.dev), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url.includes('/commits?sha=main&per_page=1')) {
        return new Response(JSON.stringify(githubCommits.main), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
        return new Response(JSON.stringify(githubPulls), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const githubSection = (
      await screen.findByRole('heading', { level: 2, name: 'GitHub public repository' })
    ).closest('section')!;
    expect(
      await within(githubSection).findByRole('heading', { level: 3, name: 'dev' }),
    ).toBeTruthy();
    expect(within(githubSection).getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
    expect(within(githubSection).getByRole('list', { name: 'Open pull requests' })).toBeTruthy();
    expect(await within(githubSection).findByText('Request budget: Unknown')).toBeTruthy();
    expect(within(githubSection).queryByRole('progressbar')).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
  });

  it.each([
    ['missing headers', {}],
    [
      'malformed integer headers',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57.5',
        'X-RateLimit-Reset': '1786140366',
      },
    ],
    [
      'a missing reset header',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
      },
    ],
    [
      'a non-positive reset timestamp',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
        'X-RateLimit-Reset': '0',
      },
    ],
    [
      'a malformed reset timestamp',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
        'X-RateLimit-Reset': 'not-a-timestamp',
      },
    ],
  ] as const)(
    'keeps valid repository data but marks the GitHub request budget Unknown for %s',
    async (_caseName, rateLimitHeaders) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
          const body = url.includes('/commits?sha=dev&per_page=1')
            ? githubCommits.dev
            : url.includes('/commits?sha=main&per_page=1')
              ? githubCommits.main
              : githubPulls;
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...rateLimitHeaders,
            },
          });
        }
        if (url === 'https://api.example.test/admin/operations/neon') {
          return jsonResponse(emptyInventory);
        }
        if (url === 'https://api.example.test/admin/operations/r2-capacity') {
          return jsonResponse(availableR2Capacity);
        }
        const deploymentResponse = defaultDeploymentResponse(url);
        if (deploymentResponse) return deploymentResponse;
        throw new Error(`Unexpected request: ${url}`);
      });

      render(<AdminOperations />);

      const githubSection = (
        await screen.findByRole('heading', { level: 2, name: 'GitHub public repository' })
      ).closest('section')!;
      expect(
        await within(githubSection).findByRole('heading', { level: 3, name: 'dev' }),
      ).toBeTruthy();
      expect(within(githubSection).getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
      expect(within(githubSection).getByRole('list', { name: 'Open pull requests' })).toBeTruthy();
      expect(await within(githubSection).findByText('Request budget: Unknown')).toBeTruthy();
      expect(within(githubSection).queryByRole('progressbar')).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
    },
  );

  it('keeps repository links usable when the browser GitHub rate limit is exhausted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('GitHub rate limit reached for this browser/IP.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open repository ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro',
    );
    expect(screen.getByRole('link', { name: 'Open pull requests ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/pulls',
    );
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expect(within(githubSection).getByText('0 of 60 requests remain')).toBeTruthy();
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 100.0% used, 0.0% remaining',
      100,
    );
    // The sequential GitHub loader stops after the first rate-limited request,
    // so the two remaining public GitHub reads are intentionally skipped.
    expect(fetchMock).toHaveBeenCalledTimes(14);
  });

  it('identifies GitHub secondary throttling and provides retry guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
        return new Response(
          JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }),
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': '60',
              'X-RateLimit-Remaining': '12',
              'X-RateLimit-Reset': '1786140366',
            },
          },
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(
      await screen.findByText('GitHub temporarily throttled requests for this browser/IP.'),
    ).toBeTruthy();
    expect(screen.getByText('Retry after 60 seconds.')).toBeTruthy();
    expect(screen.getByText('12 of 60 requests remain')).toBeTruthy();
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 80.0% used, 20.0% remaining',
      80,
    );
  });

  it('renders the full API identity, independent migration heads, and all three Pages markers', async () => {
    mockOperationsFetch();

    render(<AdminOperations />);

    const apiCard = await getDeploymentCard('API build identity');
    expect(await within(apiCard).findByText(apiGitCommit)).toBeTruthy();
    expect(within(apiCard).getByText('Version')).toBeTruthy();
    expect(apiCard.textContent).toContain(apiIdentity.version);
    expect(within(apiCard).getByText('Git commit')).toBeTruthy();
    expect(apiCard.textContent).toContain(apiGitCommit);
    expect(apiCard.querySelector(`time[datetime="${apiIdentity.buildTime}"]`)).toBeTruthy();

    const productCard = await getDeploymentCard('Product database readiness');
    expect(within(productCard).getByText('Healthy')).toBeTruthy();
    expect(within(productCard).getByText('Migration head')).toBeTruthy();
    expect(productCard.textContent).toContain(productMigrationHead);

    const adminCard = await getDeploymentCard('Administrator database readiness');
    expect(within(adminCard).getByText('Healthy')).toBeTruthy();
    expect(within(adminCard).getByText('Migration head')).toBeTruthy();
    expect(adminCard.textContent).toContain(adminMigrationHead);

    const publicPagesCard = await getDeploymentCard('Public site Pages identity');
    expect(within(publicPagesCard).getByText('Commit')).toBeTruthy();
    expect(publicPagesCard.textContent).toContain(publicPagesCommit);
    expect(within(publicPagesCard).getByText('Branch')).toBeTruthy();
    expect(publicPagesCard.textContent).toContain(publicPagesMarker.branch);

    const adminPagesCard = await getDeploymentCard('Administrator Pages identity');
    expect(within(adminPagesCard).getByText('Commit')).toBeTruthy();
    expect(adminPagesCard.textContent).toContain(adminPagesCommit);
    expect(within(adminPagesCard).getByText('Branch')).toBeTruthy();
    expect(adminPagesCard.textContent).toContain(adminPagesMarker.branch);

    const dashboardPagesCard = await getDeploymentCard('Office dashboard Pages identity');
    expect(within(dashboardPagesCard).getByText('Commit')).toBeTruthy();
    expect(dashboardPagesCard.textContent).toContain(dashboardPagesCommit);
    expect(within(dashboardPagesCard).getByText('Branch')).toBeTruthy();
    expect(dashboardPagesCard.textContent).toContain(dashboardPagesMarker.branch);
    expect(
      screen.getByText(
        'Build identity, readiness, provider metadata, and exact promotion proof are different evidence classes.',
      ),
    ).toBeTruthy();
  });

  it('accepts only main, dev, and positive preview Pages branch labels', async () => {
    const unsupportedBranches = {
      publicSite: 'pr-0',
      administrator: 'dependabot/npm_and_yarn/@types/node-24.x',
      dashboard: 'pr-01',
    } as const;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://site.example.test/_cf-pages-deployment.json') {
        return jsonResponse({ ...publicPagesMarker, branch: unsupportedBranches.publicSite });
      }
      if (url === '/_cf-pages-deployment.json') {
        return jsonResponse({ ...adminPagesMarker, branch: unsupportedBranches.administrator });
      }
      if (url === 'https://dashboard.example.test/_cf-pages-deployment.json') {
        return jsonResponse({ ...dashboardPagesMarker, branch: unsupportedBranches.dashboard });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    for (const cardName of [
      'Public site Pages identity',
      'Administrator Pages identity',
      'Office dashboard Pages identity',
    ]) {
      expect(await within(await getDeploymentCard(cardName)).findByText('Unknown')).toBeTruthy();
    }
    for (const branch of Object.values(unsupportedBranches)) {
      expect(document.body.textContent).not.toContain(branch);
    }
  });

  it('keeps public-site and dashboard Pages loading independent from each other and the admin marker', async () => {
    let resolvePublicMarker!: (response: Response) => void;
    let resolveDashboardMarker!: (response: Response) => void;
    const publicMarkerResponse = new Promise<Response>((resolve) => {
      resolvePublicMarker = resolve;
    });
    const dashboardMarkerResponse = new Promise<Response>((resolve) => {
      resolveDashboardMarker = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://site.example.test/_cf-pages-deployment.json') {
        return publicMarkerResponse;
      }
      if (url === 'https://dashboard.example.test/_cf-pages-deployment.json') {
        return dashboardMarkerResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const publicCard = await getDeploymentCard('Public site Pages identity');
    const dashboardCard = await getDeploymentCard('Office dashboard Pages identity');
    expect(within(publicCard).getByText('Checking')).toBeTruthy();
    expect(within(dashboardCard).getByText('Checking')).toBeTruthy();
    expect(await screen.findByText(adminPagesCommit)).toBeTruthy();

    await act(async () => {
      resolveDashboardMarker(jsonResponse(dashboardPagesMarker));
      await dashboardMarkerResponse;
    });
    expect(await within(dashboardCard).findByText(dashboardPagesCommit)).toBeTruthy();
    expect(within(publicCard).getByText('Checking')).toBeTruthy();

    await act(async () => {
      resolvePublicMarker(jsonResponse(publicPagesMarker));
      await publicMarkerResponse;
    });
    expect(await within(publicCard).findByText(publicPagesCommit)).toBeTruthy();
  });

  it('does not let an older overlapping refresh overwrite newer dashboard Pages evidence', async () => {
    const olderCommit = '5555555555555555555555555555555555555555';
    const newerCommit = '6666666666666666666666666666666666666666';
    let dashboardAttempt = 0;
    let resolveOlderRefresh!: (response: Response) => void;
    let resolveNewerRefresh!: (response: Response) => void;
    const olderRefresh = new Promise<Response>((resolve) => {
      resolveOlderRefresh = resolve;
    });
    const newerRefresh = new Promise<Response>((resolve) => {
      resolveNewerRefresh = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://dashboard.example.test/_cf-pages-deployment.json') {
        dashboardAttempt += 1;
        if (dashboardAttempt === 2) return olderRefresh;
        if (dashboardAttempt === 3) return newerRefresh;
        return jsonResponse(dashboardPagesMarker);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);
    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(await screen.findByText(dashboardPagesCommit)).toBeTruthy();

    act(() => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => {
      expect(
        deploymentRequests(fetchMock, 'https://dashboard.example.test/_cf-pages-deployment.json'),
      ).toHaveLength(3);
    });

    await act(async () => {
      resolveNewerRefresh(jsonResponse({ ...dashboardPagesMarker, commit: newerCommit }));
      await newerRefresh;
    });
    expect(await screen.findByText(newerCommit)).toBeTruthy();

    await act(async () => {
      resolveOlderRefresh(jsonResponse({ ...dashboardPagesMarker, commit: olderCommit }));
      await olderRefresh;
    });
    await waitFor(() => expect(screen.queryByText(olderCommit)).toBeNull());
    expect(screen.getByText(newerCommit)).toBeTruthy();
  });

  it.each([
    {
      surface: 'API identity',
      failedUrl: 'https://api.example.test/healthz',
      failedResponse: () => new Response(null, { status: 502 }),
      cardName: 'API build identity',
      status: 'Unknown',
      missing: apiGitCommit,
      preserved: [
        productMigrationHead,
        adminMigrationHead,
        publicPagesCommit,
        adminPagesCommit,
        dashboardPagesCommit,
      ],
    },
    {
      surface: 'product readiness',
      failedUrl: 'https://api.example.test/readyz',
      failedResponse: () => jsonResponse({ ok: false, db: 'down' }, 503),
      cardName: 'Product database readiness',
      status: 'Unavailable',
      missing: productMigrationHead,
      preserved: [
        apiGitCommit,
        adminMigrationHead,
        publicPagesCommit,
        adminPagesCommit,
        dashboardPagesCommit,
      ],
    },
    {
      surface: 'administrator readiness',
      failedUrl: 'https://api.example.test/admin/readyz',
      failedResponse: () => {
        throw new Error('administrator database offline');
      },
      cardName: 'Administrator database readiness',
      status: 'Unavailable',
      missing: adminMigrationHead,
      preserved: [
        apiGitCommit,
        productMigrationHead,
        publicPagesCommit,
        adminPagesCommit,
        dashboardPagesCommit,
      ],
    },
    {
      surface: 'public-site Pages marker',
      failedUrl: 'https://site.example.test/_cf-pages-deployment.json',
      failedResponse: () => new Response(null, { status: 404 }),
      cardName: 'Public site Pages identity',
      status: 'Unknown',
      missing: publicPagesCommit,
      preserved: [
        apiGitCommit,
        productMigrationHead,
        adminMigrationHead,
        adminPagesCommit,
        dashboardPagesCommit,
      ],
    },
    {
      surface: 'administrator Pages marker',
      failedUrl: '/_cf-pages-deployment.json',
      failedResponse: () => new Response(null, { status: 404 }),
      cardName: 'Administrator Pages identity',
      status: 'Unknown',
      missing: adminPagesCommit,
      preserved: [
        apiGitCommit,
        productMigrationHead,
        adminMigrationHead,
        publicPagesCommit,
        dashboardPagesCommit,
      ],
    },
    {
      surface: 'office-dashboard Pages marker',
      failedUrl: 'https://dashboard.example.test/_cf-pages-deployment.json',
      failedResponse: () => {
        throw new Error('dashboard marker unavailable');
      },
      cardName: 'Office dashboard Pages identity',
      status: 'Unknown',
      missing: dashboardPagesCommit,
      preserved: [
        apiGitCommit,
        productMigrationHead,
        adminMigrationHead,
        publicPagesCommit,
        adminPagesCommit,
      ],
    },
  ])('keeps a $surface failure independent from the other evidence', async (testCase) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === testCase.failedUrl) return testCase.failedResponse();
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const failedCard = await getDeploymentCard(testCase.cardName);
    expect(await within(failedCard).findByText(testCase.status)).toBeTruthy();
    expect(failedCard.textContent).not.toContain(testCase.missing);
    for (const preservedValue of testCase.preserved) {
      expect(await screen.findByText(preservedValue)).toBeTruthy();
    }
  });

  it('shows only bounded expected and actual identifiers for a readiness head mismatch', async () => {
    const expectedHead = '0029_next_schema.sql';
    const actualHead = '0028_current_schema.sql';
    const rawMessage = 'postgres://owner:password@example.test <script>secret()</script>';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/readyz') {
        return jsonResponse(
          {
            ok: false,
            db: 'head-mismatch',
            expected: expectedHead,
            actual: actualHead,
            message: rawMessage,
          },
          503,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const productCard = await getDeploymentCard('Product database readiness');
    expect(await within(productCard).findByText('Unavailable')).toBeTruthy();
    expect(within(productCard).getByText('Expected')).toBeTruthy();
    expect(productCard.textContent).toContain(expectedHead);
    expect(within(productCard).getByText('Actual')).toBeTruthy();
    expect(productCard.textContent).toContain(actualHead);
    expect(document.body.textContent).not.toContain(rawMessage);
    expect(document.body.textContent).not.toContain('owner:password');
    expect(document.querySelector('script')).toBeNull();
    expect(await screen.findByText(apiGitCommit)).toBeTruthy();
    expect(await screen.findByText(adminMigrationHead)).toBeTruthy();
    expect(await screen.findByText(publicPagesCommit)).toBeTruthy();
    expect(await screen.findByText(adminPagesCommit)).toBeTruthy();
    expect(await screen.findByText(dashboardPagesCommit)).toBeTruthy();
  });

  it('strictly rejects extra fields, secrets, shortened SHAs, and HTML-shaped values', async () => {
    const forbiddenValues = [
      'api-observer-token-must-never-render',
      'database-password-must-never-render',
      '<img src=x onerror=secret-must-never-run>',
      '<script>pages-secret-must-never-run</script>',
      'pages-cookie-must-never-render',
      'public-pages-token-must-never-render',
      '<svg onload=dashboard-pages-secret-must-never-run>',
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/healthz') {
        return jsonResponse({
          ...apiIdentity,
          gitCommit: 'deadbeef',
          buildTime: 'not-an-iso-timestamp',
          token: forbiddenValues[0],
        });
      }
      if (url === 'https://api.example.test/readyz') {
        return jsonResponse({ ...productReadiness, password: forbiddenValues[1] });
      }
      if (url === 'https://api.example.test/admin/readyz') {
        return jsonResponse({ ...adminReadiness, head: forbiddenValues[2] });
      }
      if (url === 'https://site.example.test/_cf-pages-deployment.json') {
        return jsonResponse({ ...publicPagesMarker, token: forbiddenValues[5] });
      }
      if (url === '/_cf-pages-deployment.json') {
        return jsonResponse({
          ...adminPagesMarker,
          branch: forbiddenValues[3],
          cookie: forbiddenValues[4],
        });
      }
      if (url === 'https://dashboard.example.test/_cf-pages-deployment.json') {
        return jsonResponse({
          ...dashboardPagesMarker,
          branch: forbiddenValues[6],
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(
      await within(await getDeploymentCard('API build identity')).findByText('Unknown'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Product database readiness')).findByText('Unavailable'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Administrator database readiness')).findByText(
        'Unavailable',
      ),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Public site Pages identity')).findByText('Unknown'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Administrator Pages identity')).findByText('Unknown'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Office dashboard Pages identity')).findByText(
        'Unknown',
      ),
    ).toBeTruthy();

    const renderedText = document.body.textContent ?? '';
    for (const value of [
      ...forbiddenValues,
      'deadbeef',
      productMigrationHead,
      adminMigrationHead,
      publicPagesCommit,
      adminPagesCommit,
      dashboardPagesCommit,
    ]) {
      expect(renderedText).not.toContain(value);
    }
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('reports individual readiness failures and refreshes only when asked', async () => {
    let productAttempt = 0;
    let adminAttempt = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/readyz') {
        productAttempt += 1;
        return productAttempt === 1
          ? jsonResponse({ ok: false, db: 'down' }, 503)
          : jsonResponse(productReadiness);
      }
      if (url === 'https://api.example.test/admin/readyz') {
        adminAttempt += 1;
        if (adminAttempt === 1) throw new Error('offline');
        return jsonResponse(adminReadiness);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const productCard = (
      await screen.findByRole('heading', {
        level: 3,
        name: 'Product database readiness',
      })
    ).closest('article')!;
    const adminCard = screen
      .getByRole('heading', { level: 3, name: 'Administrator database readiness' })
      .closest('article')!;
    expect(await within(productCard).findByText('Unavailable')).toBeTruthy();
    expect(await within(adminCard).findByText('Unavailable')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(16);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(32));
    expect(await within(productCard).findByText('Healthy')).toBeTruthy();
    expect(await within(adminCard).findByText('Healthy')).toBeTruthy();
  });

  it('does not request deployment identities or provider observations while signed out', async () => {
    authMock.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(adminSession);
    const fetchMock = mockOperationsFetch(emptyInventory);
    const user = userEvent.setup();
    const view = render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open dashboard ↗' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Fly inventory' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Harpa-recorded AI usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'API build identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Public site Pages identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Administrator Pages identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Office dashboard Pages identity' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    view.unmount();
    render(<AdminOperations />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Harpa-recorded AI usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'API build identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Public site Pages identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Administrator Pages identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Office dashboard Pages identity' })).toBeNull();
  });

  it('shows a distinct loading state until the Neon observation arrives', async () => {
    let resolveInventory!: (response: Response) => void;
    const inventoryResponse = new Promise<Response>((resolve) => {
      resolveInventory = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') return inventoryResponse;
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Loading Neon inventory…')).toBeTruthy();

    await act(async () => {
      resolveInventory(jsonResponse(emptyInventory));
      await inventoryResponse;
    });
    expect(await within(inventorySection).findByText('No accessible Neon projects.')).toBeTruthy();
  });

  it('renders available projects with the exact count and a bounded branch scroller', async () => {
    mockOperationsFetch();

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('1 visible project')).toBeTruthy();
    expect(inventorySection.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('prj_application')).toBeTruthy();
    expect(projectCard.querySelector('time[datetime="2026-05-01T00:00:00.000Z"]')).toBeTruthy();
    expect(within(projectCard).getByText('147 branches')).toBeTruthy();
    expect(within(projectCard).queryByText('2 branches')).toBeNull();
    expect(within(projectCard).getByText('main')).toBeTruthy();
    expect(within(projectCard).getByText('dev')).toBeTruthy();
    expect(within(projectCard).getByText('br_main')).toBeTruthy();
    expect(within(projectCard).getByText('br_dev')).toBeTruthy();
    expect(within(projectCard).getByText('2 active branch details returned.')).toBeTruthy();

    const branchScroller = within(projectCard).getByRole('region', {
      name: 'Branches for Application database',
    });
    expect(branchScroller.className).toContain('overflow-y-auto');
    expect(branchScroller.className).toMatch(/\bmax-h-/);
  });

  it('returns to the signed-out guard when the Neon observer rejects an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, 401);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByText('Neon inventory is temporarily unavailable.')).toBeNull();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('preserves verified project facts when the Neon observation is partial', async () => {
    mockOperationsFetch({
      observedAt,
      status: 'partial',
      projectsTruncated: false,
      unavailableProjectCount: 1,
      projects: [
        {
          ...applicationProject,
          branchCount: { status: 'available', count: 12 },
          branchDetails: { status: 'unknown', reason: 'timeout' },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Partial Neon inventory')).toBeTruthy();
    expect(within(inventorySection).getByText('1 project unavailable.')).toBeTruthy();

    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('12 branches')).toBeTruthy();
    expect(within(projectCard).getByText('Branch details unavailable.')).toBeTruthy();
    expect(within(projectCard).getByText('Provider request timed out.')).toBeTruthy();
  });

  it('labels truncated branch details without conflating their size with the exact count', async () => {
    mockOperationsFetch({
      ...availableInventory,
      status: 'partial',
      unavailableProjectCount: 1,
      projects: [
        {
          ...applicationProject,
          branchDetails: { ...applicationProject.branchDetails, truncated: true },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Partial Neon inventory')).toBeTruthy();
    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('147 branches')).toBeTruthy();
    expect(within(projectCard).getByText('2 active branch details returned.')).toBeTruthy();
    expect(within(projectCard).getByText('Branch detail list is truncated.')).toBeTruthy();
  });

  it('renders an explicit empty state when the viewer has no accessible projects', async () => {
    mockOperationsFetch(emptyInventory);

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('No accessible Neon projects.')).toBeTruthy();
    expect(within(inventorySection).queryByRole('article')).toBeNull();
  });

  it('renders missing configuration as Unknown without implying provider health', async () => {
    mockOperationsFetch({
      observedAt,
      status: 'unknown',
      reason: 'not_configured',
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Unknown')).toBeTruthy();
    expect(within(inventorySection).getByText('Neon inventory is not configured.')).toBeTruthy();
    expect(within(inventorySection).queryByText(/healthy/i)).toBeNull();
    expect(
      within(inventorySection).getByRole('link', { name: 'Open Neon console ↗' }),
    ).toHaveProperty('href', 'https://console.neon.tech/app/projects');
  });

  it('manually refreshes the inventory together with both readiness probes', async () => {
    const inventoryResponses = [
      {
        ...availableInventory,
        projects: [
          {
            ...applicationProject,
            branchCount: { status: 'available', count: 1 },
            branchDetails: { status: 'available', truncated: false, branches: [] },
          },
        ],
      },
      availableInventory,
    ];
    let inventoryRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') {
        const response = inventoryResponses[inventoryRequestCount] ?? availableInventory;
        inventoryRequestCount += 1;
        return jsonResponse(response);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    expect(await screen.findByText('1 branch')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('147 branches')).toBeTruthy();

    const inventoryCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === 'https://api.example.test/admin/operations/neon',
    );
    expect(inventoryCalls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(32);
  });

  it('uses only the admin cookie request and never renders credentials or raw provider data', async () => {
    const forbiddenValues = [
      'neon-viewer-key-must-never-leak',
      'postgresql://owner:password@ep-secret.example/db',
      'ep-secret-pooler.example',
      'raw Neon provider error body',
    ];
    const fetchMock = mockOperationsFetch({
      ...availableInventory,
      apiKey: forbiddenValues[0],
      rawProviderResponse: { error: forbiddenValues[3] },
      projects: [
        {
          ...applicationProject,
          connectionUri: forbiddenValues[1],
          proxyHost: forbiddenValues[2],
          ownerId: 'provider-owner-id',
          passwords: ['database-password'],
          endpoints: [{ host: forbiddenValues[2] }],
          roles: [{ name: 'owner' }],
          annotations: { hidden: 'raw-annotation' },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(await within(inventorySection).findByText('Unknown')).toBeTruthy();
    expect(
      within(inventorySection).queryByRole('heading', {
        level: 3,
        name: 'Application database',
      }),
    ).toBeNull();
    const inventoryCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === 'https://api.example.test/admin/operations/neon',
    );
    expect(inventoryCall).toBeDefined();
    const requestInit = inventoryCall?.[1];
    expect(requestInit).toMatchObject({ credentials: 'include', cache: 'no-store' });
    expect(requestInit?.method ?? 'GET').toBe('GET');
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(JSON.stringify(requestInit)).not.toContain('neon-viewer-key');

    const renderedText = document.body.textContent ?? '';
    for (const value of [
      ...forbiddenValues,
      'provider-owner-id',
      'database-password',
      'raw-annotation',
    ]) {
      expect(renderedText).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows a distinct loading state until the Neon Free usage observation arrives', async () => {
    let resolveNeonUsage!: (response: Response) => void;
    const neonUsageResponse = new Promise<Response>((resolve) => {
      resolveNeonUsage = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        return neonUsageResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(within(section).getByText('Loading Neon Free usage…')).toBeTruthy();

    await act(async () => {
      resolveNeonUsage(jsonResponse(availableNeonUsage));
      await neonUsageResponse;
    });
    expect(
      await within(section).findByRole('progressbar', {
        name: 'Application database compute: 25.0% used, 75.0% remaining',
      }),
    ).toBeTruthy();
  });

  it('loads Neon Free usage with the admin cookie and refreshes it only with the shared control', async () => {
    const observations = [unknownNeonUsage, availableNeonUsage];
    let observationIndex = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        const observation = observations[observationIndex] ?? availableNeonUsage;
        observationIndex += 1;
        return jsonResponse(observation);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Neon Free usage is not configured.')).toBeTruthy();
    expect(neonUsageRequests(fetchMock)).toHaveLength(1);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(
      await within(section).findByRole('progressbar', {
        name: 'Application database compute: 25.0% used, 75.0% remaining',
      }),
    ).toBeTruthy();
    await waitFor(() => expect(neonUsageRequests(fetchMock)).toHaveLength(2));
    for (const [, requestInit] of neonUsageRequests(fetchMock)) {
      expect(requestInit).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(32);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('renders Neon Free project and organization percentages from raw published references', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, availableNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    const project = within(section)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expectPaintedProgressbar(
      project,
      'Application database compute: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      project,
      'Application database storage: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      section,
      'Organization public network transfer: 25.0% used, 75.0% remaining',
      25,
    );

    const renderedText = section.textContent ?? '';
    for (const rawEvidence of [
      '90,000 CU-seconds used',
      '360,000 CU-seconds published reference',
      '125,000,000 bytes used',
      '500,000,000 bytes published reference',
      '1,250,000,000 bytes used',
      '5,000,000,000 bytes published reference',
    ]) {
      expect(renderedText).toContain(rawEvidence);
    }
    expect(renderedText).toContain('25.0% used');
    expect(renderedText).toContain('75.0% remaining');
    expect(section.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]')).toBeTruthy();
    expect(section.querySelector(`time[datetime="${resetAt}"]`)).toBeTruthy();
    expect(within(section).getByText('Not an invoice or credit balance.')).toBeTruthy();
    expect(within(section).queryByText(/credit remaining|cash credit/i)).toBeNull();
    expect(within(section).getByRole('link', { name: 'Open Neon pricing ↗' })).toHaveProperty(
      'href',
      'https://neon.com/pricing',
    );
    expect(within(section).getByRole('link', { name: 'Open Neon console ↗' })).toHaveProperty(
      'href',
      'https://console.neon.tech/app/projects',
    );
  });

  it('keeps complete empty Neon discovery available without fabricating a transfer period or percentage', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, emptyNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(within(section).getByText('0 visible projects')).toBeTruthy();
    expect(within(section).getByText('No Neon projects were returned.')).toBeTruthy();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
    expect(within(section).queryByText(/% (?:used|remaining)/i)).toBeNull();
    expect(section.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]')).toBeNull();
    expect(section.querySelector(`time[datetime="${resetAt}"]`)).toBeNull();
    expect(within(section).getByRole('link', { name: 'Open Neon pricing ↗' })).toHaveProperty(
      'href',
      'https://neon.com/pricing',
    );
    expect(within(section).getByRole('link', { name: 'Open Neon console ↗' })).toHaveProperty(
      'href',
      'https://console.neon.tech/app/projects',
    );
  });

  it('does not call a partial empty Neon discovery an organization with no projects', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, partialEmptyNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expect(within(section).getByText('0 visible projects')).toBeTruthy();
    expect(
      within(section).getByText(
        'Project discovery is incomplete; no project usage rows were safely available.',
      ),
    ).toBeTruthy();
    expect(within(section).getByText('1 provider-reported project is unavailable.')).toBeTruthy();
    expect(within(section).getByText('Project discovery is truncated.')).toBeTruthy();
    expect(within(section).queryByText('No Neon projects were returned.')).toBeNull();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
  });

  it('preserves available project percentages while explaining partial Neon usage evidence', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, partialNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expectPaintedProgressbar(
      section,
      'Application database compute: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      section,
      'Application database storage: 25.0% used, 75.0% remaining',
      25,
    );
    const unknownProject = within(section)
      .getByRole('heading', { level: 3, name: 'Admin database' })
      .closest('article')!;
    expect(within(unknownProject).getByText('Project usage unavailable.')).toBeTruthy();
    expect(within(unknownProject).getByText('Provider request timed out.')).toBeTruthy();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).getByText('Complete project coverage is unavailable.')).toBeTruthy();
    expect(
      within(section).queryByRole('progressbar', {
        name: /Organization public network transfer/i,
      }),
    ).toBeNull();
  });

  it.each([
    [unknownNeonUsage, 'Neon Free usage is not configured.'],
    [
      { ...unknownNeonUsage, reason: 'unsupported_plan' as const },
      'Neon plan is not the supported Free plan.',
    ],
  ] as const)(
    'renders an Unknown Neon Free usage reason without a fabricated percentage',
    async (observation, expectedCopy) => {
      mockOperationsFetch(emptyInventory, availableR2Capacity, observation);

      render(<AdminOperations />);

      const section = await getNeonUsageSection();
      expect(await within(section).findByText('Unknown')).toBeTruthy();
      expect(within(section).getByText(expectedCopy)).toBeTruthy();
      expect(within(section).queryByRole('progressbar')).toBeNull();
      expect(within(section).queryByText(/% (?:used|remaining)/i)).toBeNull();
    },
  );

  it('returns the whole page to sign-in when the Neon Free usage observer rejects the session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, 401);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByText('Neon Free usage is temporarily unavailable.')).toBeNull();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts Neon credentials, provider bodies, and project connection data', async () => {
    const forbiddenValues = [
      'neon-viewer-key-must-never-leak',
      'postgresql://owner:password@ep-secret.example/db',
      'raw Neon usage provider error for owner@example.com',
      'ep-secret-pooler.example',
    ];
    const poisonedNeonUsage = {
      ...availableNeonUsage,
      apiKey: forbiddenValues[0],
      rawProviderResponse: { error: forbiddenValues[2] },
      projects: [
        {
          ...availableNeonUsageProject,
          connectionUri: forbiddenValues[1],
          proxyHost: forbiddenValues[3],
          ownerId: 'provider-owner-id',
        },
      ],
    };
    mockOperationsFetch(emptyInventory, availableR2Capacity, poisonedNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Neon Free usage returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of [...forbiddenValues, 'provider-owner-id']) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('retains over-reference percentages while clamping every painted Neon meter at 100%', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, overAllowanceNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expectPaintedProgressbar(
      section,
      'Application database compute: 111.1% used, 0.0% remaining',
      100,
    );
    expectPaintedProgressbar(
      section,
      'Application database storage: 120.0% used, 0.0% remaining',
      100,
    );
    expectPaintedProgressbar(
      section,
      'Organization public network transfer: 120.0% used, 0.0% remaining',
      100,
    );
    expect(section.textContent).toContain('111.1% used');
    expect(section.textContent).toContain('120.0% used');
    expect(section.textContent).toContain('0.0% remaining');
  });

  it('loads R2 capacity with the admin cookie and refreshes it only with the shared control', async () => {
    const observations = [unknownR2Capacity, availableR2Capacity];
    let observationIndex = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        const observation = observations[observationIndex] ?? availableR2Capacity;
        observationIndex += 1;
        return jsonResponse(observation);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('R2 capacity is not configured.')).toBeTruthy();
    expect(r2CapacityRequests(fetchMock)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await within(section).findByText('2 visible buckets')).toBeTruthy();
    await waitFor(() => expect(r2CapacityRequests(fetchMock)).toHaveLength(2));
    for (const [, requestInit] of r2CapacityRequests(fetchMock)) {
      expect(requestInit).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(32);
  });

  it('shows a distinct loading state until the R2 observation arrives', async () => {
    let resolveR2Capacity!: (response: Response) => void;
    const r2CapacityResponse = new Promise<Response>((resolve) => {
      resolveR2Capacity = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return r2CapacityResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(within(section).getByText('Loading R2 capacity…')).toBeTruthy();

    await act(async () => {
      resolveR2Capacity(jsonResponse(availableR2Capacity));
      await r2CapacityResponse;
    });
    expect(await within(section).findByText('2 visible buckets')).toBeTruthy();
  });

  it('renders available R2 snapshots, free-tier references, caveats, and a bounded bucket list', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(within(section).getByText('2 visible buckets')).toBeTruthy();
    expect(section.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const renderedText = section.textContent ?? '';
    for (const value of [
      '10 GB-month',
      '1,000,000 Class A operations',
      '10,000,000 Class B operations',
      'Standard storage',
      '61,000,000 payload bytes',
      '596,713 metadata bytes',
      '138 published objects',
      '1 uploading object',
      'Infrequent Access',
      '12,000,000 payload bytes',
      '7 published objects',
      '125,000 used',
      '875,000 estimated remaining',
      '4,200,000 used',
      '5,800,000 estimated remaining',
      '32,000 free operations',
    ]) {
      expect(renderedText).toContain(value);
    }
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class A operations: 12.5% used, 87.5% remaining',
      12.5,
    );
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class B operations: 42.0% used, 58.0% remaining',
      42,
    );
    expect(renderedText).toContain('12.5% used');
    expect(renderedText).toContain('87.5% remaining');
    expect(renderedText).toContain('42.0% used');
    expect(renderedText).toContain('58.0% remaining');
    expect(within(section).getAllByRole('progressbar')).toHaveLength(2);
    expect(within(section).queryByRole('progressbar', { name: /storage/i })).toBeNull();
    expect(renderedText).not.toMatch(/(?:standard|infrequent access|storage)[^.\n]*%/i);
    for (const caveat of [
      'Current storage is a snapshot, not remaining GB-month capacity.',
      'Storage metrics may lag.',
      'Operation headroom is a conservative account-wide estimate from analytics and published mappings; storage-class eligibility is unavailable, so this is not a provider billing balance.',
      'Infrequent Access storage is outside the Standard-storage free tier.',
    ]) {
      expect(within(section).getByText(caveat)).toBeTruthy();
    }

    const bucketScroller = within(section).getByRole('region', { name: 'R2 buckets' });
    expect(bucketScroller.className).toContain('overflow-y-auto');
    expect(bucketScroller.className).toMatch(/\bmax-h-/);
    expect(within(bucketScroller).getByText('harpa-pro')).toBeTruthy();
    expect(within(bucketScroller).getByText('harpa-pro-archive')).toBeTruthy();
    expect(bucketScroller.querySelector('time[datetime="2026-05-01T00:00:00.000Z"]')).toBeTruthy();
    expect(within(section).getByRole('link', { name: 'Open Cloudflare console ↗' })).toHaveProperty(
      'href',
      'https://dash.cloudflare.com/',
    );
  });

  it('shows the exact published stored total without counting uploading bytes', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expectDefinitionValue(section, 'Published stored now', '70.3 MiB (73,716,713 bytes)');
    expect(section.textContent).not.toContain('73,717,865 bytes');
  });

  it.each([
    {
      caseName: 'zero published bytes',
      standard: {
        ...availableR2Capacity.storage.standard,
        publishedPayloadBytes: 0,
        publishedMetadataBytes: 0,
        uploadingPayloadBytes: Number.MAX_SAFE_INTEGER,
        uploadingMetadataBytes: 0,
      },
      infrequentAccess: {
        ...availableR2Capacity.storage.infrequentAccess,
        publishedPayloadBytes: 0,
        publishedMetadataBytes: 0,
      },
      expected: '0 bytes',
    },
    {
      caseName: 'a multi-field maximum-safe-integer total',
      standard: {
        ...availableR2Capacity.storage.standard,
        publishedPayloadBytes: Number.MAX_SAFE_INTEGER - 3,
        publishedMetadataBytes: 1,
        uploadingPayloadBytes: 4_096,
        uploadingMetadataBytes: 2_048,
      },
      infrequentAccess: {
        ...availableR2Capacity.storage.infrequentAccess,
        publishedPayloadBytes: 1,
        publishedMetadataBytes: 1,
      },
      expected: '8.0 PiB (9,007,199,254,740,991 bytes)',
    },
    {
      caseName: 'a rounded value just below the next IEC unit',
      standard: {
        ...availableR2Capacity.storage.standard,
        publishedPayloadBytes: 1_048_525,
        publishedMetadataBytes: 0,
      },
      infrequentAccess: {
        ...availableR2Capacity.storage.infrequentAccess,
        publishedPayloadBytes: 0,
        publishedMetadataBytes: 0,
      },
      expected: '1.0 MiB (1,048,525 bytes)',
    },
  ])(
    'formats $caseName without precision loss',
    async ({ standard, infrequentAccess, expected }) => {
      const observation = {
        ...availableR2Capacity,
        storage: {
          status: 'available' as const,
          standard,
          infrequentAccess,
        },
      };
      mockOperationsFetch(emptyInventory, observation);

      render(<AdminOperations />);

      const section = await getR2CapacitySection();
      expectDefinitionValue(section, 'Published stored now', expected);
    },
  );

  it('keeps ingress and egress volume explicitly Unknown with the documented evidence limits', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expectDefinitionValue(section, 'Ingress volume', 'Unknown');
    expectDefinitionValue(section, 'Egress volume', 'Unknown');
    expect(
      within(section).getByText('The documented R2 metrics do not expose ingress or egress bytes.'),
    ).toBeTruthy();
    expect(
      within(section).getByText(
        'Direct R2 egress is free, but this observer cannot measure bytes served.',
      ),
    ).toBeTruthy();
    expect(
      within(section).getByText('Harpa uploads and downloads use direct signed URLs.'),
    ).toBeTruthy();
  });

  it.each([
    ['zero', 0, 1_000_000, 0, 10_000_000, 0, 100, 0],
    ['full', 1_000_000, 0, 10_000_000, 0, 100, 0, 100],
    ['over-reference', 1_250_000, 0, 12_500_000, 0, 125, 0, 100],
  ] as const)(
    'renders %s R2 Class A and Class B operation percentages',
    async (
      _caseName,
      classAUsed,
      classARemaining,
      classBUsed,
      classBRemaining,
      usedPercent,
      remainingPercent,
      paintedPercent,
    ) => {
      const observation = {
        ...availableR2Capacity,
        operations: {
          ...availableR2Capacity.operations,
          classA: {
            ...availableR2Capacity.operations.classA,
            estimatedUsed: classAUsed,
            estimatedRemaining: classARemaining,
          },
          classB: {
            ...availableR2Capacity.operations.classB,
            estimatedUsed: classBUsed,
            estimatedRemaining: classBRemaining,
          },
        },
      };
      mockOperationsFetch(emptyInventory, observation);

      render(<AdminOperations />);

      const section = await getR2CapacitySection();
      expectPaintedProgressbar(
        section,
        `Estimated R2 Class A operations: ${usedPercent.toFixed(1)}% used, ${remainingPercent.toFixed(1)}% remaining`,
        paintedPercent,
      );
      expectPaintedProgressbar(
        section,
        `Estimated R2 Class B operations: ${usedPercent.toFixed(1)}% used, ${remainingPercent.toFixed(1)}% remaining`,
        paintedPercent,
      );
    },
  );

  it('preserves partial R2 facts and explains unknown storage, truncation, and exclusions', async () => {
    const partialR2Capacity = {
      ...availableR2Capacity,
      status: 'partial' as const,
      buckets: { ...availableR2Capacity.buckets, truncated: true },
      storage: { status: 'unknown' as const, reason: 'timeout' as const },
      operations: {
        ...availableR2Capacity.operations,
        unclassifiedRequests: 57,
      },
      caveats: [
        'storage_snapshot_not_gb_month',
        'storage_metrics_may_lag',
        'operations_estimated_from_analytics',
        'unclassified_operations_excluded',
        'bucket_inventory_truncated',
      ] as const,
    };
    mockOperationsFetch(emptyInventory, partialR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expect(within(section).getByText('2 visible buckets')).toBeTruthy();
    expect(within(section).getByText('Storage snapshot unavailable.')).toBeTruthy();
    expect(within(section).getByText('Cloudflare request timed out.')).toBeTruthy();
    expect(
      within(section).getByText('Bucket inventory is truncated; more buckets may exist.'),
    ).toBeTruthy();
    expect(
      within(section).getByText(
        '57 successful requests were unclassified and excluded from the operation estimates.',
      ),
    ).toBeTruthy();
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class A operations: 12.5% used, 87.5% remaining',
      12.5,
    );
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class B operations: 42.0% used, 58.0% remaining',
      42,
    );
    expect(within(section).getAllByRole('progressbar')).toHaveLength(2);
    expect(section.textContent).toContain('875,000 estimated remaining');
  });

  it('renders an unknown R2 observation without implying provider health or remaining storage', async () => {
    mockOperationsFetch(emptyInventory, unknownR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity is not configured.')).toBeTruthy();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
    expect(within(section).queryByText(/remaining GB-month/i)).toBeNull();
    expect(within(section).queryByText(/GB-month remaining/i)).toBeNull();
  });

  it('uses neutral copy when the admin route rate-limits the R2 observation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse({ error: { code: 'RATE_LIMITED', message: 'route bucket' } }, 429);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity observation was rate limited.')).toBeTruthy();
    expect(within(section).queryByText(/Cloudflare rate limiting/i)).toBeNull();
    expect(document.body.textContent).not.toContain('route bucket');
  });

  it('returns the whole page to sign-in when the R2 observer finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-r2-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-r2-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts R2 credentials, raw provider data, and exact remaining storage', async () => {
    const forbiddenValues = [
      'cloudflare-observer-token-must-never-render',
      'cloudflare-account-id-must-never-render',
      'raw Cloudflare GraphQL error body',
      'private/object-key.jpg',
      '9.75 exact remaining GB-month',
    ];
    const poisonedR2Capacity = {
      ...availableR2Capacity,
      apiToken: forbiddenValues[0],
      accountId: forbiddenValues[1],
      rawProviderResponse: { errors: [{ message: forbiddenValues[2] }] },
      objectKeys: [forbiddenValues[3]],
      remainingStorage: forbiddenValues[4],
    };
    const fetchMock = mockOperationsFetch(emptyInventory, poisonedR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByText('harpa-pro')).toBeNull();

    const [request] = r2CapacityRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);

    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of forbiddenValues) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('loads strict Fly inventory with the admin cookie and renders bounded provider facts', async () => {
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      availableFlyInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(await within(section).findByText('1 configured app observed')).toBeTruthy();
    expect(within(section).getByText('Organization harpa-pro.')).toBeTruthy();
    expect(within(section).getByText('Remaining Fly credit: Unknown')).toBeTruthy();
    expect(
      within(section).getByText(
        'Machine state and process group are provider inventory, not Harpa readiness or Machine/worker liveness.',
      ),
    ).toBeTruthy();
    expect(
      within(section).getByText('Volume size is allocated capacity, not used or free storage.'),
    ).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();

    const appHeading = within(section).getByRole('heading', { level: 3, name: 'harpa-pro-api' });
    const appCard = appHeading.closest('article')!;
    expect(appCard.textContent).toContain('app_harpa_pro_api');
    expect(appCard.textContent).toContain('deployed');
    expect(appCard.textContent).toContain('network default');
    expect(within(appCard).getByText('2 Machines reported')).toBeTruthy();
    expect(within(appCard).getByText('1 Volume reported')).toBeTruthy();
    expect(
      within(appCard).getByText('1 Machine detail returned from a separate snapshot.'),
    ).toBeTruthy();
    expect(
      within(appCard).getByText('1 Volume detail returned from a separate snapshot.'),
    ).toBeTruthy();
    expect(within(appCard).queryByText(/drift/i)).toBeNull();
    expect(within(appCard).getByText('machine_prod_1')).toBeTruthy();
    expect(within(appCard).getByText(/Process group(?:\s*[:·-]\s*|\s+)app/i)).toBeTruthy();
    expect(within(appCard).getByText('shared · 1 CPU · 512 MB')).toBeTruthy();
    expect(within(appCard).getByText('vol_prod_1')).toBeTruthy();
    expect(within(appCard).getByText('3 GB allocated')).toBeTruthy();
    expect(within(appCard).getByText('Attached to machine_prod_1')).toBeTruthy();
    expect(within(appCard).getByText('Snapshots retained 5 days')).toBeTruthy();
    expect(within(appCard).getByText('Automatic backups enabled')).toBeTruthy();
    for (const timestamp of [
      '2026-08-08T05:00:00.000Z',
      '2026-08-08T05:10:00.000Z',
      '2026-08-08T05:01:00.000Z',
    ]) {
      expect(appCard.querySelector(`time[datetime="${timestamp}"]`)).toBeTruthy();
    }
    expect(section.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    for (const name of ['Machines for harpa-pro-api', 'Volumes for harpa-pro-api']) {
      const scroller = within(appCard).getByRole('region', { name });
      expect(scroller.className).toContain('overflow-y-auto');
      expect(scroller.className).toMatch(/\bmax-h-/);
      expect(scroller.tabIndex).toBe(0);
    }

    const [request] = flyInventoryRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    const canarySection = await getCanarySection();
    expect(within(canarySection).getByText('Not run yet in this browser session.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Storage lifecycle' })).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('renders an absent Fly process group as not reported rather than readiness or liveness', async () => {
    const nullProcessGroupInventory = {
      ...availableFlyInventory,
      apps: [
        {
          ...productionFlyApp,
          machines: {
            ...productionFlyApp.machines,
            items: [
              {
                ...productionFlyApp.machines.items[0],
                processGroup: null,
              },
            ],
          },
        },
      ],
    };
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      nullProcessGroupInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(
      await within(section).findByText(/Process group(?:\s*[:·-]\s*|\s+)not reported/i),
    ).toBeTruthy();
    expect(section.textContent).not.toContain('Process group null');
    expect(
      within(section).getByText(
        'Machine state and process group are provider inventory, not Harpa readiness or Machine/worker liveness.',
      ),
    ).toBeTruthy();
  });

  it('shows a distinct loading state until the Fly observation arrives', async () => {
    let resolveFlyInventory!: (response: Response) => void;
    const flyInventoryResponse = new Promise<Response>((resolve) => {
      resolveFlyInventory = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/fly-inventory') {
        return flyInventoryResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(within(section).getByText('Loading Fly inventory…')).toBeTruthy();
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);

    await act(async () => {
      resolveFlyInventory(jsonResponse(availableFlyInventory));
      await flyInventoryResponse;
    });
    expect(await within(section).findByText('1 configured app observed')).toBeTruthy();
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('preserves safe app facts when Fly inventory is partial', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      partialFlyInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(await within(section).findByText('Partial Fly inventory')).toBeTruthy();
    expect(within(section).getByText('1 configured app unavailable.')).toBeTruthy();
    const appCard = within(section)
      .getByRole('heading', { level: 3, name: 'harpa-pro-api' })
      .closest('article')!;
    expect(appCard.textContent).toContain('app_harpa_pro_api');
    expect(within(appCard).getByText('Machine inventory unavailable.')).toBeTruthy();
    expect(within(appCard).getByText('Fly request timed out.')).toBeTruthy();
    expect(within(appCard).getByText('3 GB allocated')).toBeTruthy();
  });

  it('labels truncated Fly detail lists without treating snapshot count differences as drift', async () => {
    const truncatedFlyInventory = {
      ...availableFlyInventory,
      status: 'partial' as const,
      apps: [
        {
          ...productionFlyApp,
          reportedMachineCount: 75,
          reportedVolumeCount: 80,
          machines: { ...productionFlyApp.machines, truncated: true },
          volumes: { ...productionFlyApp.volumes, truncated: true },
        },
      ],
    };
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      truncatedFlyInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(await within(section).findByText('Partial Fly inventory')).toBeTruthy();
    const appCard = within(section)
      .getByRole('heading', { level: 3, name: 'harpa-pro-api' })
      .closest('article')!;
    expect(within(appCard).getByText('75 Machines reported')).toBeTruthy();
    expect(within(appCard).getByText('80 Volumes reported')).toBeTruthy();
    expect(
      within(appCard).getByText('1 Machine detail returned from a separate snapshot.'),
    ).toBeTruthy();
    expect(
      within(appCard).getByText('1 Volume detail returned from a separate snapshot.'),
    ).toBeTruthy();
    expect(within(appCard).getByText('Machine detail list is truncated.')).toBeTruthy();
    expect(within(appCard).getByText('Volume detail list is truncated.')).toBeTruthy();
    expect(within(appCard).queryByText(/drift/i)).toBeNull();
  });

  it('renders an unknown Fly observation without implying provider health or credit', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Fly inventory is not configured.')).toBeTruthy();
    expect(within(section).getByText('Remaining Fly credit: Unknown')).toBeTruthy();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
    expect(within(section).queryByText(/credit remaining/i)).toBeNull();
    expect(within(section).queryByRole('progressbar')).toBeNull();
    expect(within(section).getByRole('link', { name: 'Open Fly dashboard ↗' })).toHaveProperty(
      'href',
      'https://fly.io/dashboard',
    );
  });

  it('returns the whole page to sign-in when Fly inventory finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/fly-inventory') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-fly-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Fly inventory' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-fly-cookie-detail');
    expect(document.documentElement.outerHTML).not.toContain('expired-fly-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects Fly secrets, non-allowlisted apps, and raw provider fields', async () => {
    const forbiddenValues = [
      'fly-read-only-token-must-never-render',
      'unreviewed-private-app',
      'fdaa:0:18:a7b:196:e274:9ce1:2',
      'registry.fly.io/private/image:latest',
      'host-dedication-key-must-never-render',
      'raw Fly provider error body',
      'unreviewed-process-metadata-must-never-render',
    ];
    const poisonedFlyInventory = {
      ...availableFlyInventory,
      apiToken: forbiddenValues[0],
      nonAllowlistedApps: [forbiddenValues[1]],
      rawProviderError: forbiddenValues[5],
      apps: [
        {
          ...productionFlyApp,
          machines: {
            ...productionFlyApp.machines,
            items: [
              {
                ...productionFlyApp.machines.items[0],
                privateIp: forbiddenValues[2],
                imageRef: forbiddenValues[3],
                config: {
                  env: { SECRET: forbiddenValues[0] },
                  metadata: { unreviewed: forbiddenValues[6] },
                },
                events: [{ status: forbiddenValues[5] }],
              },
            ],
          },
          volumes: {
            ...productionFlyApp.volumes,
            items: [
              {
                ...productionFlyApp.volumes.items[0],
                hostDedicationKey: forbiddenValues[4],
                blocksAvail: 730_163,
              },
            ],
          },
        },
      ],
    };
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      poisonedFlyInventory,
    );

    render(<AdminOperations />);

    const section = await getFlyInventorySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Fly inventory returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByRole('heading', { name: 'harpa-pro-api' })).toBeNull();
    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of forbiddenValues) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }

    const [request] = flyInventoryRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows a distinct loading state until the Sentry observation arrives', async () => {
    let resolveSentry!: (response: Response) => void;
    const sentryResponse = new Promise<Response>((resolve) => {
      resolveSentry = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        return sentryResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(within(section).getByText('Loading Sentry observation…')).toBeTruthy();

    const neonHeading = await screen.findByRole('heading', { level: 2, name: 'Neon inventory' });
    const neonSection = neonHeading.closest('section')!;
    expect(await within(neonSection).findByText('No accessible Neon projects.')).toBeTruthy();
    expect(
      await within(await getR2CapacitySection()).findByText('R2 capacity is not configured.'),
    ).toBeTruthy();
    expect(
      await within(await getFlyInventorySection()).findByText('1 configured app observed'),
    ).toBeTruthy();
    expect(await within(await getAiUsageSection()).findByText('19 recorded events')).toBeTruthy();

    await act(async () => {
      resolveSentry(jsonResponse(availableSentryObservation));
      await sentryResponse;
    });
    expect(await within(section).findByText('Available')).toBeTruthy();
    expectDefinitionValue(section, 'Crashed', '1');
  });

  it('renders only fixed Sentry aggregates, caveats, and the generic issues link', async () => {
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      availableSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(section.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();
    expectDefinitionValue(section, 'Unresolved error issue groups', '3');
    expectDefinitionValue(section, 'Mobile sessions · last 24 hours', '12');
    expectDefinitionValue(section, 'Healthy', '9');
    expectDefinitionValue(section, 'Errored', '2');
    expectDefinitionValue(section, 'Abnormal', '0');
    expectDefinitionValue(section, 'Crashed', '1');

    for (const caveat of [
      'One issue group can contain many error events. Issue details stay in Sentry.',
      'Mobile release health covers the configured mobile project only; it does not cover the API or browser applications.',
      'Zero unresolved groups is not proof that all systems have no errors.',
      'A crashed session is recent activity, not an unresolved issue.',
      'Missing or zero session data is Unknown, not zero crashes.',
    ]) {
      expect(within(section).getByText(caveat)).toBeTruthy();
    }

    const issuesLink = within(section).getByRole('link', { name: 'Open Sentry issues ↗' });
    expect(issuesLink).toHaveProperty('href', 'https://sentry.io/issues/');
    expect(issuesLink.getAttribute('href')).not.toMatch(/organizations|projects|harpa/i);
    expect(within(section).queryByText(/project slug|organization slug/i)).toBeNull();
    expect(within(section).queryByRole('progressbar')).toBeNull();

    const [request] = sentryRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('renders a truncated unresolved issue count as a lower bound and marks the card partial', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      lowerBoundSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expectDefinitionValue(section, 'Unresolved error issue groups', '100+');
    expectDefinitionValue(section, 'Mobile sessions · last 24 hours', '12');
    expect(
      within(section).getByText(
        'The unresolved issue-group count is a lower bound because Sentry reported another page.',
      ),
    ).toBeTruthy();
  });

  it('preserves the unresolved issue aggregate when mobile session evidence is unavailable', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      partialSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expectDefinitionValue(section, 'Unresolved error issue groups', '3');
    expect(within(section).getByText('Mobile sessions · last 24 hours')).toBeTruthy();
    expect(within(section).getByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('No mobile session data was available.')).toBeTruthy();
    expect(within(section).queryByText(/0 crashes/i)).toBeNull();
  });

  it('preserves all mobile session aggregates when unresolved issue evidence is unavailable', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      issueUnknownSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    const issueTerm = within(section).getByText('Unresolved error issue groups', {
      selector: 'dt',
    });
    const issueDefinition = issueTerm.nextElementSibling as HTMLElement | null;
    expect(issueDefinition?.tagName).toBe('DD');
    expect(within(issueDefinition!).getByText('Unknown')).toBeTruthy();
    expect(within(issueDefinition!).getByText('Sentry request timed out.')).toBeTruthy();
    expect(issueDefinition?.textContent).not.toMatch(/\b0\b|no unresolved|zero errors?/i);

    expectDefinitionValue(section, 'Mobile sessions · last 24 hours', '12');
    expectDefinitionValue(section, 'Healthy', '9');
    expectDefinitionValue(section, 'Errored', '2');
    expectDefinitionValue(section, 'Abnormal', '0');
    expectDefinitionValue(section, 'Crashed', '1');
  });

  it('renders a wholly unknown Sentry observation without implying zero errors or crashes', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      unknownSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Sentry denied access to this observation.')).toBeTruthy();
    for (const aggregateLabel of [
      'Unresolved error issue groups',
      'Mobile sessions · last 24 hours',
      'Healthy',
      'Errored',
      'Abnormal',
      'Crashed',
    ]) {
      expect(within(section).queryByText(aggregateLabel, { selector: 'dt' })).toBeNull();
    }
    expect(within(section).queryByText(/0 unresolved/i)).toBeNull();
    expect(within(section).queryByText(/0 crashes/i)).toBeNull();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
  });

  it('returns the whole page to sign-in when the Sentry observer finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-sentry-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Sentry errors and mobile crashes' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-sentry-cookie-detail');
    expect(document.documentElement.outerHTML).not.toContain('expired-sentry-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('maps a rejected Sentry fetch to typed Unknown copy without rendering the Error message', async () => {
    const privateError = 'private-sentry-fetch-error-must-never-render';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        throw new Error(privateError);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Sentry is temporarily unavailable.')).toBeTruthy();
    expect(document.body.textContent).not.toContain(privateError);
    expect(document.documentElement.outerHTML).not.toContain(privateError);
  });

  it('maps a Sentry route 500 to typed Unknown copy without rendering the provider body', async () => {
    const privateProviderBody = 'private-sentry-route-500-body-must-never-render';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        return jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: privateProviderBody } },
          500,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Sentry is temporarily unavailable.')).toBeTruthy();
    expect(document.body.textContent).not.toContain(privateProviderBody);
    expect(document.documentElement.outerHTML).not.toContain(privateProviderBody);
  });

  it('maps a Sentry route rate limit to typed copy without rendering the provider body', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        return jsonResponse(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'sentry-rate-limit-provider-detail-must-never-render',
            },
          },
          429,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Sentry observation was rate limited.')).toBeTruthy();
    expect(document.body.textContent).not.toContain(
      'sentry-rate-limit-provider-detail-must-never-render',
    );
    expect(document.documentElement.outerHTML).not.toContain(
      'sentry-rate-limit-provider-detail-must-never-render',
    );
  });

  it.each(sentryRedactionCases)(
    'strictly rejects and redacts a Sentry $label field at its reviewed nesting level',
    async ({ value, observation }) => {
      const fetchMock = mockOperationsFetch(
        emptyInventory,
        unknownR2Capacity,
        availableNeonUsage,
        availableStorageLifecycle,
        unknownFlyInventory,
        observation,
      );

      render(<AdminOperations />);

      const section = await getSentrySection();
      expect(await within(section).findByText('Unknown')).toBeTruthy();
      expect(within(section).getByText('Sentry returned an invalid response.')).toBeTruthy();
      expect(within(section).queryByText('3')).toBeNull();
      expect(document.body.textContent).not.toContain(value);
      expect(document.documentElement.outerHTML).not.toContain(value);

      const [request] = sentryRequests(fetchMock);
      expect(request).toBeDefined();
      const [, requestInit] = request!;
      expect(requestInit).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
    },
  );

  it('strictly rejects inconsistent Sentry aggregate totals', async () => {
    const inconsistentSentryObservation = {
      ...availableSentryObservation,
      mobileSessions: {
        ...availableSentryObservation.mobileSessions,
        totalSessions: 13,
      },
    };
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      inconsistentSentryObservation,
    );

    render(<AdminOperations />);

    const section = await getSentrySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Sentry returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByText('3')).toBeNull();

    const [request] = sentryRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('does not let an older overlapping refresh overwrite newer Sentry evidence', async () => {
    let sentryAttempt = 0;
    let resolveOlderRefresh!: (response: Response) => void;
    let resolveNewerRefresh!: (response: Response) => void;
    const olderRefresh = new Promise<Response>((resolve) => {
      resolveOlderRefresh = resolve;
    });
    const newerRefresh = new Promise<Response>((resolve) => {
      resolveNewerRefresh = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/sentry') {
        sentryAttempt += 1;
        if (sentryAttempt === 2) return olderRefresh;
        if (sentryAttempt === 3) return newerRefresh;
        return jsonResponse(unknownSentryObservation);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);
    const section = await getSentrySection();
    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(
      await within(section).findByText('Sentry denied access to this observation.'),
    ).toBeTruthy();

    act(() => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(sentryRequests(fetchMock)).toHaveLength(3));

    await act(async () => {
      resolveNewerRefresh(jsonResponse(availableSentryObservation));
      await newerRefresh;
    });
    expect(await within(section).findByText('Available')).toBeTruthy();
    expectDefinitionValue(section, 'Crashed', '1');

    await act(async () => {
      resolveOlderRefresh(jsonResponse(unknownSentryObservation));
      await olderRefresh;
    });
    await waitFor(() =>
      expect(within(section).queryByText('Sentry denied access to this observation.')).toBeNull(),
    );
    expect(within(section).getByText('Available')).toBeTruthy();
    expectDefinitionValue(section, 'Crashed', '1');
  });

  it('shows a distinct loading state until the Harpa usage-ledger observation arrives', async () => {
    let resolveAiUsage!: (response: Response) => void;
    const aiUsageResponse = new Promise<Response>((resolve) => {
      resolveAiUsage = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/ai-usage') {
        return aiUsageResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      if (url === 'https://api.example.test/admin/operations/fly-inventory') {
        return jsonResponse(unknownFlyInventory);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getAiUsageSection();
    expect(within(section).getByText('Loading Harpa-recorded AI usage…')).toBeTruthy();

    await act(async () => {
      resolveAiUsage(jsonResponse(emptyAiUsage));
      await aiUsageResponse;
    });
    expect(
      await within(section).findAllByText('No AI usage recorded in this window.'),
    ).toHaveLength(2);
  });

  it('renders non-empty Harpa usage windows with modes, operations, providers, tokens, seconds, warnings, and unknown credit', async () => {
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      availableSentryObservation,
      availableAiUsage,
    );

    render(<AdminOperations />);

    const section = await getAiUsageSection();
    const canarySection = await getCanarySection();
    expect(
      canarySection.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(section).getByText(
        'Harpa-recorded metadata is a retained, best-effort ledger. It is not provider billing.',
      ),
    ).toBeTruthy();
    expect(section.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const monthHeading = within(section).getByRole('heading', {
      level: 3,
      name: 'Month to date',
    });
    const month = monthHeading.closest('article');
    expect(month).toBeTruthy();
    for (const value of [
      '19 recorded events',
      'Live: 7 succeeded, 3 failed, 10 total',
      'Record: 3 succeeded, 1 failed, 4 total',
      'Replay: 4 succeeded, 1 failed, 5 total',
      '114,200 input tokens',
      '22,800 output tokens',
      '31,000 cached tokens',
      '45.125 transcription input seconds',
    ]) {
      expect(within(month!).getByText(value)).toBeTruthy();
    }
    expect(month!.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]')).toBeTruthy();
    expect(month!.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const monthOperations = within(month!).getByRole('list', {
      name: 'Month-to-date operations',
    });
    const operationExpectations = [
      {
        name: 'Chat',
        patterns: [
          /Live\D+3 succeeded\D+1 failed/,
          /Record\D+1 succeeded\D+0 failed/,
          /Replay\D+2 succeeded\D+0 failed/,
        ],
      },
      {
        name: 'Report generation',
        patterns: [
          /Live\D+2 succeeded\D+1 failed/,
          /Record\D+2 succeeded\D+1 failed/,
          /Replay\D+2 succeeded\D+1 failed/,
        ],
      },
      {
        name: 'Transcription',
        patterns: [
          /Live\D+2 succeeded\D+1 failed/,
          /Record\D+0 succeeded\D+0 failed/,
          /Replay\D+0 succeeded\D+0 failed/,
        ],
      },
    ] as const;
    for (const { name, patterns } of operationExpectations) {
      const item = within(monthOperations).getByText(name).closest('li');
      expect(item).toBeTruthy();
      const text = item!.textContent ?? '';
      for (const pattern of patterns) expect(text).toMatch(pattern);
    }

    const monthProviders = within(month!).getByRole('list', {
      name: 'Month-to-date providers',
    });
    const providerExpectations = [
      ['OpenAI', '8 recorded events'],
      ['Groq', '3 recorded events'],
      ['Kimi', '5 recorded events'],
      ['Other', '3 recorded events'],
    ] as const;
    for (const [name, count] of providerExpectations) {
      const item = within(monthProviders).getByText(name).closest('li');
      expect(item).toBeTruthy();
      expect(item!.textContent).toContain(count);
    }
    const openAiProvider = within(monthProviders).getByText('OpenAI').closest('li')!;
    expect(openAiProvider.textContent).toContain('100,000 input tokens');
    expect(openAiProvider.textContent).toContain('20,000 output tokens');
    expect(openAiProvider.textContent).toContain('30,000 cached tokens');
    const groqProvider = within(monthProviders).getByText('Groq').closest('li')!;
    expect(groqProvider.textContent).toContain('45.125 transcription input seconds');

    const last24Heading = within(section).getByRole('heading', {
      level: 3,
      name: 'Last 24 hours',
    });
    const last24 = last24Heading.closest('article');
    expect(last24).toBeTruthy();
    for (const value of [
      '5 recorded events',
      'Live: 2 succeeded, 1 failed, 3 total',
      'Record: 0 succeeded, 0 failed, 0 total',
      'Replay: 2 succeeded, 0 failed, 2 total',
      '2,500 input tokens',
      '500 output tokens',
      '200 cached tokens',
      '12.5 transcription input seconds',
    ]) {
      expect(within(last24!).getByText(value)).toBeTruthy();
    }
    expect(last24!.querySelector('time[datetime="2026-08-07T05:30:00.000Z"]')).toBeTruthy();
    expect(last24!.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();
    const last24Providers = within(last24!).getByRole('list', {
      name: 'Last-24-hours providers',
    });
    for (const name of ['OpenAI', 'Groq', 'Other']) {
      expect(within(last24Providers).getByText(name)).toBeTruthy();
    }
    expect(within(last24Providers).queryByText('Kimi')).toBeNull();

    for (const warning of [
      '3 retained events used an unclassified vendor label and are grouped as Other.',
      '1 successful transcription event has no recorded input duration; transcription seconds are incomplete.',
      '1 retained event used an unclassified vendor label and is grouped as Other.',
    ]) {
      expect(within(section).getByText(warning)).toBeTruthy();
    }

    expect(within(section).getAllByText('Remaining provider credit: Unknown')).toHaveLength(3);
    for (const [name, href] of [
      ['Open OpenAI dashboard ↗', 'https://platform.openai.com/usage'],
      ['Open Groq dashboard ↗', 'https://console.groq.com/keys'],
      ['Open Kimi dashboard ↗', 'https://platform.kimi.ai/console'],
    ] as const) {
      expect(within(section).getByRole('link', { name })).toHaveProperty('href', href);
    }
    expect(within(section).queryByText(/remaining quota/i)).toBeNull();
    expect(within(section).queryByText(/credit remaining/i)).toBeNull();

    const [request] = aiUsageRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
  });

  it('renders both empty ledger windows as available without inventing provider usage', async () => {
    mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      availableSentryObservation,
      emptyAiUsage,
    );

    render(<AdminOperations />);

    const section = await getAiUsageSection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(within(section).getAllByText('No AI usage recorded in this window.')).toHaveLength(2);
    expect(within(section).getAllByText('0 recorded events')).toHaveLength(2);
    expect(within(section).queryByText('No AI providers are configured.')).toBeNull();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
    expect(within(section).getAllByText('Remaining provider credit: Unknown')).toHaveLength(3);
  });

  it('returns the whole page to sign-in when the AI usage observer finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/ai-usage') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-ai-ledger-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(unknownR2Capacity);
      }
      if (url === 'https://api.example.test/admin/operations/fly-inventory') {
        return jsonResponse(unknownFlyInventory);
      }
      const response = defaultDeploymentResponse(url);
      if (response) return response;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Harpa-recorded AI usage' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-ai-ledger-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts AI credentials, identities, content, raw vendors, and inconsistent aggregates', async () => {
    const forbiddenValues = [
      'openai-admin-key-must-never-render',
      'groq-provider-token-must-never-render',
      'usr_private_customer',
      'customer@example.test',
      'prj_private_customer',
      'rpt_private_customer',
      'raw prompt and transcript must never render',
      'shadow-provider-private-label',
      'raw provider error detail',
    ];
    const poisonedAiUsage = {
      ...availableAiUsage,
      openAiAdminKey: forbiddenValues[0],
      groqApiKey: forbiddenValues[1],
      userId: forbiddenValues[2],
      email: forbiddenValues[3],
      projectId: forbiddenValues[4],
      reportId: forbiddenValues[5],
      prompt: forbiddenValues[6],
      rawVendor: forbiddenValues[7],
      rawProviderError: forbiddenValues[8],
      monthToDate: {
        ...availableAiUsage.monthToDate,
        recordedEventCount: 20,
      },
    };
    const fetchMock = mockOperationsFetch(
      emptyInventory,
      unknownR2Capacity,
      availableNeonUsage,
      availableStorageLifecycle,
      unknownFlyInventory,
      availableSentryObservation,
      poisonedAiUsage,
    );

    render(<AdminOperations />);

    const section = await getAiUsageSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(
      within(section).getByText('The AI usage ledger returned an invalid response.'),
    ).toBeTruthy();
    expect(within(section).queryByText('19 recorded events')).toBeNull();
    const renderedText = document.body.textContent ?? '';
    for (const value of forbiddenValues) expect(renderedText).not.toContain(value);

    const [request] = aiUsageRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('renames the cost-bearing control and clearly states its live quota impact', async () => {
    const fetchMock = mockOperationsFetch(emptyInventory);

    render(<AdminOperations />);

    const section = await getCanarySection();
    expect(
      within(section).getByRole('heading', { level: 2, name: 'Report generation live canary' }),
    ).toBeTruthy();
    const idleCopy = within(section).getByText('Not run yet in this browser session.');
    expect(idleCopy.closest('[aria-live="polite"]')).toBeTruthy();
    expect(within(section).getByText('Each click updates one synthetic report.')).toBeTruthy();
    expect(
      within(section).getByText('Each click spends a small amount of real AI quota.'),
    ).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Run live canary' })).toHaveProperty(
      'disabled',
      false,
    );

    expect(await screen.findByText(apiGitCommit)).toBeTruthy();
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('posts only after an explicit click with the current CSRF token and prevents double-submit', async () => {
    let resolveCanary!: (response: Response) => void;
    const canaryResponse = new Promise<Response>((resolve) => {
      resolveCanary = resolve;
    });
    const fetchMock = mockDiagnosticFetch(() => canaryResponse);

    render(<AdminOperations />);

    const section = await getCanarySection();
    const runButton = getRunCanaryButton(section);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    expect(sentryRequests(fetchMock)).toHaveLength(1);
    act(() => {
      runButton.click();
      runButton.click();
    });
    await waitFor(() => expect(diagnosticRequests(fetchMock)).toHaveLength(1));
    expect(runButton).toHaveProperty('disabled', true);
    const progress = within(section).getByText('Running live canary…');
    expect(progress.closest('[aria-live="polite"]')).toBeTruthy();

    const [, requestInit] = diagnosticRequests(fetchMock)[0]!;
    expect(requestInit).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    const requestHeaders = new Headers(requestInit?.headers);
    expect(requestHeaders.get('x-admin-csrf')).toBe(adminSession.csrfToken);
    expect(requestHeaders.has('authorization')).toBe(false);

    await act(async () => {
      resolveCanary(jsonResponse(passCanary));
      await canaryResponse;
    });

    expect(await within(section).findByText('Pass')).toBeTruthy();
    await waitFor(() => expect(runButton).toHaveProperty('disabled', false));
    expect(sentryRequests(fetchMock)).toHaveLength(1);
  });

  it('renders live generation and usage proof plus only the bounded escaped synthetic preview', async () => {
    const { section } = await renderAndRunCanary(passCanary);

    expect(await within(section).findByText('Pass')).toBeTruthy();
    for (const value of [
      'report-canary@e2e.harpapro.com',
      'prj_01234567',
      'rpt_01234567',
      'openai',
      'gpt-5.1',
      'req-report-canary-1',
    ]) {
      expect(within(section).getByText(value)).toBeTruthy();
    }
    expect(within(section).getByText('Report 42')).toBeTruthy();
    expect(within(section).getByText('Live')).toBeTruthy();
    expect(within(section).getByText('Sign-out confirmed.')).toBeTruthy();
    expectSuccessfulCanaryProof(section);

    expect(within(section).getByText('Free plan')).toBeTruthy();
    expect(within(section).getByText('Report generations')).toBeTruthy();
    expect(within(section).getByText('AI input tokens')).toBeTruthy();
    expect(within(section).getByText('AI output tokens')).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('renders the 80-second cleanup-grace duration while keeping functional latencies bounded', async () => {
    const { section } = await renderAndRunCanary({
      ...passCanary,
      durationMs: 80_000,
    });

    expect(await within(section).findByText('Pass')).toBeTruthy();
    expect(within(section).getByText('Completed in 80,000 ms.')).toBeTruthy();

    const httpTerm = within(section).getByText(/^HTTP(?: status)?$/i, { selector: 'dt' });
    const generationDetails = httpTerm.closest('dl');
    expect(generationDetails).toBeTruthy();
    expectDefinitionValue(
      generationDetails!,
      /^(?:Generation )?(?:duration|latency)$/i,
      '1,300 ms',
    );

    const inputTokensTerm = within(section).getByText('Input tokens', { selector: 'dt' });
    const usageDetails = inputTokensTerm.closest('dl');
    expect(usageDetails).toBeTruthy();
    expectDefinitionValue(usageDetails!, /^(?:Usage )?(?:duration|latency)$/i, '876 ms');
  });

  it('renders a valid nullable all-empty preview without inventing sample text', async () => {
    const emptyPreviewHash = 'b'.repeat(64);
    const { section } = await renderAndRunCanary({
      ...passCanary,
      preview: {
        schemaValid: true,
        sample: {
          title: null,
          summary: null,
          weather: null,
          workers: [],
          materials: [],
          issues: [],
          nextSteps: [],
          summarySections: [],
        },
        counts: {
          workers: 0,
          materials: 0,
          issues: 0,
          nextSteps: 0,
          summarySections: 0,
          imageAttachments: 0,
          documentAttachments: 0,
        },
        truncated: false,
        bodySha256: emptyPreviewHash,
      },
    });

    expect(await within(section).findByText('Pass')).toBeTruthy();
    const previewRegion = within(section).getByRole('region', {
      name: 'Synthetic report response preview',
    });
    for (const label of [
      'Workers',
      'Materials',
      'Issues',
      'Next steps',
      'Summary sections',
      'Image attachments',
      'Document attachments',
    ]) {
      expectDefinitionValue(previewRegion, label, '0');
    }
    expectDefinitionValue(previewRegion, /^(?:Report (?:body )?)?SHA-256$/i, emptyPreviewHash);
    expect(previewRegion.textContent).not.toMatch(/undefined|\bnull\b/i);
    expect(previewRegion.textContent).not.toContain(escapedPreviewTitle);
    expect(previewRegion.textContent).not.toContain(escapedPreviewSummary);
    expect(within(previewRegion).queryByText('Preview truncated')).toBeNull();
    expect(previewRegion.querySelector('script')).toBeNull();
    expect(previewRegion.querySelector('img')).toBeNull();
  });

  it('keeps a completed canary result across shared Refresh without repeating its POST', async () => {
    const { fetchMock, section } = await renderAndRunCanary(passCanary);
    const user = userEvent.setup();
    expect(await within(section).findByText('Pass')).toBeTruthy();
    expect(diagnosticRequests(fetchMock)).toHaveLength(1);
    await waitFor(() =>
      expect(deploymentRequests(fetchMock, 'https://api.example.test/healthz')).toHaveLength(1),
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(deploymentRequests(fetchMock, 'https://api.example.test/healthz')).toHaveLength(2),
    );
    expect(diagnosticRequests(fetchMock)).toHaveLength(1);
    const refreshedSection = await getCanarySection();
    expect(refreshedSection.isConnected).toBe(true);
    expect(within(refreshedSection).getByText('Pass')).toBeTruthy();
  });

  it('keeps proven live output while showing only the two reviewed warning reasons', async () => {
    const warningCanary = {
      ...passCanary,
      status: 'warning' as const,
      limits: null,
      cleanup: 'failed' as const,
      warnings: ['sign_out_failed', 'limits_unavailable'] as const,
    };
    const { section } = await renderAndRunCanary(warningCanary);

    expect(await within(section).findByText('Warning')).toBeTruthy();
    expect(within(section).getByText('Live')).toBeTruthy();
    expectSuccessfulCanaryProof(section);
    expect(within(section).getByText('Effective usage limits were unavailable.')).toBeTruthy();
    expect(within(section).getByText('Application sign-out could not be confirmed.')).toBeTruthy();
    expect(section.textContent).not.toMatch(/replay only|fresh live call was not confirmed/i);
    expect(within(section).queryByText('Sign-out confirmed.')).toBeNull();
  });

  it.each([
    [
      'mode_gate',
      'live_mode_required',
      'Mode gate',
      'Live provider mode was required but not proven.',
    ],
    [
      'usage_proof',
      'live_proof_failed',
      'Usage proof',
      'The generation and usage evidence did not prove one fresh live provider call.',
    ],
    [
      'usage_proof',
      'usage_proof_missing',
      'Usage proof',
      'No matching live usage row was recorded.',
    ],
    [
      'usage_proof',
      'usage_proof_ambiguous',
      'Usage proof',
      'More than one matching live usage row was recorded.',
    ],
    [
      'preview',
      'preview_invalid',
      'Preview',
      'The live report response could not be safely previewed.',
    ],
    ['usage_window', 'timeout', 'Usage window', 'The live canary timed out.'],
    ['generate', 'rate_limited', 'Generate', 'Rate limiting prevented report generation.'],
  ] as const)(
    'renders reviewed live-canary failure %s/%s',
    async (phase, reason, phaseLabel, message) => {
      const failed = {
        observedAt,
        status: 'fail' as const,
        durationMs: 900,
        phase,
        reason,
        cleanup: 'succeeded' as const,
      };
      const { section } = await renderAndRunCanary(failed);

      expect(await within(section).findByText('Failed')).toBeTruthy();
      expect(within(section).getByText(phaseLabel)).toBeTruthy();
      expect(within(section).getByText(message)).toBeTruthy();
      expect(within(section).getByText('Sign-out confirmed.')).toBeTruthy();
      expect(within(section).queryByText(/healthy/i)).toBeNull();
    },
  );

  it.each([
    [
      'not_configured',
      'Report-generation live canary is not configured. No provider call occurred.',
    ],
    ['not_enabled', 'Report-generation live canary is disabled. No provider call occurred.'],
  ] as const)('renders unknown/%s without implying a provider call', async (reason, message) => {
    const { section } = await renderAndRunCanary({
      ...unknownCanary,
      reason,
    });

    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText(message)).toBeTruthy();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
  });

  it('distinguishes CSRF rejection and route rate limiting without rendering raw detail', async () => {
    const forbiddenBody = {
      error: {
        code: 'FORBIDDEN',
        message: 'csrf-origin-detail-must-never-render',
      },
    };
    let result = await renderAndRunCanary(forbiddenBody, 403);

    expect(await within(result.section).findByText('Request rejected')).toBeTruthy();
    expect(
      within(result.section).getByText(
        'The admin origin or CSRF check rejected this live canary request.',
      ),
    ).toBeTruthy();
    expect(result.section.textContent).not.toContain('csrf-origin-detail-must-never-render');
    expect(document.documentElement.outerHTML).not.toContain(
      'csrf-origin-detail-must-never-render',
    );
    expect(within(result.section).queryByText(/provider failed/i)).toBeNull();

    cleanup();
    result = await renderAndRunCanary(
      { error: { code: 'RATE_LIMITED', message: 'raw limiter detail' } },
      429,
    );
    expect(await within(result.section).findByText('Rate limited')).toBeTruthy();
    expect(
      within(result.section).getByText('Live canary run limit reached. Try again later.'),
    ).toBeTruthy();
    expect(result.section.textContent).not.toContain('raw limiter detail');
    expect(document.documentElement.outerHTML).not.toContain('raw limiter detail');
  });

  it('returns the whole page to sign-in when a live canary request finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    mockDiagnosticFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'expired-cookie-detail' } }, 401),
    );
    const user = userEvent.setup();

    render(<AdminOperations />);

    const section = await getCanarySection();
    await user.click(getRunCanaryButton(section));

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Report generation live canary' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-cookie-detail');
    expect(document.documentElement.outerHTML).not.toContain('expired-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an overlong preview string',
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          sample: { ...passCanary.preview.sample, title: 'x'.repeat(401) },
        },
      },
    ],
    [
      'a sixth preview item',
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          sample: {
            ...passCanary.preview.sample,
            nextSteps: Array.from({ length: 6 }, (_, index) => `Step ${index + 1}`),
          },
        },
      },
    ],
    [
      'an underfilled sample for its structural count',
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          sample: {
            ...passCanary.preview.sample,
            workers: passCanary.preview.sample.workers.slice(0, 4),
          },
        },
      },
    ],
    [
      'a structural count below its sample length',
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          counts: {
            ...passCanary.preview.counts,
            workers: 4,
          },
        },
      },
    ],
    [
      'a malformed report hash',
      {
        ...passCanary,
        preview: { ...passCanary.preview, bodySha256: 'not-a-sha256' },
      },
    ],
    [
      'a replay-only success warning',
      {
        ...passCanary,
        status: 'warning',
        generation: { ...passCanary.generation, fixtureMode: 'replay' },
        warnings: ['replay_only'],
      },
    ],
  ])('strictly rejects %s', async (_description, poisonedResponse) => {
    const { section } = await renderAndRunCanary(poisonedResponse);

    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('The live canary returned an invalid response.')).toBeTruthy();
  });

  const leakSentinels = {
    password: 'test-password-must-never-render',
    bearerToken: 'bearer-token-must-never-render',
    cookie: 'application-cookie-must-never-render',
    authToken: 'application-auth-token-must-never-render',
    prompt: 'source-prompt-must-never-render',
    notes: 'synthetic-note-content-must-never-render',
    transcript: 'source-transcript-must-never-render',
    rawResponse: 'raw-model-response-must-never-render',
    providerMessage: 'raw-provider-error-must-never-render',
    databaseError: 'raw-database-error-must-never-render',
    upstreamException: 'raw-upstream-exception-must-never-render',
    canonicalJson: 'canonical-report-json-must-never-render',
    rawBody: 'raw-report-body-must-never-render',
    usageId: 'lue_private_usage_row',
    userId: 'usr_private_synthetic_user',
    issueAttachmentId: 'fil_private_issue_attachment',
    summaryAttachmentId: 'fil_private_summary_attachment',
  } as const;

  it.each([
    [
      'a test password',
      leakSentinels.password,
      { ...passCanary, password: leakSentinels.password },
    ],
    [
      'a Bearer token',
      leakSentinels.bearerToken,
      {
        ...passCanary,
        target: { ...passCanary.target, bearerToken: leakSentinels.bearerToken },
      },
    ],
    [
      'an application cookie',
      leakSentinels.cookie,
      { ...passCanary, cookie: leakSentinels.cookie },
    ],
    [
      'an application auth token',
      leakSentinels.authToken,
      { ...passCanary, authToken: leakSentinels.authToken },
    ],
    [
      'a generation prompt',
      leakSentinels.prompt,
      {
        ...passCanary,
        generation: { ...passCanary.generation, prompt: leakSentinels.prompt },
      },
    ],
    [
      'source notes',
      leakSentinels.notes,
      {
        ...passCanary,
        generation: { ...passCanary.generation, notes: leakSentinels.notes },
      },
    ],
    [
      'a source transcript',
      leakSentinels.transcript,
      {
        ...passCanary,
        generation: { ...passCanary.generation, transcript: leakSentinels.transcript },
      },
    ],
    [
      'a raw provider response',
      leakSentinels.rawResponse,
      {
        ...passCanary,
        generation: {
          ...passCanary.generation,
          response: { body: leakSentinels.rawResponse },
        },
      },
    ],
    [
      'a provider message',
      leakSentinels.providerMessage,
      {
        ...passCanary,
        generation: {
          ...passCanary.generation,
          providerMessage: leakSentinels.providerMessage,
        },
      },
    ],
    [
      'a database error',
      leakSentinels.databaseError,
      {
        ...passCanary,
        generation: {
          ...passCanary.generation,
          databaseError: leakSentinels.databaseError,
        },
      },
    ],
    [
      'an upstream exception',
      leakSentinels.upstreamException,
      {
        ...passCanary,
        generation: {
          ...passCanary.generation,
          upstreamException: leakSentinels.upstreamException,
        },
      },
    ],
    [
      'canonical report JSON',
      leakSentinels.canonicalJson,
      {
        ...passCanary,
        preview: { ...passCanary.preview, canonicalJson: leakSentinels.canonicalJson },
      },
    ],
    [
      'a raw report body',
      leakSentinels.rawBody,
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          rawBody: { title: leakSentinels.rawBody },
        },
      },
    ],
    [
      'a usage-row ID',
      leakSentinels.usageId,
      {
        ...passCanary,
        usage: { ...passCanary.usage, id: leakSentinels.usageId },
      },
    ],
    [
      'a usage user ID',
      leakSentinels.userId,
      {
        ...passCanary,
        usage: { ...passCanary.usage, userId: leakSentinels.userId },
      },
    ],
    [
      'an issue attachment ID',
      leakSentinels.issueAttachmentId,
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          sample: {
            ...passCanary.preview.sample,
            issues: passCanary.preview.sample.issues.map((issue, index) =>
              index === 0
                ? {
                    ...issue,
                    attachments: { images: [leakSentinels.issueAttachmentId] },
                  }
                : issue,
            ),
          },
        },
      },
    ],
    [
      'a summary-section attachment ID',
      leakSentinels.summaryAttachmentId,
      {
        ...passCanary,
        preview: {
          ...passCanary.preview,
          sample: {
            ...passCanary.preview.sample,
            summarySections: passCanary.preview.sample.summarySections.map(
              (summarySection, index) =>
                index === 0
                  ? {
                      ...summarySection,
                      attachments: { documents: [leakSentinels.summaryAttachmentId] },
                    }
                  : summarySection,
            ),
          },
        },
      },
    ],
  ] as const)(
    'strictly rejects and redacts %s',
    async (_description, sentinel, poisonedResponse) => {
      const { section } = await renderAndRunCanary(poisonedResponse);

      expect(await within(section).findByText('Unknown')).toBeTruthy();
      expect(
        within(section).getByText('The live canary returned an invalid response.'),
      ).toBeTruthy();
      const renderedText = document.body.textContent ?? '';
      const renderedHtml = document.documentElement.outerHTML;
      for (const value of [sentinel, adminSession.csrfToken]) {
        expect(renderedText).not.toContain(value);
        expect(renderedHtml).not.toContain(value);
      }
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
    },
  );
});
