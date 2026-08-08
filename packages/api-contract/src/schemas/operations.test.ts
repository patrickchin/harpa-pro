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

const storageLifecycleCaveats = [
  'db_state_not_worker_liveness',
  'queue_counts_not_provider_health',
  'empty_queue_not_execution_proof',
] as const;

const storageLifecycleAvailableObservation = {
  observedAt,
  status: 'available',
  rollout: {
    armedAt: '2026-08-08T07:55:00.000Z',
    enforceAfter: '2026-08-08T07:59:00.000Z',
    accountDeleteEnabled: true,
    leaseEnforcementActive: true,
    accountDeletionAvailable: true,
    updatedAt: '2026-08-08T07:55:01.000Z',
  },
  jobs: {
    total: 10,
    initial: 6,
    final: 4,
    dueNow: 7,
    scheduled: 3,
    activeClaims: 2,
    staleClaims: 1,
    retrying: 2,
    maxAttemptCount: 3,
    oldestDueAt: '2026-08-08T07:00:00.000Z',
    nextRunAfter: '2026-08-08T09:00:00.000Z',
  },
  caveats: storageLifecycleCaveats,
} as const;

const storageLifecycleUnknownObservation = {
  observedAt,
  status: 'unknown',
  reason: 'database_unavailable',
} as const;

const emptyStorageLifecycleJobs = {
  total: 0,
  initial: 0,
  final: 0,
  dueNow: 0,
  scheduled: 0,
  activeClaims: 0,
  staleClaims: 0,
  retrying: 0,
  maxAttemptCount: 0,
  oldestDueAt: null,
  nextRunAfter: null,
} as const;

const storageLifecycleObservation = operations.storageLifecycleObservation;

describe('admin operations storage lifecycle observation schema', () => {
  it('accepts the exact reviewed available observation', () => {
    expect(storageLifecycleObservation.parse(storageLifecycleAvailableObservation)).toStrictEqual(
      storageLifecycleAvailableObservation,
    );
  });

  it.each([
    'rollout_state_missing',
    'timeout',
    'database_unavailable',
    'invalid_response',
  ] as const)('accepts the redacted unknown reason %s', (reason) => {
    const observation = { ...storageLifecycleUnknownObservation, reason };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['available reason', { ...storageLifecycleAvailableObservation, reason: 'invalid_response' }],
    [
      'unknown rollout data',
      {
        ...storageLifecycleUnknownObservation,
        rollout: storageLifecycleAvailableObservation.rollout,
      },
    ],
    [
      'unknown job data',
      { ...storageLifecycleUnknownObservation, jobs: storageLifecycleAvailableObservation.jobs },
    ],
    [
      'unknown caveats',
      { ...storageLifecycleUnknownObservation, caveats: storageLifecycleCaveats },
    ],
    ['an unsupported status', { ...storageLifecycleUnknownObservation, status: 'partial' }],
    ['a missing unknown reason', { observedAt, status: 'unknown' }],
  ] as const)('rejects the invalid discriminated-union shape %s', (_description, observation) => {
    expect(storageLifecycleObservation.safeParse(observation).success).toBe(false);
  });

  it.each([
    [null, false],
    ['2026-08-08T07:59:59.999Z', true],
    [observedAt, true],
    ['2026-08-08T08:00:00.001Z', false],
  ] as const)(
    'accepts enforceAfter=%s only with leaseEnforcementActive=%s',
    (enforceAfter, leaseEnforcementActive) => {
      const observation = {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          enforceAfter,
          accountDeleteEnabled: false,
          leaseEnforcementActive,
          accountDeletionAvailable: false,
        },
      };

      expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
      expect(
        storageLifecycleObservation.safeParse({
          ...observation,
          rollout: {
            ...observation.rollout,
            leaseEnforcementActive: !leaseEnforcementActive,
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ] as const)(
    'accepts lease=%s and flag=%s only with accountDeletionAvailable=%s',
    (leaseEnforcementActive, accountDeleteEnabled, accountDeletionAvailable) => {
      const observation = {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          enforceAfter: leaseEnforcementActive
            ? '2026-08-08T07:59:00.000Z'
            : '2026-08-08T08:01:00.000Z',
          leaseEnforcementActive,
          accountDeleteEnabled,
          accountDeletionAvailable,
        },
      };

      expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
      expect(
        storageLifecycleObservation.safeParse({
          ...observation,
          rollout: {
            ...observation.rollout,
            accountDeletionAvailable: !accountDeletionAvailable,
          },
        }).success,
      ).toBe(false);
    },
  );

  it('accepts active enforcement with a null arming marker so inconsistency stays visible', () => {
    const observation = {
      ...storageLifecycleAvailableObservation,
      rollout: { ...storageLifecycleAvailableObservation.rollout, armedAt: null },
    };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  it('accepts the exact empty-queue correlations', () => {
    const observation = {
      ...storageLifecycleAvailableObservation,
      jobs: emptyStorageLifecycleJobs,
    };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['initial plus final below total', { initial: 5 }],
    ['initial plus final above total', { final: 5 }],
    ['initial greater than total', { initial: 11, final: 0 }],
  ] as const)('rejects %s', (_description, jobsOverride) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, ...jobsOverride },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['due and scheduled below total', { dueNow: 6 }],
    ['due and scheduled above total', { scheduled: 4 }],
    ['scheduled greater than total', { dueNow: 0, scheduled: 11 }],
  ] as const)('rejects %s', (_description, jobsOverride) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, ...jobsOverride },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['overlapping active and stale claims', { activeClaims: 4, staleClaims: 4 }],
    ['more retrying jobs than total', { retrying: 11 }],
  ] as const)('rejects %s', (_description, jobsOverride) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, ...jobsOverride },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['due work without oldestDueAt', { oldestDueAt: null }],
    ['oldestDueAt without due work', { dueNow: 0, scheduled: 10, activeClaims: 0, staleClaims: 0 }],
    ['scheduled work without nextRunAfter', { nextRunAfter: null }],
    ['nextRunAfter without scheduled work', { dueNow: 10, scheduled: 0 }],
  ] as const)('rejects %s', (_description, jobsOverride) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, ...jobsOverride },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['oldest due after observation', { oldestDueAt: '2026-08-08T08:00:00.001Z' }],
    ['next run equal to observation', { nextRunAfter: observedAt }],
    ['next run before observation', { nextRunAfter: '2026-08-08T07:59:59.999Z' }],
  ] as const)('rejects %s', (_description, jobsOverride) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, ...jobsOverride },
      }).success,
    ).toBe(false);
  });

  it('accepts oldest due equal to the observation database clock', () => {
    const observation = {
      ...storageLifecycleAvailableObservation,
      jobs: { ...storageLifecycleAvailableObservation.jobs, oldestDueAt: observedAt },
    };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  it('requires maxAttemptCount to be zero for an empty queue', () => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...emptyStorageLifecycleJobs, maxAttemptCount: 1 },
      }).success,
    ).toBe(false);
  });

  it('accepts zero maxAttemptCount for a non-empty queue', () => {
    const observation = {
      ...storageLifecycleAvailableObservation,
      jobs: { ...storageLifecycleAvailableObservation.jobs, maxAttemptCount: 0 },
    };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  const storageLifecycleCountFields = [
    'total',
    'initial',
    'final',
    'dueNow',
    'scheduled',
    'activeClaims',
    'staleClaims',
    'retrying',
    'maxAttemptCount',
  ] as const;
  const invalidStorageLifecycleCounts = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] as const;

  it.each(
    storageLifecycleCountFields.flatMap((field) =>
      invalidStorageLifecycleCounts.map((value) => [field, value] as const),
    ),
  )('rejects unsafe count %s=%s', (field, value) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, [field]: value },
      }).success,
    ).toBe(false);
  });

  it('accepts Number.MAX_SAFE_INTEGER in a fully correlated queue snapshot', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const observation = {
      ...storageLifecycleAvailableObservation,
      jobs: {
        total: maximum,
        initial: maximum,
        final: 0,
        dueNow: maximum,
        scheduled: 0,
        activeClaims: maximum,
        staleClaims: 0,
        retrying: maximum,
        maxAttemptCount: maximum,
        oldestDueAt: observedAt,
        nextRunAfter: null,
      },
    };

    expect(storageLifecycleObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['observedAt', { ...storageLifecycleAvailableObservation, observedAt: 'not-a-timestamp' }],
    [
      'unknown.observedAt',
      { ...storageLifecycleUnknownObservation, observedAt: 'not-a-timestamp' },
    ],
    [
      'rollout.armedAt',
      {
        ...storageLifecycleAvailableObservation,
        rollout: { ...storageLifecycleAvailableObservation.rollout, armedAt: 'not-a-timestamp' },
      },
    ],
    [
      'rollout.enforceAfter',
      {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          enforceAfter: 'not-a-timestamp',
        },
      },
    ],
    [
      'rollout.updatedAt',
      {
        ...storageLifecycleAvailableObservation,
        rollout: { ...storageLifecycleAvailableObservation.rollout, updatedAt: 'not-a-timestamp' },
      },
    ],
    [
      'jobs.oldestDueAt',
      {
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, oldestDueAt: 'not-a-timestamp' },
      },
    ],
    [
      'jobs.nextRunAfter',
      {
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, nextRunAfter: 'not-a-timestamp' },
      },
    ],
  ] as const)('rejects a non-finite ISO timestamp at %s', (_field, observation) => {
    expect(storageLifecycleObservation.safeParse(observation).success).toBe(false);
  });

  it.each([
    ['a null required observedAt', { ...storageLifecycleAvailableObservation, observedAt: null }],
    [
      'a null rollout updatedAt',
      {
        ...storageLifecycleAvailableObservation,
        rollout: { ...storageLifecycleAvailableObservation.rollout, updatedAt: null },
      },
    ],
    [
      'a string account-delete flag',
      {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          accountDeleteEnabled: 'true',
        },
      },
    ],
    [
      'a string lease-enforcement flag',
      {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          leaseEnforcementActive: 'true',
        },
      },
    ],
    [
      'a string availability gate',
      {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          accountDeletionAvailable: 'true',
        },
      },
    ],
    [
      'a string queue count',
      {
        ...storageLifecycleAvailableObservation,
        jobs: { ...storageLifecycleAvailableObservation.jobs, total: '10' },
      },
    ],
  ] as const)('rejects %s', (_description, observation) => {
    expect(storageLifecycleObservation.safeParse(observation).success).toBe(false);
  });

  it.each([
    ['a missing caveat', storageLifecycleCaveats.slice(0, 2)],
    [
      'reordered caveats',
      [storageLifecycleCaveats[1], storageLifecycleCaveats[0], storageLifecycleCaveats[2]],
    ],
    ['a duplicate caveat', [...storageLifecycleCaveats, storageLifecycleCaveats[0]]],
    ['an unreviewed caveat', [...storageLifecycleCaveats, 'worker_is_healthy']],
  ] as const)('rejects %s', (_description, caveats) => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleAvailableObservation,
        caveats,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'a raw SQL error',
      { ...storageLifecycleAvailableObservation, databaseError: 'password authentication failed' },
    ],
    ['a stack trace', { ...storageLifecycleUnknownObservation, stack: 'Error at private-db.ts:7' }],
    [
      'a raw provider message',
      { ...storageLifecycleUnknownObservation, message: 'Neon connection string rejected' },
    ],
    ['a user identifier', { ...storageLifecycleAvailableObservation, userId: 'usr_23456789' }],
    [
      'a project identifier',
      { ...storageLifecycleAvailableObservation, projectId: 'prj_23456789' },
    ],
    ['an R2 bucket', { ...storageLifecycleAvailableObservation, bucket: 'harpa-pro-secret' }],
    [
      'a Fly machine identifier',
      { ...storageLifecycleAvailableObservation, machineId: '5683abcd' },
    ],
    [
      'queue payloads',
      {
        ...storageLifecycleAvailableObservation,
        jobs: {
          ...storageLifecycleAvailableObservation.jobs,
          payload: { userId: 'usr_23456789', exactKeys: ['private/report.pdf'] },
        },
      },
    ],
    [
      'raw retry text',
      {
        ...storageLifecycleAvailableObservation,
        jobs: {
          ...storageLifecycleAvailableObservation.jobs,
          lastError: 'S3 token rejected for private/report.pdf',
        },
      },
    ],
    [
      'per-row lock data',
      {
        ...storageLifecycleAvailableObservation,
        jobs: {
          ...storageLifecycleAvailableObservation.jobs,
          lockedAt: '2026-08-08T07:58:00.000Z',
        },
      },
    ],
    [
      'rollout SQL details',
      {
        ...storageLifecycleAvailableObservation,
        rollout: {
          ...storageLifecycleAvailableObservation.rollout,
          rawRow: { account_delete_enabled: true },
        },
      },
    ],
  ] as const)('rejects leaked %s', (_description, observation) => {
    expect(storageLifecycleObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects an arbitrary secret-bearing unknown reason', () => {
    expect(
      storageLifecycleObservation.safeParse({
        ...storageLifecycleUnknownObservation,
        reason: 'password authentication failed for postgresql://secret@private',
      }).success,
    ).toBe(false);
  });
});

