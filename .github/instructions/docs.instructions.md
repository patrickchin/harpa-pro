---
applyTo: 'docs/**,*.md,**/*.md'
description: 'Docs + markdown style. Loads when editing any markdown file.'
---

# Docs

## Hard rule

**Docs land in the same commit as the behaviour they describe**
(AGENTS.md hard rule #3). Behaviour, schema, deployment, or
workflow change → matching doc update in the same PR.

## Layout

- `docs/v4/arch-*.md` — architecture docs. Index in
  `docs/v4/architecture.md`.
- `docs/v4/plan-p*.md` — phase plans with checkbox tasks.
- `docs/v4/pitfalls.md` — what went wrong in v3; numbered.
  Reference pitfalls by number (e.g. "Pitfall 6").
- `docs/bugs/README.md` — recurring-bug log. Add an entry every
  time you fix a bug that smelled familiar.
- `docs/v4/prompts/` — reusable per-screen / per-route templates.

## Cross-linking

- New `arch-*.md` doc → also link from `docs/v4/architecture.md`.
- Plan checkboxes get ticked **in the same commit** that completes
  the task.
- Run `pnpm test:docs:links` after you add, remove, or rename a local
  Markdown link or heading. The root lint job runs the same check.

## Style

- Use sentence case for headings.
- 80-column soft wrap.
- Prefer relative links (`../arch-foo.md`) over absolute repo paths.
- Inline code for file paths, identifiers, env vars, and CLI flags.

## Don't

- Don't paste large code blobs into arch docs — link to the source
  file + line range instead.
- Don't create scratch/notes files in `docs/` — those belong in the
  session workspace.
