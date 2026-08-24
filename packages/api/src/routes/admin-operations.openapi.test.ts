import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_CSRF_HEADER } from '../lib/admin-csrf.js';
import { adminOperationsRoutes } from './admin-operations.js';

const SPEC_DOC_CONFIG = {
  openapi: '3.1.0' as const,
  info: { title: 'Harpa Pro API', version: '0.0.0' },
};

function schemaPropertyNames(schema: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const properties = record.properties;
    if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
      Object.keys(properties).forEach((name) => names.add(name));
    }
    Object.values(record).forEach(visit);
  };
  visit(schema);
  return [...names].sort();
}

function schemaStringLiterals(schema: unknown): Set<string> {
  const literals = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.const === 'string') literals.add(record.const);
    if (Array.isArray(record.enum)) {
      record.enum.forEach((literal) => {
        if (typeof literal === 'string') literals.add(literal);
      });
    }
    Object.values(record).forEach(visit);
  };
  visit(schema);
  return literals;
}

type SchemaObject = Record<string, unknown>;

function asSchemaObject(value: unknown): SchemaObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SchemaObject)
    : undefined;
}

function schemaObjectNodes(schema: unknown): SchemaObject[] {
  const nodes: SchemaObject[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = asSchemaObject(value);
    if (!record) return;
    if (asSchemaObject(record.properties)) nodes.push(record);
    Object.values(record).forEach(visit);
  };
  visit(schema);
  return nodes;
}

function schemaBranchWithStatus(schema: unknown, status: string): SchemaObject {
  const matches = schemaObjectNodes(schema).filter((node) => {
    const properties = asSchemaObject(node.properties);
    return schemaStringLiterals(properties?.status).has(status);
  });
  expect(matches).toHaveLength(1);
  const branch = matches[0];
  if (!branch) throw new Error(`missing ${status} schema branch`);
  return branch;
}

function schemaProperty(schema: SchemaObject, name: string): unknown {
  return asSchemaObject(schema.properties)?.[name];
}

function expectClosedObjectSchema(schema: unknown, expectedKeys: readonly string[]): void {
  const object = asSchemaObject(schema);
  expect(object).toBeDefined();
  const properties = asSchemaObject(object?.properties);
  expect(Object.keys(properties ?? {}).sort()).toEqual([...expectedKeys].sort());
  expect(Array.isArray(object?.required) ? [...object.required].sort() : object?.required).toEqual(
    [...expectedKeys].sort(),
  );
  expect(object?.additionalProperties).toBe(false);
}