const flyMachine = {
  id: 'machine-api-01',
  name: 'api-machine-01',
  state: 'started',
  processGroup: 'app',
  region: 'sin',
  cpuKind: 'shared',
  cpus: 2,
  memoryMb: 512,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-08T07:55:00.000Z',
};

const flyVolume = {
  id: 'vol-storage-01',
  name: 'storage_data',
  state: 'created',
  sizeGb: 10,
  region: 'sin',
  encrypted: true,
  attachedMachineId: 'machine-storage-01',
  createdAt: '2026-08-01T08:00:00.000Z',
  snapshotRetentionDays: 5,
  autoBackupEnabled: true,
};

const flyApp = {
  id: 'harpa-pro-api',
  name: 'harpa-pro-api',
  status: 'deployed',
  network: 'default',
  reportedMachineCount: 1,
  reportedVolumeCount: 1,
  machines: {
    status: 'available',
    truncated: false,
    items: [flyMachine],
  },
  volumes: {
    status: 'available',
    truncated: false,
    returnedAllocatedGb: 10,
    items: [flyVolume],
  },
};

const flyAvailableObservation = {
  observedAt,
  status: 'available',
  organizationSlug: 'harpa-pro',
  configuredAppCount: 1,
  unavailableConfiguredAppCount: 0,
  apps: [flyApp],
};

const flyPartialObservation = {
  ...flyAvailableObservation,
  status: 'partial',
  apps: [
    {
      ...flyApp,
      volumes: { status: 'unknown', reason: 'timeout' },
    },
  ],
};

const flyUnknownObservation = {
  observedAt,
  status: 'unknown',
  reason: 'not_configured',
};

