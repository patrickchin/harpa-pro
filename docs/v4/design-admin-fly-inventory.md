# Design — Admin Fly inventory

**Status:** Draft for a self-initiated stacked pull request. Keep the pull
request unmerged until the operator reviews it. This change does not provision
the observer credential.

## Goal

Add a bounded, read-only Fly inventory section to the dedicated administrator
operations page. It answers these infrastructure questions without opening the
Fly dashboard:

1. Which reviewed Harpa Fly apps are visible to the observer?
2. How many Machines and Volumes did Fly report for each app?
3. What states, process groups, regions, CPU, and memory does Fly report for
   those Machines?
4. What allocated size, attachment, encryption, and backup settings does Fly
   report for those Volumes?

This is provider inventory. It is not readiness, liveness, deployment proof,
billing proof, remaining-credit proof, or a write-capable control surface.
Machine state and process group do not prove Harpa readiness or that a worker
is live. Remaining Fly credit stays `Unknown`.

## Provider evidence and limits

The design uses only Fly's documented REST and credential surfaces:

- [Access tokens](https://fly.io/docs/security/tokens/) documents org-scoped
  tokens and recommends the narrowest token that works.
- [fly tokens create readonly](https://fly.io/docs/flyctl/tokens-create-readonly/)
  creates a token limited to reading one organization and its resources.
- [Working with the Machines API](https://fly.io/docs/machines/api/working-with-machines-api/)
  documents the public `https://api.machines.dev` origin, Bearer-token
  authentication, response codes, and provider rate limits.
- [Apps resource](https://fly.io/docs/machines/api/apps-resource/) documents
  organization app listing and app details.
- [Machines resource](https://fly.io/docs/machines/api/machines-resource/)
  documents Machine identity, state, region, timestamps, and the Machine
  `config` object used for reviewed guest and process-group fields.
- [Volumes resource](https://fly.io/docs/machines/api/volumes-resource/)
  documents Volume identity, allocated `size_gb`, attachment, encryption,
  snapshot retention, and automatic backups.

The reviewed Fly docs do not document a stable REST field for current free
trial credit, remaining billing credit, or invoice balance. The implementation
does not scrape the dashboard or use Fly's internal GraphQL API. The dashboard
remains the billing source.

Volume `size_gb` is allocated size. It is not current filesystem use, free
space, remaining plan capacity, or a billing balance. Although Fly examples
contain block counters, this version does not return or derive from them
because the reviewed reference does not define enough accounting semantics for
an operator-facing claim.

## Credential and scope boundary

The API accepts one optional server-only configuration triplet:

- `ADMIN_FLY_ORG_SLUG`;
- `ADMIN_FLY_READ_ONLY_API_TOKEN`; and
- `ADMIN_FLY_APP_NAMES`.

All three values must be absent or present together. Empty or whitespace-only
values are invalid. A partial triplet fails API boot. If all three are absent,
the observer returns `unknown/not_configured` without an outbound request.

`ADMIN_FLY_APP_NAMES` is a comma-separated list of one to ten unique, exact
Fly app names. This observer deliberately accepts only a conservative lowercase
DNS-label subset for both the organization slug and every app name: one to 63
characters, alphanumeric at each end, with alphanumeric characters or hyphens
inside. Values and comma-separated segments are trimmed at boot. The observer
returns no metadata or aggregate counts for apps outside this allowlist, even
when the org-list response contains them. The organization request is used to
verify membership and obtain provider-reported Machine and Volume counts for
the reviewed apps; it is not permission to return the whole organization.

The API cannot infer a token's policy merely because fixed `GET` requests
succeed. Provision a dedicated token with:

```text
fly tokens create readonly --org <org>
```

Review its organization and read-only scope before enabling the variables. Do
not reuse a deploy token, `fly auth login` token, CI/CD credential, or a token
with write access. Use the shortest practical expiry supported by the operator
workflow and record rotation as an operator responsibility. The token never
reaches the browser, logs, response contract, OpenAPI examples, or committed
fixtures.

## Route boundary

Add:

```text
GET /admin/operations/fly-inventory
```

The route uses the existing provider-observer boundary, in this order:

1. `Cache-Control: private, no-store` before any rejection;
2. the shared trusted-Fly-IP administrator window;
3. the dedicated administrator cookie session; and
4. a separate 12-request-per-minute identity-and-session limit.

Application Bearer tokens, including the retired application `is_admin` bit,
must fail before any Fly request. The route has no request body, query
parameters, write method, polling path, or arbitrary provider proxy. A browser
`401` returns the entire operations page to signed-out state.

## Upstream request plan

One observation uses the fixed `https://api.machines.dev` origin, one shared
10-second abort deadline, `redirect: 'error'`, and no retry:

1. `GET /v1/apps?org_slug={orgSlug}` once.
2. For each configured app found in that response, in configured order:
   - `GET /v1/apps/{appName}`;
   - `GET /v1/apps/{appName}/machines?include_deleted=false`; and
   - `GET /v1/apps/{appName}/volumes`.

Apps are processed serially. The three fixed reads for one app may overlap.
With ten configured apps the absolute ceiling is 31 provider calls. The
observer does not follow pagination or make an internal GraphQL request.

The API's local provider-observer transport helper owns the shared deadline,
headers, redirect rejection, and JSON parsing. This Fly observer retains the
fixed request plan, provider-specific status mapping, schemas, and truncation
rules.

The existing Machine-list response supplies `config.guest` and the reviewed
`config.metadata.fly_process_group` value. Process-group presentation adds no
provider request and does not change the 31-call ceiling.

Fly documents Machines API limits per action and identifier: one request per
second with a short burst of three for most actions. Serial app processing and
one call per action/identifier avoid an uncontrolled burst. Provider `429`
still fails closed without retry.

The outward contract returns at most ten apps, 50 Machine rows per app, and 50
Volume rows per app. Longer provider arrays are locally truncated and make the
observation partial. The organization list is parsed with a defensive input
bound of 1,000 app rows; a provider payload beyond it is invalid rather than
silently complete.

The app-detail response must repeat the requested app ID and name and the
configured organization slug. A mismatch makes that configured app
unavailable. Machine and Volume paths use percent-encoded, boot-validated app
names only.

## Redaction boundary

The server returns only the contract allowlist. It never returns:

- token values, provider response headers, or arbitrary error text;
- non-allowlisted app names or metadata;
- Machine `private_ip`, instance IDs, image registry/repository/tag/digest,
  raw `config`, environment, services, checks, events, or unreviewed metadata;
- Volume zone, allocation ID, host-dedication key, filesystem type, block
  counters, or snapshot contents; or
- raw provider payloads.

Machine CPU and memory are extracted only from the reviewed `config.guest`
fields. `processGroup` is extracted only from
`config.metadata.fly_process_group`. An absent process-group key becomes
`null`. A present value must be a one-to-63-character lowercase DNS label with
an alphanumeric character at each end; otherwise that Machine inventory fails
closed as `invalid_response`. No other metadata key crosses the API boundary,
and the raw `config` object never crosses it.

## Response contract

`operations.flyInventoryObservation` is a strict discriminated union.

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
    | 'not_found'
    | 'invalid_response'
    | 'provider_unavailable';
}
```

Available and partial observations contain:

```ts
{
  observedAt: string;
  status: 'available' | 'partial';
  organizationSlug: string;
  configuredAppCount: number;
  unavailableConfiguredAppCount: number;
  apps: Array<{
    id: string;
    name: string;
    status: string;
    network: string | null;
    reportedMachineCount: number;
    reportedVolumeCount: number;
    machines:
      | {
          status: 'available';
          truncated: boolean;
          items: Array<{
            id: string;
            name: string;
            state: string;
            processGroup: string | null;
            region: string;
            cpuKind: string;
            cpus: number;
            memoryMb: number;
            createdAt: string;
            updatedAt: string;
          }>;
        }
      | { status: 'unknown'; reason: FlyInventoryReason };
    volumes:
      | {
          status: 'available';
          truncated: boolean;
          returnedAllocatedGb: number;
          items: Array<{
            id: string;
            name: string;
            state: string;
            sizeGb: number;
            region: string;
            encrypted: boolean;
            attachedMachineId: string | null;
            createdAt: string;
            snapshotRetentionDays: number | null;
            autoBackupEnabled: boolean | null;
          }>;
        }
      | { status: 'unknown'; reason: FlyInventoryReason };
  }>;
}
```

All counts and sizes are non-negative safe integers. `returnedAllocatedGb`
equals the safe sum of returned Volume `sizeGb` values. When a Volume list is
truncated, that sum is explicitly not an app-wide total.

`apps.length + unavailableConfiguredAppCount` must equal
`configuredAppCount`. An `available` observation has no unavailable app,
unknown detail, or truncated list. A `partial` observation must contain at
least one returned, verified app plus one of those incompleteness signals. If
no configured app remains verified after organization discovery and detail
validation, the observation is wholly unavailable and returns `unknown` with
the highest-priority redacted reason. Priority is `timeout`, `rate_limited`,
`forbidden`, `not_found`, `invalid_response`, then `provider_unavailable`.

The organization-list counts and the detail calls are separate provider
snapshots. `reportedMachineCount` and `reportedVolumeCount` therefore do not
have to equal the later detail-array lengths. The UI labels them separately and
does not call a difference drift or failure.

## Administrator presentation

Add a distinct **Fly inventory** section with loading, available, partial, and
`Unknown` states. It shows:

- the reviewed organization slug, configured-app coverage, and observation
  time;
- one card per returned allowlisted app;
- provider-reported Machine and Volume counts;
- bounded, accessible Machine and Volume scrolling regions;
- Machine state, process group, region, CPU kind, CPU count, memory, and
  timestamps;
- Volume allocated size, attachment, encryption, backup settings, and
  creation time; and
- `Remaining Fly credit: Unknown` with a Fly dashboard link.

The section states explicitly that Machine state and process group are not
Harpa readiness or Machine/worker liveness. The separate **Storage lifecycle**
card remains first-party database state and also does not prove worker
liveness. Volume size is allocation, not used/free storage. Keep all of these
surfaces visually separate from the first-party readiness and
deployment-identity cards.

The browser calls the route once after a dedicated admin session is confirmed
and again only when the operator presses the shared **Refresh** button. The
current stacked page makes 11 authenticated fixed GET reads on load and 22
after one Refresh, including the storage lifecycle observer. Adding this route
changes those counts to 12 and 24. It never triggers or clears the report
generation live canary and introduces no interval or background poll.

## Verification

RED tests precede implementation and prove:

- the strict contract accepts available, partial, and unknown states, enforces
  correlations and bounds, and rejects leaked provider fields;
- the optional env triplet rejects all partial, blank, duplicate, malformed,
  and over-limit configurations;
- unconfigured observation makes zero provider calls;
- default wiring uses the parsed env and global fetch, exact fixed URLs,
  Bearer header, `redirect: 'error'`, one shared signal, serial apps, no retry,
  and the 31-call ceiling;
- `processGroup` comes only from the bounded, allowlisted
  `config.metadata.fly_process_group` field in the existing Machine response,
  makes no extra call, and exposes no other metadata;
- Machine state and process group are never labeled readiness or liveness;
- non-allowlisted apps never leave the server;
- provider failures redact bodies while safe app facts survive as partial;
- anonymous, Better Auth, and legacy application-admin callers fail before
  provider access;
- the route preserves private/no-store on success, `401`, and `429` and uses
  its isolated 12-per-minute administrator budget;
- the admin component covers every state, strict parsing, identifiers,
  timestamps, bounded scrollers, `401` sign-out, 12/24 fixed reads, no
  credential storage, and no polling; and
- OpenAPI and generated types include the route while mobile hooks continue to
  skip this administrator-only path.

Run contract, env, observer unit and coverage, route integration/scope,
OpenAPI drift/codegen, API unit/lint/typecheck, admin unit/coverage/lint/
typecheck/build, and the root required gates under the
repository's pinned Node version.

## Rollout and rollback

Keep this self-initiated change as an unmerged stacked draft. Code and preview
checks prove only the implementation contract. Live enablement separately
requires a reviewed read-only token, reviewed app allowlist, paired variables
in the intended environment, the exact deployed API/admin SHAs, and an
authenticated observation.

Rollback removes the route, card, contract, and optional variables. It does not
change a Fly app, Machine, Volume, token, or billing setting. Revoke the
dedicated observer token separately if the feature is retired.
