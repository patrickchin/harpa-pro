/**
 * Generates apps/mobile/lib/api/hooks.ts from packages/api-contract/openapi.json.
 *
 * Why an in-repo generator instead of orval / openapi-react-query-codegen:
 *  - Our `paths` types are already emitted by openapi-typescript in
 *    @harpa/api-contract. The hook layer is a thin wrapper around
 *    `request<P, M>` — ~20 lines per endpoint.
 *  - Third-party generators add multi-megabyte deps + per-tool config
 *    drift. The names below are the contract; reviewers can read the
 *    full mapping in one screen.
 *  - Spec-drift gate (`scripts/check-spec-drift.sh`) runs gen:hooks too,
 *    so a missing entry here fails CI alongside missing types.
 *
 * The naming map is intentional: every (method, path) gets a stable
 * hook name. Adding/removing/renaming a route is a contract change.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  hook: string;
  /** True for GETs (useQuery) — false for writes (useMutation). */
  query: boolean;
  /** Whether the path has `{...}` params. */
  hasPathParams: boolean;
  /** Whether the operation has a request body (any-of any media type). */
  hasBody: boolean;
  /** Default React Query queryKey head for queries. */
  queryKeyHead?: string;
  /**
   * For queries: which field of the input object holds path params (if any),
   * which holds query params. For simplicity in P2.3 we accept a single
   * `input` object and split it inside the hook body.
   */
}

/**
 * Canonical naming. Keep this list in 1:1 sync with openapi.json — the
 * generator throws if it sees a path/method combination not listed here,
 * and the `unknown` set below catches stale names that no longer match a
 * route.
 */
