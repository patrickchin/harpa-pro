import { describe, expect, it } from 'vitest';
import { ADMIN_CSRF_HEADER } from '../lib/admin-csrf.js';
import { adminOperationsRoutes } from './admin-operations.js';

const SPEC_DOC_CONFIG = {
  openapi: '3.1.0' as const,
  info: { title: 'Harpa Pro API', version: '0.0.0' },
};

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

  it('requires the strict admin CSRF header for report generation', () => {
    const doc = adminOperationsRoutes.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const operation = doc.paths?.['/admin/operations/report-generate']?.post;

    expect(operation?.parameters).toContainEqual({
      in: 'header',
      name: ADMIN_CSRF_HEADER,
      required: true,
      schema: {
        pattern: '^[A-Za-z0-9_-]{43}$',
        type: 'string',
      },
    });
  });
});
