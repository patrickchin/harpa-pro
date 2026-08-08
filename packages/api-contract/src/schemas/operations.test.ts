import { describe, expect, it } from 'vitest';
import { operations } from './index.js';

const observedAt = '2026-08-08T08:00:00.000Z';

const branch = {
  id: 'br-main-01234567',
  name: 'main',
  parentId: null,
  currentState: 'ready',
  default: true,
  protected: true,
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-08-08T07:59:00.000Z',
};

const availableProject = {
  id: 'tiny-tree-06262558',
  name: 'harpa-pro',
  regionId: 'aws-eu-central-1',
  pgVersion: 17,
  createdAt: '2026-06-01T08:00:00.000Z',
  updatedAt: '2026-08-08T07:58:00.000Z',
  effectivePermission: 'VIEWER',
  branchCount: {
    status: 'available',
    count: 1,
  },
  branchDetails: {
    status: 'available',
    truncated: false,
    branches: [branch],
  },
};

const availableObservation = {
  observedAt,
  status: 'available',
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [availableProject],
};

const partialObservation = {
  observedAt,
  status: 'partial',
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [
    {
      ...availableProject,
      branchDetails: {
        status: 'unknown',
        reason: 'timeout',
      },
    },
  ],
};

const unknownObservation = {
  observedAt,
  status: 'unknown',
  reason: 'not_configured',
};