describe('admin operations Fly inventory schema', () => {
  it.each([
    ['available', flyAvailableObservation],
    ['partial', flyPartialObservation],
    ['unknown', flyUnknownObservation],
  ] as const)('accepts an exact %s observation', (_status, observation) => {
    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    'not_configured',
    'timeout',
    'rate_limited',
    'forbidden',
    'not_found',
    'invalid_response',
    'provider_unavailable',
  ] as const)('accepts the redacted unknown/%s reason', (reason) => {
    const observation = { ...flyUnknownObservation, reason };

    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it('rejects a reason outside the redacted enum at every unknown boundary', () => {
    const candidates = [
      { ...flyUnknownObservation, reason: 'private provider response body' },
      {
        ...flyPartialObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              status: 'unknown',
              reason: 'private provider response body',
            },
          },
        ],
      },
      {
        ...flyPartialObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              status: 'unknown',
              reason: 'private provider response body',
            },
          },
        ],
      },
    ];

    for (const candidate of candidates) {
      expect(operations.flyInventoryObservation.safeParse(candidate).success).toBe(false);
    }
  });

  it('accepts nullable reviewed app, Machine, and Volume fields', () => {
    const observation = {
      ...flyAvailableObservation,
      apps: [
        {
          ...flyApp,
          network: null,
          machines: {
            ...flyApp.machines,
            items: [{ ...flyMachine, processGroup: null }],
          },
          volumes: {
            ...flyApp.volumes,
            items: [
              {
                ...flyVolume,
                attachedMachineId: null,
                snapshotRetentionDays: null,
                autoBackupEnabled: null,
              },
            ],
          },
        },
      ],
    };

    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it('requires an explicit nullable process group on every Machine row', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              ...flyApp.machines,
              items: [{ ...flyMachine, processGroup: undefined }],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('does not correlate provider-reported counts with later detail snapshots', () => {
    const observation = {
      ...flyAvailableObservation,
      apps: [
        {
          ...flyApp,
          reportedMachineCount: 7,
          reportedVolumeCount: 0,
        },
      ],
    };

    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    [
      'an unavailable configured app',
      {
        ...flyAvailableObservation,
        configuredAppCount: 2,
        unavailableConfiguredAppCount: 1,
      },
    ],
    [
      'unknown Machine details',
      {
        ...flyAvailableObservation,
        apps: [{ ...flyApp, machines: { status: 'unknown', reason: 'timeout' } }],
      },
    ],
    [
      'unknown Volume details',
      {
        ...flyAvailableObservation,
        apps: [{ ...flyApp, volumes: { status: 'unknown', reason: 'timeout' } }],
      },
    ],
    [
      'truncated Machine details',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: { ...flyApp.machines, truncated: true },
          },
        ],
      },
    ],
    [
      'truncated Volume details',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: { ...flyApp.volumes, truncated: true },
          },
        ],
      },
    ],
  ] as const)('rejects available status with %s', (_description, observation) => {
    expect(operations.flyInventoryObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects partial status without an incompleteness signal', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        status: 'partial',
      }).success,
    ).toBe(false);
  });

  it('rejects partial status when every configured app is unavailable', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        status: 'partial',
        configuredAppCount: 1,
        unavailableConfiguredAppCount: 1,
        apps: [],
      }).success,
    ).toBe(false);
  });

  it.each([
    {
      configuredAppCount: 2,
      unavailableConfiguredAppCount: 1,
    },
    {
      apps: [{ ...flyApp, machines: { status: 'unknown', reason: 'rate_limited' } }],
    },
    {
      apps: [{ ...flyApp, volumes: { status: 'unknown', reason: 'forbidden' } }],
    },
    {
      apps: [
        {
          ...flyApp,
          machines: { ...flyApp.machines, truncated: true },
        },
      ],
    },
    {
      apps: [
        {
          ...flyApp,
          volumes: { ...flyApp.volumes, truncated: true },
        },
      ],
    },
  ] as const)('accepts partial status with a bounded incompleteness signal', (override) => {
    const observation = {
      ...flyAvailableObservation,
      status: 'partial',
      ...override,
    };

    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 0],
  ] as const)(
    'rejects app-count correlation configuredAppCount=%s unavailableConfiguredAppCount=%s',
    (configuredAppCount, unavailableConfiguredAppCount) => {
      expect(
        operations.flyInventoryObservation.safeParse({
          ...flyAvailableObservation,
          status: 'partial',
          configuredAppCount,
          unavailableConfiguredAppCount,
        }).success,
      ).toBe(false);
    },
  );

  it('enforces the ten-app observation bound', () => {
    const appsAtLimit = Array.from({ length: 10 }, (_, index) => ({
      ...flyApp,
      id: `harpa-pro-api-${index}`,
      name: `harpa-pro-api-${index}`,
    }));
    const observationAtLimit = {
      ...flyAvailableObservation,
      configuredAppCount: 10,
      apps: appsAtLimit,
    };

    expect(operations.flyInventoryObservation.parse(observationAtLimit)).toStrictEqual(
      observationAtLimit,
    );
    expect(
      operations.flyInventoryObservation.safeParse({
        ...observationAtLimit,
        configuredAppCount: 11,
        apps: [...appsAtLimit, flyApp],
      }).success,
    ).toBe(false);
  });

  it('rejects zero or more than ten configured apps even when app-count correlation holds', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        configuredAppCount: 0,
        apps: [],
      }).success,
    ).toBe(false);
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        status: 'partial',
        configuredAppCount: 11,
        unavailableConfiguredAppCount: 11,
        apps: [],
      }).success,
    ).toBe(false);
  });

  it.each(['machines', 'volumes'] as const)(
    'enforces the 50-row bound for available %s',
    (field) => {
      const itemsAtLimit = Array.from({ length: 50 }, (_, index) =>
        field === 'machines'
          ? { ...flyMachine, id: `machine-${index}`, name: `machine-${index}` }
          : { ...flyVolume, id: `volume-${index}`, name: `volume-${index}`, sizeGb: 1 },
      );
      const detail =
        field === 'machines'
          ? { ...flyApp.machines, items: itemsAtLimit }
          : { ...flyApp.volumes, returnedAllocatedGb: 50, items: itemsAtLimit };
      const observationAtLimit = {
        ...flyAvailableObservation,
        apps: [{ ...flyApp, [field]: detail }],
      };

      expect(operations.flyInventoryObservation.parse(observationAtLimit)).toStrictEqual(
        observationAtLimit,
      );
      expect(
        operations.flyInventoryObservation.safeParse({
          ...flyAvailableObservation,
          status: 'partial',
          apps: [
            {
              ...flyApp,
              [field]: {
                ...detail,
                truncated: true,
                items: [
                  ...itemsAtLimit,
                  field === 'machines'
                    ? { ...flyMachine, id: 'machine-over-limit' }
                    : { ...flyVolume, id: 'volume-over-limit', sizeGb: 1 },
                ],
                ...(field === 'volumes' ? { returnedAllocatedGb: 51 } : {}),
              },
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it('accepts the exact safe sum of returned allocated Volume sizes', () => {
    const volumes = [
      { ...flyVolume, id: 'volume-4', sizeGb: 4 },
      { ...flyVolume, id: 'volume-6', sizeGb: 6 },
    ];
    const observation = {
      ...flyAvailableObservation,
      apps: [
        {
          ...flyApp,
          volumes: { ...flyApp.volumes, returnedAllocatedGb: 10, items: volumes },
        },
      ],
    };

    expect(operations.flyInventoryObservation.parse(observation)).toStrictEqual(observation);
  });

  it('rejects a returned allocated sum that does not equal the returned Volume rows', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: { ...flyApp.volumes, returnedAllocatedGb: 9 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects a Volume-size sum that overflows the safe-integer range', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              ...flyApp.volumes,
              returnedAllocatedGb: Number.MAX_SAFE_INTEGER,
              items: [
                { ...flyVolume, id: 'volume-max', sizeGb: Number.MAX_SAFE_INTEGER },
                { ...flyVolume, id: 'volume-overflow', sizeGb: 1 },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  const invalidSafeIntegers = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] as const;

  it.each(invalidSafeIntegers)('rejects unsafe top-level and app counts (%s)', (value) => {
    const candidates = [
      { ...flyAvailableObservation, configuredAppCount: value },
      { ...flyAvailableObservation, unavailableConfiguredAppCount: value },
      {
        ...flyAvailableObservation,
        apps: [{ ...flyApp, reportedMachineCount: value }],
      },
      {
        ...flyAvailableObservation,
        apps: [{ ...flyApp, reportedVolumeCount: value }],
      },
    ];

    for (const candidate of candidates) {
      expect(operations.flyInventoryObservation.safeParse(candidate).success).toBe(false);
    }
  });

  it.each(invalidSafeIntegers)(
    'rejects unsafe Machine and Volume sizes or counts (%s)',
    (value) => {
      const candidates = [
        {
          ...flyAvailableObservation,
          apps: [
            {
              ...flyApp,
              machines: { ...flyApp.machines, items: [{ ...flyMachine, cpus: value }] },
            },
          ],
        },
        {
          ...flyAvailableObservation,
          apps: [
            {
              ...flyApp,
              machines: { ...flyApp.machines, items: [{ ...flyMachine, memoryMb: value }] },
            },
          ],
        },
        {
          ...flyAvailableObservation,
          apps: [
            {
              ...flyApp,
              volumes: {
                ...flyApp.volumes,
                returnedAllocatedGb: value,
                items: [{ ...flyVolume, sizeGb: value }],
              },
            },
          ],
        },
        {
          ...flyAvailableObservation,
          apps: [
            {
              ...flyApp,
              volumes: {
                ...flyApp.volumes,
                items: [{ ...flyVolume, snapshotRetentionDays: value }],
              },
            },
          ],
        },
      ];

      for (const candidate of candidates) {
        expect(operations.flyInventoryObservation.safeParse(candidate).success).toBe(false);
      }
    },
  );

  it.each(['', 'Web', 'worker_group', '-worker', 'worker-', 'worker group', 'a'.repeat(64)])(
    'rejects malformed Machine process group %s',
    (processGroup) => {
      expect(
        operations.flyInventoryObservation.safeParse({
          ...flyAvailableObservation,
          apps: [
            {
              ...flyApp,
              machines: {
                ...flyApp.machines,
                items: [{ ...flyMachine, processGroup }],
              },
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['top-level token', { ...flyAvailableObservation, apiToken: 'fly-secret' }],
    ['raw provider response', { ...flyAvailableObservation, rawProviderResponse: {} }],
    [
      'provider response headers',
      { ...flyAvailableObservation, providerHeaders: { authorization: 'Bearer fly-secret' } },
    ],
    [
      'unknown provider error text',
      { ...flyUnknownObservation, providerMessage: 'token rejected for private organization' },
    ],
    [
      'Machine private IP',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              ...flyApp.machines,
              items: [{ ...flyMachine, privateIp: 'fdaa:0:1::2' }],
            },
          },
        ],
      },
    ],
    [
      'Machine instance ID',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: { ...flyApp.machines, items: [{ ...flyMachine, instanceId: 'secret' }] },
          },
        ],
      },
    ],
    [
      'unreviewed Machine metadata',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              ...flyApp.machines,
              items: [{ ...flyMachine, metadata: { secret: 'private' } }],
            },
          },
        ],
      },
    ],
    [
      'raw Machine config',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              ...flyApp.machines,
              items: [{ ...flyMachine, config: { env: { TOKEN: 'secret' } } }],
            },
          },
        ],
      },
    ],
    [
      'Machine image reference',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: {
              ...flyApp.machines,
              items: [{ ...flyMachine, imageRef: { digest: 'sha256:secret' } }],
            },
          },
        ],
      },
    ],
    [
      'Machine events',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            machines: { ...flyApp.machines, items: [{ ...flyMachine, events: [] }] },
          },
        ],
      },
    ],
    [
      'Volume zone',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: { ...flyApp.volumes, items: [{ ...flyVolume, zone: 'sin-1' }] },
          },
        ],
      },
    ],
    [
      'Volume allocation ID',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              ...flyApp.volumes,
              items: [{ ...flyVolume, allocationId: 'allocation-secret' }],
            },
          },
        ],
      },
    ],
    [
      'Volume host-dedication key',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              ...flyApp.volumes,
              items: [{ ...flyVolume, hostDedicationKey: 'host-secret' }],
            },
          },
        ],
      },
    ],
    [
      'Volume block counters',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              ...flyApp.volumes,
              items: [{ ...flyVolume, blocksFree: 100, blocksAvailable: 90 }],
            },
          },
        ],
      },
    ],
    [
      'Volume filesystem type',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: { ...flyApp.volumes, items: [{ ...flyVolume, fstype: 'ext4' }] },
          },
        ],
      },
    ],
    [
      'Volume snapshot contents',
      {
        ...flyAvailableObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              ...flyApp.volumes,
              items: [{ ...flyVolume, snapshots: [{ id: 'snapshot-secret' }] }],
            },
          },
        ],
      },
    ],
    [
      'nested provider error text',
      {
        ...flyPartialObservation,
        apps: [
          {
            ...flyApp,
            volumes: {
              status: 'unknown',
              reason: 'provider_unavailable',
              providerMessage: 'private Fly response body',
            },
          },
        ],
      },
    ],
  ] as const)('rejects leaked %s', (_description, observation) => {
    expect(operations.flyInventoryObservation.safeParse(observation).success).toBe(false);
  });

  it('rejects unknown observations that retain provider inventory', () => {
    expect(
      operations.flyInventoryObservation.safeParse({
        ...flyUnknownObservation,
        organizationSlug: 'harpa-pro',
        configuredAppCount: 1,
        unavailableConfiguredAppCount: 0,
        apps: [flyApp],
      }).success,
    ).toBe(false);
  });
});

