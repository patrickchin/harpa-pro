# Design — Admin R2 capacity

**Status:** Draft for an unmerged stacked pull request. No observer credential
is provisioned by this change.

## Goal

Add a read-only Cloudflare R2 capacity card to the dedicated administrator
operations page. The card answers four bounded questions:

1. How many R2 buckets are visible to the observer?
2. What is the current account storage and object-count snapshot?
3. How many documented Class A and Class B operations were observed this
   calendar month?
4. How do those operation counts compare with Cloudflare's published free-tier
   reference?

The card must distinguish provider measurements, Harpa-derived estimates, and
values that the documented APIs cannot establish. It must never present a
current byte snapshot as exact remaining GB-month billing capacity.

## Provider evidence and limits

Cloudflare documents the following read surfaces:

- [List Buckets](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/)
  accepts `Workers R2 Storage Read` and returns bounded bucket metadata.
- [Get Account-Level Metrics](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/metrics/methods/list/)
  returns current storage and object counts split between Standard and
  Infrequent Access storage. Cloudflare notes that this snapshot may lag.
- [R2 metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)
  documents the `r2OperationsAdaptiveGroups` GraphQL dataset and its 31-day
  retention.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/) publishes a
  monthly Standard-storage free-tier reference of 10 GB-month, 1,000,000
  Class A operations, and 10,000,000 Class B operations.
