/**
 * Neon branching API wrapper.
 *
 * Usage:
 *   pnpm db:branch:create <pr-number> [parent]
 *   pnpm db:branch:create-empty <pr-number> <parent>
 *   pnpm db:branch:delete <pr-number>
 *   pnpm db:branch:ensure <branch-name> [parent]
 *   pnpm db:branch:uri <branch-name>
 *   pnpm db:branch:prune-snapshots <keep-days> [max-count]
 *
 * Reads NEON_API_KEY + NEON_PROJECT_ID from env. Connection URIs default to
 * the app project's `neondb` / `neondb_owner`; set NEON_DATABASE_NAME and
 * NEON_ROLE_NAME for projects with different names (for example the isolated
 * admin project).
 *
 * `create` and `ensure` accept an optional parent branch name. The CI workflow
 * `pr-preview.yml` (P0.10) calls create/delete on PR open / close so
 * each PR gets its own isolated DB. `api-dev.yml` calls ensure so the
 * long-lived `dev` branch persists across deploys — per docs/v4/arch-ops.md.
 */
import { pathToFileURL } from 'node:url';

const NEON_API = 'https://console.neon.tech/api/v2';
const PR_BRANCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const POSTGRES_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const NEON_LOCK_RETRY_ATTEMPTS = 12;
const SANITATION_VERIFY_ATTEMPTS = 20;

interface BranchResponse {
  branch: { id: string; name: string };
  endpoints?: NeonEndpoint[];
}

interface BranchList {
  branches: NeonBranch[];
  pagination?: { next?: string };
}

interface NeonBranch {
  id: string;
  name: string;
  created_at: string;
}

interface NeonEndpoint {
  id: string;
  host: string;
  type: 'read_only' | 'read_write';
  branch_id?: string;
  disabled?: boolean;
}

interface EndpointResponse {
  endpoint: NeonEndpoint;
}

interface PreviewDatabaseConfig {
  name: string;
  ownerName: string;
}

interface DatabaseList {
  databases: Array<{ name: string }>;
}

interface RoleList {
  roles: Array<{ name: string }>;
}

function requiredEnv(name: 'NEON_DATABASE_NAME' | 'NEON_ROLE_NAME', fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!value.trim()) throw new Error(`${name} must not be empty`);
  return value;
}

function previewDatabaseConfig(): PreviewDatabaseConfig {
  const name = requiredEnv('NEON_DATABASE_NAME', '');
  const ownerName = requiredEnv('NEON_ROLE_NAME', '');
  for (const [envName, value] of [
    ['NEON_DATABASE_NAME', name],
    ['NEON_ROLE_NAME', ownerName],
  ] as const) {
    if (!POSTGRES_IDENTIFIER.test(value)) {
      throw new Error(`${envName} must be a valid PostgreSQL identifier`);
    }
  }
  return { name, ownerName };
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

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter)) {
    return Number(retryAfter) * 1_000;
  }
  return Math.min(attempt * 1_000, 5_000);
}