const zeroAiCallOutcome = {
  succeeded: 0,
  failed: 0,
  total: 0,
};

const zeroSuccessfulProviderUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  inputSeconds: 0,
};

const zeroAiOperationUsage = {
  liveSucceeded: 0,
  liveFailed: 0,
  recordSucceeded: 0,
  recordFailed: 0,
  replaySucceeded: 0,
  replayFailed: 0,
};

const aiUsageMonthToDate = {
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: observedAt,
  recordedEventCount: 10,
  calls: {
    live: { succeeded: 4, failed: 2, total: 6 },
    record: { succeeded: 2, failed: 0, total: 2 },
    replay: { succeeded: 1, failed: 1, total: 2 },
  },
  successfulProviderUsage: {
    inputTokens: 2_050,
    outputTokens: 570,
    cachedTokens: 270,
    inputSeconds: 45.125,
  },
  operations: {
    chat: {
      liveSucceeded: 2,
      liveFailed: 1,
      recordSucceeded: 0,
      recordFailed: 0,
      replaySucceeded: 1,
      replayFailed: 0,
    },
    generateReport: {
      liveSucceeded: 1,
      liveFailed: 0,
      recordSucceeded: 2,
      recordFailed: 0,
      replaySucceeded: 0,
      replayFailed: 1,
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
      provider: 'openai',
      recordedEventCount: 4,
      calls: {
        live: { succeeded: 2, failed: 1, total: 3 },
        record: { succeeded: 1, failed: 0, total: 1 },
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        inputTokens: 1_500,
        outputTokens: 400,
        cachedTokens: 200,
        inputSeconds: 0,
      },
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    },
    {
      provider: 'groq',
      recordedEventCount: 3,
      calls: {
        live: { succeeded: 1, failed: 1, total: 2 },
        record: zeroAiCallOutcome,
        replay: { succeeded: 1, failed: 0, total: 1 },
      },
      successfulProviderUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        inputSeconds: 45.125,
      },
      lastRecordedAt: '2026-08-08T07:40:00.000Z',
    },
    {
      provider: 'kimi',
      recordedEventCount: 2,
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: zeroAiCallOutcome,
        replay: { succeeded: 0, failed: 1, total: 1 },
      },
      successfulProviderUsage: {
        inputTokens: 300,
        outputTokens: 100,
        cachedTokens: 20,
        inputSeconds: 0,
      },
      lastRecordedAt: '2026-08-08T07:30:00.000Z',
    },
    {
      provider: 'other',
      recordedEventCount: 1,
      calls: {
        live: zeroAiCallOutcome,
        record: { succeeded: 1, failed: 0, total: 1 },
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        inputTokens: 250,
        outputTokens: 70,
        cachedTokens: 50,
        inputSeconds: 0,
      },
      lastRecordedAt: '2026-08-08T06:00:00.000Z',
    },
  ],
  unclassifiedVendorEventCount: 1,
  missingInputSecondsEventCount: 0,
  lastRecordedAt: '2026-08-08T07:50:00.000Z',
  warnings: ['unclassified_vendor_events'],
};

