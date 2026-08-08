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

const neonUsagePeriodStart = '2026-08-01T00:00:00.000Z';
const neonUsagePeriodEnd = '2026-09-01T00:00:00.000Z';

const neonUsageReasons = [
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

const neonUsageProjectReasons = [
  'timeout',
  'rate_limited',
  'forbidden',
  'not_found',
  'invalid_response',
  'provider_unavailable',
] as const;

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
  name: 'harpa-pro',
  status: 'available',
  effectivePermission: 'VIEWER',
  periodStart: neonUsagePeriodStart,
  periodEnd: neonUsagePeriodEnd,
  compute: {
    used: 90_000,
    allowance: 360_000,
    unit: 'cu_seconds',
  },
  storage: {
    used: 125_000_000,
    allowance: 500_000_000,
    unit: 'bytes',
  },
  transferBytes: 1_250_000_000,
} as const;

const unknownNeonUsageProject = {
  id: 'floral-brook-39718990',
  name: 'harpa-pro-admin',
  status: 'unknown',
  effectivePermission: 'VIEWER',
  reason: 'timeout',
} as const;

const availableNeonOrganizationTransfer = {
  status: 'available',
  periodStart: neonUsagePeriodStart,
  periodEnd: neonUsagePeriodEnd,
  used: availableNeonUsageProject.transferBytes,
  allowance: 5_000_000_000,
  unit: 'bytes',
} as const;

const availableNeonUsageObservation = {
  observedAt,
  status: 'available',
  organizationId: 'org-harpa-pro-12345678',
  plan: 'free',
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [availableNeonUsageProject],
  organizationTransfer: availableNeonOrganizationTransfer,
  caveats: neonUsageCaveats,
} as const;

const partialNeonUsageObservation = {
  ...availableNeonUsageObservation,
  status: 'partial',
  projectsTruncated: true,
  unavailableProjectCount: 1,
  projects: [availableNeonUsageProject, unknownNeonUsageProject],
  organizationTransfer: {
    status: 'unknown',
    reason: 'incomplete_project_coverage',
  },
} as const;

const unknownNeonUsageObservation = {
  observedAt,
  status: 'unknown',
  reason: 'not_configured',
} as const;

