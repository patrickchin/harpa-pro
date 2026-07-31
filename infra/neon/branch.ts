/**
 * Neon branching API wrapper.
 *
 * Usage:
 *   pnpm db:branch:create <pr-number> [parent]
 *   pnpm db:branch:delete <pr-number>
 *   pnpm db:branch:ensure <branch-name> [parent]
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
const NEON_API = 'https://console.neon.tech/api/v2';
const PR_BRANCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface BranchResponse {
  branch: { id: string; name: string };
  endpoints: NeonEndpoint[];
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
}

function requiredEnv(name: 'NEON_DATABASE_NAME' | 'NEON_ROLE_NAME', fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!value.trim()) throw new Error(`${name} must not be empty`);
  return value;
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
): { name: string; parent_id?: string; expires_at?: string } {
  return {
    name,
    ...(parentId ? { parent_id: parentId } : {}),
    ...(name.startsWith('pr-') ? { expires_at: expiresInSevenDays() } : {}),
  };
}

async function deleteBranchById(id: string, name: string): Promise<void> {
  const res = await neonFetch(`/branches/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`neon branch delete failed for '${name}' (${res.status}): ${await res.text()}`);
  }
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
    const epRes = await neonFetch(`/branches/${branchId}/endpoints`);
    if (!epRes.ok) {
      throw new Error(`neon endpoint list failed (${epRes.status}): ${await epRes.text()}`);
    }
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
  const uriRes = await neonFetch(`/connection_uri?${params.toString()}`);
  if (!uriRes.ok) {
    throw new Error(`neon connection_uri failed (${uriRes.status}): ${await uriRes.text()}`);
  }
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
      'usage: branch.ts <create|delete|ensure|snapshot|prune-snapshots> <arg> [option]',
    );
    process.exit(2);
  }
  if (cmd === 'create') return createBranch(arg, option);
  if (cmd === 'delete') return deleteBranch(arg);
  if (cmd === 'ensure') return ensureBranch(arg, option);
  if (cmd === 'snapshot') return snapshotBranch(arg, option);
  if (cmd === 'prune-snapshots') return pruneSnapshots(arg, option);
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
