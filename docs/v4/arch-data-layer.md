# Data layer (mobile)

> Companion: [arch-api-design.md](arch-api-design.md), [arch-mobile.md](arch-mobile.md).

## Goal

A single typed client where every endpoint, request shape, and
response shape is generated from `api-contract` — so a backwards-
incompatible API change fails the mobile typecheck before it ships.

## Pieces

```
lib/api/
  client.ts            # fetch wrapper: base URL, auth, error mapping
  hooks.ts             # generated React Query hooks (one per endpoint)
  errors.ts            # ApiError + classify(error)
  invalidation.ts      # cross-resource invalidation rules + helpers
  optimistic.ts        # case-by-case optimistic wrappers (notes CRUD today)
  query-client.ts      # singleton QueryClient + resetQueryCache
  session-query-provider.tsx
                       # auth gate + user-scoped persister selection
  query-persister.ts   # MMKV-backed persister + dehydrate allowlist
  prefetch.ts          # onPressIn prefetch helpers (list → detail)
  initial-data.ts      # seed detail screens from list-cache rows
```

## Generated hooks

`packages/api-contract/src/generated/types.ts` exports:

- `paths` — typed map of operation → request/response shapes.
- `operations` — by `operationId`.

`apps/mobile/lib/api/hooks.ts` is **generated** from this by
`scripts/gen-api-hooks.ts` (run by `pnpm gen:api`):

```ts
export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => client.get('/projects') });

export const useCreateProject = () =>
  useMutation({
    mutationFn: (body) => client.post('/projects', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
// …
```

CI runs `pnpm gen:api` and `git diff --exit-code` so generated
hooks stay in sync with the spec.

## Optimistic updates

Default to **server-confirmed**, opt in to optimistic on a
case-by-case basis. Optimistic wrappers live in
`apps/mobile/lib/api/optimistic.ts` and compose on top of the
generated mutation hooks:

- `useOptimisticCreateNote` — inserts a temp `not_opt…` row into every
  cached `reportNotes` page in `onMutate`, swaps it for the server row
  in `onSuccess`, rolls back the snapshot in `onError`, and re-runs
  the central `useCreateNoteMutation` invalidation in `onSettled`.
- `useOptimisticUpdateNote` — patches the cached row by id, rollback
  on error.
- `useOptimisticDeleteNote` — removes the cached row by id, rollback
  on error.

The plain `useCreateNoteMutation` / `useDeleteNoteMutation` /
`useUpdateNoteMutation` from `hooks.ts` are still exported and used
where optimism isn't needed (e.g. background pipelines). Mutations
that change pricing / billing / counts are NOT optimistic.

Optimistic rows carry an id with the `not_opt` prefix.
`isOptimisticNoteId(id)` lets call sites recognise rows that don't
exist server-side yet (e.g. to suppress edit / delete actions until
the create resolves).

## Error handling

`client.ts` maps non-2xx responses to typed `ApiError` instances
based on the `error.code` enum from the API. `classify(error)`
returns `'auth' | 'rate' | 'validation' | 'network' | 'server'`
which screens use to pick the right banner / retry / re-auth flow.

## Cache invalidation rules

Centralised in `lib/api/invalidation.ts` — a single map of
`mutationKey → queryKeys to invalidate`. Adding a new mutation
without registering its invalidation rule fails a unit test
(`invalidation.coverage.test.ts`).

Two helpers expose the same rule list to non-React callers so the
client never grows a parallel, drift-prone copy:

- `runInvalidations(qc, hookName)` — runs the rule for a mutation
  hook by name. Used by `useVoiceNotePipeline` (which calls
  `request()` imperatively, not through the generated hook) so the
  voice path and `useCreateVoiceNoteMutation` always agree on what
  to invalidate.
- `invalidateAfterFileUpload(qc, { reportId })` — fires the
  `useCreateNoteMutation` invalidations after the upload queue
  finishes a photo / document. The queue runs imperatively and
  bypasses React Query mutations, but it ultimately calls
  `POST /reports/{report}/notes`, so its cache effect must match.

## Offline / queue

The upload queue (`lib/uploads/queue.ts`) is the only client
mutation that runs while offline. It persists via legend-state to
AsyncStorage; on app start the queue resumes from the last
non-completed step. See [arch-mobile.md](arch-mobile.md) Upload
Pipeline section.

## Auth header

`client.ts` reads the active session token from
`lib/auth/session` (`useAuthSession`, which mirrors secure-store)
and attaches it to every request. On 401, it triggers `signOut()`
and the `(app)` layout redirects to `(auth)/sign-in/email`.

## Perceived-speed: persistence, prefetch, initialData

Three orthogonal layers on top of the generated hooks make the app
feel instant. They all use the same singleton `QueryClient` in
`lib/api/query-client.ts`.

