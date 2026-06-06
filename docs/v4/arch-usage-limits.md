# Per-account usage limits

> Companion: [arch-api-design.md](arch-api-design.md),
> [arch-database.md](arch-database.md),
> [arch-auth-and-rls.md](arch-auth-and-rls.md).
>
> Lessons applied:
> [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 6](pitfalls.md#pitfall-6--per-request-db-scope-rls-replacement-added-late),
> [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken),
> [Pitfall 15](pitfalls.md#pitfall-15--route-handlers-that-ignore-user-settings),
> [Pitfall 16](pitfalls.md#pitfall-16--derived-fallback-fixture-name-silently-disables-ai_live).

## 1. Problem

We already record per-user usage (`app.llm_usage_events` + the monthly aggregator in `auth/service.ts::fetchUsage`) and surface it via `GET /me/usage`. What we lack is **enforcement** — any account can issue unlimited generations against live providers, with no cap and no "upgrade" surface on mobile.

This doc designs the plan model (free / pro / enterprise + admin override), the counting model, the enforcement point (`enforceUsageLimit` called pre-side-effect), the 403 error envelope + mobile contract, and the admin override path (one-row UPDATE, not a deploy).

Acceptance: every route consuming paid AI capacity calls `enforceUsageLimit(...)` before the side-effect; at-limit users get 403 with structured details; mobile renders an `AppDialogSheet` with `limit`/`used`/`resetAt`; `GET /me/usage` includes `limits + remaining` for one-round-trip rendering.

## 2. Counting model — live count from existing tables

Compute `used` for each bucket by querying the source-of-truth tables that already power `GET /me/usage`:

| Bucket            | Source table            | Predicate                                         |
| ----------------- | ----------------------- | ------------------------------------------------- |
| `report_generate` | `app.llm_usage_events`  | `user_id=? AND operation='generate_report' AND status='ok' AND created_at >= date_trunc('month', now())` |
| `voice_transcribe`| `app.llm_usage_events`  | `user_id=? AND operation='transcribe'      AND status='ok' AND created_at >= …` |
| `voice_summarize` | `app.llm_usage_events`  | `user_id=? AND operation='chat'            AND status='ok' AND created_at >= …` |
| `ai_input_tokens` | `app.llm_usage_events`  | `sum(input_tokens) FILTER (WHERE operation IN ('chat','generate_report'))` — transcribe rows store audio duration in `input_seconds`, not tokens. |
| `ai_output_tokens`| `app.llm_usage_events`  | `sum(output_tokens) FILTER (WHERE operation IN ('chat','generate_report'))` — same |

**Why:** one source of truth — the same row that produces the usage screen gates the next call. No drift, no background reconciler, no "counter table forgotten by a new route" failure mode. Cost: one extra small `count(*)`/`sum()` per gated request, mitigated by a partial index `(user_id, created_at) WHERE status='ok'` on `app.llm_usage_events` (added in the same migration as the limits table).

A separate counter table (Pitfall 8 dual-source-of-truth) and an Upstash token bucket (rolling window misaligns with calendar-month plan caps; not source-of-truth for who already consumed what) were both rejected.

## 3. Data model

### 3.1 Plan column on `auth.users`

```sql
ALTER TABLE auth.users
  ADD COLUMN plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise'));
```

`plan` is admin-managed for now (no self-serve upgrade flow yet —
that's a P5+ billing question). The default `'free'` is intentional
so a brand-new signup is immediately gated.

### 3.2 Plan limits — code, not data

```ts
// packages/api/src/services/usage-limits.ts
export type LimitKind =
  | 'report_generate'
  | 'voice_transcribe'
  | 'voice_summarize'
  | 'ai_input_tokens'
  | 'ai_output_tokens';

export interface PlanLimits {
  report_generate: number;   // count per calendar month, UTC
  voice_transcribe: number;
  voice_summarize: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
}

export const PLAN_LIMITS: Record<'free' | 'pro' | 'enterprise', PlanLimits> = {
  free:       { report_generate:  1_000, voice_transcribe:  1_000, voice_summarize:  1_000, ai_input_tokens:   200_000_000, ai_output_tokens:   50_000_000 },
  pro:        { report_generate: 10_000, voice_transcribe: 10_000, voice_summarize: 10_000, ai_input_tokens: 2_000_000_000, ai_output_tokens: 500_000_000 },
  enterprise: { report_generate: Number.POSITIVE_INFINITY, voice_transcribe: Number.POSITIVE_INFINITY, voice_summarize: Number.POSITIVE_INFINITY, ai_input_tokens: Number.POSITIVE_INFINITY, ai_output_tokens: Number.POSITIVE_INFINITY },
};
```

Limits live in code (not a `plan_limits` table) so they're
type-checked, diff-visible in PRs, and easy to A/B in a follow-up.
`Number.POSITIVE_INFINITY` is the explicit "unbounded" marker —
serialised over the wire as `null` (see §5).

### 3.3 Per-user overrides — `app.user_limit_overrides`

```sql
CREATE TABLE app.user_limit_overrides (
  user_id           text PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- nullable: only the buckets the admin bumped; otherwise fall through to PLAN_LIMITS.
  report_generate   integer,
  voice_transcribe  integer,
  voice_summarize   integer,
  ai_input_tokens   bigint,
  ai_output_tokens  bigint,
  reason            text NOT NULL,
  granted_by        text NOT NULL REFERENCES auth.users(id),
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz   -- nullable = permanent
);
ALTER TABLE app.user_limit_overrides ENABLE ROW LEVEL SECURITY;

-- Owner read; nobody writes via app_authenticated (only admins via a
-- privileged path mounted under withAdmin — same model as adminRoutes).
CREATE POLICY user_limit_overrides_self_read ON app.user_limit_overrides
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id')::app.usr_id);
```

Effective limit for a bucket = `override[bucket] ?? PLAN_LIMITS[user.plan][bucket]`.
An override of `-1` means "explicitly unlimited" (serialised as `null`)
— distinct from `NULL` which means "no override, fall through to plan".

Override mutations go through admin-only routes (§6) — never through
scoped writes by the user themselves. Lint guard: a grep gate forbids
`update.*user_limit_overrides` outside `routes/admin.ts` /
`services/usage-limits.ts`.

### 3.4 Indexes (same migration as the table)

```sql
-- Used by enforceUsageLimit's per-bucket count/sum queries.
CREATE INDEX llm_usage_events_user_status_created_idx
  ON app.llm_usage_events (user_id, status, created_at);
```

## 4. Enforcement: `enforceUsageLimit`

### 4.1 Service signature

```ts
// packages/api/src/services/usage-limits.ts
export interface LimitCheck {
  kind: LimitKind;
  amount?: number;          // for token buckets — defaults to 1 for count buckets
}

export interface LimitState {
  kind: LimitKind;
  limit: number | null;     // null = unbounded
  used: number;
  remaining: number | null; // null = unbounded
  resetAt: string;          // ISO-8601 — first day of next UTC month
  plan: 'free' | 'pro' | 'enterprise';
  overridden: boolean;
}

export class UsageLimitExceededError extends Error {
  constructor(public state: LimitState) {
    super(`Usage limit exceeded for ${state.kind}`);
    this.name = 'UsageLimitExceededError';
  }
}

/**
 * Called from gated route handlers BEFORE the side-effect. Reads
 * `auth.users.plan` + any row in `app.user_limit_overrides`, computes
 * current-month `used` from `app.llm_usage_events`, throws
 * `UsageLimitExceededError` if `used + amount > limit`.
 *
 * Runs against the scoped DB so the queries hit RLS — no service-role
 * bypass. The check is read-only; the side-effect (the LLM call and
 * its `llm_usage_events` INSERT) is the thing that consumes quota.
 */
export async function enforceUsageLimit(
  db: ScopedDb,
  userId: string,
  check: LimitCheck,
): Promise<LimitState> { … }
```

For token buckets (`ai_input_tokens`, `ai_output_tokens`) we can't
know the cost up-front — those are enforced **post-hoc** in the
same chokepoint that writes `llm_usage_events`: if the write would
push `used` past `limit`, the row is still written (we already paid
the provider) but a `usage_limit_exceeded_after` flag is logged in
the response so the next call from the same user gets blocked. This
matches how every provider-side usage cap (OpenAI, Anthropic) is
modelled — you can't refund a token.

Count buckets (`report_generate`, `voice_transcribe`, `voice_summarize`)
are enforced **pre-hoc**: the route refuses to issue the call.

### 4.2 Wiring per route

| Route                                  | Bucket            | Phase   |
| -------------------------------------- | ----------------- | ------- |
| `POST /reports/:n/generate`            | `report_generate` | pre     |
| `POST /reports/:n/regenerate`          | `report_generate` | pre     |
| `POST /voice/transcribe`               | `voice_transcribe`| pre     |
| `POST /voice/summarize`                | `voice_summarize` | pre     |
| (every AI call, in `services/ai.ts`)   | `ai_*_tokens`     | post    |

Token enforcement lives **inside `services/ai.ts`** at the same
chokepoint that records `llm_usage_events` — see
`recordLlmUsage`. After the row is written, the chokepoint reads
the post-write `used` and, if `used > limit`, throws
`UsageLimitExceededError` so the **next** call from this user is
the one that fails. The current call already happened and is
billed; we surface that fact in the response (`X-Usage-Warning:
near-limit` header for >80%, response error for next call).

### 4.3 Pitfall 15 guard

A grep gate (`scripts/check-usage-limit-wiring.sh`) enforces that
every route file matching the table above contains an
`enforceUsageLimit(` call. CI runs it as part of `pnpm lint`. If
you add a new route that consumes paid AI capacity, you add it to
the gate's allowlist + add the call — both in the same commit.

### 4.4 Pitfall 13 guard

`enforceUsageLimit` is **not** behind a DI factory. It's a plain
function over `ScopedDb`. The "default wiring" integration test is
the route-level test that:

1. Boots the real route with the real auth middleware.
2. Inserts 5 `llm_usage_events` rows for actor A in the current month
   (no DI stubs, no factory overrides).
3. POSTs the 6th report-generate request.
4. Asserts the response is `403 USAGE_LIMIT_EXCEEDED` and the
   `app.llm_usage_events` count is still 5 (no 6th row written).

No `setUsageLimitClient({ … })` stub exists. A test that wants to
exercise the "limit is 1000" path patches `PLAN_LIMITS` via
`vi.mock` — but the **default-wiring** test never does.

## 5. API contract

### 5.1 New + extended routes

| Method | Path                  | Purpose                                                          |
| ------ | --------------------- | ---------------------------------------------------------------- |
| GET    | `/me/limits`          | Current effective limits + used + remaining + resetAt per bucket |
| GET    | `/me/usage`           | _extended_ — now also includes `limits` field (§5.3)             |
| PATCH  | `/admin/users/:id/plan`             | Admin-only — change `auth.users.plan`               |
| PUT    | `/admin/users/:id/limit-overrides`  | Admin-only — upsert overrides row                   |
| DELETE | `/admin/users/:id/limit-overrides`  | Admin-only — drop overrides                         |

### 5.2 Zod schemas (in `packages/api-contract/src/usage.ts`)

```ts
export const limitKind = z.enum([
  'report_generate',
  'voice_transcribe',
  'voice_summarize',
  'ai_input_tokens',
  'ai_output_tokens',
]);

export const limitState = z.object({
  kind: limitKind,
  limit: z.number().int().nullable(),       // null = unbounded
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nullable(),   // null = unbounded
  resetAt: z.string().datetime(),
  plan: z.enum(['free', 'pro', 'enterprise']),
  overridden: z.boolean(),
});

export const limitsResponse = z.object({
  plan: z.enum(['free', 'pro', 'enterprise']),
  buckets: z.array(limitState),
});

export const limitOverrideRequest = z.object({
  report_generate: z.number().int().nullable().optional(),
  voice_transcribe: z.number().int().nullable().optional(),
  voice_summarize: z.number().int().nullable().optional(),
  ai_input_tokens: z.number().int().nullable().optional(),
  ai_output_tokens: z.number().int().nullable().optional(),
  reason: z.string().min(3).max(500),
  expiresAt: z.string().datetime().nullable(),
});
```

### 5.3 Error envelope on a blocked call

Standard envelope from `arch-api-design.md` §"Error format" — code is
the new stable string `usage_limit_exceeded`, HTTP status is **403**
(not 429 — 429 implies "retry shortly" which is wrong for a monthly
reset; 403 + structured details is the right shape for "you can't
do this until you either upgrade or wait for resetAt").

```jsonc
HTTP/1.1 403 Forbidden
{
  "error": {
    "code": "usage_limit_exceeded",
    "message": "Monthly report generation limit reached.",
    "details": {
      "kind": "report_generate",
      "limit": 5,
      "used": 5,
      "remaining": 0,
      "resetAt": "2026-06-01T00:00:00.000Z",
      "plan": "free",
      "overridden": false
    }
  },
  "requestId": "req_…"
}
```

A near-limit (>80% used) request still succeeds but the response
carries an `X-Usage-Warning: near-limit; bucket=report_generate;
pct=80` header (where `pct` is the integer usage percentage 0–100),
so mobile can surface a one-time toast without parsing a second
endpoint.

### 5.4 `GET /me/usage` extension

The existing `usageResponse` schema gains a `limits` field shaped
identically to `limitsResponse.buckets`. Backwards compatible (new
optional field). The usage screen renders the existing month bars
**and** the limit progress in one round-trip.

## 6. Admin path

`packages/api/src/routes/admin.ts` already mounts under
`withAdmin` (checks `auth.users.is_admin`). We add three handlers:

- `PATCH /admin/users/:id/plan` — body `{ plan: 'free'|'pro'|'enterprise' }`.
- `PUT /admin/users/:id/limit-overrides` — upsert one row in
  `app.user_limit_overrides`; body is `limitOverrideRequest`.
- `DELETE /admin/users/:id/limit-overrides` — drop the row.

The admin's identity is recorded in `granted_by`. An audit log line
(`audit_limit_change`) is emitted on every mutation — same pattern
as the test-account password bypass audit in
[arch-auth-and-rls.md](arch-auth-and-rls.md#test-account-password-bypass-live-deployments).

Admin routes use the same scoped DB but elevated via `withAdmin`
middleware that re-checks `is_admin` on every request (Pitfall 6 —
no role caching in the JWT; the DB is the source of truth).

## 7. Scope tests (Pitfall 6)

For every authed surface, the paired-test rule from
`arch-auth-and-rls.md §Test gates` applies:

| Surface                                            | Own (200/403)                                | Cross (404/403)                                              |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `GET /me/limits`                                   | A reads A's limits → 200                     | _no cross_ (route is `/me`, scope-pinned)                    |
| `GET /me/usage`                                    | A reads A's usage+limits → 200                | _no cross_                                                    |
| `POST /reports/:n/generate` (at-limit)             | A blocked at 5/5 → 403                        | B unaffected at 0/5 → 200                                     |
| `app.user_limit_overrides` read                    | A reads own override row → row               | A reads B's override row → empty (RLS hides it)              |
| `app.user_limit_overrides` write (non-admin)       | _denied at route layer (no public route)_     | _denied at table layer (no INSERT/UPDATE grant)_              |
| `PATCH /admin/users/:id/plan` (non-admin caller)    | _denied at withAdmin → 403_                   | n/a                                                           |

Plus the negative-control test from §Test gates — same query without
the scope wrapper returns the other actor's override row, proving
the wrapper is what protects it.

## 8. Mobile contract

### 8.1 Usage screen

`apps/mobile/screens/usage.tsx` (already shipped in P3.13) renders
the per-month bars. We extend it with a "Plan + limits" card at the
top:

```
┌───────────────────────────────────────────┐
│ Free plan                       Upgrade ▸ │
│                                           │
│ Reports         ■■■■■░░░░░  5 / 10        │
│ Voice notes     ■■░░░░░░░░ 12 / 60        │
│ Resets May 1, 2026 (UTC)                  │
└───────────────────────────────────────────┘
```

Data comes from the existing `GET /me/usage` round-trip — the new
`limits` field is rendered directly. No separate `/me/limits` call
on this screen; the standalone `GET /me/limits` exists for the
"blocked dialog" surface to refresh without re-fetching the heavy
usage payload.

### 8.2 Limit-reached dialog

A new `AppDialogSheet` variant
(`apps/mobile/components/dialogs/UsageLimitDialog.tsx`) is shown
when the data layer's error handler sees `code:'usage_limit_exceeded'`.
Body shows `{message, used, limit, resetAt}` and offers a "Go to
usage" CTA that `router.push('/account/usage')`.

**No `Alert.alert`** — Pitfall 12. The shared error-handler in
`lib/api/errors.ts` recognises the new code and dispatches the
dialog via `useAppDialogSheet()`.

### 8.3 Near-limit toast

A response with `X-Usage-Warning: near-limit;…` triggers a
**once-per-session** toast (in-memory dedupe by `bucket`). Lives in
`lib/api/usage-warning.ts` — same place that already inspects
response headers for the rate-limit warning.

## 9. Fixture rows (Pitfall 2)

Two new fixtures in `packages/ai-fixtures/fixtures/`:

- `usage-limits.report-generate-blocked.json` — the canned
  "monthly limit reached" response for the Maestro flow.
- `usage-limits.near-limit-warning.json` — the canned response
  carrying `X-Usage-Warning`.

These are HTTP-shape fixtures used by the mobile MSW layer in
`:mock` builds, not AI fixtures (no LLM call happens — the route
short-circuits before reaching `services/ai.ts`). They live under
`packages/ai-fixtures/fixtures/` only because that's where the
HTTP fixture loader already reads from; if/when we split the
loaders we move them.

## 10. Maestro flows

Add two flows under `.maestro/modules/`:

- `14a-usage-limit-blocked.yaml` — Alice generates reports until
  she hits her limit, sees the `UsageLimitDialog`, taps "Go to
  usage", sees the progress bar at 100%.
- `14b-near-limit-toast.yaml` — Bob at 4/5 sees the toast on the
  5th generate.

Both are added to `.maestro/regression-journey.yaml`'s module list
in the P4.8 design (`design-maestro-full-regression.md`) — file a
follow-up edit there in the same PR that lands the flows.

## 11. Carve-outs

The following are explicit non-goals here and tracked in
[plan-p5-beta-ga.md](plan-p5-beta-ga.md):

1. **Self-serve upgrade flow / billing integration** (Stripe etc.).
   Plan changes are admin-only until P5.x. Filed as
   `plan-p5-beta-ga.md §P5.6 self-serve billing` (to be created
   when this feature lands — link from this section in the same PR).
2. **Per-project / per-org limits.** All limits today are per-user;
   we don't gate on project ownership. Multi-seat plans are P5+.
3. **Hard-cap vs. soft-cap policy split.** Today every bucket is
   hard-capped. A future "soft-cap with overage billing" mode is
   out of scope.
4. **Live token-cost dollarization.** We meter input/output tokens,
   not USD. A future "$ this month" view depends on a per-vendor
   price table — out of scope.

### Phase status (delivered)

- **Phase 1** (count buckets) — landed via `c0ec709`.
- **Phase 2** — post-hoc token-bucket enforcement inside
  `services/ai.ts::withUsageAccounting` + `X-Usage-Warning: near-limit`
  header (PR #38).
- **Phase 3** — mobile `UsageLimitsCard` on the Usage screen +
  `UsageLimitDialog` wired into report generate/regenerate and the
  voice-note pipeline. Count + token buckets enforced end-to-end.
- **Deferred:** Maestro flows landed as placeholders
  (`.maestro/p3-14a-usage-limits-card.yaml` runs today;
  `p3-14b-usage-limit-dialog.yaml` needs `reset-db.sh --seed-at-limit`;
  `p3-14c-near-limit-toast.yaml` needs the `X-Usage-Warning` toast
  consumer). Not yet in the regression journey. Self-serve upgrades
  remain Phase 4.

## 12. Implementation checklist

One item ≈ one commit. Order matters — migration first so the
service has a column to read; tests + docs land with each step
(Pitfall 10).

1. `feat(api): add auth.users.plan + app.user_limit_overrides + index`
   — migration `0007_usage_limits.sql` + Drizzle schema + scope
   policy + scope tests (cross-actor read of override row).
2. `feat(contract): usage-limit Zod schemas + error code`
   — `packages/api-contract/src/usage.ts` + re-export +
   `errorCodes.usage_limit_exceeded`.
3. `feat(api): enforceUsageLimit service + UsageLimitExceededError mapping`
   — `services/usage-limits.ts` + error mapper update + unit tests
   for the math (plan + override merge, INFINITY → null serialise).
4. `feat(api): wire enforceUsageLimit into reports.generate + regenerate`
   — pre-hoc check; integration test for at-limit 403 + under-limit
   200 + default-wiring test (no DI stubs).
5. `feat(api): wire enforceUsageLimit into voice.transcribe + voice.summarize`
   — same shape; integration tests.
6. `feat(api): token-bucket post-hoc enforcement in services/ai.ts`
   — `recordLlmUsage` consults limits after write; next call from
   over-quota user fails. Integration test exercises the two-call
   sequence end-to-end.
7. `feat(api): GET /me/limits + extend GET /me/usage with limits`
   — route + Zod + integration tests + contract test.
8. `feat(api): admin routes for plan + overrides + audit log`
   — three handlers + audit-log line + withAdmin tests +
   non-admin-denied tests.
9. `chore(api): check-usage-limit-wiring.sh grep gate + lint integration`
   — adds the allowlist of files that must call `enforceUsageLimit`;
   wires into `pnpm lint`.
10. `feat(mobile): usage-limit dialog + near-limit toast + error mapping`
    — new dialog + toast + error-handler wiring + behaviour tests.
11. `feat(mobile): plan + limits card on usage screen`
    — extends `screens/usage.tsx`; behaviour test on render with
    mock `limits` payload.
12. `test(e2e): maestro flows 14a + 14b + add to regression journey`
    — both flows + edit `design-maestro-full-regression.md` to list
    them in the module slot inventory.
13. `docs(v4): cross-link arch-usage-limits.md from architecture.md
    + arch-api-design.md endpoint inventory + plan-p1 errata note`
    — index entry, endpoint rows, mention that P1 froze the route
    set so this is a deliberate amendment.
