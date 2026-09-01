import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { createSanitizedPreview, existingBranchUri } from './branch.ts';

const originalFetch = globalThis.fetch;
const originalEnv = {
  NEON_API_KEY: process.env['NEON_API_KEY'],
  NEON_PROJECT_ID: process.env['NEON_PROJECT_ID'],
  NEON_DATABASE_NAME: process.env['NEON_DATABASE_NAME'],
  NEON_ROLE_NAME: process.env['NEON_ROLE_NAME'],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('keeps the endpoint disabled while removing inherited data and roles', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa_pr_360';
  process.env['NEON_ROLE_NAME'] = 'harpa_pr_360_owner';

  let branchCreateSeen = false;
  let databaseCreateSeen = false;
  let inheritedDatabaseDeleteSeen = false;
  let inheritedRoleDeleteSeen = false;
  let disabledEndpointCreateSeen = false;
  let endpointEnableSeen = false;
  let connectionUriSeen = false;
  let databaseCreated = false;
  let inheritedDatabaseDeleted = false;
  let inheritedRoleDeleted = false;
  let endpointDisabled = true;
  let databaseCreateAttempts = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith('/branches') && init?.method !== 'POST') {
      return Response.json({
        branches: [{ id: 'br-main', name: 'main', created_at: '2026-09-01T00:00:00Z' }],
      });
    }

    if (url.pathname.endsWith('/branches') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as {
        branch: Record<string, string>;
        endpoints?: Array<{ type: string }>;
      };
      assert.equal(body.branch.name, 'pr-360');
      assert.equal(body.branch.parent_id, 'br-main');
      assert.equal(body.branch.init_source, 'parent-data');
      assert.match(body.branch.expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.equal(body.endpoints, undefined);
      branchCreateSeen = true;
      return Response.json(
        {
          branch: { id: 'br-preview', name: 'pr-360' },
        },
        { status: 201 },
      );
    }

    if (url.pathname.endsWith('/endpoints') && init?.method === 'POST') {
      assert.deepEqual(JSON.parse(String(init.body)), {
        endpoint: { branch_id: 'br-preview', type: 'read_write', disabled: true },
      });
      disabledEndpointCreateSeen = true;
      return Response.json(
        {
          endpoint: {
            id: 'ep-preview',
            host: 'preview.example.neon.tech',
            branch_id: 'br-preview',
            type: 'read_write',
            disabled: true,
          },
          operations: [],
        },
        { status: 201 },
      );
    }

    if (url.pathname.endsWith('/endpoints/ep-preview') && init?.method === 'GET') {
      return Response.json({
        endpoint: {
          id: 'ep-preview',
          host: 'preview.example.neon.tech',
          branch_id: 'br-preview',
          type: 'read_write',
          disabled: endpointDisabled,
        },
      });
    }

    if (url.pathname.endsWith('/endpoints/ep-preview') && init?.method === 'PATCH') {
      assert.deepEqual(JSON.parse(String(init.body)), { endpoint: { disabled: false } });
      assert.equal(inheritedDatabaseDeleted, true);
      assert.equal(inheritedRoleDeleted, true);
      endpointDisabled = false;
      endpointEnableSeen = true;
      return Response.json({
        endpoint: {
          id: 'ep-preview',
          host: 'preview.example.neon.tech',
          branch_id: 'br-preview',
          type: 'read_write',
          disabled: false,
        },
        operations: [],
      });
    }

    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method !== 'POST') {
      return Response.json({
        databases:
          databaseCreated && inheritedDatabaseDeleted
            ? [{ name: 'harpa_pr_360' }]
            : [{ name: 'neondb' }],
      });
    }

    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method === 'POST') {
      databaseCreateAttempts += 1;
      if (databaseCreateAttempts === 1) {
        return new Response('branch operation still running', {
          status: 423,
          headers: { 'retry-after': '0' },
        });
      }
      assert.deepEqual(JSON.parse(String(init.body)), {
        database: { name: 'harpa_pr_360', owner_name: 'harpa_pr_360_owner' },
      });
      databaseCreateSeen = true;
      databaseCreated = true;
      return Response.json(
        {
          database: {
            id: 360,
            branch_id: 'br-preview',
            name: 'harpa_pr_360',
            owner_name: 'neondb_owner',
          },
          operations: [],
        },
        { status: 201 },
      );
    }

    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method !== 'POST') {
      return Response.json({
        roles: inheritedRoleDeleted ? [{ name: 'harpa_pr_360_owner' }] : [{ name: 'neondb_owner' }],
      });
    }

    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method === 'POST') {
      assert.deepEqual(JSON.parse(String(init.body)), {
        role: { name: 'harpa_pr_360_owner' },
      });
      return Response.json(
        { role: { name: 'harpa_pr_360_owner' }, operations: [] },
        { status: 201 },
      );
    }

    if (url.pathname.endsWith('/branches/br-preview/databases/neondb')) {
      assert.equal(init?.method, 'DELETE');
      inheritedDatabaseDeleteSeen = true;
      inheritedDatabaseDeleted = true;
      return new Response(null, { status: 204 });
    }

    if (url.pathname.endsWith('/branches/br-preview/roles/neondb_owner')) {
      assert.equal(init?.method, 'DELETE');
      inheritedRoleDeleteSeen = true;
      inheritedRoleDeleted = true;
      return new Response(null, { status: 204 });
    }

    if (url.pathname.endsWith('/connection_uri')) {
      assert.equal(endpointDisabled, false);
      assert.equal(inheritedRoleDeleted, true);
      assert.equal(url.searchParams.get('branch_id'), 'br-preview');
      assert.equal(url.searchParams.get('endpoint_id'), 'ep-preview');
      assert.equal(url.searchParams.get('database_name'), 'harpa_pr_360');
      assert.equal(url.searchParams.get('role_name'), 'harpa_pr_360_owner');
      connectionUriSeen = true;
      return Response.json({ uri: 'postgresql://preview.example/harpa_pr_360' });
    }

    return new Response(`unexpected request: ${url}`, { status: 500 });
  };

  const uri = await createSanitizedPreview('360', 'main');

  assert.equal(uri, 'postgresql://preview.example/harpa_pr_360');
  assert.equal(branchCreateSeen, true);
  assert.equal(databaseCreateSeen, true);
  assert.equal(inheritedDatabaseDeleteSeen, true);
  assert.equal(inheritedRoleDeleteSeen, true);
  assert.equal(disabledEndpointCreateSeen, true);
  assert.equal(endpointEnableSeen, true);
  assert.equal(connectionUriSeen, true);
});