describe('admin operations Neon Free usage schema', () => {
  it.each([
    ['available', availableNeonUsageObservation],
    ['partial', partialNeonUsageObservation],
    ['unknown', unknownNeonUsageObservation],
  ] as const)('accepts an exact %s observation', (_status, observation) => {
    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each(neonUsageReasons)('accepts the redacted %s unknown reason', (reason) => {
    expect(() =>
      operations.neonUsageObservation.parse({
        ...unknownNeonUsageObservation,
        reason,
      }),
    ).not.toThrow();
  });

  it.each(neonUsageProjectReasons)(
    'accepts the redacted %s reason for an unknown project detail',
    (reason) => {
      const observation = {
        ...availableNeonUsageObservation,
        status: 'partial',
        projects: [{ ...unknownNeonUsageProject, reason }],
        organizationTransfer: {
          status: 'unknown',
          reason: 'incomplete_project_coverage',
        },
      };

      expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
    },
  );

  it('accepts invalid_response only when otherwise valid project transfer values overflow', () => {
    const observation = {
      ...availableNeonUsageObservation,
      status: 'partial',
      projects: [
        {
          ...availableNeonUsageProject,
          transferBytes: Number.MAX_SAFE_INTEGER,
        },
        {
          ...availableNeonUsageProject,
          id: 'floral-brook-39718990',
          name: 'harpa-pro-admin',
          transferBytes: 1,
        },
      ],
      organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
    };

    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it('accepts period_mismatch only with two distinct valid project periods', () => {
    const observation = {
      ...availableNeonUsageObservation,
      status: 'partial',
      projects: [
        availableNeonUsageProject,
        {
          ...availableNeonUsageProject,
          id: 'floral-brook-39718990',
          name: 'harpa-pro-admin',
          periodStart: '2026-07-15T00:00:00.000Z',
          periodEnd: '2026-08-15T00:00:00.000Z',
          transferBytes: 250_000,
        },
      ],
      organizationTransfer: { status: 'unknown', reason: 'period_mismatch' },
    };

    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    [
      'incomplete_project_coverage without incomplete project evidence',
      {
        ...availableNeonUsageObservation,
        status: 'partial',
        organizationTransfer: {
          status: 'unknown',
          reason: 'incomplete_project_coverage',
        },
      },
    ],
    [
      'period_mismatch with only one project period',
      {
        ...availableNeonUsageObservation,
        status: 'partial',
        organizationTransfer: { status: 'unknown', reason: 'period_mismatch' },
      },
    ],
    [
      'period_mismatch with identical project periods',
      {
        ...availableNeonUsageObservation,
        status: 'partial',
        projects: [
          availableNeonUsageProject,
          {
            ...availableNeonUsageProject,
            id: 'floral-brook-39718990',
            name: 'harpa-pro-admin',
          },
        ],
        organizationTransfer: { status: 'unknown', reason: 'period_mismatch' },
      },
    ],
    [
      'invalid_response with a safe aligned aggregate',
      {
        ...availableNeonUsageObservation,
        status: 'partial',
        organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
      },
    ],
    [
      'invalid_response when incomplete coverage is the stronger evidence',
      {
        ...partialNeonUsageObservation,
        organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
      },
    ],
    [
      'invalid_response when distinct periods are the stronger evidence',
      {
        ...availableNeonUsageObservation,
        status: 'partial',
        projects: [
          availableNeonUsageProject,
          {
            ...availableNeonUsageProject,
            id: 'floral-brook-39718990',
            name: 'harpa-pro-admin',
            periodStart: '2026-07-15T00:00:00.000Z',
            periodEnd: '2026-08-15T00:00:00.000Z',
          },
        ],
        organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
      },
    ],
  ] as const)('rejects %s', (_description, observation) => {
    expect(operations.neonUsageObservation.safeParse(observation).success).toBe(false);
  });

  it.each(['not_configured', 'unsupported_plan', 'unsafe_permissions'] as const)(
    'rejects top-level-only reason %s on an unknown project detail',
    (reason) => {
      expect(
        operations.neonUsageObservation.safeParse({
          ...partialNeonUsageObservation,
          projects: [{ ...unknownNeonUsageProject, reason }],
        }).success,
      ).toBe(false);
    },
  );

  it('rejects a project-detail reason on unknown organization transfer', () => {
    const observation = {
      ...availableNeonUsageObservation,
      status: 'partial',
      organizationTransfer: { status: 'unknown', reason: 'timeout' },
    };

    expect(operations.neonUsageObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects provider text as an unknown reason', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...unknownNeonUsageObservation,
        reason: 'Neon returned owner@example.com from a paid project',
      }).success,
    ).toBe(false);
  });

  it('accepts a complete Free observation with no visible projects', () => {
    const observation = {
      ...availableNeonUsageObservation,
      projects: [],
      organizationTransfer: { status: 'unknown', reason: 'no_projects' },
    };

    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    {
      ...availableNeonUsageObservation,
      organizationTransfer: { status: 'unknown', reason: 'no_projects' },
    },
    {
      ...availableNeonUsageObservation,
      status: 'partial',
      projects: [],
      projectsTruncated: true,
      organizationTransfer: { status: 'unknown', reason: 'no_projects' },
    },
    {
      ...availableNeonUsageObservation,
      status: 'partial',
      projects: [],
      unavailableProjectCount: 1,
      organizationTransfer: { status: 'unknown', reason: 'no_projects' },
    },
  ] as const)(
    'rejects no_projects without exact complete empty discovery evidence',
    (observation) => {
      expect(operations.neonUsageObservation.safeParse(observation).success).toBe(false);
    },
  );

  it('accepts exactly 20 projects and rejects a twenty-first', () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({
      ...availableNeonUsageProject,
      id: `project-${index}`,
      name: `Project ${index}`,
      transferBytes: index + 1,
    }));
    const used = projects.reduce((sum, project) => sum + project.transferBytes, 0);
    const atLimit = {
      ...availableNeonUsageObservation,
      projects,
      organizationTransfer: {
        ...availableNeonOrganizationTransfer,
        used,
      },
    };

    expect(() => operations.neonUsageObservation.parse(atLimit)).not.toThrow();
    expect(
      operations.neonUsageObservation.safeParse({
        ...atLimit,
        projects: [
          ...projects,
          {
            ...availableNeonUsageProject,
            id: 'project-20',
            name: 'Project 20',
            transferBytes: 21,
          },
        ],
        organizationTransfer: {
          ...atLimit.organizationTransfer,
          used: used + 21,
        },
      }).success,
    ).toBe(false);
  });

  it.each(['launch', 'scale', 'FREE', 'free_v3', null] as const)(
    'rejects plan evidence %s on a percentage observation',
    (planEvidence) => {
      expect(
        operations.neonUsageObservation.safeParse({
          ...availableNeonUsageObservation,
          plan: planEvidence,
        }).success,
      ).toBe(false);
    },
  );

  it.each(['EDITOR', 'ADMIN', 'viewer', null, undefined] as const)(
    'rejects project permission evidence %s on available and unknown details',
    (effectivePermission) => {
      for (const project of [availableNeonUsageProject, unknownNeonUsageProject]) {
        expect(
          operations.neonUsageObservation.safeParse({
            ...availableNeonUsageObservation,
            status: 'partial',
            projects: [{ ...project, effectivePermission }],
            organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
          }).success,
        ).toBe(false);
      }
    },
  );

  it.each([
    [
      'a truncated project list',
      {
        projectsTruncated: true,
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      },
    ],
    [
      'a provider-reported unavailable project',
      {
        unavailableProjectCount: 1,
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      },
    ],
    [
      'an unknown project detail',
      {
        projects: [availableNeonUsageProject, unknownNeonUsageProject],
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      },
    ],
  ] as const)('accepts partial status with %s', (_description, override) => {
    const observation = {
      ...availableNeonUsageObservation,
      status: 'partial',
      ...override,
    };

    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it('rejects partial status without an incompleteness signal', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        status: 'partial',
      }).success,
    ).toBe(false);
  });

  it('rejects partial status with an available organization-transfer total', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        status: 'partial',
        projectsTruncated: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'project-list truncation',
      {
        ...availableNeonUsageObservation,
        projectsTruncated: true,
      },
    ],
    [
      'a provider-reported unavailable project',
      {
        ...availableNeonUsageObservation,
        unavailableProjectCount: 1,
      },
    ],
    [
      'an unknown project',
      {
        ...availableNeonUsageObservation,
        projects: [availableNeonUsageProject, unknownNeonUsageProject],
      },
    ],
    [
      'unknown organization transfer',
      {
        ...availableNeonUsageObservation,
        organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
      },
    ],
  ] as const)('rejects available status with %s', (_description, observation) => {
    expect(operations.neonUsageObservation.safeParse(observation).success).toBe(false);
  });

  it.each([
    [
      'the compute allowance',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            compute: {
              ...availableNeonUsageProject.compute,
              allowance: 359_999,
            },
          },
        ],
      },
    ],
    [
      'the storage allowance',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            storage: {
              ...availableNeonUsageProject.storage,
              allowance: 536_870_912,
            },
          },
        ],
      },
    ],
    [
      'the organization transfer allowance',
      {
        organizationTransfer: {
          ...availableNeonOrganizationTransfer,
          allowance: 5_368_709_120,
        },
      },
    ],
    [
      'the compute unit',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            compute: { ...availableNeonUsageProject.compute, unit: 'seconds' },
          },
        ],
      },
    ],
    [
      'the storage unit',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            storage: { ...availableNeonUsageProject.storage, unit: 'gb' },
          },
        ],
      },
    ],
    [
      'the organization transfer unit',
      {
        organizationTransfer: {
          ...availableNeonOrganizationTransfer,
          unit: 'gb',
        },
      },
    ],
  ] as const)('rejects a non-literal value for %s', (_description, override) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'negative compute use',
      {
        compute: { ...availableNeonUsageProject.compute, used: -1 },
      },
    ],
    [
      'fractional storage use',
      {
        storage: { ...availableNeonUsageProject.storage, used: 1.5 },
      },
    ],
    [
      'unsafe transfer use',
      {
        transferBytes: Number.MAX_SAFE_INTEGER + 1,
      },
    ],
  ] as const)('rejects %s', (_description, projectOverride) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        status: 'partial',
        projects: [{ ...availableNeonUsageProject, ...projectOverride }],
        organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
      }).success,
    ).toBe(false);
  });

  it('rejects an organization transfer sum that differs from complete projects', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        organizationTransfer: {
          ...availableNeonOrganizationTransfer,
          used: availableNeonUsageProject.transferBytes + 1,
        },
      }).success,
    ).toBe(false);
  });

  it('accepts provider usage above every published Free-plan reference', () => {
    const project = {
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
    };
    const observation = {
      ...availableNeonUsageObservation,
      projects: [project],
      organizationTransfer: {
        ...availableNeonOrganizationTransfer,
        used: project.transferBytes,
      },
    };

    expect(operations.neonUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('rejects %s organization-transfer usage', (_description, used) => {
    const result = operations.neonUsageObservation.safeParse({
      ...availableNeonUsageObservation,
      projects: [],
      organizationTransfer: {
        ...availableNeonOrganizationTransfer,
        used,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['organizationTransfer', 'used'] }),
        ]),
      );
    }
  });

  it.each([
    [
      'a reversed project period',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            periodStart: neonUsagePeriodEnd,
            periodEnd: neonUsagePeriodStart,
          },
        ],
      },
    ],
    [
      'a project period that differs from organization transfer',
      {
        projects: [
          {
            ...availableNeonUsageProject,
            periodStart: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
    ],
    [
      'a reversed organization transfer period',
      {
        organizationTransfer: {
          ...availableNeonOrganizationTransfer,
          periodStart: neonUsagePeriodEnd,
          periodEnd: neonUsagePeriodStart,
        },
      },
    ],
  ] as const)('rejects %s', (_description, override) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        ...override,
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate project IDs', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        status: 'partial',
        projects: [availableNeonUsageProject, unknownNeonUsageProject, unknownNeonUsageProject],
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['a missing caveat', neonUsageCaveats.slice(0, -1)],
    ['a duplicate caveat', [...neonUsageCaveats, neonUsageCaveats[0]]],
    ['an out-of-order caveat tuple', [...neonUsageCaveats].reverse()],
    ['an unreviewed caveat', [...neonUsageCaveats.slice(0, -1), 'provider_credit_remaining']],
  ] as const)('rejects %s', (_description, caveats) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        caveats,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['top-level provider response', { rawProviderResponse: {} }],
    ['top-level API key', { apiKey: 'neon-secret' }],
    ['organization name', { organizationName: 'Internal organization' }],
  ] as const)('rejects leaked %s', (_description, leakedField) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        ...leakedField,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['owner ID', { ownerId: 'owner-secret' }],
    ['connection URI', { connectionUri: 'postgres://user:password@example.neon.tech/db' }],
    ['proxy host', { proxyHost: 'ep-secret.neon.tech' }],
    ['branch logical limit', { branchLogicalSizeLimitBytes: 536_870_912 }],
    ['byte-hour storage', { dataStorageBytesHour: 123_456 }],
    ['written data', { writtenDataBytes: 123_456 }],
  ] as const)('rejects leaked project %s', (_description, leakedField) => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...availableNeonUsageObservation,
        projects: [{ ...availableNeonUsageProject, ...leakedField }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown project that retains usage or provider text', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...partialNeonUsageObservation,
        projects: [
          availableNeonUsageProject,
          {
            ...unknownNeonUsageProject,
            transferBytes: 1,
            providerMessage: 'upstream timeout for owner@example.com',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects raw provider text as a nested unknown reason', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...partialNeonUsageObservation,
        projects: [
          availableNeonUsageProject,
          {
            ...unknownNeonUsageProject,
            reason: 'project detail timed out for owner@example.com',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects raw provider text as an organization-transfer reason', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...partialNeonUsageObservation,
        organizationTransfer: {
          status: 'unknown',
          reason: 'project floral-brook failed for owner@example.com',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown observations that retain organization or project facts', () => {
    expect(
      operations.neonUsageObservation.safeParse({
        ...unknownNeonUsageObservation,
        organizationId: availableNeonUsageObservation.organizationId,
        projects: [availableNeonUsageProject],
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
  finishedAt: '2026-08-08T08:00:01.250Z',
  reportUpdatedAt: '2026-08-08T08:00:01.300Z',
  generatedAt: '2026-08-08T08:00:00.050Z',
  vendor: 'openai',
  model: 'gpt-5-mini',
  fixtureMode: 'live',
  idempotentReplay: false,
};

const reportDiagnosticUsage = {
  inputTokens: 800,
  outputTokens: 200,
  cachedTokens: 125,
  latencyMs: 1_100,
  matched: true,
};

const reportDiagnosticPreviewWorker = {
  role: 'Carpenter',
  count: '3',
  hours: '8',
  notes: 'Completed the fixed synthetic framing task.',
};

const reportDiagnosticPreviewMaterial = {
  name: 'Timber',
  quantity: '24',
  unit: 'lengths',
  status: 'installed',
  condition: 'dry',
  notes: null,
};

const reportDiagnosticPreviewIssue = {
  title: 'Synthetic access check',
  severity: 'low',
  description: 'The fixed gate needs a follow-up inspection.',
  action: 'Inspect the fixed synthetic gate tomorrow.',
};

const reportDiagnosticPreviewSection = {
  title: 'Synthetic progress',
  body: 'The fixed framing task completed without delay.',
};

const reportDiagnosticPreviewSample = {
  title: 'Synthetic report canary',
  summary: 'The fixed synthetic site visit completed as expected.',
  weather: {
    condition: 'clear',
    temperature: '21 C',
    wind: 'light',
    impact: null,
  },
  workers: [reportDiagnosticPreviewWorker],
  materials: [reportDiagnosticPreviewMaterial],
  issues: [reportDiagnosticPreviewIssue],
  nextSteps: ['Inspect the fixed synthetic gate tomorrow.'],
  summarySections: [reportDiagnosticPreviewSection],
};

const reportDiagnosticPreviewCounts = {
  workers: 1,
  materials: 1,
  issues: 1,
  nextSteps: 1,
  summarySections: 1,
  imageAttachments: 0,
  documentAttachments: 0,
};

const reportDiagnosticPreview = {
  schemaValid: true,
  sample: reportDiagnosticPreviewSample,
  counts: reportDiagnosticPreviewCounts,
  truncated: false,
  bodySha256: 'a'.repeat(64),
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
  preview: reportDiagnosticPreview,
  usage: reportDiagnosticUsage,
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

describe('admin report-generation live-canary observation schema', () => {
  it.each(['not_configured', 'not_enabled'] as const)(
    'accepts the exact unknown/%s observation',
    (reason) => {
      const observation = {
        observedAt,
        status: 'unknown',
        reason,
      };

      expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
        observation,
      );
    },
  );

  it('accepts an exact live pass with usage proof and a bounded response preview', () => {
    expect(
      operations.reportGenerateDiagnosticObservation.parse(reportDiagnosticPass),
    ).toStrictEqual(reportDiagnosticPass);
  });

  it('accepts nullable report fields without adding leak-prone placeholders', () => {
    const observation = {
      ...reportDiagnosticPass,
      generation: { ...reportDiagnosticGeneration, requestId: null },
      preview: {
        ...reportDiagnosticPreview,
        sample: {
          ...reportDiagnosticPreviewSample,
          title: null,
          summary: null,
          weather: null,
        },
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it('accepts nullable nested preview fields when their parent objects exist', () => {
    const observation = {
      ...reportDiagnosticPass,
      preview: {
        ...reportDiagnosticPreview,
        sample: {
          ...reportDiagnosticPreviewSample,
          weather: {
            condition: null,
            temperature: null,
            wind: null,
            impact: null,
          },
          workers: [
            {
              ...reportDiagnosticPreviewWorker,
              count: null,
              hours: null,
              notes: null,
            },
          ],
          materials: [
            {
              ...reportDiagnosticPreviewMaterial,
              quantity: null,
              unit: null,
              status: null,
              condition: null,
              notes: null,
            },
          ],
          issues: [
            {
              ...reportDiagnosticPreviewIssue,
              severity: null,
              description: null,
              action: null,
            },
          ],
        },
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it('accepts an all-empty report preview with zero structural and attachment counts', () => {
    const observation = {
      ...reportDiagnosticPass,
      preview: {
        ...reportDiagnosticPreview,
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
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it.each([
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
      'unavailable limits with failed sign-out',
      {
        warnings: ['sign_out_failed', 'limits_unavailable'],
        generation: reportDiagnosticGeneration,
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

  it.each([
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
  ] as const)('accepts the reviewed %s failure phase', (phase) => {
    expect(() =>
      operations.reportGenerateDiagnosticObservation.parse({
        ...reportDiagnosticFail,
        phase,
      }),
    ).not.toThrow();
  });

  it.each([
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
    ['replay', false],
    ['record', false],
    ['live', true],
  ] as const)(
    'rejects fixtureMode=%s or idempotentReplay=%s for pass and warning results',
    (fixtureMode, idempotentReplay) => {
      const generation = {
        ...reportDiagnosticGeneration,
        fixtureMode,
        idempotentReplay,
      };
      const warning = {
        ...reportDiagnosticPass,
        status: 'warning',
        generation,
        limits: null,
        warnings: ['limits_unavailable'],
      };

      expect(
        operations.reportGenerateDiagnosticObservation.safeParse({
          ...reportDiagnosticPass,
          generation,
        }).success,
      ).toBe(false);
      expect(operations.reportGenerateDiagnosticObservation.safeParse(warning).success).toBe(false);
    },
  );

  it.each([
    [
      'no evidence for a warning',
      {
        warnings: ['limits_unavailable'],
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
        warnings: ['limits_unavailable'],
        limits: null,
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
    ['duplicate warnings', ['limits_unavailable', 'limits_unavailable']],
    ['the removed replay warning', ['replay_only']],
    ['an unreviewed warning', ['provider_said_try_again']],
  ] as const)('rejects %s', (_description, warnings) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        status: 'warning',
        limits: null,
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
    ['missing preview', { preview: undefined }],
    ['missing usage proof', { usage: undefined }],
    ['warning metadata', { warnings: ['limits_unavailable'] }],
  ] as const)('rejects a pass with %s', (_description, override) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each([
    { inputTokens: 0, outputTokens: 1, cachedTokens: 0 },
    { inputTokens: 1, outputTokens: 0, cachedTokens: 1 },
  ] as const)('accepts non-negative usage when the total is positive: %o', (tokens) => {
    const observation = {
      ...reportDiagnosticPass,
      usage: {
        ...reportDiagnosticUsage,
        ...tokens,
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it.each([
    ['zero total tokens', { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }],
    ['negative input tokens', { inputTokens: -1 }],
    ['negative output tokens', { outputTokens: -1 }],
    ['negative cached tokens', { cachedTokens: -1 }],
    ['unsafe input tokens', { inputTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ['unsafe output tokens', { outputTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ['unsafe cached tokens', { cachedTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ['cached tokens greater than input tokens', { inputTokens: 10, cachedTokens: 11 }],
    ['negative latency', { latencyMs: -1 }],
    ['latency beyond the functional deadline', { latencyMs: 75_001 }],
    ['an unmatched ledger row', { matched: false }],
    ['a string token count', { inputTokens: '800' }],
  ] as const)('rejects usage proof with %s', (_description, usageOverride) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        usage: {
          ...reportDiagnosticUsage,
          ...usageOverride,
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a five-item sample whose total counts and attachments require truncation', () => {
    const observation = {
      ...reportDiagnosticPass,
      preview: {
        ...reportDiagnosticPreview,
        sample: {
          ...reportDiagnosticPreviewSample,
          workers: Array.from({ length: 5 }, (_, index) => ({
            ...reportDiagnosticPreviewWorker,
            role: 'Synthetic crew ' + String(index + 1),
          })),
          materials: Array.from({ length: 5 }, (_, index) => ({
            ...reportDiagnosticPreviewMaterial,
            name: 'Synthetic material ' + String(index + 1),
          })),
          issues: Array.from({ length: 5 }, (_, index) => ({
            ...reportDiagnosticPreviewIssue,
            title: 'Synthetic issue ' + String(index + 1),
          })),
          nextSteps: Array.from(
            { length: 5 },
            (_, index) => 'Synthetic next step ' + String(index + 1),
          ),
          summarySections: Array.from({ length: 5 }, (_, index) => ({
            ...reportDiagnosticPreviewSection,
            title: 'Synthetic section ' + String(index + 1),
          })),
        },
        counts: {
          workers: 6,
          materials: 6,
          issues: 6,
          nextSteps: 6,
          summarySections: 6,
          imageAttachments: 2,
          documentAttachments: 1,
        },
        truncated: true,
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it('counts preview string bounds in Unicode code points', () => {
    const fourHundredCodePoints = '🦺'.repeat(400);
    const valid = {
      ...reportDiagnosticPass,
      preview: {
        ...reportDiagnosticPreview,
        sample: {
          ...reportDiagnosticPreviewSample,
          title: fourHundredCodePoints,
        },
      },
    };
    const invalid = {
      ...valid,
      preview: {
        ...valid.preview,
        sample: {
          ...valid.preview.sample,
          title: fourHundredCodePoints + 'x',
        },
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.safeParse(valid).success).toBe(true);
    expect(operations.reportGenerateDiagnosticObservation.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ['summary text', { ...reportDiagnosticPreviewSample, summary: 'x'.repeat(401) }],
    [
      'weather condition text',
      {
        ...reportDiagnosticPreviewSample,
        weather: {
          ...reportDiagnosticPreviewSample.weather,
          condition: 'x'.repeat(401),
        },
      },
    ],
    [
      'weather temperature text',
      {
        ...reportDiagnosticPreviewSample,
        weather: {
          ...reportDiagnosticPreviewSample.weather,
          temperature: 'x'.repeat(401),
        },
      },
    ],
    [
      'weather wind text',
      {
        ...reportDiagnosticPreviewSample,
        weather: {
          ...reportDiagnosticPreviewSample.weather,
          wind: 'x'.repeat(401),
        },
      },
    ],
    [
      'weather impact text',
      {
        ...reportDiagnosticPreviewSample,
        weather: {
          ...reportDiagnosticPreviewSample.weather,
          impact: 'x'.repeat(401),
        },
      },
    ],
    [
      'worker role text',
      {
        ...reportDiagnosticPreviewSample,
        workers: [{ ...reportDiagnosticPreviewWorker, role: 'x'.repeat(401) }],
      },
    ],
    [
      'worker count text',
      {
        ...reportDiagnosticPreviewSample,
        workers: [{ ...reportDiagnosticPreviewWorker, count: 'x'.repeat(401) }],
      },
    ],
    [
      'worker hours text',
      {
        ...reportDiagnosticPreviewSample,
        workers: [{ ...reportDiagnosticPreviewWorker, hours: 'x'.repeat(401) }],
      },
    ],
    [
      'worker notes text',
      {
        ...reportDiagnosticPreviewSample,
        workers: [{ ...reportDiagnosticPreviewWorker, notes: 'x'.repeat(401) }],
      },
    ],
    [
      'material name text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, name: 'x'.repeat(401) }],
      },
    ],
    [
      'material quantity text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, quantity: 'x'.repeat(401) }],
      },
    ],
    [
      'material unit text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, unit: 'x'.repeat(401) }],
      },
    ],
    [
      'material status text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, status: 'x'.repeat(401) }],
      },
    ],
    [
      'material condition text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, condition: 'x'.repeat(401) }],
      },
    ],
    [
      'material notes text',
      {
        ...reportDiagnosticPreviewSample,
        materials: [{ ...reportDiagnosticPreviewMaterial, notes: 'x'.repeat(401) }],
      },
    ],
    [
      'issue title text',
      {
        ...reportDiagnosticPreviewSample,
        issues: [{ ...reportDiagnosticPreviewIssue, title: 'x'.repeat(401) }],
      },
    ],
    [
      'issue severity text',
      {
        ...reportDiagnosticPreviewSample,
        issues: [{ ...reportDiagnosticPreviewIssue, severity: 'x'.repeat(401) }],
      },
    ],
    [
      'issue description text',
      {
        ...reportDiagnosticPreviewSample,
        issues: [{ ...reportDiagnosticPreviewIssue, description: 'x'.repeat(401) }],
      },
    ],
    [
      'issue action text',
      {
        ...reportDiagnosticPreviewSample,
        issues: [{ ...reportDiagnosticPreviewIssue, action: 'x'.repeat(401) }],
      },
    ],
    ['next-step text', { ...reportDiagnosticPreviewSample, nextSteps: ['x'.repeat(401)] }],
    [
      'summary-section title text',
      {
        ...reportDiagnosticPreviewSample,
        summarySections: [{ ...reportDiagnosticPreviewSection, title: 'x'.repeat(401) }],
      },
    ],
    [
      'summary-section body text',
      {
        ...reportDiagnosticPreviewSample,
        summarySections: [{ ...reportDiagnosticPreviewSection, body: 'x'.repeat(401) }],
      },
    ],
  ] as const)('rejects preview %s beyond 400 code points', (_description, sample) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          sample,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'workers',
      {
        ...reportDiagnosticPreviewSample,
        workers: Array.from({ length: 6 }, () => reportDiagnosticPreviewWorker),
      },
      { ...reportDiagnosticPreviewCounts, workers: 6 },
    ],
    [
      'materials',
      {
        ...reportDiagnosticPreviewSample,
        materials: Array.from({ length: 6 }, () => reportDiagnosticPreviewMaterial),
      },
      { ...reportDiagnosticPreviewCounts, materials: 6 },
    ],
    [
      'issues',
      {
        ...reportDiagnosticPreviewSample,
        issues: Array.from({ length: 6 }, () => reportDiagnosticPreviewIssue),
      },
      { ...reportDiagnosticPreviewCounts, issues: 6 },
    ],
    [
      'next steps',
      {
        ...reportDiagnosticPreviewSample,
        nextSteps: Array.from({ length: 6 }, () => 'Synthetic next step'),
      },
      { ...reportDiagnosticPreviewCounts, nextSteps: 6 },
    ],
    [
      'summary sections',
      {
        ...reportDiagnosticPreviewSample,
        summarySections: Array.from({ length: 6 }, () => reportDiagnosticPreviewSection),
      },
      { ...reportDiagnosticPreviewCounts, summarySections: 6 },
    ],
  ] as const)('rejects more than five sampled %s', (_description, sample, counts) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          sample,
          counts,
          truncated: true,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'workers',
      Array.from({ length: 4 }, (_, index) => ({
        ...reportDiagnosticPreviewWorker,
        role: 'Synthetic crew ' + String(index + 1),
      })),
    ],
    [
      'materials',
      Array.from({ length: 4 }, (_, index) => ({
        ...reportDiagnosticPreviewMaterial,
        name: 'Synthetic material ' + String(index + 1),
      })),
    ],
    [
      'issues',
      Array.from({ length: 4 }, (_, index) => ({
        ...reportDiagnosticPreviewIssue,
        title: 'Synthetic issue ' + String(index + 1),
      })),
    ],
    [
      'nextSteps',
      Array.from({ length: 4 }, (_, index) => 'Synthetic next step ' + String(index + 1)),
    ],
    [
      'summarySections',
      Array.from({ length: 4 }, (_, index) => ({
        ...reportDiagnosticPreviewSection,
        title: 'Synthetic section ' + String(index + 1),
      })),
    ],
  ] as const)('rejects four sampled %s when the structural count is six', (countName, sample) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          sample: {
            ...reportDiagnosticPreviewSample,
            [countName]: sample,
          },
          counts: {
            ...reportDiagnosticPreviewCounts,
            [countName]: 6,
          },
          truncated: true,
        },
      }).success,
    ).toBe(false);
  });

  it.each(['workers', 'materials', 'issues', 'nextSteps', 'summarySections'] as const)(
    'rejects an empty %s sample when its count is one even if attachments justify truncation',
    (countName) => {
      expect(
        operations.reportGenerateDiagnosticObservation.safeParse({
          ...reportDiagnosticPass,
          preview: {
            ...reportDiagnosticPreview,
            sample: {
              ...reportDiagnosticPreviewSample,
              [countName]: [],
            },
            counts: {
              ...reportDiagnosticPreviewCounts,
              [countName]: 1,
              imageAttachments: 1,
            },
            truncated: true,
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    'workers',
    'materials',
    'issues',
    'nextSteps',
    'summarySections',
    'imageAttachments',
    'documentAttachments',
  ] as const)('rejects negative and unsafe %s preview counts', (countName) => {
    for (const invalidCount of [-1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        operations.reportGenerateDiagnosticObservation.safeParse({
          ...reportDiagnosticPass,
          preview: {
            ...reportDiagnosticPreview,
            counts: {
              ...reportDiagnosticPreviewCounts,
              [countName]: invalidCount,
            },
            truncated: true,
          },
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    [
      'a sampled array longer than its count',
      {
        counts: { ...reportDiagnosticPreviewCounts, workers: 0 },
        truncated: true,
      },
    ],
    [
      'an undisclosed structural truncation',
      {
        counts: { ...reportDiagnosticPreviewCounts, workers: 2 },
        truncated: false,
      },
    ],
    [
      'undisclosed image attachment references',
      {
        counts: { ...reportDiagnosticPreviewCounts, imageAttachments: 1 },
        truncated: false,
      },
    ],
    [
      'undisclosed document attachment references',
      {
        counts: { ...reportDiagnosticPreviewCounts, documentAttachments: 1 },
        truncated: false,
      },
    ],
  ] as const)('rejects preview counts with %s', (_description, previewOverride) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          ...previewOverride,
        },
      }).success,
    ).toBe(false);
  });

  it('allows truncation with equal structural counts because a string may have been clipped', () => {
    const observation = {
      ...reportDiagnosticPass,
      preview: {
        ...reportDiagnosticPreview,
        truncated: true,
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
  });

  it.each([
    ['schemaValid=false', { schemaValid: false }],
    ['a short hash', { bodySha256: 'a'.repeat(63) }],
    ['a long hash', { bodySha256: 'a'.repeat(65) }],
    ['an uppercase hash', { bodySha256: 'A'.repeat(64) }],
    ['a non-hexadecimal hash', { bodySha256: 'g'.repeat(64) }],
  ] as const)('rejects a preview with %s', (_description, previewOverride) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          ...previewOverride,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'generation proof after the request lower bound',
      {
        ...reportDiagnosticGeneration,
        generatedAt: '2026-08-08T08:00:00.200Z',
      },
    ],
    [
      'request completion before its request lower bound',
      {
        ...reportDiagnosticGeneration,
        finishedAt: '2026-08-08T08:00:00.050Z',
      },
    ],
    [
      'report update before request completion',
      {
        ...reportDiagnosticGeneration,
        reportUpdatedAt: '2026-08-08T08:00:01.200Z',
      },
    ],
  ] as const)('rejects %s', (_description, generation) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        generation,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['request ID', { requestId: '<script>alert(1)</script>' }],
    ['vendor', { vendor: 'raw provider error: key=secret' }],
    ['model', { model: '<img src=x onerror=alert(1)>' }],
  ] as const)('rejects unsafe characters in the generation %s', (_description, override) => {
    expect(
      operations.reportGenerateDiagnosticGeneration.safeParse({
        ...reportDiagnosticGeneration,
        ...override,
      }).success,
    ).toBe(false);
  });

  it('rejects an unsafe target report number', () => {
    expect(
      operations.reportGenerateDiagnosticTarget.safeParse({
        ...reportDiagnosticTarget,
        reportNumber: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it.each(['limit', 'used', 'remaining'] as const)(
    'rejects an unsafe limit-summary %s',
    (field) => {
      expect(
        operations.reportGenerateDiagnosticLimitSummary.safeParse({
          ...reportDiagnosticBucket,
          [field]: Number.MAX_SAFE_INTEGER + 1,
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['pass', reportDiagnosticPass],
    [
      'warning',
      {
        ...reportDiagnosticPass,
        status: 'warning',
        limits: null,
        warnings: ['limits_unavailable'],
      },
    ],
    ['fail', reportDiagnosticFail],
  ] as const)('allows cleanup grace in the %s overall duration', (_status, observation) => {
    const atDeadline = { ...observation, durationMs: 80_000 };

    expect(operations.reportGenerateDiagnosticObservation.parse(atDeadline)).toStrictEqual(
      atDeadline,
    );
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...observation,
        durationMs: 80_001,
      }).success,
    ).toBe(false);
  });

  it('keeps generation duration at the functional 75-second deadline', () => {
    expect(
      operations.reportGenerateDiagnosticGeneration.safeParse({
        ...reportDiagnosticGeneration,
        durationMs: 75_000,
      }).success,
    ).toBe(true);
    expect(
      operations.reportGenerateDiagnosticGeneration.safeParse({
        ...reportDiagnosticGeneration,
        durationMs: 75_001,
      }).success,
    ).toBe(false);
  });

  it('accepts usage latency at the functional 75-second deadline', () => {
    const observation = {
      ...reportDiagnosticPass,
      usage: {
        ...reportDiagnosticUsage,
        latencyMs: 75_000,
      },
    };

    expect(operations.reportGenerateDiagnosticObservation.parse(observation)).toStrictEqual(
      observation,
    );
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
        generation: { ...reportDiagnosticGeneration, fixtureMode: 'fixture' },
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
      'negative quota usage',
      {
        ...reportDiagnosticPass,
        limits: {
          ...reportDiagnosticLimits,
          reportGenerate: { ...reportDiagnosticBucket, used: -1 },
        },
      },
    ],
    [
      'an inconsistent warning variant',
      {
        ...reportDiagnosticPass,
        status: 'warning',
        warnings: ['limits_unavailable'],
      },
    ],
    [
      'success evidence on a failure',
      {
        ...reportDiagnosticFail,
        target: reportDiagnosticTarget,
        preview: reportDiagnosticPreview,
        usage: reportDiagnosticUsage,
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
      'canonical report JSON',
      {
        ...reportDiagnosticPass,
        preview: { ...reportDiagnosticPreview, canonicalJson: '{"secret":"report"}' },
      },
    ],
    [
      'a raw report body',
      {
        ...reportDiagnosticPass,
        preview: { ...reportDiagnosticPreview, rawBody: reportDiagnosticPreviewSample },
      },
    ],
    [
      'an issue attachment identifier',
      {
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          sample: {
            ...reportDiagnosticPreviewSample,
            issues: [
              {
                ...reportDiagnosticPreviewIssue,
                attachments: { images: ['not_secret'] },
              },
            ],
          },
        },
      },
    ],
    [
      'a summary-section attachment identifier',
      {
        ...reportDiagnosticPass,
        preview: {
          ...reportDiagnosticPreview,
          sample: {
            ...reportDiagnosticPreviewSample,
            summarySections: [
              {
                ...reportDiagnosticPreviewSection,
                attachments: { documents: ['not_secret'] },
              },
            ],
          },
        },
      },
    ],
    [
      'duplicated usage vendor metadata',
      {
        ...reportDiagnosticPass,
        usage: {
          ...reportDiagnosticUsage,
          vendor: reportDiagnosticGeneration.vendor,
          model: reportDiagnosticGeneration.model,
        },
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

  it.each([
    ['ID', { id: 'lue_01234567' }],
    ['user ID', { userId: 'usr_01234567' }],
    ['project ID', { projectId: reportDiagnosticTarget.projectId }],
    ['report ID', { reportId: reportDiagnosticTarget.reportId }],
    ['timestamp', { createdAt: '2026-08-08T08:00:01.200Z' }],
  ] as const)('rejects leaked usage-row %s', (_description, leakedField) => {
    expect(
      operations.reportGenerateDiagnosticObservation.safeParse({
        ...reportDiagnosticPass,
        usage: {
          ...reportDiagnosticUsage,
          ...leakedField,
        },
      }).success,
    ).toBe(false);
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
