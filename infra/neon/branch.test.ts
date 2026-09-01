import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { createSchemaOnlyPreview, existingBranchUri } from './branch.ts';

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

test('creates a data-less preview branch and a fresh per-PR database', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa_pr_360';
  process.env['NEON_ROLE_NAME'] = 'neondb_owner';

  let branchCreateSeen = false;
  let databaseCreateSeen = false;
  let connectionUriSeen = false;

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
        endpoints: Array<{ type: string }>;
      };
      assert.equal(body.branch.name, 'pr-360');
      assert.equal(body.branch.parent_id, 'br-main');
      assert.equal(body.branch.init_source, 'schema-only');
      assert.match(body.branch.expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.deepEqual(body.endpoints, [{ type: 'read_write' }]);
      branchCreateSeen = true;
      return Response.json(
        {
          branch: { id: 'br-preview', name: 'pr-360' },
          endpoints: [{ id: 'ep-preview', host: 'preview.example.neon.tech', type: 'read_write' }],
        },
        { status: 201 },
      );
    }

    if (url.pathname.endsWith('/branches/br-preview/databases') && init?.method === 'POST') {
      assert.deepEqual(JSON.parse(String(init.body)), {
        database: { name: 'harpa_pr_360', owner_name: 'neondb_owner' },
      });
      databaseCreateSeen = true;
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

    if (url.pathname.endsWith('/connection_uri')) {
      assert.equal(url.searchParams.get('branch_id'), 'br-preview');
      assert.equal(url.searchParams.get('endpoint_id'), 'ep-preview');
      assert.equal(url.searchParams.get('database_name'), 'harpa_pr_360');
      assert.equal(url.searchParams.get('role_name'), 'neondb_owner');
      connectionUriSeen = true;
      return Response.json({ uri: 'postgresql://preview.example/harpa_pr_360' });
    }

    return new Response(`unexpected request: ${url}`, { status: 500 });
  };

  const uri = await createSchemaOnlyPreview('360', 'main');

  assert.equal(uri, 'postgresql://preview.example/harpa_pr_360');
  assert.equal(branchCreateSeen, true);
  assert.equal(databaseCreateSeen, true);
  assert.equal(connectionUriSeen, true);
});

test('rejects an unsafe preview database identifier before calling Neon', async () => {
  process.env['NEON_API_KEY'] = 'test-api-key';
  process.env['NEON_PROJECT_ID'] = 'test-project';
  process.env['NEON_DATABASE_NAME'] = 'harpa-pr-360;drop database main';
  process.env['NEON_ROLE_NAME'] = 'neondb_owner';
  globalThis.fetch = async () => {
    throw new Error('fetch must not run');
  };

  await assert.rejects(createSchemaOnlyPreview('360', 'main'), /valid PostgreSQL identifier/);
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