test('deletes a preview branch if Neon does not keep its endpoint disabled', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa_pr_360';
  process.env['NEON_ROLE_NAME'] = 'harpa_pr_360_owner';
  let branchCleanupSeen = false;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/branches') && init?.method !== 'POST') {
      return Response.json({
        branches: [{ id: 'br-main', name: 'main', created_at: '2026-09-01T00:00:00Z' }],
      });
    }
    if (url.pathname.endsWith('/branches') && init?.method === 'POST') {
      return Response.json({ branch: { id: 'br-preview', name: 'pr-360' } }, { status: 201 });
    }
    if (url.pathname.endsWith('/endpoints') && init?.method === 'POST') {
      return Response.json(
        {
          endpoint: {
            id: 'ep-preview',
            host: 'preview.example.neon.tech',
            branch_id: 'br-preview',
            type: 'read_write',
            disabled: false,
          },
          operations: [],
        },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/branches/br-preview') && init?.method === 'DELETE') {
      branchCleanupSeen = true;
      return new Response(null, { status: 204 });
    }
    return new Response(`unexpected request: ${url}`, { status: 500 });
  };

  await assert.rejects(createSanitizedPreview('360', 'main'), /not created disabled/);
  assert.equal(branchCleanupSeen, true);
});

test('rejects an unsafe preview database identifier before calling Neon', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa-pr-360;drop database main';
  process.env['NEON_ROLE_NAME'] = 'neondb_owner';
  globalThis.fetch = async () => {
    throw new Error('fetch must not run');
  };

  await assert.rejects(createSanitizedPreview('360', 'main'), /valid PostgreSQL identifier/);
});