async function neonRequestWithLockRetry(
  path: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  for (let attempt = 1; attempt <= NEON_LOCK_RETRY_ATTEMPTS; attempt += 1) {
    const response = await neonFetch(path, init);
    if (response.ok) return response;
    const body = await response.text();
    const retryable = response.status === 423 || response.status === 503;
    if (!retryable || attempt === NEON_LOCK_RETRY_ATTEMPTS) {
      throw new Error(`${operation} failed (${response.status}): ${body}`);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
  }
  throw new Error(`${operation} exhausted retries`);
}

async function listBranches(): Promise<BranchList['branches']> {
  const branches: NeonBranch[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      limit: '100',
      sort_by: 'created_at',
      sort_order: 'asc',
    });
    if (cursor) params.set('cursor', cursor);
    const res = await neonFetch(`/branches?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`neon branch list failed (${res.status}): ${await res.text()}`);
    }
    const page = (await res.json()) as BranchList;
    branches.push(...page.branches);
    cursor = page.pagination?.next;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error('neon branch pagination returned a repeated cursor');
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return branches;
}

function expiresInSevenDays(): string {
  const expiresAt = new Date(Date.now() + PR_BRANCH_TTL_MS);
  expiresAt.setMilliseconds(0);
  return expiresAt.toISOString().replace('.000Z', 'Z');
}

function branchCreateFields(
  name: string,
  parentId?: string,
  initSource?: 'parent-data',
): { name: string; parent_id?: string; init_source?: 'parent-data'; expires_at?: string } {
  return {
    name,
    ...(parentId ? { parent_id: parentId } : {}),
    ...(initSource ? { init_source: initSource } : {}),
    ...(name.startsWith('pr-') ? { expires_at: expiresInSevenDays() } : {}),
  };
}

async function deleteBranchById(id: string, name: string): Promise<void> {
  await neonRequestWithLockRetry(
    `/branches/${id}`,
    { method: 'DELETE' },
    `neon branch delete for '${name}'`,
  );
}

async function parentIdFor(name?: string): Promise<string | undefined> {
  if (!name) return undefined;
  const parent = (await listBranches()).find((branch) => branch.name === name);
  if (!parent) throw new Error(`neon parent branch '${name}' not found`);
  return parent.id;
}

async function connectionUri(
  branchId: string,
  responseEndpoints: NeonEndpoint[] = [],
): Promise<string> {
  let endpoint = responseEndpoints.find((candidate) => candidate.type === 'read_write');
  if (!endpoint) {
    const epRes = await neonRequestWithLockRetry(
      `/branches/${branchId}/endpoints`,
      { method: 'GET' },
      'neon endpoint list',
    );
    const epBody = (await epRes.json()) as {
      endpoints: NeonEndpoint[];
    };
    endpoint = epBody.endpoints.find((candidate) => candidate.type === 'read_write');
  }
  if (!endpoint) throw new Error(`neon branch '${branchId}' has no read_write endpoint`);

  const params = new URLSearchParams({
    branch_id: branchId,
    endpoint_id: endpoint.id,
    database_name: requiredEnv('NEON_DATABASE_NAME', 'neondb'),
    role_name: requiredEnv('NEON_ROLE_NAME', 'neondb_owner'),
  });
  // Intentionally omit `pooled=true`: migrators require session semantics.
  // Preview deployments deliberately reuse this direct URI at runtime because
  // their traffic is low; splitting migration/runtime URLs is deferred.
  const uriRes = await neonRequestWithLockRetry(
    `/connection_uri?${params.toString()}`,
    { method: 'GET' },
    'neon connection_uri',
  );
  const uriBody = (await uriRes.json()) as { uri: string };
  if (!uriBody.uri) throw new Error('neon response did not include a connection URI');
  return uriBody.uri;
}

async function createBranch(prNumber: string, parent?: string): Promise<void> {
  const name = `pr-${prNumber}`;
  // Idempotent: if a branch with this name already exists (PR was
  // pushed to again), delete it first so the new branch is created
  // from the latest parent data.
  await deleteBranchIfExists(name);
  const parentId = await parentIdFor(parent);
  const res = await neonFetch('/branches', {
    method: 'POST',
    body: JSON.stringify({
      branch: branchCreateFields(name, parentId),
      endpoints: [{ type: 'read_write' }],
    }),
  });
  if (!res.ok) {
    throw new Error(`neon branch create failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as BranchResponse;
  const uri = await connectionUri(body.branch.id, body.endpoints);
  // Emit a single line for CI consumption (set as DATABASE_URL secret).
  console.log(uri);
}

async function createDatabase(
  branchId: string,
  { name, ownerName }: PreviewDatabaseConfig,
): Promise<void> {
  await neonRequestWithLockRetry(
    `/branches/${branchId}/databases`,
    {
      method: 'POST',
      body: JSON.stringify({ database: { name, owner_name: ownerName } }),
    },
    'neon database create',
  );
}

async function createRole(branchId: string, name: string): Promise<void> {
  await neonRequestWithLockRetry(
    `/branches/${branchId}/roles`,
    { method: 'POST', body: JSON.stringify({ role: { name } }) },
    'neon preview role create',
  );
}

async function createDisabledEndpoint(branchId: string): Promise<NeonEndpoint> {
  const response = await neonRequestWithLockRetry(
    '/endpoints',
    {
      method: 'POST',
      body: JSON.stringify({
        endpoint: { branch_id: branchId, type: 'read_write', disabled: true },
      }),
    },
    'neon disabled preview endpoint create',
  );
  const { endpoint } = (await response.json()) as EndpointResponse;
  if (
    !endpoint?.id ||
    !endpoint.host ||
    endpoint.branch_id !== branchId ||
    endpoint.type !== 'read_write' ||
    endpoint.disabled !== true
  ) {
    throw new Error('neon preview endpoint was not created disabled on the expected branch');
  }
  return endpoint;
}

async function proveEndpointDisabled(endpointId: string): Promise<void> {
  const response = await neonRequestWithLockRetry(
    `/endpoints/${endpointId}`,
    { method: 'GET' },
    'neon preview endpoint safety check',
  );
  const { endpoint } = (await response.json()) as EndpointResponse;
  if (endpoint?.id !== endpointId || endpoint.disabled !== true) {
    throw new Error('neon preview endpoint enabled before sanitation was proved');
  }
}

async function enableEndpoint(endpointId: string): Promise<NeonEndpoint> {
  const response = await neonRequestWithLockRetry(
    `/endpoints/${endpointId}`,
    { method: 'PATCH', body: JSON.stringify({ endpoint: { disabled: false } }) },
    'neon sanitized preview endpoint enable',
  );
  const { endpoint } = (await response.json()) as EndpointResponse;
  if (
    !endpoint?.id ||
    endpoint.id !== endpointId ||
    !endpoint.host ||
    endpoint.type !== 'read_write' ||
    endpoint.disabled !== false
  ) {
    throw new Error('neon sanitized preview endpoint did not enable as expected');
  }
  return endpoint;
}

async function listDatabaseNames(branchId: string): Promise<string[]> {
  const response = await neonRequestWithLockRetry(
    `/branches/${branchId}/databases`,
    { method: 'GET' },
    'neon database list',
  );
  const body = (await response.json()) as DatabaseList;
  return body.databases.map((database) => database.name).sort();
}

async function deleteDatabase(branchId: string, name: string): Promise<void> {
  await neonRequestWithLockRetry(
    `/branches/${branchId}/databases/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
    `neon database delete for '${name}'`,
  );
}

async function listRoleNames(branchId: string): Promise<string[]> {
  const response = await neonRequestWithLockRetry(
    `/branches/${branchId}/roles`,
    { method: 'GET' },
    'neon role list',
  );
  const body = (await response.json()) as RoleList;
  return body.roles.map((role) => role.name).sort();
}

async function deleteRole(branchId: string, name: string): Promise<void> {
  await neonRequestWithLockRetry(
    `/branches/${branchId}/roles/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
    `neon role delete for '${name}'`,
  );
}

async function proveOnlyFreshDatabaseRemains(branchId: string, expected: string): Promise<void> {
  let actual: string[] = [];
  for (let attempt = 1; attempt <= SANITATION_VERIFY_ATTEMPTS; attempt += 1) {
    actual = await listDatabaseNames(branchId);
    if (actual.length === 1 && actual[0] === expected) return;
    if (attempt < SANITATION_VERIFY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 500, 2_000)));
    }
  }
  throw new Error(
    `neon preview sanitation failed: expected only '${expected}', found [${actual.join(', ')}]`,
  );
}

