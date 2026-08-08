# Admin live report-generation canary

> Status: Draft follow-up to the existing
> [admin report-generation diagnostic](design-admin-report-generate-diagnostic.md).
> Implement this work in a separate stacked pull request. Keep production
> activation outside that pull request.

## Goal

Give a dedicated administrator one manual check that calls the deployed report
generation API with synthetic data and spends real provider tokens.

The check must prove all of these results in one run:

1. Better Auth signs in the fixed synthetic application account.
2. The fixed synthetic report is readable and remains a draft.
3. The real report generation endpoint returns HTTP 200.
4. The provider mode is `live`, with no replay or record fallback.
5. The generated body passes the current `reportBody` schema.
6. Harpa records exactly one matching live `app.llm_usage_events` row.
7. The administrator receives a bounded, text-safe preview of the validated
   synthetic report response.
8. The runner signs out after every successful sign-in and confirms that the
   exact temporary Bearer session is no longer readable.

This canary is not a general API console. The browser cannot select an
account, report, provider, model, fixture, URL, header, or request body.

## Relationship to the existing diagnostic

This follow-up tightens the existing route and card. It does not add a second
report target or a second mutation path.

Keep this route:

```text
POST /admin/operations/report-generate
```

Rename the button to **Run live canary**. One click runs the current fixed
HTTP sequence against the configured synthetic report.

Remove `replay_only` as a successful warning. A replay, record-mode call, or
idempotent replay is a failed live canary.

The shared operations refresh must not run, clear, or repeat this canary.
The page must not run it on load, on a timer, or in the background.

## Mutation boundary

Each run keeps the current bounded mutation contract:

- one temporary Better Auth application session;
- one replacement body on one fixed synthetic draft report;
- one generation-debug record on that report; and
- one `app.llm_usage_events` row for the live provider call.

The canary reuses the existing short synthetic notes. It does not create or
edit notes during a run. It never creates accounts, projects, reports, files,
or comments.

The browser sends an empty body to the administrator route. The server calls
the real report endpoint with its fixed target and version precondition.

## Development enablement gate

Add `ADMIN_REPORT_LIVE_CANARY_ENABLED` with values `0` or `1`. The default is
`0`.

When the value is `0`, the route returns `unknown/not_enabled`. It must make no
application request and no application-database query.

The environment parser accepts `1` only when all conditions below are true:

- `NODE_ENV` is `production`;
- `BETTER_AUTH_URL` is exactly `https://harpa-pro-api-dev.fly.dev`;
- `ADMIN_CORS_ORIGINS` is exactly
  `https://dev.harpa-pro-admin.pages.dev`;
- `HARPAPRO_PR_BUILD` is `0`;
- `AI_LIVE` is `1`;
- `AI_FIXTURE_MODE` is `live`; and
- all existing `ADMIN_REPORT_DIAGNOSTIC_*` target values are valid.

The parser must fail API boot when the flag is `1` and any condition fails.
The runner must also check its parsed configuration before sign-in.

This gate prevents a missing variable from silently selecting replay. It also
prevents a pull-request preview, local administrator build, or production
administrator build from spending provider tokens.

Do not add a request option that overrides `AI_LIVE`, `AI_FIXTURE_MODE`, the
provider, the model, or `fixtureName`. Do not retry with replay after any live
failure.

## Security and request limits

Keep the current middleware order:

1. Apply `Cache-Control: private, no-store` before every response.
2. Require the exact configured administrator `Origin`.
3. Apply the trusted Fly client-IP administrator budget.
4. Require the dedicated administrator cookie session.
5. Validate the current session-derived `X-Admin-CSRF` token.
6. Apply the three-runs-per-15-minutes identity and session budget.

Application Bearer tokens, Better Auth cookies, and legacy application-admin
claims cannot authorize the administrator route.

The real report endpoint keeps its user, AI, and monthly usage limits. The
canary must not bypass those limits or use a separate provider credential.

The button disables while a request runs. A browser session cannot submit a
second request until the first request finishes.

## Execution sequence

