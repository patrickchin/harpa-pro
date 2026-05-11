# Data layer (mobile)

> Companion: [arch-api-design.md](arch-api-design.md), [arch-mobile.md](arch-mobile.md).

## Goal

A single typed client where every endpoint, request shape, and
response shape is generated from `api-contract` — so a backwards-
incompatible API change fails the mobile typecheck before it ships.

## Pieces

```
lib/api/
  client.ts        # fetch wrapper: base URL, auth, error mapping
  hooks.ts         # generated React Query hooks (one per endpoint)
  errors.ts        # ApiError + classify(error)
  invalidation.ts  # cross-resource invalidation rules
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
case-by-case basis:

- `useCreateNote` is optimistic (note appears instantly with a
  pending state, swaps to confirmed on response).
- `useDeleteNote` is optimistic with rollback on error.
- Mutations that change pricing / billing / counts are NOT
  optimistic.

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

## Offline / queue

The upload queue (`features/upload/queue.ts`) is the only client
mutation that runs while offline. It persists via legend-state to
AsyncStorage; on app start the queue resumes from the last
non-completed step. See [arch-mobile.md](arch-mobile.md) Upload
Pipeline section.

## Auth header

`client.ts` reads the active session token from
`features/auth/useAuthSession` (which mirrors secure-store) and
attaches it to every request. On 401, it triggers `signOut()` and
the `(app)` layout redirects to `(auth)/login`.
