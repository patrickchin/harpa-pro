# 2026-08-07 — Admin activity label collided with deletion state (Pattern R18)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A live user named exactly `Deleted user`, or a live project named
exactly `Deleted project`, appeared as a bracketed deleted placeholder in the
admin activity feed. The row accessible name announced it as unavailable, and
the same false state reached filter labels, details, and the text export.

**Root cause.** The API returned human-readable fallback strings for missing
joins, and the admin renderer inferred deletion by matching those strings.
Because user and project names are user-controlled, label text could not
distinguish an available row from a missing row. Existing tests covered only
ordinary live names and the fallback strings, so both paths passed.

**Fix.** The `/admin/activity` response now carries explicit actor, subject,
and project availability state derived from joined-row presence. Deleted labels
are null at the API boundary. The renderer creates placeholders from state and
entity type while treating every available label as opaque text. The route's
dedicated admin authentication, rate limiting, and database-read boundary are
unchanged.

**Test.** Contract and API integration tests require explicit availability
state. Component and Playwright fixtures use live entities named exactly
`Deleted user` and `Deleted project` and require literal UI, accessibility,
filter, detail, and text-export output while the genuinely deleted fixtures
remain bracketed and unavailable.

**Pattern.** R18 — display strings are data, never entity state.