const aiUsageLast24Hours = {
  windowStart: '2026-08-07T08:00:00.000Z',
  windowEnd: observedAt,
  recordedEventCount: 4,
  calls: {
    live: { succeeded: 1, failed: 1, total: 2 },
    record: { succeeded: 1, failed: 0, total: 1 },
    replay: { succeeded: 1, failed: 0, total: 1 },
  },
  successfulProviderUsage: {
    inputTokens: 650,
    outputTokens: 170,
    cachedTokens: 80,
    inputSeconds: 0,
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
      recordSucceeded: 1,
      recordFailed: 0,
      replaySucceeded: 0,
      replayFailed: 0,
    },
    transcribe: {
      liveSucceeded: 0,
      liveFailed: 1,
      recordSucceeded: 0,
      recordFailed: 0,
      replaySucceeded: 0,
      replayFailed: 0,
    },
  },
  providers: [
    {
      provider: 'openai',
      recordedEventCount: 2,
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: zeroAiCallOutcome,
        replay: { succeeded: 1, failed: 0, total: 1 },
      },
      successfulProviderUsage: {
        inputTokens: 400,
        outputTokens: 100,
        cachedTokens: 50,
        inputSeconds: 0,
      },
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    },
    {
      provider: 'groq',
      recordedEventCount: 1,
      calls: {
        live: { succeeded: 0, failed: 1, total: 1 },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: zeroSuccessfulProviderUsage,
      lastRecordedAt: '2026-08-08T07:40:00.000Z',
    },
    {
      provider: 'kimi',
      recordedEventCount: 1,
      calls: {
        live: zeroAiCallOutcome,
        record: { succeeded: 1, failed: 0, total: 1 },
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        inputTokens: 250,
        outputTokens: 70,
        cachedTokens: 30,
        inputSeconds: 0,
      },
      lastRecordedAt: '2026-08-08T07:30:00.000Z',
    },
  ],
  unclassifiedVendorEventCount: 0,
  missingInputSecondsEventCount: 0,
  lastRecordedAt: '2026-08-08T07:50:00.000Z',
  warnings: [],
};

const aiUsageOpenaiProvider = aiUsageMonthToDate.providers[0]!;
const aiUsageGroqProvider = aiUsageMonthToDate.providers[1]!;
const aiUsageOtherProvider = aiUsageMonthToDate.providers[3]!;

const aiUsageProviderCapacity = {
  openai: { status: 'unknown', reason: 'not_observed' },
  groq: { status: 'unknown', reason: 'not_observed' },
  kimi: { status: 'unknown', reason: 'not_observed' },
};

const aiUsageCaveats = [
  'best_effort_ledger',
  'not_provider_billing',
  'replay_not_provider_usage',
  'record_mode_calls_provider',
  'deleted_history_excluded',
];

const aiUsageAvailableObservation = {
  observedAt,
  status: 'available',
  source: 'harpa_usage_ledger',
  monthToDate: aiUsageMonthToDate,
  last24Hours: aiUsageLast24Hours,
  providerCapacity: aiUsageProviderCapacity,
  caveats: aiUsageCaveats,
};