async function proveOnlyFreshRoleRemains(branchId: string, expected: string): Promise<void> {
  let actual: string[] = [];
  for (let attempt = 1; attempt <= SANITATION_VERIFY_ATTEMPTS; attempt += 1) {
    actual = await listRoleNames(branchId);
    if (actual.length === 1 && actual[0] === expected) return;
    if (attempt < SANITATION_VERIFY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 500, 2_000)));
    }
  }
  throw new Error(
    `neon preview sanitation failed: expected only role '${expected}', found [${actual.join(', ')}]`,
  );
}

/**
 * Clone the parent into a private ephemeral branch with no compute, then add a
 * disabled endpoint for management operations. Create a child-only role and
 * fresh database, delete every inherited database and role, and prove both the
 * result and the disabled endpoint before enabling it. No connection URI is
 * requested or emitted until then. Any earlier residue remains inaccessible
 * even if best-effort branch cleanup also fails.
 */
export async function createSanitizedPreview(prNumber: string, parent: string): Promise<string> {
  if (!/^\d+$/.test(prNumber)) throw new Error('pr-number must be a positive integer');
  const database = previewDatabaseConfig();
  const name = `pr-${prNumber}`;
  await deleteBranchIfExists(name);
  const parentId = await parentIdFor(parent);
  if (!parentId) throw new Error(`neon parent branch '${parent}' not found`);
  const res = await neonRequestWithLockRetry(
    '/branches',
    {
      method: 'POST',
      body: JSON.stringify({
        branch: branchCreateFields(name, parentId, 'parent-data'),
      }),
    },
    'neon preview branch create',
  );
  const body = (await res.json()) as BranchResponse;
  try {
    let endpoint = await createDisabledEndpoint(body.branch.id);
    const inheritedDatabases = await listDatabaseNames(body.branch.id);
    const inheritedRoles = await listRoleNames(body.branch.id);
    if (inheritedDatabases.includes(database.name)) {
      throw new Error(`preview database '${database.name}' already exists on parent branch`);
    }
    if (inheritedRoles.includes(database.ownerName)) {
      throw new Error(`preview role '${database.ownerName}' already exists on parent branch`);
    }
    await createRole(body.branch.id, database.ownerName);
    await createDatabase(body.branch.id, database);
    for (const inherited of inheritedDatabases) {
      await deleteDatabase(body.branch.id, inherited);
    }
    for (const inherited of inheritedRoles) {
      await deleteRole(body.branch.id, inherited);
    }
    await proveOnlyFreshDatabaseRemains(body.branch.id, database.name);
    await proveOnlyFreshRoleRemains(body.branch.id, database.ownerName);
    await proveEndpointDisabled(endpoint.id);
    endpoint = await enableEndpoint(endpoint.id);
    return await connectionUri(body.branch.id, [endpoint]);
  } catch (error) {
    try {
      await deleteBranchById(body.branch.id, name);
    } catch (cleanupError) {
      console.error(
        `[neon] failed to delete unsafe preview branch ${name}: ${String(cleanupError)}`,
      );
    }
    throw error;
  }
}

