# IDs, slugs, and URL shapes

> Companion to [arch-api-design.md](arch-api-design.md),
> [arch-database.md](arch-database.md), and
> [arch-mobile.md](arch-mobile.md).
>
> **Status:** decided. Implemented in **P3.1** — see
> [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).
> Supersedes the dual-id (uuid + slug) scheme from P3.0
> ([design-p30-ids-slugs.md](design-p30-ids-slugs.md)).

## Decision

Every user-addressable entity has **one** primary identifier — a
short, prefixed, URL-safe string that is _both_ the DB primary
key _and_ the public URL token. No parallel UUID column.

```
prj_<8 chars>      # project
rpt_<8 chars>      # report
fil_<10 chars>     # file
not_<10 chars>     # note
usr_<12 chars>     # user
ses_<12 chars>     # session
vrf_<10 chars>     # auth verification
wls_<10 chars>     # waitlist entry
```

Reports also carry a **per-project number** (incrementing `int`,
unique within `(project_id, number)`) used in the canonical URL
for human readability — see "URL shapes" below.

### Format

- **Separator:** underscore. Single-token under double-click
  selection; matches Stripe / Slack / Discord / OpenAI.
- **Alphabet:** Crockford base32 — `0123456789abcdefghjkmnpqrstvwxyz`
  (no `i`/`l`/`o`/`u`; lowercase canonical form, case-insensitive
  on input).
- **Generator:** `packages/api/src/lib/ids.ts::newId(prefix)` —
  `crypto.randomBytes` → Crockford base32. Server-side only.
- **Collision handling:** `insertWithGeneratedId(prefix, fn)`
  retries up to 3× on PG `23505` (unique-violation). Birthday
  bounds: 8-char prefix → 50% collision at ~1.1M rows per type;
  10-/12-char prefixes are effectively collision-free.
- **TypeScript brand:** `Id<P>` from
  `@harpa/api-contract` is a phantom-typed string. The brand is
  applied at trust boundaries (`assertId('usr', value)` in
  `auth.api.getSession()` consumers, `signTestSession`, etc.) and at insert
  (`newId('prj')`). Drizzle columns are plain `text()` so
  `eq(col, plainString)` still works.

## URL shapes

Two shapes per entity. Both stable, both indefinitely supported.

| Entity  | Long (canonical)                                | Short (permalink)    |
|---------|-------------------------------------------------|----------------------|
| Project | `/projects/prj_xxxxxxxx`                        | `/p/prj_xxxxxxxx`    |
| Report  | `/projects/prj_xxxxxxxx/reports/<number>`       | `/r/rpt_xxxxxxxx`    |

- **Long URLs** are the canonical address used internally — nav
  stack, analytics, deep-link targets.
- **Short URLs** are share-link entry points (push, "Copy
  link", QR). Resolved via `GET /p/:project` / `GET /r/:report`
  which return JSON; the mobile client `router.replace`s to the
  long URL so the back stack stays clean.

### Why both numbers and slugs for reports

- The number is what users say out loud and remember
  (`/projects/.../reports/42`). Per-project counter, monotone,
  gaps OK.
- The slug is globally unique and stable across re-parenting.
  Today reports never move projects, but the schema permits it;
  the slug URL would still resolve.

## Schema

```sql
CREATE DOMAIN app.prj_id AS text
  CHECK (VALUE ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.rpt_id AS text
  CHECK (VALUE ~ '^rpt_[0-9a-hjkmnp-tv-z]{8,16}$');
-- …usr_id, ses_id, fil_id, not_id, vrf_id, wls_id

CREATE TABLE app.projects (
  id          app.prj_id PRIMARY KEY,
  …
);

CREATE TABLE app.reports (
  id          app.rpt_id PRIMARY KEY,
  project_id  app.prj_id NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  number      int NOT NULL,
  …
  UNIQUE (project_id, number)
);
```

The DOMAIN is the runtime contract: invalid slugs are rejected
by the DB itself, not by application code. RLS
`current_setting('app.user_id')::app.usr_id` coerces the JWT
claim into the DOMAIN at every scoped statement.

### Per-project number generation

Allocated in a single transaction via the SECURITY DEFINER helper
`app.create_report_with_owner(...)`. `projects.next_report_number
int NOT NULL DEFAULT 1`; gaps from rolled-back transactions are
acceptable (GitHub issue numbering does the same).

## API contract

Zod factory in `packages/api-contract/src/schemas/ids.ts`:

```ts
export const idSchema = (prefix: IdPrefix) =>
  z.string()
    .regex(new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{8,16}$`))
    .transform(s => s.toLowerCase());

export const projectId = idSchema('prj');
export const reportId  = idSchema('rpt');
// …userId, fileId, noteId, sessionId
```

Route params use the short, slug-native form everywhere:

| Path                                         | Param   |
|----------------------------------------------|---------|
| `GET /projects/{project}`                    | `prj_*` |
| `GET /projects/{project}/reports/{number}`   | `prj_*` + int |
| `DELETE /projects/{project}/members/{user}`  | `prj_*` + `usr_*` |
| `GET /reports/{report}/notes`                | `rpt_*` |
| `PATCH /notes/{note}`                        | `not_*` |
| `GET /p/{project}`                           | `prj_*` resolver |
| `GET /r/{report}`                            | `rpt_*` resolver |

Resolver responses return JSON (not a 308 redirect) so the
mobile client controls the navigation transition:

```jsonc
GET /r/rpt_abc12def
→ 200 { "type": "report",
        "projectId": "prj_xxxxxxxx",
        "reportId":  "rpt_abc12def",
        "reportNumber": 42 }
```

## Mobile routing (Expo Router)

```
app/(app)/projects/[project]/index.tsx                    # project home
app/(app)/projects/[project]/edit.tsx                     # project edit
app/(app)/projects/[project]/members.tsx                  # members
app/(app)/projects/[project]/reports/index.tsx            # reports list
app/(app)/projects/[project]/reports/[number]/generate.tsx
app/(app)/p/[project].tsx                                 # short → router.replace
app/(app)/r/[report].tsx                                  # short → router.replace
```

The resolver screens render a brief skeleton, call the
corresponding `/p` / `/r` resolver hook, then `router.replace`
to the canonical long URL.

## Deep linking implications

The slug-native scheme makes deep linking essentially free —
see the five rules in
[arch-mobile.md §"Deep-link readiness"](arch-mobile.md). The
short-URL routes are the natural targets for universal links
when `apple-app-site-association` / `assetlinks.json` are wired
in P4.

## What this is NOT

- ❌ A user-editable slug. IDs are server-assigned and immutable.
  Renaming a project keeps the same id.
- ❌ A vanity URL. Titles never appear in URLs — title changes
  must never break links.
- ❌ A separate "internal vs public" identifier. The slug IS the
  primary key. The previous dual-id design (P3.0) was abandoned
  before it shipped to production — see
  [design-p31-slug-only-ids.md §1](design-p31-slug-only-ids.md).

## Implementation design

See [**design-p31-slug-only-ids.md**](design-p31-slug-only-ids.md)
for the schema, generator, RLS retype, and rollout plan.
