import { describe, expect, it } from 'vitest';
import { ADMIN_CSRF_HEADER } from '../lib/admin-csrf.js';
import { adminOperationsRoutes } from './admin-operations.js';

const SPEC_DOC_CONFIG = {
  openapi: '3.1.0' as const,
  info: { title: 'Harpa Pro API', version: '0.0.0' },
};

describe('admin operations OpenAPI contract', () => {
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