### 1. Persistent cache (MMKV)

`SessionQueryProvider` in `app/_layout.tsx` waits for better-auth to
resolve a stable user id, then mounts `PersistQueryClientProvider`
with that user's MMKV namespace. A cold start can therefore render
that user's last-seen UI immediately, then revalidate in the
background, without hydrating data before the principal is known.

- **Storage:** `react-native-mmkv` (id `rq-cache`, key
  `rq-cache-v2:<encoded-user-id>`). The former unscoped
  `rq-cache-v1` snapshot is discarded because its owner cannot be
  established safely.
- **`maxAge`:** 24h. Older blobs are dropped on restore.
- **`buster`:** `Constants.expoConfig?.version` — bump the app
  version (`app.config.ts`) to invalidate all persisted caches on
  the next release.
- **Allowlist** (`shouldDehydrateQuery`): only `success` queries
  whose first key segment is in `PERSISTED_KEY_HEADS` are written
  (`projects`, `project`, `projectMembers`, `projectReports`,
  `report`, `reportNotes`, `me`, `meLimits`). `meUsage` is
  deliberately excluded (changes too often). Pages containing
  optimistic `not_opt…` ids are also skipped so we don't restore
  pending state across launches.
- **Auth boundary:** while auth is loading or the user id changes,
  descendants are withheld and the shared in-memory `QueryClient` is
  cleared before the new scope mounts. Resolving to unauthenticated,
  explicit `signOut`, and the 401 handler also clear every persisted
  user snapshot. Thus session expiry and direct account switching are
  protected even when the explicit logout callback did not run.

### 2. Prefetch on press intent

List rows call a `usePrefetchX` hook from `lib/api/prefetch.ts` on
`Pressable.onPressIn` — the detail GET is in flight before the
route mounts. Examples:

- `projects-list` → `prefetchProject(slug)` +
  `prefetchProjectReports(slug)`.
- `reports-list` → `prefetchReport(slug, number)` (finalized rows
  only; drafts navigate to `/generate`).

**Key shape MUST match the generated hook exactly**
(`[head, input.params, undefined]`). A mismatched key writes a
separate cache entry and the destination hook still spins.
`prefetch.test.tsx` asserts shape by seeding under the asserted
key and confirming the real generated hook reads it.

### 3. `initialData` from list cache

Detail-screen call sites seed `useProjectQuery` / `useReportQuery`
with helpers from `lib/api/initial-data.ts`:

```ts
const qc = useQueryClient();
const result = useProjectQuery(
  { params: { project: slug } },
  {
    initialData: projectInitialData(qc, slug),
    initialDataUpdatedAt: projectInitialDataUpdatedAt(qc),
  },
);
```

`initialDataUpdatedAt` is **critical** — without it React Query
treats the seed as freshly fetched and skips background refetch.
Helpers walk every cached list variant (paginated `{items, nextCursor}`
envelopes) and return the first match, or `undefined`.

Wired on: project home / members / edit, reports list, saved
report (`projectInitialData` + `reportInitialData`). Generated
hooks are unchanged; this is call-site wiring only.

### Out of scope (future)

- AppState / NetInfo wiring for `focusManager` / `onlineManager`.
- Per-resource `staleTime` tuning.
- Aggregated `/reports/{n}/full` endpoint (would collapse four
  detail GETs into one).
- Broader optimistic coverage beyond notes.

Three automated gates keep the data-layer contract honest. Each one
catches a class of "silent escape" we don't want to discover in
production:

- **`packages/api/src/__tests__/contract.test.ts`** — the runtime
  OpenAPI doc must equal the frozen `packages/api-contract/openapi.json`,
  and every documented path must resolve to a registered handler.
- **`packages/api/src/__tests__/auth-coverage.test.ts`** — every
  registered route is either on the explicit public allowlist OR
  returns `401` for a request without an `Authorization` header.
  Forgetting `withAuth()` on a new route fails this test (and would
  otherwise leave `c.get('db')` undefined — see
  [arch-auth-and-rls.md](arch-auth-and-rls.md)).
- **`apps/mobile/lib/api/invalidation.coverage.test.ts`** — every
  mutation hook registers a `INVALIDATIONS` entry. Adding a new
  generated mutation without the matching cache-invalidation rule
  fails this test.

Zod / OpenAPI / Drizzle drift on _response_ shapes is partially
guarded by the contract test (Zod → OpenAPI → committed spec → mobile
types) — but the Drizzle column → Zod schema link is hand-written.
When you add a nullable column, the Zod field is `.nullable()` (not
`.nullable().optional()`) unless the server can omit the key from a
response. Mark a field `.optional()` only when the server may legally
not send the key at all.
