# Design — Admin deployment identity

**Status:** Draft for a self-initiated stacked pull request. Keep the pull
request unmerged until the operator reviews it.

## Goal

Add a read-only deployment-identity panel to the dedicated administrator
operations page. The panel should answer four narrow questions without opening
raw endpoints:

- which API build is answering this browser;
- which application migration head that API can currently serve;
- which isolated administrator migration head is currently ready; and
- which Cloudflare Pages commit and branch built the administrator site in
  this browser.

The panel is an observation aid. It is not deployment proof, promotion proof,
provider health, an alert, or a replacement for the release gates in
`docs/v4/arch-ops.md`.

## Why this slice is next

Harpa already publishes all four values. The operations page currently reduces
the two readiness responses to Healthy or Unavailable, so the operator still
has to open raw endpoints to identify the running build and schema heads. The
Pages build already emits a same-origin marker, but the administrator UI does
not display it.

This extension uses first-party, read-only surfaces only. It introduces no
provider API, observer token, secret, write method, polling loop, history,
database table, or deployment action.

## Evidence boundaries

Keep these evidence classes visually and semantically separate:

1. `GET /healthz` is API build identity and liveness. It returns the package
   version, build-time Git commit, and optional build time.
2. `GET /readyz` is product-database readiness. Its migration head is the
   actual application schema head observed by the running API.
3. `GET /admin/readyz` is isolated administrator-database readiness. Its head
   is independent from the product database.
4. `GET /_cf-pages-deployment.json` on the current administrator origin is the
   administrator Pages build marker only.

Do not compare the API Git commit with the Pages commit and label a difference
as drift. Pull-request Fly previews intentionally run a synthetic merge commit
while Pages markers report the pull-request head. Display the identities next
to explicit source labels and explain that difference.

Do not infer the public site or dashboard Pages identity from the administrator
marker. This first cut reads only its same-origin marker. Exact public, admin,
and dashboard Pages proof remains a CI/release obligation.

## Browser requests

On authenticated page load, and again only when the operator presses the
existing **Refresh** button, issue these bounded reads:

```text
GET {PUBLIC_API_BASE_URL}/healthz
GET {PUBLIC_API_BASE_URL}/readyz
GET {PUBLIC_API_BASE_URL}/admin/readyz
GET /_cf-pages-deployment.json
```

Each fetch uses `cache: 'no-store'`. The health request uses
`credentials: 'omit'`; the readiness requests preserve the existing
credentialed administrator-origin behavior; the marker uses same-origin
credentials. There is no retry, timer, interval, background refresh, or
operator-controlled URL.

The existing exact administrator-origin CORS policy is extended from
`/readyz` to `/healthz`. The health route remains public and read-only. An
unrelated origin receives no `Access-Control-Allow-Origin` header.

## Strict response handling

The browser accepts only bounded allowlisted JSON objects.

### API identity

```ts
type ApiIdentity = {
  ok: true;
  service: 'api';
  version: string;
  gitCommit: 'local' | string; // otherwise a full 40-character hex SHA
  buildTime?: string; // finite ISO timestamp
};
```

The version is a short printable value. The browser rejects extra fields,
invalid timestamps, oversized strings, shortened deployed SHAs, and any other
shape. `local` is valid only as the existing development fallback.

### Readiness

Successful readiness is:

```ts
type Ready = { ok: true; db: 'up'; head: string | null };
```

A `503` may be parsed only as one of the existing safe states:

```ts
type NotReady = {
  ok: false;
  db: 'down' | 'schema-missing' | 'head-mismatch';
  expected?: string;
  actual?: string | null;
  message?: string;
};
```

Migration identifiers are bounded printable strings. The UI may render
`expected` and `actual` for `head-mismatch`. It never renders `message` or an
unknown server field. Network failures, unexpected status codes, malformed
JSON, or invalid shapes use reviewed static copy.

### Administrator Pages marker

```ts
type PagesMarker = {
  commit: string; // full 40-character lowercase hex SHA
  branch: string; // bounded allowlisted branch label
};
```

The branch label accepts letters, digits, `/`, `.`, `_`, `-`, `+`, `!`, and
`@`, including scoped automation branches such as Dependabot's. The browser
rejects extra fields, whitespace, HTML delimiters, control characters, and
oversized values. A missing marker is expected in local development and older
deployments, so it produces an explicit Unknown marker state without changing
readiness.

No raw response body, header, URL, exception, database message, environment
value, cookie, or provider content is stored or rendered.

## Presentation

Extend the current readiness section rather than adding a second monitoring
system.

- API identity shows version, full Git commit, optional build time, and the
  observation time.
- Product readiness shows Healthy or Unavailable plus the observed application
  migration head when valid.
- Administrator readiness shows Healthy or Unavailable plus its independent
  migration head when valid.
- Administrator Pages identity shows the full commit and branch from the
  same-origin marker.
- A short note says that build identity, readiness, provider metadata, and
  exact promotion proof are different evidence classes.

Use selectable or wrapped monospace text for full identifiers. Do not truncate
the only rendered copy of a SHA or migration name. Do not add a green
"aligned" state or a red "drift" state from cross-surface SHA comparison.

Loading and partial failures remain per surface. A health or marker failure
must not erase valid readiness evidence, and a readiness failure must not erase
valid build identity.

## Security and operational limits

- The page remains behind the dedicated administrator session.
- All requests are fixed GETs and all caches are disabled.
- The panel performs no write, diagnostic mutation, provider call, secret
  lookup, arbitrary fetch, log query, or database query beyond the existing
  readiness probes.
- No value is persisted in browser storage or server storage.
- No polling or alerting is added.
- No production, preview, Pages, Fly, Neon, or secret configuration changes are
  part of this slice.
- The pull request remains an unmerged stacked draft because this is a
  self-initiated improvement.

## Test plan

Add RED component journeys before implementation that prove:

- the four fixed reads happen on authenticated load and once more on manual
  Refresh, with the required cache and credential modes;
- valid API identity, both migration heads, and the administrator marker are
  rendered with full identifiers and clear evidence labels;
- scoped automation branch labels are accepted, while HTML-shaped labels fail
  closed;
- API, product readiness, administrator readiness, and marker failures are
  independent;
- a late response from an older overlapping refresh cannot replace newer
  evidence;
- `503 head-mismatch` shows only bounded expected/actual migration identifiers;
- raw `message`, extra fields, secrets, HTML, and malformed values fail closed
  and never enter rendered text or browser storage;
- no timer or automatic repeat request is introduced; and
- signed-out entry still performs none of these reads.

Extend the existing API CORS test to prove `/healthz` is readable only from the
configured administrator origin. Run the focused component and CORS suites,
full administrator tests and coverage, API unit tests, lint, typecheck, builds,
documentation links, OpenAPI drift, and the protected pre-push gate.

## Rollout and proof

Code review and preview checks prove only the implementation contract. A later
authorized rollout must still verify the exact deployed API identity, both
readiness heads, and all three Pages markers through the established release
gates. The panel's own values are useful corroborating observations, not the
sole promotion decision.