- [Analytics API token configuration](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
  documents the `Account Analytics: Read` permission, Client IP filtering, and
  token time-to-live controls.

Storage billing uses average daily peak storage over the billing period. The
account metrics endpoint is a point-in-time snapshot and has no provider
measurement timestamp. Therefore this version exposes current stored bytes but
does not expose a `remainingStorage`, `remainingGbMonth`, or equivalent field.
The free tier applies to Standard storage only. Infrequent Access data is shown
separately and always carries an explicit caveat.

The operations estimate uses only successful operations whose `actionType`
appears in Cloudflare's published Class A, Class B, or free-operation lists.
Unrecognised successful operations are excluded and make the observation
partial. The operations dataset does not identify the request's storage class,
so the account-wide total may include Infrequent Access activity that is not
eligible for the Standard free tier. Subtracting that total from the published
allowance is a conservative operational estimate, not an eligible-use balance
or invoice.

## Credential boundary

The API accepts one optional pair of server-only values:

- `ADMIN_CLOUDFLARE_ACCOUNT_ID`;
- `ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN`.

Both values must be absent or present together. Empty or whitespace-only values
are invalid. A partial pair fails API boot. If both are absent, the observer
returns `unknown/not_configured` without an outbound request.

Provision a dedicated Cloudflare token with only these permissions:

- `Workers R2 Storage Read` for the intended account; and
- `Account Analytics: Read` for the intended account.

`Account Analytics: Read` is broader than an R2-only permission even though
this observer issues only the fixed R2 query. Treat that broader read surface
as an explicit residual risk: the token must be dedicated to this observer,
account-scoped, short-lived with a reviewed expiry/rotation date, and never
reused by another workload. Apply Cloudflare Client IP Address Filtering when
the target environment has stable, documented egress addresses. If stable
egress is unavailable, record that exception during enablement instead of
silently omitting the restriction.

Do not reuse the R2 S3 credentials, a Pages deployment token, the CI
`CLOUDFLARE_API_TOKEN`, or a token with write permission. The observer token
never reaches the browser, logs, response contract, OpenAPI examples, or test
fixtures committed to the repository.

Cloudflare does not return the token's permission policy from these data calls.
Deployment proof therefore includes a manual review of the token summary before
the secret is enabled. The code still has a fixed egress origin and fixed read
queries, so no administrator input can select a provider method or resource.

## Route boundary

Add:

```text
GET /admin/operations/r2-capacity
```

The route uses the same dedicated browser-admin boundary as the Neon observer:

1. `Cache-Control: private, no-store` before any rejection;
2. the shared trusted-Fly-IP admin window;
3. the dedicated administrator cookie session; and
4. a separate 12-request-per-minute identity-and-session limit.

Application Bearer tokens, including the retired application `is_admin` bit,
must fail before any Cloudflare request. The route has no request body, query
parameters, write method, polling path, or arbitrary provider proxy.

The browser calls it once after a dedicated admin session is established and
again only when the operator presses the shared **Refresh** button. A `401`
returns the complete page to signed-out state.

## Upstream call plan

One observation makes at most three provider requests. They share one
10-second abort budget and never retry or follow pagination:

1. `GET https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/buckets`
   with `per_page=100`, `direction=asc`, and `order=name`;
2. `GET https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/metrics`;
3. `POST https://api.cloudflare.com/client/v4/graphql` containing only the
   documented R2 operations analytics query.

The GraphQL POST is a read query authenticated by an Analytics Read token. It
groups the current UTC calendar month's data by `actionType` and
`actionStatus`. Only `actionStatus=success` contributes to the estimate. The
query uses the documented `limit: 10000` ceiling so large accounts do not
silently truncate the operation mix below the provider's published example.
Provider request bodies, response headers, raw errors, object names, and
object metadata are never returned.

The bucket list is capped at 100. A non-empty continuation cursor sets
`truncated=true`; it is not followed. Storage metrics are account-wide and do
not depend on bucket pagination.

## Operation classification

The observer pins the operation names in Cloudflare's pricing documentation.

Class A:

- `ListBuckets`, `PutBucket`, `ListObjects`, `PutObject`, `CopyObject`;
- `CompleteMultipartUpload`, `CreateMultipartUpload`,
  `LifecycleStorageTierTransition`;
- `ListMultipartUploads`, `UploadPart`, `UploadPartCopy`, `ListParts`;
- `PutBucketEncryption`, `PutBucketCors`, and
  `PutBucketLifecycleConfiguration`.

Class B:

- `HeadBucket`, `HeadObject`, `GetObject`, and `UsageSummary`;
- `GetBucketEncryption`, `GetBucketLocation`, `GetBucketCors`, and
  `GetBucketLifecycleConfiguration`.

Free operations:

- `DeleteObject`, `DeleteBucket`, and `AbortMultipartUpload`.

Mapped successful request counts are summed with safe-integer checks. Derived
operation headroom is:

```text
max(0, published free-tier reference - estimated used)
```

Unknown operation types do not contribute. Their aggregate count is exposed as
`unclassifiedRequests`, and the observation becomes partial. Values above the
free-tier reference produce zero estimated remaining, never a negative number.

## Response contract

`operations.r2CapacityObservation` is a strict discriminated union.

An unconfigured or wholly unavailable observation is:

```ts
{
  observedAt: string;
  status: 'unknown';
  reason:
    | 'not_configured'
    | 'timeout'
    | 'rate_limited'
    | 'forbidden'
    | 'invalid_response'
    | 'provider_unavailable';
}
```

Available and partial observations contain:

```ts
{
  observedAt: string;
  status: 'available' | 'partial';
  freeTierReference: {
    storageGbMonth: 10;
    classAOperations: 1_000_000;
    classBOperations: 10_000_000;
    appliesTo: 'standard_only';
  };
  buckets:
    | {
        status: 'available';
        truncated: boolean;
        items: Array<{
          name: string;
          jurisdiction: 'default' | 'eu' | 'fedramp' | 'unknown';
          location: 'apac' | 'eeur' | 'enam' | 'weur' | 'wnam' | 'oc' | null;
          defaultStorageClass: 'standard' | 'infrequent_access' | 'unknown';
          createdAt: string | null;
        }>;
      }
    | { status: 'unknown'; reason: R2CapacityReason };
  storage:
    | {
        status: 'available';
        standard: R2StorageClassSnapshot;
        infrequentAccess: R2StorageClassSnapshot;
      }
    | { status: 'unknown'; reason: R2CapacityReason };
  operations:
    | {
        status: 'available';
        windowStart: string;
        windowEnd: string;
        classA: R2OperationEstimate;
        classB: R2OperationEstimate;
        freeRequests: number;
        unclassifiedRequests: number;
      }
    | { status: 'unknown'; reason: R2CapacityReason };
  caveats: R2CapacityCaveat[];
}
```

`R2StorageClassSnapshot` contains only non-negative safe integers for
`publishedPayloadBytes`, `publishedMetadataBytes`, `publishedObjects`,
`uploadingPayloadBytes`, `uploadingMetadataBytes`, and `uploadingObjects`.
When the Cloudflare metrics response omits an optional storage class, state, or
metric field, the observer normalizes that missing provider field to `0`
instead of treating the whole response as invalid.

`R2OperationEstimate` contains `estimatedUsed`, the matching literal published
allowance, and `estimatedRemaining`. All are non-negative safe integers.

The finite caveat set is:

- `storage_snapshot_not_gb_month`;
- `storage_metrics_may_lag`;
- `infrequent_access_not_covered_by_free_tier`;
- `operations_estimated_from_analytics`;
- `unclassified_operations_excluded`;
- `bucket_inventory_truncated`.

Every non-unknown observation includes the first, second, and fourth caveats.
Infrequent Access data, unclassified operations, and bucket truncation require
their corresponding caveat. Caveats are unique. An `available` observation has
all three nested values available, no truncation, and no unclassified
operations. Any preserved incomplete signal requires `partial`.

The schema is strict. It rejects account IDs, tokens, raw Cloudflare envelopes,
GraphQL errors, object keys, request headers, exact storage-remaining fields,
and any other non-allowlisted property.

## Failure policy

HTTP `401` or `403` maps to `forbidden`; `429` maps to `rate_limited`; `408`
or `504` and an observation abort map to `timeout`; malformed JSON or a shape
that violates the provider allowlist maps to `invalid_response`; other network
or non-success failures map to `provider_unavailable`.

If all three reads fail, return top-level `unknown` using the highest-priority
safe reason: timeout, rate limit, forbidden, invalid response, then provider
unavailable. If at least one read succeeds, preserve it and return `partial`
with unknown nested values for failed reads. Raw provider error bodies are
discarded.

## Administrator presentation

Add an **R2 capacity** card beneath the infrastructure section. It shows:

- observation time and Available, Partial, or Unknown state;
- the three published free-tier reference values;
- current Standard and Infrequent Access storage/object snapshots;
- estimated Class A and Class B month-to-date used and remaining values;
- free and unclassified operation counts;
- a bounded, accessible, vertically scrollable bucket inventory; and
- the existing Cloudflare console link.

Required explanatory copy states:

- current storage is a snapshot, not remaining GB-month capacity;
- storage metrics may lag;
- operation headroom is derived from analytics and published mappings, not a
  provider billing balance, and may conservatively include operations against
  storage classes that are not free-tier eligible; and
- Infrequent Access is outside the Standard-storage free tier.

Unknown reasons use reviewed static copy. The UI never displays a raw provider
message. Invalid or extra response fields fail strict parsing and render a safe
Unknown state.

## Tests

Contract tests cover every union member and correlation, unique caveats,
safe-integer limits, the 100-bucket bound, partial invariants, rejected secret
or raw-provider fields, and absence of an exact storage-remaining field.

Environment tests cover a valid pair, both absent, each half-pair, empty and
whitespace values, and account-ID validation.

Observer tests cover default env/global-fetch wiring, exact origins, methods,
queries, headers and GraphQL variables; zero calls when unconfigured; the
three-call maximum; timeout and status mapping; no retry or pagination;
Class A/B/free/unknown classification; safe summation and remaining floors;
partial preservation; and redaction.

Route and scope integration tests cover the dedicated cookie boundary,
anonymous/application/legacy-admin rejection before provider access, no-store
on `200`, `401`, and `429`, the isolated rate limit, and real default observer
wiring rather than a route-level collaborator stub (Pitfall 13).

Admin component tests cover loading, available, partial, unknown, truncation,
unclassified operations, Infrequent Access, shared Refresh, expired-session
sign-out, strict parsing, safe copy, and absence of browser storage or an
Authorization header.

Regenerate OpenAPI and generated types, then run contract, API, admin, scope,
spec-drift, typecheck, lint, build, coverage, and documentation-link gates.

## Rollout and proof

This self-initiated change remains an unmerged stacked draft until reviewed.
The code deploys with both observer values absent first; that state makes zero
Cloudflare calls and renders Not configured.

Enabling an environment requires separate approval and these proofs:

1. review the Cloudflare token summary for exactly the two read permissions,
   the intended account, a bounded TTL/rotation date, and Client IP Address
   Filtering where the target environment has stable egress; otherwise record
   the accepted IP-filtering exception and the broader Analytics Read residual
   risk;
2. store the pair in that environment's server-side secret boundary;
3. deploy and verify the intended Fly merge or release SHA plus exact Pages
   head marker according to the environment contract;
4. authenticate through the dedicated admin site and refresh once;
5. confirm three or fewer fixed provider requests, a strict redacted response,
   and no token or raw provider content in logs; and
6. compare the displayed snapshot with Cloudflare's R2 dashboard while keeping
   the documented estimation caveats visible.

Development approval does not authorize production enablement. This PR never
creates a token, changes a Cloudflare permission, activates a secret, merges a
branch, or deploys production.
