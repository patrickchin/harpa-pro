# `reference/` — read-only design references

Files here are **not built, not published, and not consumed by any
workspace**. They exist purely as a visual + structural reference
while we design our own equivalents in `packages/`.

`pnpm-workspace.yaml` only globs `apps/*` and `packages/*`, so pnpm
ignores anything under `reference/`. The lint gates
(`scripts/check-no-*.sh`) also scope to `apps/`, `packages/`, and
`infra/`, so reference code can contain whatever the original
project had without tripping CI.

Delete a sub-tree the moment we no longer need it as a reference.

## Current contents

### `report-ui/` + `report-core/`

Copied from `../haru3-reports/packages/report-ui` +
`packages/report-core` at commit `0fbba81` ("feat(report-ui): extract
presentational reports UI into @harpa/report-ui").

Purpose: visual reference for the look-and-feel of the daily site
report (header + stats + weather + workers + materials + issues +
next steps + note cards). We'll re-implement matching visuals in
our own packages (e.g. `@harpa/ui-voice` for the marketing hero
demo) rather than depending on these files directly.

Stack used by the reference:

- React Native + NativeWind v4
- `lucide-react-native` icons
- Drives off a `GeneratedSiteReport` Zod schema in `report-core`
  (we will design our own equivalent later)

Do not import from `reference/` in app or package code.