const ENDPOINTS: Endpoint[] = [
  // health
  { method: 'get', path: '/healthz', hook: 'useHealthQuery', query: true, hasPathParams: false, hasBody: false, queryKeyHead: 'health' },

  // auth
  { method: 'post', path: '/auth/otp/start',  hook: 'useStartOtpMutation',  query: false, hasPathParams: false, hasBody: true },
  { method: 'post', path: '/auth/otp/verify', hook: 'useVerifyOtpMutation', query: false, hasPathParams: false, hasBody: true },
  { method: 'post', path: '/auth/logout',     hook: 'useLogoutMutation',    query: false, hasPathParams: false, hasBody: false },

  { method: 'get',   path: '/me',       hook: 'useMeQuery',          query: true,  hasPathParams: false, hasBody: false, queryKeyHead: 'me' },
  { method: 'patch', path: '/me',       hook: 'useUpdateMeMutation', query: false, hasPathParams: false, hasBody: true },
  { method: 'get',   path: '/me/usage', hook: 'useMeUsageQuery',     query: true,  hasPathParams: false, hasBody: false, queryKeyHead: 'meUsage' },

  // projects
  { method: 'get',    path: '/projects',                              hook: 'useListProjectsQuery',         query: true,  hasPathParams: false, hasBody: false, queryKeyHead: 'projects' },
  { method: 'post',   path: '/projects',                              hook: 'useCreateProjectMutation',     query: false, hasPathParams: false, hasBody: true },
  { method: 'get',    path: '/projects/{id}',                         hook: 'useProjectQuery',              query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'project' },
  { method: 'patch',  path: '/projects/{id}',                         hook: 'useUpdateProjectMutation',     query: false, hasPathParams: true,  hasBody: true },
  { method: 'delete', path: '/projects/{id}',                         hook: 'useDeleteProjectMutation',     query: false, hasPathParams: true,  hasBody: false },
  { method: 'get',    path: '/projects/{id}/members',                 hook: 'useProjectMembersQuery',       query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'projectMembers' },
  { method: 'post',   path: '/projects/{id}/members',                 hook: 'useAddProjectMemberMutation',  query: false, hasPathParams: true,  hasBody: true },
  { method: 'delete', path: '/projects/{id}/members/{userId}',        hook: 'useRemoveProjectMemberMutation', query: false, hasPathParams: true,  hasBody: false },

  // reports
  { method: 'get',    path: '/projects/{id}/reports',                 hook: 'useProjectReportsQuery',       query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'projectReports' },
  { method: 'post',   path: '/projects/{id}/reports',                 hook: 'useCreateReportMutation',      query: false, hasPathParams: true,  hasBody: true },
  { method: 'get',    path: '/reports/{reportId}',                    hook: 'useReportQuery',               query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'report' },
  { method: 'patch',  path: '/reports/{reportId}',                    hook: 'useUpdateReportMutation',      query: false, hasPathParams: true,  hasBody: true },
  { method: 'delete', path: '/reports/{reportId}',                    hook: 'useDeleteReportMutation',      query: false, hasPathParams: true,  hasBody: false },
  { method: 'post',   path: '/reports/{reportId}/generate',           hook: 'useGenerateReportMutation',    query: false, hasPathParams: true,  hasBody: true },
  { method: 'post',   path: '/reports/{reportId}/regenerate',         hook: 'useRegenerateReportMutation',  query: false, hasPathParams: true,  hasBody: true },
  { method: 'post',   path: '/reports/{reportId}/finalize',           hook: 'useFinalizeReportMutation',    query: false, hasPathParams: true,  hasBody: false },
  { method: 'post',   path: '/reports/{reportId}/pdf',                hook: 'useReportPdfMutation',         query: false, hasPathParams: true,  hasBody: false },

  // notes
  { method: 'get',    path: '/reports/{reportId}/notes',              hook: 'useReportNotesQuery',          query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'reportNotes' },
  { method: 'post',   path: '/reports/{reportId}/notes',              hook: 'useCreateNoteMutation',        query: false, hasPathParams: true,  hasBody: true },
  { method: 'patch',  path: '/notes/{noteId}',                        hook: 'useUpdateNoteMutation',        query: false, hasPathParams: true,  hasBody: true },
  { method: 'delete', path: '/notes/{noteId}',                        hook: 'useDeleteNoteMutation',        query: false, hasPathParams: true,  hasBody: false },

  // files
  { method: 'post',   path: '/files/presign',                         hook: 'usePresignFileMutation',       query: false, hasPathParams: false, hasBody: true },
  { method: 'post',   path: '/files',                                 hook: 'useCreateFileMutation',        query: false, hasPathParams: false, hasBody: true },
  { method: 'get',    path: '/files/{id}/url',                        hook: 'useFileUrlQuery',              query: true,  hasPathParams: true,  hasBody: false, queryKeyHead: 'fileUrl' },

  // voice
  { method: 'post',   path: '/voice/transcribe',                      hook: 'useTranscribeVoiceMutation',   query: false, hasPathParams: false, hasBody: true },
  { method: 'post',   path: '/voice/summarize',                       hook: 'useSummarizeVoiceMutation',    query: false, hasPathParams: false, hasBody: true },

  // settings
  { method: 'get',    path: '/settings/ai',                           hook: 'useAiSettingsQuery',           query: true,  hasPathParams: false, hasBody: false, queryKeyHead: 'aiSettings' },
  { method: 'patch',  path: '/settings/ai',                           hook: 'useUpdateAiSettingsMutation',  query: false, hasPathParams: false, hasBody: true },
];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const specPath = resolve(repoRoot, 'packages/api-contract/openapi.json');
const outPath = resolve(here, '..', 'lib/api/hooks.ts');

const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

// Validate that ENDPOINTS matches the spec exactly. Drift here means
// the generator (and the invalidation map) is stale.
const specPairs = new Set<string>();
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const method of Object.keys(ops)) {
    if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
    specPairs.add(`${method} ${path}`);
  }
}
const tablePairs = new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`));
const missingFromTable = [...specPairs].filter((p) => !tablePairs.has(p));
const stale = [...tablePairs].filter((p) => !specPairs.has(p));
if (missingFromTable.length || stale.length) {
  console.error('gen-hooks: ENDPOINTS table is out of sync with openapi.json');
  if (missingFromTable.length) console.error('  missing entries:', missingFromTable);
  if (stale.length) console.error('  stale entries (no longer in spec):', stale);
  process.exit(1);
}

const banner = `/**
 * AUTO-GENERATED by apps/mobile/scripts/gen-hooks.ts. DO NOT EDIT.
 *
 * Run \`pnpm gen:api\` to regenerate. The spec-drift gate
 * (scripts/check-spec-drift.sh) fails CI if this file is out of date.
 *
 * Each hook is a thin wrapper over \`request(path, method, ...)\` from
 * \`./client.js\`. Mutations call into the central invalidation map
 * (\`./invalidation.js\`) so post-write cache busts are declarative
 * and tested.
 */
