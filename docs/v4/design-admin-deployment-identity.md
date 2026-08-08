# Design — Admin deployment identity

**Status:** Draft for a self-initiated stacked pull request. Keep the pull
request unmerged until the operator reviews it.

## Goal

Add a read-only deployment-identity panel to the dedicated administrator
operations page. The panel answers six narrow questions without opening raw
endpoints:

- which API build is answering this browser
- which application migration head that API can currently serve
- which isolated administrator migration head is currently ready
- which Cloudflare Pages commit and branch built the public site
- which Cloudflare Pages commit and branch built the administrator site
- which Cloudflare Pages commit and branch built the office dashboard.

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

The first cut showed only the administrator Pages marker. A later stacked
extension adds the public-site and dashboard markers. The marker endpoints
already permit public cross-origin reads. The extension does not add an API
proxy or a new credential.

## Evidence boundaries

Keep these evidence classes visually and semantically separate:

1. `GET /healthz` is API build identity and liveness. It returns the package
   version, build-time Git commit, and optional build time.
2. `GET /readyz` is product-database readiness. Its migration head is the
   actual application schema head observed by the running API.
3. `GET /admin/readyz` is isolated administrator-database readiness. Its head
   is independent from the product database.
4. `GET {PUBLIC_SITE_BASE_URL}/_cf-pages-deployment.json` is the public-site
   Pages build marker only.
5. `GET /_cf-pages-deployment.json` on the current administrator origin is the
   administrator Pages build marker only.
6. `GET {PUBLIC_DASHBOARD_URL}/_cf-pages-deployment.json` is the office
   dashboard Pages build marker only.

Do not compare the API Git commit with the Pages commit and label a difference
as drift. Pull-request Fly previews intentionally run a synthetic merge commit
while Pages markers report the pull-request head. Display the identities next
to explicit source labels and explain that difference.

Do not infer one Pages identity from another marker. Each card uses its own
marker response. Exact public, administrator, and dashboard Pages proof remains
a CI and release obligation.

## Fixed Pages origins

The administrator build requires two public, non-secret origins:

- `PUBLIC_SITE_BASE_URL`
- `PUBLIC_DASHBOARD_URL`.

Both values must be exact HTTP origins. Production and deployed preview builds
require HTTPS. Local development can use loopback HTTP origins. The parser
rejects credentials, paths, queries, fragments, and unsupported schemes.

The Cloudflare Pages build wrapper sets the origins from `CF_PAGES_BRANCH`.
The fixed mappings are:

| Branch   | Public site                          | Office dashboard                               |
| -------- | ------------------------------------ | ---------------------------------------------- |
| `main`   | `https://harpa-pro.pages.dev`        | `https://harpa-pro-dashboard.pages.dev`        |
| `dev`    | `https://dev.harpa-pro.pages.dev`    | `https://dev.harpa-pro-dashboard.pages.dev`    |
| `pr-<n>` | `https://pr-<n>.harpa-pro.pages.dev` | `https://pr-<n>.harpa-pro-dashboard.pages.dev` |

The browser never accepts a marker origin from a query, response, or operator
input. The public marker files must continue to return
`Access-Control-Allow-Origin: *`. They contain only the reviewed commit and
branch fields.

## Browser requests

On authenticated page load, and again only when the operator presses the
existing **Refresh** button, issue these bounded reads:

```text
GET {PUBLIC_API_BASE_URL}/healthz
GET {PUBLIC_API_BASE_URL}/readyz
GET {PUBLIC_API_BASE_URL}/admin/readyz
GET {PUBLIC_SITE_BASE_URL}/_cf-pages-deployment.json
GET /_cf-pages-deployment.json
GET {PUBLIC_DASHBOARD_URL}/_cf-pages-deployment.json
```

Each fetch uses `cache: 'no-store'`. The health request and both cross-origin
marker requests use `credentials: 'omit'`. The readiness requests preserve the
existing credentialed administrator-origin behavior. The administrator marker
uses same-origin credentials. There is no retry, timer, background refresh, or
operator-controlled URL.

The full stacked page makes 15 fixed GET requests after session confirmation.
One manual **Refresh** makes the same 15 requests again. The report live canary
remains a separate manual POST and never runs during either cycle.

The existing `/healthz` CORS policy permits the exact administrator origin. The
health route remains public and read-only. An unrelated origin receives no
`Access-Control-Allow-Origin` header.

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

### Pages marker

```ts
type PagesMarker = {
  commit: string; // full 40-character lowercase hex SHA
  branch: 'main' | 'dev' | `pr-${number}`;
};
```

The branch label matches the Cloudflare build wrapper output. A preview number
starts with a digit from 1 through 9. Later digits can range from 0 through 9.
The browser rejects extra fields, unsupported branch labels, whitespace, HTML
delimiters, control characters, and oversized values. A missing marker is
expected in local development and older deployments. It produces an explicit
Unknown state for that card only.

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
- Public-site Pages identity shows the full commit and branch from its marker.
- Administrator Pages identity shows the full commit and branch from the
  same-origin marker.
- Office-dashboard Pages identity shows the full commit and branch from its
  marker.
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
- Cross-origin marker requests omit credentials and authorization headers.
- Marker origins come only from validated build-time public configuration.
- The panel performs no write, diagnostic mutation, provider call, secret
  lookup, arbitrary fetch, log query, or database query beyond the existing
  readiness probes.
- No value is persisted in browser storage or server storage.
- No polling or alerting is added.
- The build wrapper adds two non-secret public origins to the administrator
  artifact. No Pages, Fly, Neon, provider, or secret setting changes.
- The pull request remains an unmerged stacked draft because this is a
  self-initiated improvement.

## Test plan

Add RED tests before implementation that prove:

- the six deployment reads happen on authenticated load and once more on
  manual Refresh, with the required cache and credential modes;
- valid API identity, both migration heads, and all three markers render with
  full identifiers and clear evidence labels;
- the full stacked page makes exactly 15 GETs on load and 30 after one Refresh;
- the admin environment rejects absent, malformed, or unsafe marker origins;
- the Pages build wrapper emits exact main, dev, and preview marker origins;
- exact `main`, `dev`, and `pr-<n>` branch labels pass, while unsupported and
  HTML-shaped labels fail closed;
- API, product readiness, administrator readiness, and all marker failures are
  independent;
- a late response from an older overlapping refresh cannot replace newer
  evidence;
- `503 head-mismatch` shows only bounded expected/actual migration identifiers;
- raw `message`, extra fields, secrets, HTML, and malformed values fail closed
  and never enter rendered text or browser storage;
- no timer or automatic repeat request is introduced; and
- signed-out entry still performs none of these reads.

Retain the existing API CORS test that limits `/healthz` to the configured
administrator origin. Run the focused component and CORS suites, full
administrator tests and coverage, API unit tests, lint, typecheck, builds,
documentation links, OpenAPI drift, and the protected pre-push gate.

## Rollout and proof

Code review and preview checks prove only the implementation contract. A later
authorized rollout must still verify the exact deployed API identity, both
readiness heads, and all three Pages markers through the established release
gates. The panel values are corroborating observations. They are not the sole
promotion decision.