Use `BETTER_AUTH_URL` as the fixed application origin. Use one 75-second
functional deadline and no functional retry. Cleanup may use one additional
five-second grace window, so the complete observation duration is at most
80 seconds.

1. Check the development enablement gate.
2. Sign in the configured synthetic account through Better Auth and capture
   the strictly validated `set-auth-token` Bearer token.
3. Read the fixed report through the real report GET endpoint.
4. Require the fixed project, report number, report ID, and `draft` state.
5. Capture a lower-bound timestamp from the application database.
6. Call the real report generation endpoint with `expectedUpdatedAt`.
7. Reject an `idempotent-replay` response.
8. Read and validate the persisted generation proof.
9. Match the live usage row in the application database.
10. Derive the bounded response preview from the returned report body.
11. Read the three existing synthetic-account limit buckets.
12. Attempt Better Auth sign-out in `finally` with the exact Bearer token that
    authorized the report reads and generation request.
13. Read Better Auth `GET /api/auth/get-session` with that same Bearer token
    and require an HTTP 200 response whose complete JSON body is `null`.

The generation request omits `fixtureName`. Its idempotency key remains bound
to the fixed target and captured report version.

After functional work ends, sign-out and session verification share one
separate five-second cleanup-only grace signal. A sign-out HTTP 200 is not
sufficient: cleanup succeeds only when the follow-up read proves that the
exact Bearer session is absent. A non-null, malformed, failed, or timed-out
session read is `sign_out_failed`. The cleanup signal must never restart
generation, proof, usage, preview, or limits work.

## Live generation proof

The persisted generation proof must have `fixtureMode: live`. It must match the
generation response and the fixed report update.

The runner fails when any condition below occurs:

- `fixtureMode` is `replay` or `record`;
- the response reports an idempotent replay;
- the persisted generation does not match the returned report;
- the generated report body is absent or invalid; or
- the report update timestamps do not form a valid sequence.

The runner never converts these failures into warnings. It never calls a
fixture after a live failure.

## Usage-row proof

The canary must match the provider call to Harpa's usage ledger. This proof is
required even though normal product calls treat accounting as best effort.

Immediately before generation, read the application database clock. After the
persisted proof succeeds, run one bounded ledger query.

The default application-database adapter must stop waiting when the functional
signal aborts, including while the pool is waiting for a connection. The
underlying query is read-only and may finish later under the pool's statement
timeout, but it must not delay the canary response or start cleanup work. The
adapter must observe the late promise outcome so it cannot produce an
unhandled rejection.

The query filters by:

- the signed-in synthetic user ID captured from the strictly validated Better
  Auth response;
- the fixed project ID;
- the returned report ID;
- `operation = 'generate_report'`;
- a `created_at` value after the captured database time;
- a `created_at` value no later than the query database time; and
- the vendor and model from the validated persisted proof.

Read at most two rows. Require exactly one row. The row must have
`fixture_mode = 'live'` and `status = 'ok'`. Its input and output token counts
must be safe integers whose sum is greater than zero. Cached tokens must be a
non-negative safe integer no greater than input tokens.

Zero rows fail with `usage_proof_missing`. Two rows fail with
`usage_proof_ambiguous`. Any other mode or status fails with
`live_proof_failed`.

Return only the row's non-negative token counts and bounded latency. Do not
return its ID, user ID, project ID, report ID, or timestamp. Vendor and model
come only from the separately validated persisted generation proof; the ledger
row must match them but does not add another outward field.

## Bounded report response preview

Parse the returned body with the current shared `reportBody` schema. Reject a
missing body, schema error, unsafe count, or hash failure.

The user must be able to inspect what the live endpoint returned. The canary
therefore shows actual fields from the validated synthetic report, not only a
success badge. It still does not expose the raw HTTP payload or an unbounded
model response.

Return this bounded preview:

```ts
type ReportResponsePreview = {
  schemaValid: true;
  sample: {
    title: string | null;
    summary: string | null;
    weather: {
      condition: string | null;
      temperature: string | null;
      wind: string | null;
      impact: string | null;
    } | null;
    workers: Array<{
      role: string;
      count: string | null;
      hours: string | null;
      notes: string | null;
    }>;
    materials: Array<{
      name: string;
      quantity: string | null;
      unit: string | null;
      status: string | null;
      condition: string | null;
      notes: string | null;
    }>;
    issues: Array<{
      title: string;
      severity: string | null;
      description: string | null;
      action: string | null;
    }>;
    nextSteps: string[];
    summarySections: Array<{ title: string; body: string }>;
  };
  counts: {
    workers: number;
    materials: number;
    issues: number;
    nextSteps: number;
    summarySections: number;
    imageAttachments: number;
    documentAttachments: number;
  };
  truncated: boolean;
  bodySha256: string;
};
```

Each preview array contains at most the first five items in endpoint order.
Each non-null string contains at most 400 Unicode code points. `truncated` is
true when any array or string is clipped, or when attachment references are
represented only by counts. The server performs clipping after the complete
body passes `reportBody`; clipped data is never used as proof of schema
validity.

The browser renders the sample as escaped text in a bounded scroll region. It
must not inject model text as HTML. This preview is allowed only because the
target account, notes, project, and report are fixed synthetic fixtures. A
future arbitrary or customer-selected target must not reuse this response
shape.

Attachment counts include references in issues and summary sections. All
counts must be non-negative safe integers within the contract limit.

For `bodySha256`, recursively sort object keys, preserve array order, encode
the canonical JSON as UTF-8, and compute SHA-256. Return 64 lowercase
hexadecimal characters. Never return or log the canonical JSON.

The hash lets an administrator compare runs even when a sample is clipped. It
is not an integrity signature or a report identifier.

## Observation contract

Replace the diagnostic union with a strict live-canary union. Keep the current
`pass`, `warning`, `fail`, and `unknown` status names.

An unknown result contains only:

- `observedAt`;
- `status: unknown`; and
- `reason: not_configured | not_enabled`.

A pass or warning contains:

- the existing fixed target identifiers;
- HTTP status, request ID, and bounded duration of at most 80,000 ms, including
  cleanup;
- `fixtureMode: live` and `idempotentReplay: false`;
- the bounded report response preview;
- `usage.inputTokens`, `usage.outputTokens`, and `usage.cachedTokens`;
- `usage.latencyMs` and `usage.matched: true`;
- the three existing account limit summaries when available; and
- the cleanup result.

A pass requires limits and confirmed sign-out. A warning keeps proven live
generation but allows only `limits_unavailable` or `sign_out_failed`.
Generation latency and usage latency remain bounded by the 75-second
functional deadline; only the top-level observation duration can include the
five-second cleanup grace.

A fail contains a reviewed phase, reason, duration, and cleanup state. Add
`mode_gate`, `usage_window`, `usage_proof`, and `preview` to the existing
phase allowlist.

Add these reviewed failure reasons:

- `live_mode_required`;
- `live_proof_failed`;
- `usage_proof_missing`;
- `usage_proof_ambiguous`; and
- `preview_invalid`.

Keep the existing reviewed sign-in, target, conflict, usage-limit, rate-limit,
provider, timeout, invalid-response, and upstream reasons.

The contract must reject unknown keys, arbitrary strings, invalid hashes,
negative counts, unsafe integers, duplicate warnings, and inconsistent status
variants.

## Redaction and logging

The response, browser state, and structured logs must not contain:

- prompts, source notes, transcripts, or the canonical report JSON;
- raw provider response text or provider error text;
- report text outside the bounded synthetic `sample`, or any sample from a
  non-synthetic target;
- the test password, Bearer token, cookies, CSRF token, or auth token;
- a usage-row ID or user ID; or
- arbitrary exception, database, or upstream response text.

The existing strictly validated provider and model identifiers remain safe
operational metadata. They are not free-form provider response text.

The current report endpoints include debug text in their internal responses.
The runner must discard that text after strict correlation checks. It must not
serialize an upstream response object or parsed report body into logs.

Audit logs may contain the administrator request ID, administrator identity,
phase, reviewed outcome, duration, fixed target IDs, token counts, structural
counts, truncation flag, and the report hash. Logs must not contain preview
sample text.