/* eslint-disable */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { request, type RequestBody, type ResponseBody, type PathParams, type QueryParams } from './client.js';
import { ApiError } from './errors.js';
import { INVALIDATIONS, INVALIDATIONS_NONE } from './invalidation.js';
`;

function emitQueryHook(e: Endpoint): string {
  const path = JSON.stringify(e.path);
  const m = JSON.stringify(e.method);
  const head = JSON.stringify(e.queryKeyHead ?? e.hook);
  const inputType = e.hasPathParams
    ? `{ params: PathParams<${path}, ${m}>; query?: QueryParams<${path}, ${m}> }`
    : `{ query?: QueryParams<${path}, ${m}> } | void`;
  const inputArg = e.hasPathParams ? 'input' : 'input?';
  const queryKey = e.hasPathParams
    ? `[${head}, (input as any).params, (input as any).query] as const`
    : `[${head}, (input as any)?.query] as const`;
  const requestArgs = e.hasPathParams
    ? `request(${path}, ${m}, { params: (input as any).params, query: (input as any).query, signal })`
    : `request(${path}, ${m}, { query: (input as any)?.query, signal })`;
  return `
export function ${e.hook}(
  ${inputArg}: ${inputType},
  options?: Omit<UseQueryOptions<ResponseBody<${path}, ${m}>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<ResponseBody<${path}, ${m}>, ApiError>({
    queryKey: ${queryKey},
    queryFn: ({ signal }) => ${requestArgs},
    ...options,
  });
}
`;
}

function emitMutationHook(e: Endpoint): string {
  const path = JSON.stringify(e.path);
  const m = JSON.stringify(e.method);
  // Variables shape: { params?, body? } depending on what the op needs.
  const parts: string[] = [];
  if (e.hasPathParams) parts.push(`params: PathParams<${path}, ${m}>`);
  if (e.hasBody) parts.push(`body: RequestBody<${path}, ${m}>`);
  const varsType = parts.length ? `{ ${parts.join('; ')} }` : 'void';
  const requestArgs: string[] = [];
  if (e.hasPathParams) requestArgs.push(`params: (vars as any).params`);
  if (e.hasBody) requestArgs.push(`body: (vars as any).body`);
  const reqCall = requestArgs.length
    ? `request(${path}, ${m}, { ${requestArgs.join(', ')} })`
    : `request(${path}, ${m})`;
  return `
export function ${e.hook}(
  options?: UseMutationOptions<ResponseBody<${path}, ${m}>, ApiError, ${varsType}>,
) {
  const qc = useQueryClient();
  return useMutation<ResponseBody<${path}, ${m}>, ApiError, ${varsType}>({
    mutationFn: (vars) => ${reqCall},
    ...options,
    onSuccess: (...args) => {
      const rule = INVALIDATIONS[${JSON.stringify(e.hook)}];
      if (rule && rule !== INVALIDATIONS_NONE) {
        for (const head of rule) {
          qc.invalidateQueries({ queryKey: [head] });
        }
      }
      return options?.onSuccess?.(...args);
    },
  });
}
`;
}

const groups: Record<string, string[]> = {};
for (const e of ENDPOINTS) {
  const tag = e.path.split('/')[1] || 'misc';
  groups[tag] ??= [];
  groups[tag].push(e.query ? emitQueryHook(e) : emitMutationHook(e));
}

const sections = Object.entries(groups)
  .map(([tag, blocks]) => `// ─── ${tag} ───────────────────────────────────────────${blocks.join('')}`)
  .join('\n');

const out = banner + '\n' + sections + '\n';
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${ENDPOINTS.length} endpoints)`);
