# Design — Admin AI usage ledger

**Status:** Draft for a self-initiated stacked pull request. Keep the pull
request unmerged until the operator reviews it.

## Goal

Add a first-party, read-only AI usage section to the dedicated administrator
operations page. It answers four bounded questions:

1. How many AI calls did Harpa record this month and in the last 24 hours?
2. Which configured provider categories handled those calls?
3. How many tokens or transcription seconds did successful provider calls
   report?
4. Did Harpa record provider errors, replay activity, unknown vendor labels, or
   incomplete transcription duration?

This is a summary of Harpa's retained, best-effort usage ledger. It is not an
OpenAI, Groq, or Kimi billing statement. It does not prove provider invoices,
rate-limit headroom, free-tier use, prepaid balance, or remaining credit.
Those provider-capacity values stay `Unknown`.

## Provider-account decision

OpenAI documents organization usage, costs, and spend-limit endpoints:

- [Completions usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions)
  returns token usage over a requested interval.
- [Costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)
  returns organization cost buckets.
- [Spend limit](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/spend_limit/methods/retrieve)
  returns the organization hard threshold.

Those endpoints require an organization Admin API key. OpenAI's
[administration overview](https://developers.openai.com/api/reference/administration/overview)
and [Admin API keys reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/admin_api_keys)
also document write-capable administration operations for that credential
class. A workload identity token cannot call Admin API endpoints, according to
[OpenAI's workload identity reference](https://developers.openai.com/api/reference/workload-identity-federation).

This draft does not add an OpenAI Admin API key merely to read usage. It also
does not add a general provider-admin credential for Groq or Kimi. A future
provider-account observer requires a separately reviewed credential whose
enforced policy cannot mutate provider resources. Until that boundary exists,
the provider dashboards remain the billing sources.

## Ledger source and accounting rules

The only data source is `app.llm_usage_events`. Every supported AI path is
expected to write one metadata-only `ok` or `error` event through the shared AI
service. Recording is deliberately best-effort so an accounting-write failure
does not turn a successful customer AI response into an application failure.
The summary therefore cannot claim completeness.

The observer uses two fixed UTC windows ending at one captured `observedAt`:

- month to date, beginning at the first instant of the current UTC month; and
- the previous 24 hours.

The windows are `[windowStart, observedAt)`. The browser cannot choose a date
range.

Provider-attributable calls are events whose `fixture_mode` is `live` or
`record`. Replay events are reported separately and never counted as provider
consumption. Within each class, `ok` and `error` counts remain separate.

Current deployed runtime is expected to emit `live` or `replay`. Retained
`record` rows are still provider-attributable if they exist from historical
recording or local fixture refresh activity, so the observer continues to count
them rather than silently dropping them.

Token and audio totals use only successful provider-attributable events:

- `chat` and `generate_report` contribute input, output, and cached tokens;
- `transcribe` contributes `input_seconds`; and
- transcription rows do not contribute tokens.

The migration that introduced `input_seconds` did not backfill older rows. The
observer returns `missingInputSecondsEventCount` so the UI can state when a
transcription-duration total is incomplete.

Vendor is currently a free-text ledger column. The response normalizes exact
`openai`, `groq`, and `kimi` values to those three categories. Every other
value becomes `other`; the raw label never leaves the API. The observer returns
`unclassifiedVendorEventCount` and a warning when that count is non-zero.

Account deletion removes the associated ledger rows. The observation covers
only events retained at query time and is not an immutable historical record.

## Route boundary

Add:

```text
GET /admin/operations/ai-usage
```

The route uses this middleware order:

1. `Cache-Control: private, no-store` before any rejection;
2. the shared trusted-Fly-IP administrator window;
3. the dedicated administrator cookie session; and
4. a separate 12-request-per-minute identity-and-session limit.

Application Bearer tokens, including the retired application `is_admin` bit,
must fail before any application-database query. The route has no body, query
parameters, write method, provider request, credential, retry, or polling path.
A browser `401` returns the whole operations page to signed-out state.

The route calls an administrator service rather than importing `rawDb()` into
the route layer. That service uses the application database pool, not the
separate admin-auth database, and it is the reviewed cross-user aggregate
boundary.

## Query and migration boundary

One observation makes one aggregate database query. The query scans from the
earlier of the current-month start and the 24-hour start through
`observedAt`. It groups only by:

- normalized provider category;
- operation;
- fixture mode; and
- status.

Those bounded dimensions allow at most 72 returned aggregate rows. The query
uses conditional aggregates to produce both time windows. It returns counts
and sums as decimal text, which the service converts to non-negative safe
integers or finite three-decimal-place seconds. Overflow, a row count above the
bound, an invalid timestamp, or a broken correlation fails closed to
`unknown/invalid_response`.

The database pool already enforces a five-second statement timeout. SQLSTATE
`57014` maps to `unknown/timeout`; missing-table or missing-column SQLSTATEs map
to `unknown/schema_unavailable`; other database errors map to
`unknown/database_unavailable`. Raw error messages never enter the response.

Existing indexes begin with `user_id` and serve per-user application reads.
They do not efficiently support a global time-window scan. Add an expand-only,
non-transactional migration:

```sql
CREATE INDEX CONCURRENTLY llm_usage_events_created_at_idx
  ON app.llm_usage_events (created_at DESC);
```

The migration runner records the new `.notx.sql` file only after the
concurrent index build succeeds. The statement deliberately omits
`IF NOT EXISTS`: an interrupted concurrent build can leave an invalid index
with the target name, and a no-op rerun must not record the migration as
successful. Recovery first verifies the index is invalid, drops that exact
index concurrently, and then reruns the migration. The current API environment
parser accepts only a normal `.sql` filename as `MIGRATIONS_REQUIRED_HEAD`,
even though the
deploy workflows and migration runner accept `.notx.sql`. This stack must fix
that existing contract gap before the concurrent migration becomes the
lexically latest application head. RED environment and readiness tests must
prove that an exact `.notx.sql` filename is accepted and compared without
normalizing away the suffix. No placeholder migration may hide the mismatch.

There is no table rewrite, data backfill, rollup table, trigger, or second
accounting source. Rollback, if needed, is a new forward migration that drops
the index concurrently after the route no longer depends on it.

## Response contract

`operations.aiUsageObservation` is a strict discriminated union.

An unavailable observation is:

```ts
type UnknownAiUsageObservation = {
  observedAt: string;
  status: 'unknown';
  reason: 'schema_unavailable' | 'database_unavailable' | 'timeout' | 'invalid_response';
};
```

An available observation is:

```ts
type AvailableAiUsageObservation = {
  observedAt: string;
  status: 'available';
  source: 'harpa_usage_ledger';
  monthToDate: AiUsageWindow;
  last24Hours: AiUsageWindow;
  providerCapacity: {
    openai: {
      status: 'unknown';
      reason: 'not_observed';
    };
    groq: {
      status: 'unknown';
      reason: 'not_observed';
    };
    kimi: {
      status: 'unknown';
      reason: 'not_observed';
    };
  };
  caveats: [
    'best_effort_ledger',
    'not_provider_billing',
    'replay_not_provider_usage',
    'record_mode_calls_provider',
    'deleted_history_excluded',
  ];
};

type AiUsageWindow = {
  windowStart: string;
  windowEnd: string;
  recordedEventCount: number;
  calls: {
    live: AiCallOutcome;
    record: AiCallOutcome;
    replay: AiCallOutcome;
  };
  successfulProviderUsage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    inputSeconds: number;
  };
  operations: {
    chat: AiOperationUsage;
    generateReport: AiOperationUsage;
    transcribe: AiOperationUsage;
  };
  providers: Array<{
    provider: 'openai' | 'groq' | 'kimi' | 'other';
    recordedEventCount: number;
    calls: {
      live: AiCallOutcome;
      record: AiCallOutcome;
      replay: AiCallOutcome;
    };
    successfulProviderUsage: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      inputSeconds: number;
    };
    lastRecordedAt: string;
  }>;
  unclassifiedVendorEventCount: number;
  missingInputSecondsEventCount: number;
  lastRecordedAt: string | null;
  warnings: Array<'unclassified_vendor_events' | 'missing_transcription_duration'>;
};

type AiCallOutcome = {
  succeeded: number;
  failed: number;
  total: number;
};

type AiOperationUsage = {
  liveSucceeded: number;
  liveFailed: number;
  recordSucceeded: number;
  recordFailed: number;
  replaySucceeded: number;
  replayFailed: number;
};
```

All counts and token totals are non-negative safe integers. Seconds are
non-negative finite numbers rounded to at most three decimal places. Cached
tokens cannot exceed input tokens. Call outcomes satisfy
`succeeded + failed = total`, and `recordedEventCount` equals the live, record,
and replay totals. Overall call and successful-usage totals equal the sums of
the provider rows. Operation-mode outcomes cover those same events, including
record-mode events.

Providers and warnings are unique. `unclassified_vendor_events` is present if
and only if `unclassifiedVendorEventCount` is non-zero.
`missing_transcription_duration` is present if and only if
`missingInputSecondsEventCount` is non-zero. Providers with no event in a
window are omitted; the array is therefore bounded to four rows. An empty
window is a valid available observation with zero totals, no provider rows, no
warnings, and `lastRecordedAt: null`.

`windowEnd` must equal `observedAt`. `last24Hours.windowStart` is exactly 24
hours earlier. `monthToDate.windowStart` is the first UTC instant of that
month. Every non-null last-recorded timestamp must fall within its window.

## Privacy and redaction boundary

The response is aggregate-only. It never returns:

- user IDs, emails, names, plan assignments, or per-user limits;
- project IDs, report IDs, request IDs, or counts grouped by customer;
- prompts, transcripts, notes, report bodies, or provider responses;
- raw vendor or model strings;
- provider error text; or
- database error text or SQL.

No row-level usage endpoint is added to the administrator page. The existing
curated business-activity feed remains separate from the AI ledger.

## Administrator presentation

Add a distinct **Harpa-recorded AI usage** section below the manual report
generation live canary. It shows:

- month-to-date and last-24-hour event and provider-call outcomes;
- successful input, output, and cached tokens;
- successful transcription input seconds;
- counts by operation and normalized provider category;
- the last retained event time;
- explicit warnings for unknown vendor labels or missing transcription
  duration; and
- `Remaining provider credit: Unknown` for OpenAI, Groq, and Kimi, with links
  to their dashboards.

The heading and explanatory text must say `Harpa-recorded`. The UI must not
label the values as invoices, spend, provider capacity, or remaining quota.
Replay activity is visually separate from provider-attributable calls.

The browser calls the route once after the dedicated admin session is
confirmed and again only when the operator presses the shared **Refresh**
button. It does not poll. The current Fly-inventory stack makes 12 fixed reads
on load and 24 after one Refresh. This route changes those totals to 13 and 26.
The manual report-generation live canary remains a separate POST and never runs
on load or shared Refresh.

## Deliberate exclusions

This draft does not add:

- an OpenAI, Groq, or Kimi administrator credential;
- provider billing, spend, balance, rate-limit, or free-tier claims;
- model rankings or model-level costs;
- per-user, per-project, or per-report usage;
- aggregate plan assignment or user-limit pressure;
- charts, historical buckets, arbitrary date ranges, pagination, exports,
  persistence, polling, or alerts; or
- a rollup table or background aggregation worker.

The existing manual report-generation live canary remains the bounded live API
exercise. The existing `/me/limits` contract remains the source for one
application user's Harpa product limits. A future aggregate user-limit pressure
panel needs a separate design because its semantics and privacy boundary are
different from provider usage.

## Verification

RED tests precede implementation and prove:

1. the strict contract accepts available, empty, and redacted unknown states;
2. count, time-window, provider, operation, warning, and sum correlations fail
   closed when inconsistent;
3. the service performs one bounded default-wired database query and maps
   timeout, schema, database, malformed, and overflow failures without raw
   text;
4. live and record events count as provider calls, while replay stays
   separate;
5. tokens and seconds follow operation semantics, including missing historical
   transcription duration;
6. unknown vendors become `other` without returning their raw label;
7. the API environment and readiness contracts accept an exact `.notx.sql`
   required head, then the concurrent index migration applies, is recorded,
   and leaves the exact index valid;
8. anonymous, application Bearer, and legacy application-admin credentials
   fail before the query;
9. successful, `401`, and `429` responses remain private and uncached;
10. OpenAPI and generated contract artifacts contain the route;
11. the browser strictly parses the response, renders empty and non-empty
    windows, signs out on `401`, and leaks no seeded identity or content; and
12. load and shared Refresh make exactly one GET per cycle, with no polling or
    live-canary POST.

Run the focused contract, service, migration, route, scope, and admin journeys,
then the full API and administrator suites, coverage, lint, typecheck, build,
OpenAPI drift, generated-client, formatting, and documentation-link gates under
the repository-pinned Node version.

## Rollout and review boundary

This is a self-initiated stacked draft above the Fly inventory draft. Do not
merge it until the operator reviews the contract, privacy boundary, migration,
and UI. A code deployment proves only that the read path exists. It does not
prove ledger completeness or provider capacity.
