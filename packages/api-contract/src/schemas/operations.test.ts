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
