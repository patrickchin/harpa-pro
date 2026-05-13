# M0 — Foundation

Goal: `apps/marketing` exists as an Astro app in the monorepo, ports
the Lovable landing page to static `.astro` components, and deploys to
a Cloudflare Pages preview URL with a green Lighthouse score.

## Exit gate
- [ ] `pnpm --filter @harpa/marketing dev` runs locally on port 3002.
- [ ] `pnpm --filter @harpa/marketing build` produces a static-first
      output (zero JS on pages without islands).
- [ ] Cloudflare Pages preview deploys on every PR.
- [ ] Lighthouse Performance / Accessibility / Best Practices / SEO
      all ≥ 95 on the deployed preview.
- [ ] Tailwind v4 wired; self-hosted fonts; shadcn CSS vars defined.
- [ ] Lovable landing-page JSX ported to `.astro` pages (no React
      hydration anywhere yet — islands come in M1/M2).
- [ ] Conventional Commits, `dev` branch workflow, root `pnpm test`
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
- [ ] `src/content/config.ts` with collections: `faq`, `features`.
- [ ] Port FAQ entries + feature cards into MDX files.
- [ ] Create `.astro` primitives: `Button.astro`, `Section.astro`,
      `Container.astro` — typed props, no JS, re-usable.
- [ ] Update landing page to pull from content collections via
      `getCollection('faq')`.
- [ ] Commit: `feat(marketing): mdx content collections + primitives`.

### M0.5 Cloudflare Pages deploy
- [ ] **No SSR adapter.** Output stays `static` and Pages serves
      `dist/` directly. The `@astrojs/cloudflare` v11 adapter does
      not support Astro 5 and is unnecessary for a static site
      (decision recorded in M0.1).
- [ ] Create `wrangler.jsonc` minimal config (name, compatibility
      date, `pages_build_output_dir = "dist"`).
- [ ] GitHub Action `.github/workflows/marketing-preview.yml`:
      - Trigger on PR to `dev`, path filter `apps/marketing/**`.
      - Install deps, `pnpm --filter @harpa/marketing build`.
      - `wrangler pages deploy apps/marketing/dist --project-name=harpa-marketing
        --branch=${{ github.head_ref }}`.
      - Comment unique preview URL on PR.
- [ ] GitHub Action `.github/workflows/marketing-prod.yml`:
      - Trigger on push to `dev`, path filter `apps/marketing/**`.
      - Deploy to production Cloudflare Pages project.
- [ ] Commit: `chore(ci): marketing preview + prod deploys`.

### M0.6 Lighthouse gate
- [ ] Add `@lhci/cli` to root `devDependencies`.
- [ ] Create `lighthouserc.json` (budgets: perf ≥ 95, a11y ≥ 95, bp
      ≥ 95, seo ≥ 95).
- [ ] GitHub Action step in `marketing-preview.yml` runs `lhci
      autorun --collect.url=$PREVIEW_URL`.
- [ ] Commit: `chore(ci): lighthouse budget gate`.

### M0.7 TypeScript + lint + test scaffold
- [ ] Extend `tsconfig.base.json` in `apps/marketing/tsconfig.json`.
- [ ] Add `eslint` config extending repo root.
- [ ] Placeholder `apps/marketing/src/__tests__/smoke.test.ts` (Vitest)
      asserting MDX content parses.
- [ ] Root `pnpm test`, `pnpm typecheck`, `pnpm lint` include
      `@harpa/marketing`.
- [ ] Commit: `chore(marketing): typescript + lint + test scaffold`.

### M0.8 M0 exit
- [ ] Visual review: landing page matches Lovable source in layout +
      spacing + typography.
- [ ] Lighthouse all green on preview deploy.
- [ ] Tag `v0.1.0-marketing`.

## Out of scope for M0
- Waitlist form (React island, M1).
- Voice demo (React island, M2).
- Legal pages, OG image, sitemap (M3).
- Custom domain DNS (M3).
- Analytics, Sentry (M3).
