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