describe('admin operations OpenAPI contract', () => {
  it('centralizes the common framing for the seven read-only observations', () => {
    const source = readFileSync(new URL('./admin-operations.ts', import.meta.url), 'utf8');

    expect(source.match(/method: 'get'/g)).toHaveLength(1);
    expect(
      source.match(/privateNoStore,\s*adminAuthIpWindow,\s*withAdminSession\(\)/g),
    ).toHaveLength(1);
  });

  it('publishes Neon Free usage as an admin-session protected read-only GET', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const operation = doc.paths?.['/admin/operations/neon-usage']?.get;

    expect(operation).toBeDefined();
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toBeUndefined();
    expect(operation?.requestBody).toBeUndefined();
    expect(operation?.responses).toMatchObject({
      200: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });
    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    const serializedSchema = JSON.stringify(successSchema);
    for (const required of [
      'organizationId',
      'projectsTruncated',
      'unavailableProjectCount',
      'effectivePermission',
      'organizationTransfer',
      'cu_seconds',
      'provider_values_may_lag',
      'not_invoice_or_credit_balance',
    ]) {
      expect(serializedSchema).toContain(required);
    }
    for (const redacted of [
      'owner_id',
      'connection_uri',
      'proxy_host',
      'members',
      'endpoints',
      'settings',
      'applications',
      'integrations',
    ]) {
      expect(serializedSchema).not.toContain(redacted);
    }
  });

  it('publishes Harpa-recorded AI usage as an admin-session protected GET', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const path = doc.paths?.['/admin/operations/ai-usage'];
    const operation = path?.get;

    expect(operation).toBeDefined();
    expect(Object.keys(path ?? {}).sort()).toEqual(['get']);
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toBeUndefined();
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '429']);
    expect(operation?.responses).toMatchObject({
      200: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });

    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    const serializedSchema = JSON.stringify(successSchema);
    expect(serializedSchema).toContain('harpa_usage_ledger');
    expect(serializedSchema).toContain('providerCapacity');
    expect(serializedSchema).toContain('missingInputSecondsEventCount');
    for (const redacted of [
      'userId',
      'projectId',
      'reportId',
      'email',
      'model',
      'prompt',
      'transcript',
      'notes',
      'rawVendor',
      'providerError',
      'sqlText',
      'errorText',
      'errorMessage',
    ]) {
      expect(serializedSchema).not.toContain(`"${redacted}"`);
    }
  });

  it('publishes the exact Fly inventory observer as an admin-session read-only GET', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const path = doc.paths?.['/admin/operations/fly-inventory'];
    const operation = path?.get;

    expect(operation).toBeDefined();
    expect(Object.keys(path ?? {}).sort()).toEqual(['get']);
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toBeUndefined();
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '429']);
    expect(operation?.responses).toMatchObject({
      200: {
        description: expect.stringMatching(/read-only.*Fly.*inventory/i),
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });

    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    expect(schemaPropertyNames(successSchema)).toEqual(
      [
        'apps',
        'attachedMachineId',
        'autoBackupEnabled',
        'configuredAppCount',
        'cpuKind',
        'cpus',
        'createdAt',
        'encrypted',
        'id',
        'items',
        'machines',
        'memoryMb',
        'name',
        'network',
        'observedAt',
        'organizationSlug',
        'processGroup',
        'reason',
        'region',
        'reportedMachineCount',
        'reportedVolumeCount',
        'returnedAllocatedGb',
        'sizeGb',
        'snapshotRetentionDays',
        'state',
        'status',
        'truncated',
        'unavailableConfiguredAppCount',
        'updatedAt',
        'volumes',
      ].sort(),
    );

    const objectNodes = schemaObjectNodes(successSchema);
    const topLevelBranches = objectNodes.filter((node) => {
      const properties = asSchemaObject(node.properties);
      return properties?.observedAt !== undefined && properties.status !== undefined;
    });
    expect(topLevelBranches).toHaveLength(3);
    const topLevelBranch = (status: string): SchemaObject => {
      const matches = topLevelBranches.filter((node) =>
        schemaStringLiterals(schemaProperty(node, 'status')).has(status),
      );
      expect(matches).toHaveLength(1);
      const branch = matches[0];
      if (!branch) throw new Error(`missing top-level ${status} Fly schema branch`);
      return branch;
    };
    expectClosedObjectSchema(topLevelBranch('available'), [
      'observedAt',
      'status',
      'organizationSlug',
      'configuredAppCount',
      'unavailableConfiguredAppCount',
      'apps',
    ]);
    expectClosedObjectSchema(topLevelBranch('partial'), [
      'observedAt',
      'status',
      'organizationSlug',
      'configuredAppCount',
      'unavailableConfiguredAppCount',
      'apps',
    ]);
    expectClosedObjectSchema(topLevelBranch('unknown'), ['observedAt', 'status', 'reason']);

    const exactNestedObjects = [
      {
        marker: 'reportedMachineCount',
        keys: [
          'id',
          'name',
          'status',
          'network',
          'reportedMachineCount',
          'reportedVolumeCount',
          'machines',
          'volumes',
        ],
      },
      {
        marker: 'cpuKind',
        keys: [
          'id',
          'name',
          'state',
          'processGroup',
          'region',
          'cpuKind',
          'cpus',
          'memoryMb',
          'createdAt',
          'updatedAt',
        ],
      },
      {
        marker: 'sizeGb',
        keys: [
          'id',
          'name',
          'state',
          'sizeGb',
          'region',
          'encrypted',
          'attachedMachineId',
          'createdAt',
          'snapshotRetentionDays',
          'autoBackupEnabled',
        ],
      },
      {
        marker: 'returnedAllocatedGb',
        keys: ['status', 'truncated', 'returnedAllocatedGb', 'items'],
      },
    ] as const;
    for (const { marker, keys } of exactNestedObjects) {
      const matches = objectNodes.filter(
        (node) => asSchemaObject(node.properties)?.[marker] !== undefined,
      );
      expect(matches.length).toBeGreaterThan(0);
      matches.forEach((node) => expectClosedObjectSchema(node, keys));
    }

    const literals = schemaStringLiterals(successSchema);
    for (const required of [
      'available',
      'partial',
      'unknown',
      'not_configured',
      'timeout',
      'rate_limited',
      'forbidden',
      'not_found',
      'invalid_response',
      'provider_unavailable',
    ]) {
      expect(literals).toContain(required);
    }

    const serializedSchema = JSON.stringify(successSchema);
    for (const forbiddenProperty of [
      'billing_email',
      'billingEmail',
      'private_ip',
      'privateIp',
      'instance_id',
      'instanceId',
      'image_ref',
      'imageRef',
      'config',
      'metadata',
      'env',
      'services',
      'checks',
      'events',
      'zone',
      'attached_alloc_id',
      'attachedAllocId',
      'host_dedication_key',
      'hostDedicationKey',
      'fstype',
      'blocks',
      'providerMessage',
      'remainingCredit',
    ]) {
      expect(serializedSchema).not.toContain(`"${forbiddenProperty}"`);
    }
  });

  it('publishes the exact storage-lifecycle observer as an admin-session read-only GET', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const path = doc.paths?.['/admin/operations/storage-lifecycle'];
    const operation = path?.get;

    expect(operation).toBeDefined();
    expect(Object.keys(path ?? {}).sort()).toEqual(['get']);
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toBeUndefined();
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '429']);
    expect(operation?.responses).toMatchObject({
      200: {
        description: expect.stringMatching(/read-only.*storage lifecycle/i),
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });

    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    expect(schemaPropertyNames(successSchema)).toEqual(
      [
        'observedAt',
        'status',
        'reason',
        'rollout',
        'armedAt',
        'enforceAfter',
        'accountDeleteEnabled',
        'leaseEnforcementActive',
        'accountDeletionAvailable',
        'updatedAt',
        'jobs',
        'total',
        'initial',
        'final',
        'dueNow',
        'scheduled',
        'activeClaims',
        'staleClaims',
        'retrying',
        'maxAttemptCount',
        'oldestDueAt',
        'nextRunAfter',
        'caveats',
      ].sort(),
    );

    const availableBranch = schemaBranchWithStatus(successSchema, 'available');
    const unknownBranch = schemaBranchWithStatus(successSchema, 'unknown');
    expectClosedObjectSchema(availableBranch, [
      'observedAt',
      'status',
      'rollout',
      'jobs',
      'caveats',
    ]);
    expectClosedObjectSchema(unknownBranch, ['observedAt', 'status', 'reason']);
    expectClosedObjectSchema(schemaProperty(availableBranch, 'rollout'), [
      'armedAt',
      'enforceAfter',
      'accountDeleteEnabled',
      'leaseEnforcementActive',
      'accountDeletionAvailable',
      'updatedAt',
    ]);
    expectClosedObjectSchema(schemaProperty(availableBranch, 'jobs'), [
      'total',
      'initial',
      'final',
      'dueNow',
      'scheduled',
      'activeClaims',
      'staleClaims',
      'retrying',
      'maxAttemptCount',
      'oldestDueAt',
      'nextRunAfter',
    ]);

    const literals = schemaStringLiterals(successSchema);
    for (const required of [
      'available',
      'unknown',
      'rollout_state_missing',
      'timeout',
      'database_unavailable',
      'invalid_response',
      'db_state_not_worker_liveness',
      'queue_counts_not_provider_health',
      'empty_queue_not_execution_proof',
    ]) {
      expect(literals).toContain(required);
    }

    const serializedSchema = JSON.stringify(successSchema);
    for (const forbidden of [
      'user_id',
      'userId',
      'payload',
      'exactKeys',
      'sweepPrefixes',
      'last_error',
      'lastError',
      'locked_at',
      'lockedAt',
      'projectId',
      'bucket',
      'machine',
    ]) {
      expect(serializedSchema).not.toContain(forbidden);
    }
  });

  it('publishes the strict Sentry observer on one admin-session read-only GET', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const path = doc.paths?.['/admin/operations/sentry'];
    const operation = path?.get;

    expect(operation).toBeDefined();
    expect(Object.keys(path ?? {}).sort()).toEqual(['get']);
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toBeUndefined();
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '429']);
    expect(operation?.responses).toMatchObject({
      200: {
        description: expect.stringMatching(/read-only.*Sentry/i),
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });

    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    expect(schemaPropertyNames(successSchema)).toEqual(
      [
        'abnormalSessions',
        'cap',
        'caveats',
        'count',
        'countKind',
        'crashedSessions',
        'erroredSessions',
        'healthySessions',
        'mobileSessions',
        'observedAt',
        'reason',
        'status',
        'totalSessions',
        'unresolvedErrors',
        'window',
        'windowEnd',
        'windowStart',
      ].sort(),
    );

    const topLevelBranches = schemaObjectNodes(successSchema).filter((node) => {
      const properties = asSchemaObject(node.properties);
      return properties?.observedAt !== undefined && properties.status !== undefined;
    });
    expect(topLevelBranches).toHaveLength(3);
    const topLevelBranch = (status: string): SchemaObject => {
      const matches = topLevelBranches.filter((node) =>
        schemaStringLiterals(schemaProperty(node, 'status')).has(status),
      );
      expect(matches).toHaveLength(1);
      const branch = matches[0];
      if (!branch) throw new Error(`missing top-level ${status} Sentry schema branch`);
      return branch;
    };

    const availableBranch = topLevelBranch('available');
    expectClosedObjectSchema(availableBranch, [
      'observedAt',
      'status',
      'unresolvedErrors',
      'mobileSessions',
      'caveats',
    ]);
    expectClosedObjectSchema(topLevelBranch('partial'), [
      'observedAt',
      'status',
      'unresolvedErrors',
      'mobileSessions',
      'caveats',
    ]);
    expectClosedObjectSchema(topLevelBranch('unknown'), ['observedAt', 'status', 'reason']);
    expectClosedObjectSchema(schemaProperty(availableBranch, 'unresolvedErrors'), [
      'status',
      'count',
      'countKind',
      'cap',
    ]);
    expectClosedObjectSchema(schemaProperty(availableBranch, 'mobileSessions'), [
      'status',
      'window',
      'windowStart',
      'windowEnd',
      'totalSessions',
      'healthySessions',
      'erroredSessions',
      'abnormalSessions',
      'crashedSessions',
    ]);

    const numericSchemas = (propertyName: string): SchemaObject[] =>
      schemaObjectNodes(successSchema).flatMap((node) => {
        const property = asSchemaObject(schemaProperty(node, propertyName));
        return property ? [property] : [];
      });
    const issueCounts = numericSchemas('count');
    expect(issueCounts).toHaveLength(2);
    for (const issueCount of issueCounts) {
      expect(issueCount.minimum).toBe(0);
      expect(issueCount.maximum).toBe(100);
    }
    for (const propertyName of [
      'healthySessions',
      'erroredSessions',
      'abnormalSessions',
      'crashedSessions',
    ]) {
      const sessionCounts = numericSchemas(propertyName);
      expect(sessionCounts).toHaveLength(2);
      for (const sessionCount of sessionCounts) expect(sessionCount.minimum).toBe(0);
    }
    const totalSessions = numericSchemas('totalSessions');
    expect(totalSessions).toHaveLength(2);
    for (const totalSessionCount of totalSessions) expect(totalSessionCount.minimum).toBe(1);

    expect([...schemaStringLiterals(successSchema)].sort()).toEqual(
      [
        'available',
        'partial',
        'unknown',
        'not_configured',
        'forbidden',
        'not_found',
        'rate_limited',
        'timeout',
        'invalid_response',
        'provider_unavailable',
        'no_session_data',
        'exact',
        'lower_bound',
        'last_24_hours',
        'issue_groups_not_events',
        'mobile_sessions_only',
        'telemetry_coverage_applies',
        'issue_count_truncated',
      ].sort(),
    );

    const serializedSchema = JSON.stringify(successSchema);
    for (const forbiddenProperty of [
      'organizationSlug',
      'orgSlug',
      'projectSlug',
      'projectSlugs',
      'apiToken',
      'readToken',
      'issueId',
      'shortId',
      'title',
      'culprit',
      'message',
      'stacktrace',
      'tags',
      'users',
      'email',
      'url',
      'headers',
      'rawIssues',
      'rawSessions',
      'providerError',
    ]) {
      expect(serializedSchema).not.toContain(`"${forbiddenProperty}"`);
    }
  });

  it('keeps the strict live canary on the existing admin-session POST path', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const path = doc.paths?.['/admin/operations/report-generate'];
    const operation = path?.post;

    expect(operation).toBeDefined();
    expect(Object.keys(path ?? {}).sort()).toEqual(['post']);
    expect(operation?.security).toEqual([{ adminSession: [] }]);
    expect(operation?.parameters).toEqual([
      {
        in: 'header',
        name: ADMIN_CSRF_HEADER,
        required: true,
        schema: {
          pattern: '^[A-Za-z0-9_-]{43}$',
          type: 'string',
        },
      },
    ]);
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '403', '429']);
    expect(operation?.responses).toMatchObject({
      200: {
        description: expect.stringMatching(/live canary/i),
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      401: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      403: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
      429: {
        content: {
          'application/json': { schema: expect.any(Object) },
        },
      },
    });
  });

  it('publishes the complete reviewed live-canary observation schema', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const operation = doc.paths?.['/admin/operations/report-generate']?.post;

    const successResponse = operation?.responses?.[200];
    const successSchema =
      successResponse && 'content' in successResponse
        ? successResponse.content?.['application/json']?.schema
        : undefined;
    expect(schemaPropertyNames(successSchema)).toEqual(
      [
        'accountEmail',
        'action',
        'aiInputTokens',
        'aiOutputTokens',
        'body',
        'bodySha256',
        'cachedTokens',
        'cleanup',
        'condition',
        'count',
        'counts',
        'description',
        'documentAttachments',
        'durationMs',
        'finishedAt',
        'fixtureMode',
        'generatedAt',
        'generation',
        'hours',
        'httpStatus',
        'idempotentReplay',
        'imageAttachments',
        'impact',
        'inputTokens',
        'issues',
        'latencyMs',
        'limit',
        'limits',
        'materials',
        'matched',
        'model',
        'name',
        'nextSteps',
        'notes',
        'observedAt',
        'outputTokens',
        'overridden',
        'phase',
        'plan',
        'preview',
        'projectId',
        'quantity',
        'reason',
        'remaining',
        'reportGenerate',
        'reportId',
        'reportNumber',
        'reportUpdatedAt',
        'requestId',
        'requestedAt',
        'resetAt',
        'role',
        'sample',
        'schemaValid',
        'severity',
        'status',
        'summary',
        'summarySections',
        'target',
        'temperature',
        'title',
        'truncated',
        'unit',
        'usage',
        'used',
        'vendor',
        'warnings',
        'weather',
        'wind',
        'workers',
      ].sort(),
    );

    const stringLiterals = schemaStringLiterals(successSchema);
    for (const required of [
      'unknown',
      'pass',
      'warning',
      'fail',
      'not_configured',
      'not_enabled',
      'limits_unavailable',
      'sign_out_failed',
      'not_started',
      'succeeded',
      'failed',
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
      'live',
    ]) {
      expect(stringLiterals).toContain(required);
    }
    expect(stringLiterals).not.toContain('replay');
    expect(stringLiterals).not.toContain('record');
    expect(stringLiterals).not.toContain('replay_only');
  });
});
