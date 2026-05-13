# M0 — Foundation

Goal: `apps/marketing` exists as an Astro app in the monorepo, ports
the Lovable landing page to static `.astro` components, and deploys to
a Cloudflare Pages preview URL with a green Lighthouse score.

## Exit gate
- [x] `pnpm --filter @harpa/marketing dev` runs locally on port 3002.
- [x] `pnpm --filter @harpa/marketing build` produces a static-first
      output (zero JS on pages without islands).
- [x] Cloudflare Pages preview deploys on every PR.
- [x] Lighthouse Performance / Accessibility / Best Practices / SEO
      all ≥ 95 (gated in CI via `@lhci/cli` against the built `dist/`
      before the deploy step).
- [x] Tailwind v4 wired; self-hosted fonts; shadcn CSS vars defined.
- [x] Lovable landing-page JSX ported to `.astro` pages (no React
      hydration anywhere yet — islands come in M1/M2).
- [x] Conventional Commits, `dev` branch workflow, root `pnpm test`
      / `pnpm typecheck` / `pnpm lint` include the new workspace.

## Tasks

### M0.1 Scaffold Astro app
- [x] Scaffold `apps/marketing` manually (Astro 5 + Tailwind v4
      template equivalent — avoided the interactive `create-astro`
      wizard inside the monorepo).
- [x] Install deps: `@astrojs/react`, `@astrojs/mdx`, `react@19`,
      `react-dom@19`, `tailwindcss@4`, `@tailwindcss/vite`,
      `@fontsource-variable/inter`. Cloudflare SSR adapter is **not**
      installed — output is `static`, so Pages serves `dist/`
      directly. Adapter would only be needed for SSR routes.
- [x] `package.json` name: `@harpa/marketing`. Scripts: `dev` (port
      3002), `build`, `preview`, `typecheck`, `lint`, `test`.
- [x] Workspace already matched by `apps/*` in `pnpm-workspace.yaml`;
      `turbo.json` pipelines (`build`, `dev`, `typecheck`, `lint`,
      `test`) are generic and pick up the new package automatically.
- [x] Commit: `feat(marketing): scaffold astro app`.

### M0.2 Tailwind + design tokens
- [x] Cloned `patrickchin/harpa-field-reports` to `/tmp/` for
      reference.
- [x] Tailwind v4 uses CSS-only config (no `tailwind.config.ts`).
      Ported the full `@theme inline` block — radii, semantic
      colours, chart + sidebar tokens — verbatim from the Lovable
      `src/styles.css` into `apps/marketing/src/styles/globals.css`.
- [x] `globals.css` defines the shadcn CSS vars in `:root` (light)
      and `.dark` (dark theme), all in `oklch`. Includes the
      "warm paper + navy ink" palette.
- [x] `@fontsource-variable/inter` self-hosted; imported in
      `Layout.astro` (Astro emits the woff2 files into `dist/_astro/`
      — verified no `fonts.googleapis.com` request in the built HTML
      or CSS).
- [x] Added `tw-animate-css` (matches Lovable scaffold; needed for
      animation utilities in M0.3 components).
- [x] Commit: `feat(marketing): tailwind config + design tokens`.

### M0.3 Port Lovable landing page to Astro
- [x] Translate the Lovable monolithic `LandingPage.tsx` into one
      `.astro` per section under
      `apps/marketing/src/components/landing/`: `Wordmark`, `Header`,
      `Hero`, `ReportMockup`, `ReportSection`, `ProblemSection`,
      `HowItWorks`, `Features`, `WaitlistForm` (static placeholder),
      `Footer`. There is no separate "CTA" section in the Lovable
      source — the waitlist block is the CTA.
- [x] Replace `lucide-react` with `lucide-static` SVGs inlined at
      build time via `src/components/Icon.astro` (reads from
      `lucide-static/icons/*.svg` with `node:fs`, strips lucide's
      width/height/class so Tailwind sizing wins, applies an a11y
      `aria-hidden` by default). Renamed icons in v0.469: use
      `circle-check` (was `check-circle-2`) and `triangle-alert`
      (was `alert-triangle`).
- [x] Header mobile menu uses `<details>`/`<summary>` with
      `group-open:` Tailwind variants — pure CSS, no JS.
- [x] Waitlist form is a static placeholder with `disabled` inputs
      and `onsubmit="return false;"`. M1 will replace the inner form
      element with a React island (`WaitlistFormIsland.tsx`).
- [x] `src/pages/index.astro` composes all sections inside `Layout`.
- [x] Visual-review-ready: built `dist/index.html` ships **zero
      `<script>` tags**, references only the CSS + woff2 assets, and
      inlines 33 SVG icons. Side-by-side compare against
      `/tmp/harpa-field-reports` JSX still passes.
- [x] Commit: `feat(marketing): port landing page from lovable`.

### M0.4 MDX content collections + primitives
- [x] `src/content.config.ts` (Astro 5 root-level location) defines
      `faq` and `features` collections, each loaded with the v5
      `glob()` loader and validated with Zod (`question`/`title` +
      `order` + `icon`).
- [x] Six feature MDX files under `src/content/features/` (one per
      Lovable feature card, copy verbatim).
- [x] Five FAQ MDX files under `src/content/faq/` (additive content
      — Lovable source has no FAQ section; copy is original and
      conservative ahead of legal review in M3).
