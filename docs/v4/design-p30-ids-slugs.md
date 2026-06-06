# P3.0 IDs/Slugs Migration — Implementation Design

> **Status:** ⚠️ **SUPERSEDED** by
> [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).
> Retained for historical context only — do not implement against
> this doc.
>
> **Companion:** [arch-ids-and-urls.md](arch-ids-and-urls.md)

## Historical note

This design proposed a **dual-id scheme**:

- Internal `uuid` primary key (UUIDv7, generated DB-side).
- Public `slug` column (`prj_xxxxxx`, `rpt_xxxxxx`) used in API
  paths, mobile URLs, and share links.
- Per-project `number` for reports (`/projects/prj_x/reports/42`).
- Expand/contract migration adding `slug` + `number` as nullable,
  then backfilling, then enforcing `NOT NULL`.

It was **rejected before shipping** in favour of a slug-only scheme:

- **No parallel UUID column.** The prefixed slug is the primary
  key directly.
- Each entity gets its own Postgres `DOMAIN` (e.g. `app.prj_id`,
  `app.rpt_id`) that constrains the slug shape at the type level.
- Foreign keys reference the slug DOMAIN, not a UUID.
- Eliminates the dual-id complexity (two ways to identify a row,
  two indexes per table, two join keys) and the expand/contract
  backfill step entirely.

See [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md) for
the implemented design.