test('deletes the entire preview branch when inherited-data removal fails', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa_pr_360';
  process.env['NEON_ROLE_NAME'] = 'harpa_pr_360_owner';
  let branchCleanupSeen = false;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/branches') && init?.method !== 'POST') {
      return Response.json({
        branches: [{ id: 'br-main', name: 'main', created_at: '2026-09-01T00:00:00Z' }],
      });
    }
    if (url.pathname.endsWith('/branches') && init?.method === 'POST') {
      return Response.json(
        {
          branch: { id: 'br-preview', name: 'pr-360' },
        },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/endpoints') && init?.method === 'POST') {
      return Response.json(
        {
          endpoint: {
            id: 'ep-preview',
            host: 'preview.example.neon.tech',
            branch_id: 'br-preview',
            type: 'read_write',
            disabled: true,
          },
          operations: [],
        },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method !== 'POST') {
      return Response.json({ databases: [{ name: 'neondb' }] });
    }
    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method === 'POST') {
      return Response.json({ database: { name: 'harpa_pr_360' }, operations: [] }, { status: 201 });
    }
    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method !== 'POST') {
      return Response.json({ roles: [{ name: 'neondb_owner' }] });
    }
    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method === 'POST') {
      return Response.json(
        { role: { name: 'harpa_pr_360_owner' }, operations: [] },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/branches/br-preview/databases/neondb')) {
      return new Response('cannot delete inherited database', { status: 400 });
    }
    if (url.pathname.endsWith('/branches/br-preview') && init?.method === 'DELETE') {
      branchCleanupSeen = true;
      return new Response(null, { status: 204 });
    }
    return new Response(`unexpected request: ${url}`, { status: 500 });
  };

  await assert.rejects(createSanitizedPreview('360', 'main'), /database delete.*failed/);
  assert.equal(branchCleanupSeen, true);
});

test('deletes the entire preview branch when inherited-role removal fails', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa_pr_360';
  process.env['NEON_ROLE_NAME'] = 'harpa_pr_360_owner';
  let branchCleanupSeen = false;
  let inheritedDatabaseDeleted = false;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/branches') && init?.method !== 'POST') {
      return Response.json({
        branches: [{ id: 'br-main', name: 'main', created_at: '2026-09-01T00:00:00Z' }],
      });
    }
    if (url.pathname.endsWith('/branches') && init?.method === 'POST') {
      return Response.json(
        {
          branch: { id: 'br-preview', name: 'pr-360' },
        },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/endpoints') && init?.method === 'POST') {
      return Response.json(
        {
          endpoint: {
            id: 'ep-preview',
            host: 'preview.example.neon.tech',
            branch_id: 'br-preview',
            type: 'read_write',
            disabled: true,
          },
          operations: [],
        },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method !== 'POST') {
      return Response.json({
        databases: inheritedDatabaseDeleted ? [{ name: 'harpa_pr_360' }] : [{ name: 'neondb' }],
      });
    }
    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method === 'POST') {
      return Response.json({ database: { name: 'harpa_pr_360' }, operations: [] }, { status: 201 });
    }
    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method !== 'POST') {
      return Response.json({ roles: [{ name: 'neondb_owner' }] });
    }
    if (url.pathname.endsWith('/branches/br-preview/roles') && init?.method === 'POST') {
      return Response.json(
        { role: { name: 'harpa_pr_360_owner' }, operations: [] },
        { status: 201 },
      );
    }
    if (url.pathname.endsWith('/branches/br-preview/databases/neondb')) {
      inheritedDatabaseDeleted = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/branches/br-preview/roles/neondb_owner')) {
      return new Response('cannot delete inherited role', { status: 400 });
    }
    if (url.pathname.endsWith('/branches/br-preview') && init?.method === 'DELETE') {
      branchCleanupSeen = true;
      return new Response(null, { status: 204 });
    }
    return new Response(`unexpected request: ${url}`, { status: 500 });
  };

  await assert.rejects(createSanitizedPreview('360', 'main'), /role delete.*failed/);
  assert.equal(branchCleanupSeen, true);
});

test('fails closed when a preview branch is missing', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  let postSeen = false;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'POST') postSeen = true;
    return Response.json({ branches: [] });
  };

  await assert.rejects(existingBranchUri('pr-360'), /not found/);
  assert.equal(postSeen, false);
});