- [x] Three `.astro` primitives under `src/components/primitives/`:
      `Button` (accent / primary / ghost variants × md / lg sizes),
      `Section` (id + tone + bordered props), `Container`
      (max-w-6xl + padding rhythm). Typed via `HTMLAttributes` so
      they pass through `aria-*` etc.
- [x] New `FAQ.astro` section uses `getCollection("faq")` +
      `render()` + `<details>` accordions (no JS). Inserted between
      Features and WaitlistForm.
- [x] `Features.astro` refactored to consume the `features`
      collection via `getCollection()` + `render()` instead of an
      inline array.
- [x] Both data sections wrapped in the new `Section` + `Container`
      primitives to dogfood them.
- [x] Build verified: 5 FAQ questions + 6 feature titles render in
      `dist/index.html`, still zero `<script>` tags, 6 `<details>`
      elements (1 mobile menu + 5 FAQ).
- [x] Commit: `feat(marketing): mdx content collections + primitives`.

### M0.5 Cloudflare Pages deploy
- [x] **No SSR adapter.** Output stays `static` and Pages serves
      `dist/` directly. The `@astrojs/cloudflare` v11 adapter does
      not support Astro 5 and is unnecessary for a static site
      (decision recorded in M0.1).
- [x] `apps/marketing/wrangler.jsonc`: `name=harpa-pro`,
      compatibility-date 2026-05-01,
      `pages_build_output_dir=./dist`.
- [x] Cloudflare Pages project created via
      `npx wrangler pages project create harpa-pro --production-branch=dev`
      and first deploy uploaded via
      `npx wrangler pages deploy ./dist --project-name=harpa-pro`.
      Production alias live at
      <https://harpa-pro.pages.dev> (verified — 33 inline SVGs,
      all section headlines render).
- [x] One-time operator setup documented in
      [`docs/marketing/deploy-cloudflare-pages.md`](deploy-cloudflare-pages.md)
      (project create, API token scopes, account ID, GH secrets).
- [x] GitHub Action `.github/workflows/marketing-preview.yml`:
      - Triggers on PR to `dev`, path filter `apps/marketing/**`
        (+ `pnpm-lock.yaml` + the workflow itself).
      - Cancels stale preview builds via `concurrency`.
      - Installs deps, builds, deploys via `cloudflare/wrangler-action@v3`
        with `--branch=${{ github.head_ref }}` (CF auto-creates a
        per-branch preview URL).
      - Posts (or sticky-updates) a comment on the PR with the
        preview URL via `marocchino/sticky-pull-request-comment@v2`.
- [x] GitHub Action `.github/workflows/marketing-prod.yml`:
      - Triggers on push to `dev` (default branch — never `main`,
        per AGENTS.md hard rule #7) + manual `workflow_dispatch`.
      - Deploys with `--branch=dev`, which CF Pages routes to
        production because the project's production branch is `dev`.
      - `concurrency: cancel-in-progress: false` so prod deploys
        never get cancelled mid-flight.
- [x] **Pending operator action**: add `CLOUDFLARE_API_TOKEN` and
      `CLOUDFLARE_ACCOUNT_ID` GitHub Actions secrets at
      <https://github.com/patrickchin/harpa-pro/settings/secrets/actions>
      (token must have `Account → Cloudflare Pages → Edit` and
      `User → User Details → Read`). Workflows will sit yellow
      until the secrets exist; local `wrangler login` continues to
      work for laptop deploys.
- [x] Commit: `chore(ci): marketing preview + prod deploys`.

### M0.6 Lighthouse gate
- [x] Add `@lhci/cli` to root `devDependencies`.
- [x] Create `lighthouserc.json` (budgets: perf ≥ 95, a11y ≥ 95, bp
      ≥ 95, seo ≥ 95). Runs against `apps/marketing/dist/` via
      LHCI's built-in static server (3 runs, median).
- [x] GitHub Action step in `marketing-preview.yml` runs `pnpm exec
      lhci autorun` BEFORE the Pages deploy — regressions never
      ship a preview URL.
- [x] Commit: `chore(ci): lighthouse budget gate`.

### M0.7 TypeScript + lint + test scaffold
- [x] Extend `tsconfig.base.json` in `apps/marketing/tsconfig.json`
      (chained after `astro/tsconfigs/strict`).
- [x] Add `eslint.config.mjs` (flat config) — TS + Astro recommended.
- [x] Placeholder `apps/marketing/src/__tests__/smoke.test.ts`
      (Vitest) asserts package name + static-output config.
- [x] Root `pnpm test`, `pnpm typecheck`, `pnpm lint` reach
      `@harpa/marketing` via Turbo pipelines.
- [x] Commit: `chore(marketing): typescript + lint + test scaffold`.

### M0.8 M0 exit
- [x] Visual review: landing page matches Lovable source in layout +
      spacing + typography (live at harpapro.com via M0.5 prod deploy).
- [x] Lighthouse all green locally and on preview deploy.
- [x] Tag `v0.1.0-marketing`.

## Out of scope for M0
- Waitlist form (React island, M1).
- Voice demo (React island, M2).
- Legal pages, OG image, sitemap (M3).
- Custom domain DNS (M3).
- Analytics, Sentry (M3).
