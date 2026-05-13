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
- [ ] Run `pnpm create astro@latest apps/marketing` with Tailwind v4
      template.
- [ ] Install additional deps: `@astrojs/react`, `@astrojs/cloudflare`,
      `@astrojs/mdx`, `react@19`, `react-dom@19`, `tailwindcss@4`,
      `@tailwindcss/vite`.
- [ ] `package.json` name: `@harpa/marketing`. Scripts: `dev` (port
      3002), `build`, `preview`, `typecheck`, `lint`, `test`.
- [ ] Register workspace in `pnpm-workspace.yaml`, `turbo.json`
      pipelines (`build`, `dev`, `typecheck`, `lint`, `test`).
- [ ] Commit: `feat(marketing): scaffold astro app`.

### M0.2 Tailwind + design tokens
- [ ] Clone `patrickchin/harpa-field-reports` into a tmp dir for
      reference.
- [ ] Port `tailwind.config.ts` (colors, radius, font family) from
      Lovable scaffold.
- [ ] Create `src/styles/globals.css` with shadcn CSS vars (light +
      dark themes).
- [ ] Install `@fontsource-variable/inter`, import in
      `src/layouts/Layout.astro` (no Google Fonts request).
- [ ] Commit: `feat(marketing): tailwind config + design tokens`.

### M0.3 Port Lovable landing page to Astro
- [ ] Translate Hero, Features, HowItWorks, SampleReport, FAQ, CTA,
      Footer sections into `.astro` files under
      `apps/marketing/src/components/`.
- [ ] Replace `lucide-react` with `lucide-static` SVGs inlined at
      build time (zero JS for icons).
- [ ] Replace any Radix-driven accordion/tabs with semantic HTML +
      Tailwind + CSS `details`/`summary` or pure CSS states (no JS
      yet).
- [ ] Create `src/pages/index.astro` composing all sections.
- [ ] Visual review: render locally, compare to Lovable source
      side-by-side.
- [ ] Commit: `feat(marketing): port landing page from lovable`.

### M0.4 MDX content collections + primitives
- [ ] `src/content/config.ts` with collections: `faq`, `features`.
- [ ] Port FAQ entries + feature cards into MDX files.
- [ ] Create `.astro` primitives: `Button.astro`, `Section.astro`,
      `Container.astro` — typed props, no JS, re-usable.
- [ ] Update landing page to pull from content collections via
      `getCollection('faq')`.
- [ ] Commit: `feat(marketing): mdx content collections + primitives`.

### M0.5 Cloudflare Pages deploy
- [ ] Add `@astrojs/cloudflare` adapter, `astro.config.mjs`:
      `adapter: cloudflare({ mode: 'directory' })`.
- [ ] Create `wrangler.jsonc` minimal config (name, compatibility
      date).
- [ ] GitHub Action `.github/workflows/marketing-preview.yml`:
      - Trigger on PR to `dev`, path filter `apps/marketing/**`.
      - Install deps, `pnpm --filter @harpa/marketing build`.
      - `wrangler pages deploy dist/ --project-name=harpa-marketing
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