async function deleteBranchIfExists(name: string): Promise<void> {
  const target = (await listBranches()).find((branch) => branch.name === name);
  if (!target) return;
  await deleteBranchById(target.id, name);
  console.error(`[neon] deleted stale branch ${name} before recreate`);
}

async function deleteBranch(prNumber: string): Promise<void> {
  const name = `pr-${prNumber}`;
  const target = (await listBranches()).find((branch) => branch.name === name);
  if (!target) {
    console.error(`[neon] branch '${name}' not found — skipping delete`);
    return;
  }
  await deleteBranchById(target.id, name);
  console.error(`[neon] deleted branch ${name}`);
}

async function ensureBranch(name: string, parent?: string): Promise<void> {
  // Idempotent: if the named branch already exists, fetch its connection
  // URI; otherwise create it. Used for long-lived branches like `dev`
  // that must NOT be recreated on every deploy (that would wipe seeded
  // data and break referential integrity with R2 objects).
  const existing = (await listBranches()).find((branch) => branch.name === name);
  if (existing) {
    console.log(await connectionUri(existing.id));
    return;
  }
  const parentId = await parentIdFor(parent);
  const res = await neonFetch('/branches', {
    method: 'POST',
    body: JSON.stringify({
      branch: branchCreateFields(name, parentId),
      endpoints: [{ type: 'read_write' }],
    }),
  });
  if (!res.ok) {
    throw new Error(`neon branch create failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as BranchResponse;
  console.log(await connectionUri(body.branch.id, body.endpoints));
}

export async function existingBranchUri(name: string): Promise<string> {
  const existing = (await listBranches()).find((branch) => branch.name === name);
  if (!existing) throw new Error(`neon branch '${name}' not found`);
  return connectionUri(existing.id);
}

/**
 * Create a Neon branch named `snapshot-<sha>` off the prod parent
 * branch. Used as a pre-deploy safety net: if a deploy lands bad
 * data or a destructive migration on prod, we can restore prod from
 * this snapshot without needing PITR timestamp math.
 *
 * Idempotent: re-running with the same SHA is a no-op (Neon refuses
 * duplicate branch names with HTTP 409, which we treat as success).
 *
 * The parent branch defaults to `main`. Override with the second
 * positional arg if prod's Neon branch is named differently.
 *
 * Snapshot branches use COMPUTE-LESS endpoints (no `endpoints` in
 * the create body) — they exist only as restorable copy-on-write
 * pointers and cost essentially nothing until promoted. Promotion
 * is a manual `fly` + Doppler step documented in
 * docs/v4/arch-cicd-and-migrations.md §Failure & rollback playbook.
 */
async function snapshotBranch(sha: string, parent = 'main'): Promise<void> {
  const name = `snapshot-${sha.slice(0, 12)}`;
  const branches = await listBranches();
  if (branches.find((branch) => branch.name === name)) {
    console.error(`[neon] snapshot '${name}' already exists — skipping`);
    return;
  }
  const parentBranch = branches.find((branch) => branch.name === parent);
  if (!parentBranch) throw new Error(`neon parent branch '${parent}' not found`);
  const res = await neonFetch('/branches', {
    method: 'POST',
    body: JSON.stringify({
      branch: { name, parent_id: parentBranch.id },
      // Intentionally no endpoints[] — storage-only snapshot.
    }),
  });
  if (!res.ok) {
    throw new Error(`neon snapshot failed (${res.status}): ${await res.text()}`);
  }
  console.error(`[neon] created snapshot '${name}' off '${parent}'`);
}

/**
 * Delete `snapshot-*` branches older than `keepDays` days and cap the
 * remaining newest snapshots at `maxCount`. The count bound protects branch
 * capacity even when frequent deploys create several snapshots inside the
 * age window.
 */
async function pruneSnapshots(keepDays: string, maxCount = '3'): Promise<void> {
  const days = Number(keepDays);
  const count = Number(maxCount);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('keepDays must be a positive integer');
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('maxCount must be a non-negative integer');
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const snapshots = (await listBranches())
    .filter((branch) => branch.name.startsWith('snapshot-'))
    .sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
  const targets = snapshots.filter(
    (branch, index) => index >= count || new Date(branch.created_at).getTime() <= cutoff,
  );
  let deleted = 0;
  for (const branch of targets) {
    await deleteBranchById(branch.id, branch.name);
    console.error(`[neon] pruned snapshot ${branch.name}`);
    deleted += 1;
  }
  console.error(
    `[neon] pruned ${deleted} snapshot(s); retaining at most ${count} younger than ${days}d`,
  );
}

async function main(): Promise<void> {
  const [, , cmd, arg, option] = process.argv;
  if (!cmd || !arg) {
    console.error(
      'usage: branch.ts <create|create-empty|delete|ensure|uri|snapshot|prune-snapshots> <arg> [option]',
    );
    process.exit(2);
  }
  if (cmd === 'create') return createBranch(arg, option);
  if (cmd === 'create-empty') {
    if (!option) throw new Error('create-empty requires a parent branch');
    console.log(await createSanitizedPreview(arg, option));
    return;
  }
  if (cmd === 'delete') return deleteBranch(arg);
  if (cmd === 'ensure') return ensureBranch(arg, option);
  if (cmd === 'uri') {
    console.log(await existingBranchUri(arg));
    return;
  }
  if (cmd === 'snapshot') return snapshotBranch(arg, option);
  if (cmd === 'prune-snapshots') return pruneSnapshots(arg, option);
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
