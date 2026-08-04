# Web peer graph drift

## Symptom

`apps/site` and `apps/admin` declared React 18 even though the root pnpm
override resolved both workspaces to React 19.2.0. Neither workspace declared
Vite directly, so Astro and `@tailwindcss/vite` relied on pnpm's automatic peer
installation to choose a Vite version.

This made a Dependabot manifest diff misleading: a seemingly isolated React,
Tailwind, or Astro update could cause pnpm to select a new Vite major or create
different React and React DOM peer variants.

## Root cause

The root overrides were added for Expo compatibility without updating the two
web manifests. Vite remained an implicit peer because Astro brought it into
the lockfile transitively. The lockfile happened to contain a compatible graph,
but the workspaces did not state that compatibility boundary themselves.

## Fix

- Declare React and React DOM 19.2.0 in both web workspaces, matching the root
  runtime override.
- Align both workspaces on React 19 type packages.
- Declare Vite 6.4.3 directly in each workspace. Astro 5.18 requires Vite
  `^6.4.1`, so this keeps the current Astro major on its supported Vite line.
- Upgrade `tailwindcss` and `@tailwindcss/vite` together to 4.3.3.

Astro stays on major 5 in this change. Its major migrations remain separate so
their integration and content changes can be reviewed independently.

## Regression protection

The site and admin smoke suites parse their own `package.json` files and assert
the direct React, React type, Vite, and Tailwind compatibility versions. A
future dependency update must change the declared graph and its regression
expectations together.