## Administrator UI

Keep one **Report generation live canary** card on `/operations`.

- Initial state says `Not run yet in this browser session.`
- The button says `Run live canary`.
- The card states that each click updates one synthetic report.
- The card states that each click spends a small amount of real AI quota.
- The running state disables the button and uses `aria-live="polite"`.
- A pass shows HTTP status, duration, token counts, structural counts, hash,
  and the bounded escaped synthetic response preview.
- A warning also shows only reviewed warning copy.
- A failure shows only the reviewed phase and reason copy.
- An unconfigured or disabled state explains that no provider call occurred.
- A `401` returns the entire operations page to the signed-out state.

Do not render a provider message, prompt, source note, attachment identifier,
or any field outside the bounded response preview. Keep the result only in the
mounted page's component memory. Do not write it to `localStorage`,
`sessionStorage`, IndexedDB, or another browser persistence mechanism.

## Test contract

Follow the repository TDD workflow.

### Environment and shared contract

- RED tests cover the disabled default and every invalid enablement pair.
- A valid development deployment accepts the complete live configuration.
- A preview or production origin rejects enablement.
- The union accepts every consistent status and rejects every extra field.
- Hash, count, token, warning, and mode invariants fail closed.

### Runner and route

- Disabled and unconfigured states make zero outbound calls and zero queries.
- Default wiring calls the real fixed HTTP paths without a runner stub.
- The generation request omits `fixtureName` and sends no mode override.
- Replay, record mode, and idempotent replay all fail.
- The ledger query uses database time, fixed identifiers, and a two-row bound.
- Zero, one, and two matching-row cases cover every proof result.
- A successful row must be `live`, `ok`, and match proof vendor and model.
- Zero total tokens, negative or unsafe token counts, and cached tokens greater
  than input tokens fail the live proof.
- The preview clips strings and arrays at the documented bounds and derives a
  deterministic SHA-256 hash from the complete validated body.
- Sentinel prompts, source notes, provider debug text, secrets, attachment
  identifiers, and errors never leak; bounded synthetic report fields do.
- Sign-out and same-token session verification run after every post-login
  result. Only a strict `null` session response confirms cleanup.
- Timeout uses one functional abort and one cleanup-only grace signal. A
  default-adapter test proves that a stalled application pool cannot extend
  the functional deadline.
- No functional request retries or downgrades to replay.

### Security, browser, and live acceptance

- Existing Origin, cookie, CSRF, and trusted-IP rejection tests remain green.
- The dedicated three-per-15-minutes budget stays isolated from read routes.
- Page load and shared refresh make no canary request.
- One click sends one credentialed, no-store POST with the current CSRF token.
- The button prevents a browser double-submit while the request runs.
- Browser tests prove that only the reviewed, escaped, bounded synthetic
  preview fields render.
- A development acceptance run proves real provider tokens and one live row.
- The acceptance run records the deployed API SHA and Pages marker SHA.

Changed executable files need at least 80 percent coverage. The API's merged
line coverage must remain above its 90 percent repository gate.

## TDD and stacked pull-request boundary

Use three reviewable checkpoints:

1. Commit this design before executable changes.
2. Commit valid failing tests for the live-only contract.
3. Commit the minimal implementation that makes those tests pass.

Stack the implementation pull request on the existing report diagnostic. Do
not fold this change into an unrelated infrastructure observer.

The pull request may add the disabled code path and development configuration
contract. It must not change a Fly secret, create a synthetic target, spend a
provider token, or activate production.

After review, a separate authorized development rollout may set
`ADMIN_REPORT_LIVE_CANARY_ENABLED=1`. That rollout must verify the exact
deployed SHA, run one manual canary, match one live usage row, and inspect
redacted logs.

## Production boundary

This design intentionally rejects production enablement. It does not add a
production flag, production target, production secret, schedule, or monitor.

A future production activation needs a separate design and approval. That
review must cover cost, target lifecycle, alert ownership, rate limits,
retention, rollback, and exact production proof.
