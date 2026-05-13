/**
 * Neon branching API wrapper.
 *
 * Usage:
 *   pnpm db:branch:create <pr-number>
 *   pnpm db:branch:delete <pr-number>
 *
 * Reads NEON_API_KEY + NEON_PROJECT_ID from env. The CI workflow
 * `pr-preview.yml` (P0.10) calls these on PR open / close so each PR
 * gets its own isolated DB to run migrations + integration tests
 * against — per docs/v4/arch-ops.md.
 */
const NEON_API = 'https://console.neon.tech/api/v2';

interface BranchResponse {
  branch: { id: string; name: string };
  endpoints: Array<{ host: string }>;
  connection_uris?: Array<{ connection_uri: string }>;
}

async function neonFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = process.env['NEON_API_KEY'];
  const projectId = process.env['NEON_PROJECT_ID'];
  if (!apiKey || !projectId) {
    throw new Error('NEON_API_KEY and NEON_PROJECT_ID must be set');
  }
  const url = `${NEON_API}/projects/${projectId}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function createBranch(prNumber: string): Promise<void> {
  const name = `pr-${prNumber}`;
  // Idempotent: if a branch with this name already exists (PR was
  // pushed to again), delete it first so the new branch is created
  // from the latest `main` data.
  await deleteBranchIfExists(name);
  const res = await neonFetch('/branches', {
    method: 'POST',
    body: JSON.stringify({
      branch: { name },
      endpoints: [{ type: 'read_write' }],
    }),
  });
  if (!res.ok) {
    throw new Error(`neon branch create failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as BranchResponse;
  const uri = body.connection_uris?.[0]?.connection_uri;
  if (!uri) throw new Error('neon response did not include a connection_uri');
  // Emit a single line for CI consumption (set as DATABASE_URL secret).
  console.log(uri);
}

async function deleteBranchIfExists(name: string): Promise<void> {
  const listRes = await neonFetch('/branches');
  if (!listRes.ok) {
    throw new Error(`neon branch list failed (${listRes.status}): ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as { branches: Array<{ id: string; name: string }> };
  const target = list.branches.find((b) => b.name === name);
  if (!target) return;
  const delRes = await neonFetch(`/branches/${target.id}`, { method: 'DELETE' });
  if (!delRes.ok) {
    throw new Error(`neon branch delete failed (${delRes.status}): ${await delRes.text()}`);
  }
  console.error(`[neon] deleted stale branch ${name} before recreate`);
}

async function deleteBranch(prNumber: string): Promise<void> {
  const name = `pr-${prNumber}`;
  const listRes = await neonFetch('/branches');
  if (!listRes.ok) {
    throw new Error(`neon branch list failed (${listRes.status}): ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as { branches: Array<{ id: string; name: string }> };
  const target = list.branches.find((b) => b.name === name);
  if (!target) {
    console.error(`[neon] branch '${name}' not found — skipping delete`);
    return;
  }
  const delRes = await neonFetch(`/branches/${target.id}`, { method: 'DELETE' });
  if (!delRes.ok) {
    throw new Error(`neon branch delete failed (${delRes.status}): ${await delRes.text()}`);
  }
  console.error(`[neon] deleted branch ${name}`);
}

async function main(): Promise<void> {
  const [, , cmd, prNumber] = process.argv;
  if (!cmd || !prNumber) {
    console.error('usage: branch.ts <create|delete> <pr-number>');
    process.exit(2);
  }
  if (cmd === 'create') return createBranch(prNumber);
  if (cmd === 'delete') return deleteBranch(prNumber);
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