const emptyAiUsageWindow = {
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: observedAt,
  recordedEventCount: 0,
  calls: {
    live: zeroAiCallOutcome,
    record: zeroAiCallOutcome,
    replay: zeroAiCallOutcome,
  },
  successfulProviderUsage: zeroSuccessfulProviderUsage,
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

const unknownAiUsageObservation = {
  observedAt,
  status: 'unknown',
  reason: 'database_unavailable',
};

describe('admin operations AI usage observation schema', () => {
  it('accepts an exact available Harpa-ledger observation', () => {
    expect(operations.aiUsageObservation.parse(aiUsageAvailableObservation)).toStrictEqual(
      aiUsageAvailableObservation,
    );
  });

  it('accepts an available observation with two empty windows', () => {
    const observation = {
      ...aiUsageAvailableObservation,
      monthToDate: emptyAiUsageWindow,
      last24Hours: {
        ...emptyAiUsageWindow,
        windowStart: '2026-08-07T08:00:00.000Z',
      },
    };

    expect(operations.aiUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each(['schema_unavailable', 'database_unavailable', 'timeout', 'invalid_response'] as const)(
    'accepts the redacted unknown/%s state',
    (reason) => {
      const observation = { ...unknownAiUsageObservation, reason };

      expect(operations.aiUsageObservation.parse(observation)).toStrictEqual(observation);
    },
  );

  it('accepts exact warning evidence for incomplete transcription duration', () => {
    const provider = {
      provider: 'other',
      recordedEventCount: 2,
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: { succeeded: 1, failed: 0, total: 1 },
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        ...zeroSuccessfulProviderUsage,
        inputSeconds: 1.234,
      },
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    };
    const observation = {
      ...aiUsageAvailableObservation,
      monthToDate: {
        ...emptyAiUsageWindow,
        recordedEventCount: 2,
        calls: provider.calls,
        successfulProviderUsage: provider.successfulProviderUsage,
        operations: {
          ...emptyAiUsageWindow.operations,
          transcribe: {
            ...zeroAiOperationUsage,
            liveSucceeded: 1,
            recordSucceeded: 1,
          },
        },
        providers: [provider],
        unclassifiedVendorEventCount: 2,
        missingInputSecondsEventCount: 1,
        lastRecordedAt: provider.lastRecordedAt,
        warnings: ['missing_transcription_duration', 'unclassified_vendor_events'],
      },
    };

    expect(operations.aiUsageObservation.parse(observation)).toStrictEqual(observation);
  });

  it.each([
    ['an arbitrary unknown reason', { ...unknownAiUsageObservation, reason: 'raw SQL error' }],
    [
      'unknown state with retained ledger details',
      { ...unknownAiUsageObservation, monthToDate: aiUsageMonthToDate },
    ],
    [
      'unknown state with provider capacity details',
      { ...unknownAiUsageObservation, providerCapacity: aiUsageProviderCapacity },
    ],
    ['an unsupported source', { ...aiUsageAvailableObservation, source: 'openai_billing_api' }],
    ['an unsupported status', { ...aiUsageAvailableObservation, status: 'partial' }],
  ] as const)('rejects %s', (_description, observation) => {
    expect(operations.aiUsageObservation.safeParse(observation).success).toBe(false);
  });

  it('requires the fixed five caveats in their reviewed tuple order', () => {
    const invalidCaveats = [
      aiUsageCaveats.slice(1),
      [...aiUsageCaveats, 'provider_dashboard_may_disagree'],
      [...aiUsageCaveats, aiUsageCaveats[0]],
      [aiUsageCaveats[1], aiUsageCaveats[0], ...aiUsageCaveats.slice(2)],
    ];
    for (const caveats of invalidCaveats) {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          caveats,
        }).success,
      ).toBe(false);
    }
  });

  it('keeps all provider-capacity claims fixed at Unknown/not-observed', () => {
    const invalidCapacity = [
      {
        ...aiUsageProviderCapacity,
        openai: { status: 'available', reason: 'not_observed' },
      },
      {
        ...aiUsageProviderCapacity,
        groq: { status: 'unknown', reason: 'billing_api_unavailable' },
      },
      {
        ...aiUsageProviderCapacity,
        kimi: { ...aiUsageProviderCapacity.kimi, remainingCredits: 100 },
      },
      {
        ...aiUsageProviderCapacity,
        anthropic: { status: 'unknown', reason: 'not_observed' },
      },
    ];

    for (const providerCapacity of invalidCapacity) {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          providerCapacity,
        }).success,
      ).toBe(false);
    }

    const { kimi, ...missingKimi } = aiUsageProviderCapacity;
    expect(kimi).toStrictEqual({ status: 'unknown', reason: 'not_observed' });
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        providerCapacity: missingKimi,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['live', 0, 'chat', 'failed'],
    ['record', 0, 'chat', 'failed'],
    ['replay', 1, 'chat', 'succeeded'],
  ] as const)(
    'rejects inconsistent %s succeeded/failed totals at overall and provider levels',
    (mode, providerIndex, operation, outcome) => {
      const operationField = `${mode}${outcome === 'succeeded' ? 'Succeeded' : 'Failed'}` as const;
      const provider = aiUsageMonthToDate.providers[providerIndex]!;
      const monthToDate = {
        ...aiUsageMonthToDate,
        calls: {
          ...aiUsageMonthToDate.calls,
          [mode]: {
            ...aiUsageMonthToDate.calls[mode],
            [outcome]: aiUsageMonthToDate.calls[mode][outcome] + 1,
          },
        },
        operations: {
          ...aiUsageMonthToDate.operations,
          [operation]: {
            ...aiUsageMonthToDate.operations[operation],
            [operationField]: aiUsageMonthToDate.operations[operation][operationField] + 1,
          },
        },
        providers: aiUsageMonthToDate.providers.map((candidate, index) =>
          index === providerIndex
            ? {
                ...provider,
                calls: {
                  ...provider.calls,
                  [mode]: {
                    ...provider.calls[mode],
                    [outcome]: provider.calls[mode][outcome] + 1,
                  },
                },
              }
            : candidate,
        ),
      };

      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate,
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['overall', { ...aiUsageMonthToDate, recordedEventCount: 11 }],
    [
      'provider',
      {
        ...aiUsageMonthToDate,
        providers: [
          { ...aiUsageOpenaiProvider, recordedEventCount: 5 },
          ...aiUsageMonthToDate.providers.slice(1),
        ],
      },
    ],
  ] as const)('rejects an inconsistent %s recorded-event total', (_level, monthToDate) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      'successful calls',
      {
        ...aiUsageOpenaiProvider,
        calls: {
          ...aiUsageOpenaiProvider.calls,
          live: { succeeded: 1, failed: 1, total: 2 },
          record: { succeeded: 2, failed: 0, total: 2 },
        },
      },
    ],
    [
      'failed calls',
      {
        ...aiUsageOpenaiProvider,
        calls: {
          ...aiUsageOpenaiProvider.calls,
          live: { succeeded: 2, failed: 0, total: 2 },
          replay: { succeeded: 0, failed: 1, total: 1 },
        },
      },
    ],
  ] as const)(
    'rejects a provider mode distribution whose %s do not sum to overall calls',
    (_description, provider) => {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate: {
            ...aiUsageMonthToDate,
            providers: [provider, ...aiUsageMonthToDate.providers.slice(1)],
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['inputTokens', 2_051],
    ['outputTokens', 571],
    ['cachedTokens', 271],
    ['inputSeconds', 45.126],
  ] as const)('rejects a provider-to-overall %s sum mismatch', (field, value) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          successfulProviderUsage: {
            ...aiUsageMonthToDate.successfulProviderUsage,
            [field]: value,
          },
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['chat', 'liveSucceeded'],
    ['chat', 'liveFailed'],
    ['generateReport', 'recordSucceeded'],
    ['chat', 'recordFailed'],
    ['chat', 'replaySucceeded'],
    ['generateReport', 'replayFailed'],
  ] as const)('rejects an operation %s/%s sum mismatch', (operation, field) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          operations: {
            ...aiUsageMonthToDate.operations,
            [operation]: {
              ...aiUsageMonthToDate.operations[operation],
              [field]: aiUsageMonthToDate.operations[operation][field] + 1,
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it.each([0, 2] as const)(
    'requires the unclassified-vendor count (%s) to equal other-provider events',
    (unclassifiedVendorEventCount) => {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate: {
            ...aiUsageMonthToDate,
            unclassifiedVendorEventCount,
            warnings: unclassifiedVendorEventCount === 0 ? [] : ['unclassified_vendor_events'],
          },
        }).success,
      ).toBe(false);
    },
  );

  it('bounds missing-duration evidence by successful provider transcriptions', () => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          missingInputSecondsEventCount: 2,
          warnings: ['unclassified_vendor_events', 'missing_transcription_duration'],
        },
      }).success,
    ).toBe(false);
  });

  it('requires cached tokens to be a subset of input tokens at both aggregation levels', () => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          successfulProviderUsage: {
            ...aiUsageMonthToDate.successfulProviderUsage,
            cachedTokens: aiUsageMonthToDate.successfulProviderUsage.inputTokens + 1,
          },
        },
      }).success,
    ).toBe(false);

    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [
            {
              ...aiUsageOpenaiProvider,
              successfulProviderUsage: {
                ...aiUsageOpenaiProvider.successfulProviderUsage,
                cachedTokens: aiUsageOpenaiProvider.successfulProviderUsage.inputTokens + 1,
              },
            },
            ...aiUsageMonthToDate.providers.slice(1),
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts replay-only activity but rejects provider usage attributed to it', () => {
    const replayProvider = {
      provider: 'openai',
      recordedEventCount: 1,
      calls: {
        live: zeroAiCallOutcome,
        record: zeroAiCallOutcome,
        replay: { succeeded: 1, failed: 0, total: 1 },
      },
      successfulProviderUsage: zeroSuccessfulProviderUsage,
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    };
    const replayOnlyWindow = {
      ...emptyAiUsageWindow,
      recordedEventCount: 1,
      calls: replayProvider.calls,
      operations: {
        ...emptyAiUsageWindow.operations,
        chat: { ...zeroAiOperationUsage, replaySucceeded: 1 },
      },
      providers: [replayProvider],
      lastRecordedAt: replayProvider.lastRecordedAt,
    };

    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: replayOnlyWindow,
      }).success,
    ).toBe(true);

    const impossibleUsage = {
      inputTokens: 1,
      outputTokens: 0,
      cachedTokens: 0,
      inputSeconds: 0,
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...replayOnlyWindow,
          successfulProviderUsage: impossibleUsage,
          providers: [{ ...replayProvider, successfulProviderUsage: impossibleUsage }],
        },
      }).success,
    ).toBe(false);
  });

  it('enforces token and duration semantics against successful provider operations', () => {
    const failedProvider = {
      provider: 'openai',
      recordedEventCount: 1,
      calls: {
        live: { succeeded: 0, failed: 1, total: 1 },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: zeroSuccessfulProviderUsage,
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    };
    const failedOnlyWindow = {
      ...emptyAiUsageWindow,
      recordedEventCount: 1,
      calls: failedProvider.calls,
      operations: {
        ...emptyAiUsageWindow.operations,
        chat: { ...zeroAiOperationUsage, liveFailed: 1 },
      },
      providers: [failedProvider],
      lastRecordedAt: failedProvider.lastRecordedAt,
    };
    const impossibleFailedUsage = {
      inputTokens: 1,
      outputTokens: 0,
      cachedTokens: 0,
      inputSeconds: 0,
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...failedOnlyWindow,
          successfulProviderUsage: impossibleFailedUsage,
          providers: [{ ...failedProvider, successfulProviderUsage: impossibleFailedUsage }],
        },
      }).success,
    ).toBe(false);

    const transcribeUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      inputSeconds: 1.234,
    };
    const transcribeProvider = {
      ...failedProvider,
      provider: 'groq',
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: transcribeUsage,
    };
    const transcribeWindow = {
      ...failedOnlyWindow,
      calls: transcribeProvider.calls,
      successfulProviderUsage: transcribeUsage,
      operations: {
        ...emptyAiUsageWindow.operations,
        transcribe: { ...zeroAiOperationUsage, liveSucceeded: 1 },
      },
      providers: [transcribeProvider],
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: transcribeWindow,
      }).success,
    ).toBe(true);

    const allDurationMissingWindow = {
      ...transcribeWindow,
      successfulProviderUsage: zeroSuccessfulProviderUsage,
      providers: [
        {
          ...transcribeProvider,
          successfulProviderUsage: zeroSuccessfulProviderUsage,
        },
      ],
      missingInputSecondsEventCount: 1,
      warnings: ['missing_transcription_duration'],
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: allDurationMissingWindow,
      }).success,
    ).toBe(true);
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...allDurationMissingWindow,
          successfulProviderUsage: transcribeUsage,
          providers: [transcribeProvider],
        },
      }).success,
    ).toBe(false);

    const impossibleTranscribeTokens = {
      ...transcribeUsage,
      inputTokens: 1,
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...transcribeWindow,
          successfulProviderUsage: impossibleTranscribeTokens,
          providers: [
            {
              ...transcribeProvider,
              successfulProviderUsage: impossibleTranscribeTokens,
            },
          ],
        },
      }).success,
    ).toBe(false);

    const chatUsage = {
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      inputSeconds: 0,
    };
    const chatProvider = {
      ...failedProvider,
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: chatUsage,
    };
    const chatWindow = {
      ...failedOnlyWindow,
      calls: chatProvider.calls,
      successfulProviderUsage: chatUsage,
      operations: {
        ...emptyAiUsageWindow.operations,
        chat: { ...zeroAiOperationUsage, liveSucceeded: 1 },
      },
      providers: [chatProvider],
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...chatWindow,
          successfulProviderUsage: { ...chatUsage, inputSeconds: 1 },
          providers: [
            {
              ...chatProvider,
              successfulProviderUsage: { ...chatUsage, inputSeconds: 1 },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...chatWindow,
          missingInputSecondsEventCount: 1,
          warnings: ['missing_transcription_duration'],
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['missing unclassified warning', 1, []],
    ['spurious unclassified warning', 0, ['unclassified_vendor_events']],
    ['missing duration warning', 1, ['unclassified_vendor_events']],
    [
      'spurious duration warning',
      0,
      ['unclassified_vendor_events', 'missing_transcription_duration'],
    ],
  ] as const)('rejects %s', (description, evidenceCount, warnings) => {
    const monthToDate = description.includes('duration')
      ? {
          ...aiUsageMonthToDate,
          missingInputSecondsEventCount: evidenceCount,
          warnings,
        }
      : {
          ...aiUsageMonthToDate,
          unclassifiedVendorEventCount: evidenceCount,
          warnings,
        };

    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['duplicate warnings', ['unclassified_vendor_events', 'unclassified_vendor_events']],
    ['an unreviewed warning', ['unclassified_vendor_events', 'provider_rate_limited']],
  ] as const)('rejects %s', (_description, warnings) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: { ...aiUsageMonthToDate, warnings },
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate, empty, and unreviewed provider rows', () => {
    const duplicateProvider = {
      ...aiUsageOtherProvider,
      provider: 'openai',
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [...aiUsageMonthToDate.providers.slice(0, 3), duplicateProvider],
          unclassifiedVendorEventCount: 0,
          warnings: [],
        },
      }).success,
    ).toBe(false);

    const emptyProvider = {
      ...aiUsageOpenaiProvider,
      recordedEventCount: 0,
      calls: {
        live: zeroAiCallOutcome,
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: zeroSuccessfulProviderUsage,
    };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...emptyAiUsageWindow,
          providers: [emptyProvider],
        },
      }).success,
    ).toBe(false);

    const unreviewedProvider = { ...aiUsageOtherProvider, provider: 'anthropic' };
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [...aiUsageMonthToDate.providers.slice(0, 3), unreviewedProvider],
          unclassifiedVendorEventCount: 0,
          warnings: [],
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['monthToDate', aiUsageMonthToDate],
    ['last24Hours', aiUsageLast24Hours],
  ] as const)('rejects invalid %s timestamp correlations', (field, window) => {
    const beforeWindow = new Date(Date.parse(window.windowStart) - 1).toISOString();
    const invalidWindows = [
      { ...window, windowEnd: '2026-08-08T07:59:59.999Z' },
      { ...window, lastRecordedAt: null },
      { ...window, lastRecordedAt: window.windowEnd },
      { ...window, lastRecordedAt: '2026-08-08T07:40:00.000Z' },
      {
        ...window,
        providers: [
          { ...window.providers[0]!, lastRecordedAt: beforeWindow },
          ...window.providers.slice(1),
        ],
      },
      {
        ...window,
        providers: [
          { ...window.providers[0]!, lastRecordedAt: window.windowEnd },
          ...window.providers.slice(1),
        ],
      },
    ];

    for (const invalidWindow of invalidWindows) {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          [field]: invalidWindow,
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    [
      'month-to-date',
      'monthToDate',
      { ...aiUsageMonthToDate, windowStart: '2026-08-01T00:00:00.001Z' },
    ],
    [
      'last-24-hour',
      'last24Hours',
      { ...aiUsageLast24Hours, windowStart: '2026-08-07T08:00:00.001Z' },
    ],
  ] as const)('requires the exact %s window start', (_description, field, window) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        [field]: window,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['monthToDate', aiUsageMonthToDate],
    ['last24Hours', aiUsageLast24Hours],
  ] as const)('accepts %s last-recorded times at the inclusive lower bound', (field, window) => {
    const boundaryWindow = {
      ...window,
      providers: [
        { ...window.providers[0]!, lastRecordedAt: window.windowStart },
        ...window.providers.slice(1),
      ],
      lastRecordedAt: '2026-08-08T07:40:00.000Z',
    };

    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        [field]: boundaryWindow,
      }).success,
    ).toBe(true);
  });

  it.each(['monthToDate', 'last24Hours'] as const)(
    'requires an empty %s window to have null last-recorded time',
    (field) => {
      const windowStart =
        field === 'monthToDate' ? emptyAiUsageWindow.windowStart : '2026-08-07T08:00:00.000Z';
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          [field]: {
            ...emptyAiUsageWindow,
            windowStart,
            lastRecordedAt: '2026-08-08T07:00:00.000Z',
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['observedAt', { ...aiUsageAvailableObservation, observedAt: 'not-a-timestamp' }],
    [
      'window start',
      {
        ...aiUsageAvailableObservation,
        monthToDate: { ...aiUsageMonthToDate, windowStart: 'not-a-timestamp' },
      },
    ],
    [
      'window end',
      {
        ...aiUsageAvailableObservation,
        last24Hours: { ...aiUsageLast24Hours, windowEnd: null },
      },
    ],
    [
      'provider last-recorded time',
      {
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [
            { ...aiUsageOpenaiProvider, lastRecordedAt: 'not-a-timestamp' },
            ...aiUsageMonthToDate.providers.slice(1),
          ],
        },
      },
    ],
  ] as const)('rejects a malformed %s', (_description, observation) => {
    expect(operations.aiUsageObservation.safeParse(observation).success).toBe(false);
  });

  const unsafeCounts = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] as const;
  it.each(unsafeCounts)('rejects unsafe count and token values (%s)', (value) => {
    const candidates = [
      { ...aiUsageMonthToDate, recordedEventCount: value },
      {
        ...aiUsageMonthToDate,
        calls: {
          ...aiUsageMonthToDate.calls,
          live: { ...aiUsageMonthToDate.calls.live, succeeded: value },
        },
      },
      {
        ...aiUsageMonthToDate,
        successfulProviderUsage: {
          ...aiUsageMonthToDate.successfulProviderUsage,
          outputTokens: value,
        },
      },
      {
        ...aiUsageMonthToDate,
        operations: {
          ...aiUsageMonthToDate.operations,
          chat: { ...aiUsageMonthToDate.operations.chat, replaySucceeded: value },
        },
      },
      {
        ...aiUsageMonthToDate,
        providers: [
          { ...aiUsageOpenaiProvider, recordedEventCount: value },
          ...aiUsageMonthToDate.providers.slice(1),
        ],
      },
      {
        ...aiUsageMonthToDate,
        providers: [
          {
            ...aiUsageOpenaiProvider,
            calls: {
              ...aiUsageOpenaiProvider.calls,
              live: { ...aiUsageOpenaiProvider.calls.live, failed: value },
            },
          },
          ...aiUsageMonthToDate.providers.slice(1),
        ],
      },
      {
        ...aiUsageMonthToDate,
        providers: [
          {
            ...aiUsageOpenaiProvider,
            successfulProviderUsage: {
              ...aiUsageOpenaiProvider.successfulProviderUsage,
              inputTokens: value,
            },
          },
          ...aiUsageMonthToDate.providers.slice(1),
        ],
      },
      { ...aiUsageMonthToDate, unclassifiedVendorEventCount: value },
      { ...aiUsageMonthToDate, missingInputSecondsEventCount: value },
    ];

    for (const monthToDate of candidates) {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects unsafe arithmetic sums even when every count and token leaf is safe', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const maxProvider = {
      provider: 'openai',
      recordedEventCount: max,
      calls: {
        live: { succeeded: max, failed: 0, total: max },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: zeroSuccessfulProviderUsage,
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    };
    const maxWindow = {
      ...emptyAiUsageWindow,
      recordedEventCount: max,
      calls: maxProvider.calls,
      operations: {
        ...emptyAiUsageWindow.operations,
        chat: { ...zeroAiOperationUsage, liveSucceeded: max },
      },
      providers: [maxProvider],
      lastRecordedAt: maxProvider.lastRecordedAt,
    };
    const callOutcomeOverflow = {
      ...maxWindow,
      calls: {
        ...maxWindow.calls,
        live: { succeeded: max, failed: 1, total: max },
      },
      operations: {
        ...maxWindow.operations,
        transcribe: { ...zeroAiOperationUsage, liveFailed: 1 },
      },
      providers: [
        {
          ...maxProvider,
          calls: {
            ...maxProvider.calls,
            live: { succeeded: max, failed: 1, total: max },
          },
        },
      ],
    };
    const operationOverflow = {
      ...maxWindow,
      operations: {
        ...maxWindow.operations,
        transcribe: { ...zeroAiOperationUsage, liveSucceeded: 1 },
      },
    };

    const tokenProviders = [
      {
        provider: 'openai',
        recordedEventCount: 1,
        calls: {
          live: { succeeded: 1, failed: 0, total: 1 },
          record: zeroAiCallOutcome,
          replay: zeroAiCallOutcome,
        },
        successfulProviderUsage: {
          ...zeroSuccessfulProviderUsage,
          inputTokens: max,
        },
        lastRecordedAt: '2026-08-08T07:50:00.000Z',
      },
      {
        provider: 'kimi',
        recordedEventCount: 1,
        calls: {
          live: zeroAiCallOutcome,
          record: { succeeded: 1, failed: 0, total: 1 },
          replay: zeroAiCallOutcome,
        },
        successfulProviderUsage: {
          ...zeroSuccessfulProviderUsage,
          inputTokens: 1,
        },
        lastRecordedAt: '2026-08-08T07:40:00.000Z',
      },
    ];
    const providerTokenOverflow = {
      ...emptyAiUsageWindow,
      recordedEventCount: 2,
      calls: {
        live: { succeeded: 1, failed: 0, total: 1 },
        record: { succeeded: 1, failed: 0, total: 1 },
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        ...zeroSuccessfulProviderUsage,
        inputTokens: max,
      },
      operations: {
        ...emptyAiUsageWindow.operations,
        chat: { ...zeroAiOperationUsage, liveSucceeded: 1 },
        generateReport: { ...zeroAiOperationUsage, recordSucceeded: 1 },
      },
      providers: tokenProviders,
      lastRecordedAt: tokenProviders[0]!.lastRecordedAt,
    };

    for (const monthToDate of [callOutcomeOverflow, operationOverflow, providerTokenOverflow]) {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate,
        }).success,
      ).toBe(false);
    }
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.2345] as const)(
    'rejects an invalid successful input-seconds value (%s)',
    (inputSeconds) => {
      expect(
        operations.aiUsageObservation.safeParse({
          ...aiUsageAvailableObservation,
          monthToDate: {
            ...aiUsageMonthToDate,
            successfulProviderUsage: {
              ...aiUsageMonthToDate.successfulProviderUsage,
              inputSeconds,
            },
          },
        }).success,
      ).toBe(false);
    },
  );

  it('rejects provider input seconds with more than three decimal places', () => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [
            aiUsageOpenaiProvider,
            {
              ...aiUsageGroqProvider,
              successfulProviderUsage: {
                ...aiUsageGroqProvider.successfulProviderUsage,
                inputSeconds: 45.1251,
              },
            },
            ...aiUsageMonthToDate.providers.slice(2),
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts safe-integer and three-decimal upper boundaries when correlations hold', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const provider = {
      provider: 'openai',
      recordedEventCount: max,
      calls: {
        live: { succeeded: max, failed: 0, total: max },
        record: zeroAiCallOutcome,
        replay: zeroAiCallOutcome,
      },
      successfulProviderUsage: {
        inputTokens: max,
        outputTokens: max,
        cachedTokens: max,
        inputSeconds: 1.234,
      },
      lastRecordedAt: '2026-08-08T07:50:00.000Z',
    };
    const window = {
      ...aiUsageMonthToDate,
      recordedEventCount: max,
      calls: provider.calls,
      successfulProviderUsage: provider.successfulProviderUsage,
      operations: {
        chat: { ...zeroAiOperationUsage, liveSucceeded: max - 1 },
        generateReport: zeroAiOperationUsage,
        transcribe: { ...zeroAiOperationUsage, liveSucceeded: 1 },
      },
      providers: [provider],
      unclassifiedVendorEventCount: 0,
      lastRecordedAt: provider.lastRecordedAt,
      warnings: [],
    };

    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: window,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['user ID', { userId: 'usr_secret' }],
    ['email', { email: 'private@example.com' }],
    ['name', { name: 'Private User' }],
    ['plan assignment', { plan: 'pro' }],
    ['per-user limits', { perUserLimits: { reports: 10 } }],
    ['project ID', { projectId: 'prj_secret' }],
    ['report ID', { reportId: 'rpt_secret' }],
    ['request ID', { requestId: 'req_secret' }],
    ['prompt', { prompt: 'private report notes' }],
    ['transcript', { transcript: 'private voice transcript' }],
    ['notes', { notes: ['private note'] }],
    ['report body', { reportBody: 'private generated report' }],
    ['provider response', { providerResponse: { text: 'private output' } }],
    ['raw vendor', { rawVendor: 'private-provider-account' }],
    ['model', { model: 'private-fine-tune' }],
    ['provider error', { providerError: 'raw upstream error body' }],
    ['raw rows', { rows: [{ vendor: 'secret' }] }],
    ['SQL', { sql: 'select * from app.users' }],
  ] as const)('rejects leaked top-level %s', (_description, leakedField) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        ...leakedField,
      }).success,
    ).toBe(false);
  });

  it('rejects leaked database error text from an unknown observation', () => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...unknownAiUsageObservation,
        databaseMessage: 'password rejected for private host',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['user ID', { userId: 'usr_secret' }],
    ['project ID', { projectId: 'prj_secret' }],
    ['report ID', { reportId: 'rpt_secret' }],
    ['request ID', { requestId: 'req_secret' }],
    ['prompt', { prompt: 'private report notes' }],
    ['transcript', { transcript: 'private voice transcript' }],
    ['note', { note: 'private note' }],
    ['report body', { reportBody: 'private generated report' }],
    ['provider response', { response: 'private provider output' }],
    ['raw vendor label', { rawVendor: 'private-provider-account' }],
    ['model name', { model: 'private-fine-tune' }],
    ['provider error text', { error: 'raw upstream error body' }],
  ] as const)('rejects leaked provider-row %s', (_description, leakedField) => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          providers: [
            { ...aiUsageOpenaiProvider, ...leakedField },
            ...aiUsageMonthToDate.providers.slice(1),
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects counts grouped by customer from operation aggregates', () => {
    expect(
      operations.aiUsageObservation.safeParse({
        ...aiUsageAvailableObservation,
        monthToDate: {
          ...aiUsageMonthToDate,
          operations: {
            ...aiUsageMonthToDate.operations,
            chat: { ...aiUsageMonthToDate.operations.chat, userCount: 3 },
          },
        },
      }).success,
    ).toBe(false);
  });
});