describe('admin operations Neon inventory schema', () => {
  it.each([
    ['available', availableObservation],
    ['partial', partialObservation],
    ['unknown', unknownObservation],
  ] as const)('accepts an exact %s observation', (_status, observation) => {
    const parsed = operations.neonInventoryObservation.parse(observation);

    expect(parsed).toStrictEqual(observation);
  });

  it('accepts a complete observation with no visible projects', () => {
    expect(() =>
      operations.neonInventoryObservation.parse({
        ...availableObservation,
        projects: [],
      }),
    ).not.toThrow();
  });

  it.each([
    'not_configured',
    'unsafe_permissions',
    'timeout',
    'rate_limited',
    'forbidden',
    'not_found',
    'invalid_response',
    'provider_unavailable',
  ] as const)('accepts the redacted %s reason', (reason) => {
    expect(() =>
      operations.neonInventoryObservation.parse({
        ...unknownObservation,
        reason,
      }),
    ).not.toThrow();
  });

  it('rejects a reason outside the redacted enum', () => {
    expect(
      operations.neonInventoryObservation.safeParse({
        ...unknownObservation,
        reason: 'Neon returned a secret-bearing raw error',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['a truncated project list', { ...availableObservation, projectsTruncated: true }],
    ['an unavailable project', { ...availableObservation, unavailableProjectCount: 1 }],
    [
      'an unknown branch count',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchCount: { status: 'unknown', reason: 'timeout' },
          },
        ],
      },
    ],
    [
      'unknown branch details',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchDetails: { status: 'unknown', reason: 'timeout' },
          },
        ],
      },
    ],
    [
      'a truncated branch detail list',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchDetails: { ...availableProject.branchDetails, truncated: true },
          },
        ],
      },
    ],
  ] as const)('rejects available status with %s', (_description, observation) => {
    expect(operations.neonInventoryObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects partial status without any partial signal', () => {
    expect(
      operations.neonInventoryObservation.safeParse({
        ...availableObservation,
        status: 'partial',
      }).success,
    ).toBe(false);
  });

  it.each([
    { projectsTruncated: true },
    { unavailableProjectCount: 1 },
    {
      projects: [
        {
          ...availableProject,
          branchCount: { status: 'unknown', reason: 'rate_limited' },
        },
      ],
    },
    {
      projects: [
        {
          ...availableProject,
          branchDetails: { ...availableProject.branchDetails, truncated: true },
        },
      ],
    },
  ])('accepts partial status with a bounded incompleteness signal', (override) => {
    expect(() =>
      operations.neonInventoryObservation.parse({
        ...availableObservation,
        status: 'partial',
        ...override,
      }),
    ).not.toThrow();
  });

  it.each(['EDITOR', 'ADMIN', 'viewer', null] as const)(
    'rejects effective project permission %s',
    (effectivePermission) => {
      const candidate = {
        ...availableObservation,
        projects: [{ ...availableProject, effectivePermission }],
      };

      expect(operations.neonInventoryObservation.safeParse(candidate).success).toBe(false);
    },
  );

  it('rejects a project when effective permission evidence is omitted', () => {
    const { effectivePermission, ...projectWithoutPermission } = availableProject;
    expect(effectivePermission).toBe('VIEWER');

    expect(
      operations.neonInventoryObservation.safeParse({
        ...availableObservation,
        projects: [projectWithoutPermission],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['top-level provider response', { ...availableObservation, rawProviderResponse: {} }],
    ['top-level credential', { ...availableObservation, apiKey: 'neon-secret' }],
    ['unknown provider text', { ...unknownObservation, providerMessage: 'upstream detail' }],
    [
      'project owner ID',
      {
        ...availableObservation,
        projects: [{ ...availableProject, ownerId: 'owner-secret' }],
      },
    ],
    [
      'project organization ID',
      {
        ...availableObservation,
        projects: [{ ...availableProject, orgId: 'org-secret' }],
      },
    ],
    [
      'project connection URI',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            connectionUri: 'postgres://user:password@example.neon.tech/db',
          },
        ],
      },
    ],
    [
      'branch endpoint host',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchDetails: {
              ...availableProject.branchDetails,
              branches: [{ ...branch, host: 'ep-secret.neon.tech' }],
            },
          },
        ],
      },
    ],
    [
      'branch annotations',
      {
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchDetails: {
              ...availableProject.branchDetails,
              branches: [{ ...branch, annotations: { protected: 'internal' } }],
            },
          },
        ],
      },
    ],
    [
      'nested provider error text',
      {
        ...partialObservation,
        projects: [
          {
            ...availableProject,
            branchDetails: {
              status: 'unknown',
              reason: 'provider_unavailable',
              providerMessage: 'connection URI was rejected',
            },
          },
        ],
      },
    ],
  ] as const)('rejects leaked %s', (_description, observation) => {
    expect(operations.neonInventoryObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects unknown observations that retain discovered project data', () => {
    expect(
      operations.neonInventoryObservation.safeParse({
        ...unknownObservation,
        projects: [availableProject],
      }).success,
    ).toBe(false);
  });

  it('enforces the bounded project and branch detail lists', () => {
    const projectsAtLimit = Array.from({ length: 20 }, (_, index) => ({
      ...availableProject,
      id: `project-${index}`,
    }));
    const branchesAtLimit = Array.from({ length: 100 }, (_, index) => ({
      ...branch,
      id: `branch-${index}`,
      name: `branch-${index}`,
    }));

    expect(() =>
      operations.neonInventoryObservation.parse({
        ...availableObservation,
        projects: projectsAtLimit,
      }),
    ).not.toThrow();

    expect(() =>
      operations.neonInventoryObservation.parse({
        ...availableObservation,
        status: 'partial',
        projects: [
          {
            ...availableProject,
            branchCount: { status: 'available', count: 101 },
            branchDetails: {
              status: 'available',
              truncated: true,
              branches: branchesAtLimit,
            },
          },
        ],
      }),
    ).not.toThrow();
    expect(
      operations.neonInventoryObservation.safeParse({
        ...availableObservation,
        projects: [...projectsAtLimit, availableProject],
      }).success,
    ).toBe(false);

    expect(() =>
      operations.neonInventoryObservation.parse({
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchCount: { status: 'available', count: 100 },
            branchDetails: {
              status: 'available',
              truncated: false,
              branches: branchesAtLimit,
            },
          },
        ],
      }),
    ).not.toThrow();
    expect(
      operations.neonInventoryObservation.safeParse({
        ...availableObservation,
        projects: [
          {
            ...availableProject,
            branchCount: { status: 'available', count: 101 },
            branchDetails: {
              status: 'available',
              truncated: false,
              branches: [...branchesAtLimit, branch],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

const reportDiagnosticTarget = {
  accountEmail: 'report-canary@e2e.harpapro.com',
  projectId: 'prj_01234567',
  reportId: 'rpt_89abcdef',
  reportNumber: 7,
};

const reportDiagnosticGeneration = {
  httpStatus: 200,
  requestId: 'req-report-diagnostic-1',
  durationMs: 1_250,
  requestedAt: '2026-08-08T08:00:00.100Z',
  finishedAt: '2026-08-08T08:00:01.350Z',
  reportUpdatedAt: '2026-08-08T08:00:01.300Z',
  generatedAt: '2026-08-08T08:00:01.250Z',
  vendor: 'openai',
  model: 'gpt-5-mini',
  fixtureMode: 'live',
  idempotentReplay: false,
};

const reportDiagnosticBucket = {
  limit: 50,
  used: 3,
  remaining: 47,
  resetAt: '2026-09-01T00:00:00.000Z',
  overridden: false,
};

const reportDiagnosticLimits = {
  plan: 'free',
  reportGenerate: reportDiagnosticBucket,
  aiInputTokens: {
    ...reportDiagnosticBucket,
    limit: 100_000,
    used: 8_000,
    remaining: 92_000,
  },
  aiOutputTokens: {
    ...reportDiagnosticBucket,
    limit: null,
    used: 2_000,
    remaining: null,
    overridden: true,
  },
};

const reportDiagnosticPass = {
  observedAt,
  status: 'pass',
  durationMs: 1_500,
  target: reportDiagnosticTarget,
  generation: reportDiagnosticGeneration,
  limits: reportDiagnosticLimits,
  cleanup: 'succeeded',
};

const reportDiagnosticFail = {
  observedAt,
  status: 'fail',
  durationMs: 1_500,
  phase: 'generate',
  reason: 'provider_error',
  cleanup: 'succeeded',
};

describe('admin report-generation diagnostic observation schema', () => {
  it('accepts the exact unknown/not-configured observation', () => {
    const observation = {
      observedAt,
      status: 'unknown',
      reason: 'not_configured',
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it('accepts an exact live pass with bounded quota summaries', () => {
    expect(
      operations.reportGenerateDiagnosticObservation.parse(reportDiagnosticPass),
    ).toStrictEqual(reportDiagnosticPass);
  });

  it('accepts a missing upstream request ID without adding a leak-prone placeholder', () => {
    const observation = {
      ...reportDiagnosticPass,
      generation: { ...reportDiagnosticGeneration, requestId: null },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it.each([
    [
      'replay-only generation',
      {
        warnings: ['replay_only'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
    [
      'idempotency replay of a persisted live generation',
      {
        warnings: ['replay_only'],
        generation: { ...reportDiagnosticGeneration, idempotentReplay: true },
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
    [
      'fixture and idempotency replay with one unique warning',
      {
        warnings: ['replay_only'],
        generation: {
          ...reportDiagnosticGeneration,
          fixtureMode: 'replay',
          idempotentReplay: true,
        },
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
    [
      'unavailable limits',
      {
        warnings: ['limits_unavailable'],
        generation: reportDiagnosticGeneration,
        limits: null,
        cleanup: 'succeeded',
      },
    ],
    [
      'failed sign-out',
      {
        warnings: ['sign_out_failed'],
        generation: reportDiagnosticGeneration,
        limits: reportDiagnosticLimits,
        cleanup: 'failed',
      },
    ],
    [
      'replay-only generation with unavailable limits',
      {
        warnings: ['limits_unavailable', 'replay_only'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: null,
        cleanup: 'succeeded',
      },
    ],
    [
      'replay-only generation with failed sign-out',
      {
        warnings: ['sign_out_failed', 'replay_only'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: reportDiagnosticLimits,
        cleanup: 'failed',
      },
    ],
    [
      'unavailable limits with failed sign-out',
      {
        warnings: ['sign_out_failed', 'limits_unavailable'],
        generation: reportDiagnosticGeneration,
        limits: null,
        cleanup: 'failed',
      },
    ],
    [
      'all reviewed warning signals in any unique order',
      {
        warnings: ['sign_out_failed', 'replay_only', 'limits_unavailable'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: null,
        cleanup: 'failed',
      },
    ],
  ] as const)('accepts a warning for %s', (_description, warningFields) => {
    const observation = {
      ...reportDiagnosticPass,
      status: 'warning',
      ...warningFields,
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it.each(['sign_in', 'target_read', 'generate', 'proof_read', 'limits', 'sign_out'] as const)(
    'accepts the redacted %s failure phase',
    (phase) => {
      expect(() =>
        operations.reportGenerateDiagnosticObservation.parse({
          ...reportDiagnosticFail,
          phase,
        }),
      ).not.toThrow();
    },
  );

  it.each([
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
  ] as const)('accepts the redacted %s failure reason', (reason) => {
    expect(() =>
      operations.reportGenerateDiagnosticObservation.parse({
        ...reportDiagnosticFail,
        reason,
      }),
    ).not.toThrow();
  });

  it.each(['not_started', 'succeeded', 'failed'] as const)(
    'accepts %s cleanup evidence on a failure',
    (cleanup) => {
      expect(() =>
        operations.reportGenerateDiagnosticObservation.parse({
          ...reportDiagnosticFail,
          cleanup,
        }),
      ).not.toThrow();
    },
  );

  it.each([
    [
      'replay without replay_only',
      {
        warnings: ['sign_out_failed'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: reportDiagnosticLimits,
        cleanup: 'failed',
      },
    ],
    [
      'idempotency replay without replay_only',
      {
        warnings: ['sign_out_failed'],
        generation: { ...reportDiagnosticGeneration, idempotentReplay: true },
        limits: reportDiagnosticLimits,
        cleanup: 'failed',
      },
    ],
    [
      'replay_only on a live generation',
      {
        warnings: ['replay_only'],
        generation: reportDiagnosticGeneration,
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
    [
      'null limits without limits_unavailable',
      {
        warnings: ['sign_out_failed'],
        generation: reportDiagnosticGeneration,
        limits: null,
        cleanup: 'failed',
      },
    ],
    [
      'limits_unavailable with available limits',
      {
        warnings: ['limits_unavailable'],
        generation: reportDiagnosticGeneration,
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
    [
      'failed cleanup without sign_out_failed',
      {
        warnings: ['replay_only'],
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' },
        limits: reportDiagnosticLimits,
        cleanup: 'failed',
      },
    ],
    [
      'sign_out_failed after successful cleanup',
      {
        warnings: ['sign_out_failed'],
        generation: reportDiagnosticGeneration,
        limits: reportDiagnosticLimits,
        cleanup: 'succeeded',
      },
    ],
  ] as const)('rejects warning evidence with %s', (_description, warningFields) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        status: 'warning',
        ...warningFields,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['no warnings', []],
    ['duplicate warnings', ['replay_only', 'replay_only']],
    ['an unreviewed warning', ['provider_said_try_again']],
  ] as const)('rejects %s', (_description, warnings) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        status: 'warning',
        warnings,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['replay mode', { generation: { ...reportDiagnosticGeneration, fixtureMode: 'replay' } }],
    [
      'an idempotency replay',
      { generation: { ...reportDiagnosticGeneration, idempotentReplay: true } },
    ],
    ['missing limits', { limits: null }],
    ['failed cleanup', { cleanup: 'failed' }],
  ] as const)('rejects a pass with %s', (_description, override) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'an extra unknown field',
      { observedAt, status: 'unknown', reason: 'not_configured', durationMs: 0 },
    ],
    [
      'an unknown raw reason',
      { observedAt, status: 'unknown', reason: 'disabled by operator message' },
    ],
    ['an unsupported status', { ...reportDiagnosticPass, status: 'available' }],
    ['a string duration', { ...reportDiagnosticPass, durationMs: '1500' }],
    ['a duration beyond the overall deadline', { ...reportDiagnosticPass, durationMs: 75_001 }],
    [
      'a malformed target email',
      {
        ...reportDiagnosticPass,
        target: { ...reportDiagnosticTarget, accountEmail: 'not-an-email' },
      },
    ],
    [
      'a malformed project ID',
      {
        ...reportDiagnosticPass,
        target: { ...reportDiagnosticTarget, projectId: 'tiny-tree-06262558' },
      },
    ],
    [
      'a malformed report ID',
      { ...reportDiagnosticPass, target: { ...reportDiagnosticTarget, reportId: 'report-7' } },
    ],
    [
      'a non-positive report number',
      { ...reportDiagnosticPass, target: { ...reportDiagnosticTarget, reportNumber: 0 } },
    ],
    [
      'a non-200 generation response',
      { ...reportDiagnosticPass, generation: { ...reportDiagnosticGeneration, httpStatus: 201 } },
    ],
    [
      'an unsupported fixture mode',
      {
        ...reportDiagnosticPass,
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'record' },
      },
    ],
    [
      'a malformed generation timestamp',
      {
        ...reportDiagnosticPass,
        generation: { ...reportDiagnosticGeneration, generatedAt: 'today' },
      },
    ],
    [
      'a negative generation duration',
      { ...reportDiagnosticPass, generation: { ...reportDiagnosticGeneration, durationMs: -1 } },
    ],
    [
      'an unsupported plan',
      { ...reportDiagnosticPass, limits: { ...reportDiagnosticLimits, plan: 'trial' } },
    ],
    [
      'negative usage',
      {
        ...reportDiagnosticPass,
        limits: {
          ...reportDiagnosticLimits,
          reportGenerate: { ...reportDiagnosticBucket, used: -1 },
        },
      },
    ],
    ['an unknown failure phase', { ...reportDiagnosticFail, phase: 'request' }],
    ['an arbitrary failure reason', { ...reportDiagnosticFail, reason: 'raw upstream body' }],
  ] as const)('rejects %s', (_description, observation) => {
    expect(operations.reportGenerateDiagnosticObservation.safeParse(observation).success).toBe(
      false,
    );
  });

  it.each([
    ['a password', { ...reportDiagnosticPass, password: 'test-password-secret' }],
    [
      'a Bearer token',
      {
        ...reportDiagnosticPass,
        target: { ...reportDiagnosticTarget, bearerToken: 'secret-token' },
      },
    ],
    [
      'prompt content',
      {
        ...reportDiagnosticPass,
        generation: { ...reportDiagnosticGeneration, prompt: 'private notes' },
      },
    ],
    [
      'a raw model response',
      {
        ...reportDiagnosticPass,
        generation: { ...reportDiagnosticGeneration, response: { body: 'private report' } },
      },
    ],
    [
      'a nested provider message',
      {
        ...reportDiagnosticPass,
        generation: { ...reportDiagnosticGeneration, providerMessage: 'credential rejected' },
      },
    ],
    [
      'an extra limit bucket',
      {
        ...reportDiagnosticPass,
        limits: { ...reportDiagnosticLimits, voiceTranscribe: reportDiagnosticBucket },
      },
    ],
    [
      'limit-bucket metadata',
      {
        ...reportDiagnosticPass,
        limits: {
          ...reportDiagnosticLimits,
          reportGenerate: { ...reportDiagnosticBucket, rawLimitRow: { userId: 'usr_secret' } },
        },
      },
    ],
    ['a raw failure message', { ...reportDiagnosticFail, providerMessage: 'upstream secret' }],
  ] as const)('rejects leaked %s', (_description, observation) => {
    expect(operations.reportGenerateDiagnosticObservation.safeParse(observation).success).toBe(
      false,
    );
  });
});

const r2StorageSnapshot = {
  publishedPayloadBytes: 61_000_000,
  publishedMetadataBytes: 596_713,
  publishedObjects: 138,
  uploadingPayloadBytes: 0,
  uploadingMetadataBytes: 0,
  uploadingObjects: 0,
};

const r2EmptyStorageSnapshot = {
  publishedPayloadBytes: 0,
  publishedMetadataBytes: 0,
  publishedObjects: 0,
  uploadingPayloadBytes: 0,
  uploadingMetadataBytes: 0,
  uploadingObjects: 0,
};

const r2Bucket = {
  name: 'harpa-pro',
  jurisdiction: 'default',
  location: 'apac',
  defaultStorageClass: 'standard',
  createdAt: '2026-06-01T08:00:00.000Z',
};

const r2FreeTierReference = {
  storageGbMonth: 10,
  classAOperations: 1_000_000,
  classBOperations: 10_000_000,
  appliesTo: 'standard_only',
};

const r2Operations = {
  status: 'available',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: observedAt,
  classA: {
    estimatedUsed: 1_250,
    publishedAllowance: 1_000_000,
    estimatedRemaining: 998_750,
  },
  classB: {
    estimatedUsed: 5_000,
    publishedAllowance: 10_000_000,
    estimatedRemaining: 9_995_000,
  },
  freeRequests: 125,
  unclassifiedRequests: 0,
};

const r2RequiredCaveats = [
  'storage_snapshot_not_gb_month',
  'storage_metrics_may_lag',
  'operations_estimated_from_analytics',
];

const r2AvailableObservation = {
  observedAt,
  status: 'available',
  freeTierReference: r2FreeTierReference,
  buckets: {
    status: 'available',
    truncated: false,
    items: [r2Bucket],
  },
  storage: {
    status: 'available',
    standard: r2StorageSnapshot,
    infrequentAccess: r2EmptyStorageSnapshot,
  },
  operations: r2Operations,
  caveats: r2RequiredCaveats,
};

const r2UnknownObservation = {
  observedAt,
  status: 'unknown',
  reason: 'not_configured',
};

describe('admin operations R2 capacity schema', () => {
  it.each([
    'not_configured',
    'timeout',
    'rate_limited',
    'forbidden',
    'invalid_response',
    'provider_unavailable',
  ] as const)('accepts an exact redacted unknown/%s observation', (reason) => {
    const observation = { ...r2UnknownObservation, reason };

    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
  });

  it('accepts an exact complete observation', () => {
    expect(operations.r2CapacityObservation.parse(r2AvailableObservation)).toStrictEqual(
      r2AvailableObservation,
    );
  });

  it.each([
    [
      'bucket inventory failure',
      {
        ...r2AvailableObservation,
        status: 'partial',
        buckets: { status: 'unknown', reason: 'timeout' },
      },
    ],
    [
      'storage metrics failure',
      {
        ...r2AvailableObservation,
        status: 'partial',
        storage: { status: 'unknown', reason: 'forbidden' },
      },
    ],
    [
      'operations analytics failure',
      {
        ...r2AvailableObservation,
        status: 'partial',
        operations: { status: 'unknown', reason: 'invalid_response' },
      },
    ],
    [
      'truncated bucket inventory',
      {
        ...r2AvailableObservation,
        status: 'partial',
        buckets: { ...r2AvailableObservation.buckets, truncated: true },
        caveats: [...r2RequiredCaveats, 'bucket_inventory_truncated'],
      },
    ],
    [
      'unclassified successful operations',
      {
        ...r2AvailableObservation,
        status: 'partial',
        operations: { ...r2Operations, unclassifiedRequests: 7 },
        caveats: [...r2RequiredCaveats, 'unclassified_operations_excluded'],
      },
    ],
  ] as const)('accepts an exact partial observation with %s', (_description, observation) => {
    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['unknown buckets', { buckets: { status: 'unknown', reason: 'timeout' } }],
    ['unknown storage', { storage: { status: 'unknown', reason: 'timeout' } }],
    ['unknown operations', { operations: { status: 'unknown', reason: 'timeout' } }],
    [
      'truncated buckets',
      {
        buckets: { ...r2AvailableObservation.buckets, truncated: true },
        caveats: [...r2RequiredCaveats, 'bucket_inventory_truncated'],
      },
    ],
    [
      'unclassified operations',
      {
        operations: { ...r2Operations, unclassifiedRequests: 1 },
        caveats: [...r2RequiredCaveats, 'unclassified_operations_excluded'],
      },
    ],
  ] as const)('rejects available status with %s', (_description, overrides) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        ...overrides,
      }).success,
    ).toBe(false);
  });

  it('rejects partial status without an incompleteness signal', () => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        status: 'partial',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['jurisdiction', ['default', 'eu', 'fedramp', 'unknown']],
    ['location', ['apac', 'eeur', 'enam', 'weur', 'wnam', 'oc', null]],
    ['defaultStorageClass', ['standard', 'infrequent_access', 'unknown']],
  ] as const)('accepts every allowlisted bucket %s value', (field, values) => {
    for (const value of values) {
      const observation = {
        ...r2AvailableObservation,
        buckets: {
          ...r2AvailableObservation.buckets,
          items: [{ ...r2Bucket, [field]: value }],
        },
      };

      expect(operations.r2CapacityObservation.safeParse(observation).success).toBe(true);
    }
  });

  it('accepts nullable bucket timestamps and locations', () => {
    const observation = {
      ...r2AvailableObservation,
      buckets: {
        ...r2AvailableObservation.buckets,
        items: [{ ...r2Bucket, createdAt: null, location: null }],
      },
    };

    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
  });

  it('enforces the 100-bucket response bound', () => {
    const bucketsAtLimit = Array.from({ length: 100 }, (_, index) => ({
      ...r2Bucket,
      name: `bucket-${index}`,
    }));

    expect(() =>
      operations.r2CapacityObservation.parse({
        ...r2AvailableObservation,
        buckets: { ...r2AvailableObservation.buckets, items: bucketsAtLimit },
      }),
    ).not.toThrow();

    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        status: 'partial',
        buckets: {
          ...r2AvailableObservation.buckets,
          truncated: true,
          items: [...bucketsAtLimit, r2Bucket],
        },
        caveats: [...r2RequiredCaveats, 'bucket_inventory_truncated'],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['storage GB-month', { storageGbMonth: 11 }],
    ['Class A operations', { classAOperations: 999_999 }],
    ['Class B operations', { classBOperations: 9_999_999 }],
    ['storage applicability', { appliesTo: 'all_storage_classes' }],
  ] as const)('rejects a changed published free-tier reference for %s', (_description, change) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        freeTierReference: { ...r2FreeTierReference, ...change },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['Class A allowance', { classA: { ...r2Operations.classA, publishedAllowance: 1_000_001 } }],
    ['Class B allowance', { classB: { ...r2Operations.classB, publishedAllowance: 10_000_001 } }],
    [
      'Class A remaining estimate',
      { classA: { ...r2Operations.classA, estimatedRemaining: 998_751 } },
    ],
    [
      'Class B remaining estimate',
      { classB: { ...r2Operations.classB, estimatedRemaining: 9_995_001 } },
    ],
  ] as const)('rejects an inconsistent %s', (_description, operationChange) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        operations: { ...r2Operations, ...operationChange },
      }).success,
    ).toBe(false);
  });

  it('floors operation headroom at zero after the published allowance is exceeded', () => {
    const observation = {
      ...r2AvailableObservation,
      operations: {
        ...r2Operations,
        classA: {
          ...r2Operations.classA,
          estimatedUsed: 1_000_001,
          estimatedRemaining: 0,
        },
        classB: {
          ...r2Operations.classB,
          estimatedUsed: 10_000_001,
          estimatedRemaining: 0,
        },
      },
    };

    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
    expect(
      operations.r2CapacityObservation.safeParse({
        ...observation,
        operations: {
          ...observation.operations,
          classA: { ...observation.operations.classA, estimatedRemaining: 1 },
        },
      }).success,
    ).toBe(false);
  });

  it.each(r2RequiredCaveats)(
    'rejects an observation missing mandatory caveat %s',
    (missingCaveat) => {
      expect(
        operations.r2CapacityObservation.safeParse({
          ...r2AvailableObservation,
          caveats: r2RequiredCaveats.filter((caveat) => caveat !== missingCaveat),
        }).success,
      ).toBe(false);
    },
  );

  it('requires the Infrequent Access caveat when that class contains data', () => {
    const storage = {
      ...r2AvailableObservation.storage,
      infrequentAccess: { ...r2EmptyStorageSnapshot, publishedObjects: 1 },
    };

    expect(
      operations.r2CapacityObservation.safeParse({ ...r2AvailableObservation, storage }).success,
    ).toBe(false);

    const observation = {
      ...r2AvailableObservation,
      storage,
      caveats: [...r2RequiredCaveats, 'infrequent_access_not_covered_by_free_tier'],
    };
    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    [
      'bucket truncation',
      {
        buckets: { ...r2AvailableObservation.buckets, truncated: true },
      },
    ],
    [
      'unclassified operations',
      {
        operations: { ...r2Operations, unclassifiedRequests: 1 },
      },
    ],
  ] as const)('requires a corresponding caveat for %s', (_description, overrides) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        status: 'partial',
        ...overrides,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['duplicate caveats', [...r2RequiredCaveats, r2RequiredCaveats[0]]],
    ['an unreviewed caveat', [...r2RequiredCaveats, 'provider_dashboard_may_disagree']],
  ] as const)('rejects %s', (_description, caveats) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        caveats,
      }).success,
    ).toBe(false);
  });

  const storageMetricFields = [
    'publishedPayloadBytes',
    'publishedMetadataBytes',
    'publishedObjects',
    'uploadingPayloadBytes',
    'uploadingMetadataBytes',
    'uploadingObjects',
  ] as const;
  const invalidSafeIntegers = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] as const;

  it.each(
    storageMetricFields.flatMap((field) =>
      invalidSafeIntegers.map((value) => [field, value] as const),
    ),
  )('rejects unsafe storage metric %s=%s', (field, value) => {
    expect(
      operations.r2CapacityObservation.safeParse({
        ...r2AvailableObservation,
        storage: {
          ...r2AvailableObservation.storage,
          standard: { ...r2StorageSnapshot, [field]: value },
        },
      }).success,
    ).toBe(false);
  });

  it.each(invalidSafeIntegers)('rejects unsafe operation counts and estimates (%s)', (value) => {
    const candidates = [
      { ...r2Operations, freeRequests: value },
      { ...r2Operations, unclassifiedRequests: value },
      { ...r2Operations, classA: { ...r2Operations.classA, estimatedUsed: value } },
      { ...r2Operations, classA: { ...r2Operations.classA, estimatedRemaining: value } },
      { ...r2Operations, classB: { ...r2Operations.classB, estimatedUsed: value } },
      { ...r2Operations, classB: { ...r2Operations.classB, estimatedRemaining: value } },
    ];

    for (const candidate of candidates) {
      expect(
        operations.r2CapacityObservation.safeParse({
          ...r2AvailableObservation,
          operations: candidate,
        }).success,
      ).toBe(false);
    }
  });

  it('accepts Number.MAX_SAFE_INTEGER but rejects larger observations', () => {
    const maxStorage = Object.fromEntries(
      storageMetricFields.map((field) => [field, Number.MAX_SAFE_INTEGER]),
    );
    const observation = {
      ...r2AvailableObservation,
      status: 'partial',
      storage: {
        ...r2AvailableObservation.storage,
        standard: maxStorage,
        infrequentAccess: maxStorage,
      },
      operations: {
        ...r2Operations,
        classA: {
          ...r2Operations.classA,
          estimatedUsed: Number.MAX_SAFE_INTEGER,
          estimatedRemaining: 0,
        },
        classB: {
          ...r2Operations.classB,
          estimatedUsed: Number.MAX_SAFE_INTEGER,
          estimatedRemaining: 0,
        },
        freeRequests: Number.MAX_SAFE_INTEGER,
        unclassifiedRequests: Number.MAX_SAFE_INTEGER,
      },
      caveats: [
        ...r2RequiredCaveats,
        'infrequent_access_not_covered_by_free_tier',
        'unclassified_operations_excluded',
      ],
    };

    expect(operations.r2CapacityObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['top-level account ID', { ...r2AvailableObservation, accountId: '023e-secret' }],
    ['top-level token', { ...r2AvailableObservation, apiToken: 'cloudflare-secret' }],
    [
      'raw Cloudflare envelope',
      { ...r2AvailableObservation, rawCloudflareResponse: { success: true, result: [] } },
    ],
    ['GraphQL errors', { ...r2AvailableObservation, graphqlErrors: [{ message: 'secret' }] }],
    [
      'request headers',
      { ...r2AvailableObservation, requestHeaders: { Authorization: 'Bearer secret' } },
    ],
    ['object keys', { ...r2AvailableObservation, objectKeys: ['private/report.pdf'] }],
    [
      'bucket object metadata',
      {
        ...r2AvailableObservation,
        buckets: {
          ...r2AvailableObservation.buckets,
          items: [{ ...r2Bucket, objectKey: 'private/report.pdf' }],
        },
      },
    ],
    [
      'nested provider error text',
      {
        ...r2AvailableObservation,
        status: 'partial',
        operations: {
          status: 'unknown',
          reason: 'provider_unavailable',
          providerMessage: 'token was rejected by account 023e-secret',
        },
      },
    ],
    [
      'unknown observation provider text',
      { ...r2UnknownObservation, providerMessage: 'raw Cloudflare error body' },
    ],
  ] as const)('rejects leaked %s', (_description, observation) => {
    expect(operations.r2CapacityObservation.safeParse(observation).success).toBe(false);
  });

  it.each([
    ['top-level remaining storage', { ...r2AvailableObservation, remainingStorage: { bytes: 1 } }],
    [
      'storage remaining GB-month',
      {
        ...r2AvailableObservation,
        storage: { ...r2AvailableObservation.storage, remainingGbMonth: 9.5 },
      },
    ],
    [
      'storage-class remaining bytes',
      {
        ...r2AvailableObservation,
        storage: {
          ...r2AvailableObservation.storage,
          standard: { ...r2StorageSnapshot, remainingBytes: 9_000_000_000 },
        },
      },
    ],
    [
      'free-tier remaining storage',
      {
        ...r2AvailableObservation,
        freeTierReference: { ...r2FreeTierReference, remainingStorageGbMonth: 9.5 },
      },
    ],
  ] as const)('rejects an exact-storage claim through %s', (_description, observation) => {
    expect(operations.r2CapacityObservation.safeParse(observation).success).toBe(false);
  });
});
