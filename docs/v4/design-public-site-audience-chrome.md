# Public site: audience-scoped chrome

Status: implemented with provisional defaults; the open questions in §8
await owner review. See [§9](#9-implementation-decisions) for the defaults
chosen and where the implementation differs from the proposal.
Baseline: `origin/dev` at `f25178c6` (re-checked against `d22e9064`).
Scope: `apps/site`, `docs/marketing/README.md`, `apps/site/README.md`, and the `docs/v4/design-*site*` docs that this design supersedes in part.

## 1. Problem

One Astro site serves two unrelated audiences:

| Section | Routes | Audience | Theme |
| --- | --- | --- | --- |
| **Procurement** | `/`, `/procurement/how-to-buy-from-china`, `/procurement/guides`, `/procurement/<slug>` | Architects and interior designers buying in China | `.luxury-site` wrapper with `luxury.css`, a dark walnut masthead, and a porcelain footer |
| **Site Reporting** | `/reports`, `/reports/docs/**`, `/reports/roadmap`, `/reports/account-deletion`, `/reports/confirm` | Foremen and site supervisors | Light paper and navy theme from `globals.css` |
| **Shared** | `/privacy`, `404` | Both audiences | Light theme |

Every page uses the same chrome. Specifically:

- **`components/site/Header.astro`** shows both mega menus (`[data-mega-menu="procurement"]` and `[data-mega-menu="site-reporting"]`) and the `Contact Us` button (`/#contact`). Foremen reading app guides see a procurement CTA.
- **`components/site/Footer.astro`** uses the tagline "Technical procurement and factory records in China." on every page, followed by Procurement, Site Reporting, and Company columns. The Company column's `Contact` link goes to the procurement contact section.
- **`components/site/Wordmark.astro`** always links to `/` (procurement), including from app pages.
- **`pages/404.astro`** makes **Procurement Overview** the primary button and **Site Reporting Guides** secondary. It also renders both menus.
- **`layouts/Layout.astro` defaults** use the procurement title and description, but the default image is `public/og-image.png`. That image is the orange app card: "Harpa Pro — Site Reports — you talk, we write." As a result:
  - `/procurement/guides` passes no image, so procurement shares use the app card.
  - `/reports/*`, `/privacy`, and `404` also use it. The image is correct for the app but wrong for neutral pages.
  - The theme color (`#e55d22`) is the same everywhere.
- **Breadcrumbs:**
  - `layouts/reports/DocsLayout.astro` starts with `Home → /`, which is the procurement page.
  - `layouts/ProcurementGuide.astro` and `pages/procurement/guides.astro` also start with `Home → /`. That target is correct, but the label is generic.
  - There are three separate breadcrumb implementations. Each duplicates the visible `<nav>` and the JSON-LD `BreadcrumbList`.

Earlier accepted designs deliberately chose shared navigation ("Site reporting remains visible in the shared navigation"):

- `design-public-site-product-navigation.md`
- `design-public-site-mega-navigation-and-evidence-disclosure.md`
- `design-site-two-page-navigation.md`

This design **supersedes the shared-chrome part** of those docs. It keeps their interaction requirements: native `<details>` without JavaScript, hover, outside click, Escape with focus return, a 4rem masthead, and no horizontal overflow.

## 2. Goals and non-goals

**Goals**

1. Each section gets its own header navigation, CTA, footer, wordmark target, breadcrumb root, and default metadata (title, description, social image, and theme color).
2. A neutral 404 presents both offers equally.
3. One lightweight, measurable cross-link connects the two sections in the header, mobile menu, and footer.
4. One source of truth defines section configuration, so navigation, breadcrumbs, metadata, and analytics cannot drift apart.

**Non-goals**

- No URL, redirect, sitemap, or canonical changes. `public/_redirects` remains byte-identical.
- No visual redesign of either theme. The luxury masthead styles (`.luxury-site [data-site-header]`) continue to work because the header markup hooks stay the same.
- No change to the Organization or WebSite JSON-LD identity (`https://harpapro.com/#organization` and `/#website`).
- No new dependency or deployment.

## 3. Information architecture

```
harpapro.com
├── [procurement]  /  ·  /procurement/how-to-buy-from-china  ·  /procurement/guides  ·  /procurement/<slug>
├── [reports]      /reports  ·  /reports/docs/**  ·  /reports/roadmap  ·  /reports/account-deletion  ·  /reports/confirm
└── [shared]       /privacy  ·  404
```

| Chrome element | procurement | reports | shared |
| --- | --- | --- | --- |
| Wordmark target | `/` | `/reports` | `/` |
| Wordmark sublabel (optional, Q3) | — | "Site Reporting" | — |
| Desktop navigation | Existing **Procurement** mega panel, unchanged (5 links) | Existing **Site Reporting** mega panel, unchanged (4 links, including Get the App) | Two plain links: **Interior procurement** (`/`) and **Site reporting app** (`/reports`) |
| Primary CTA | `Contact Us` → `/#contact` (unchanged) | `Get the App` → App Store (`APP_STORE_URL`, new tab) | none |
| Cross-link (desktop header) | quiet text link "Site reporting app" → `/reports` | quiet text link "Interior procurement" → `/` | n/a (both are primary) |
| Mobile menu | Procurement group, then a divider, then "Also from Harpa Pro: Site reporting app" | Site Reporting group, then a divider, then "Also from Harpa Pro: Interior procurement" | Both groups (today's menu) |
| Footer tagline | "Technical procurement and factory records in China." | "Daily site reports from voice notes, photos, and text." (owner to confirm, Q4) | "Interior procurement in China and the Harpa Pro site-reporting app." |
| Footer columns | Procurement · Company (Privacy, Contact `/#contact`) · Also from Harpa Pro (1 link) | Site Reporting (App, Guides, Roadmap, Account Deletion) · Company (Privacy, Get the App) · Also from Harpa Pro (1 link) | Procurement · Site Reporting · Company (today's footer) |
| Breadcrumb root | `Procurement` → `/` | `Site Reporting` → `/reports` | none |
| Default title | `Interior Procurement in China \| Harpa Pro` | `Site Reports by Voice \| Harpa Pro` | `Harpa Pro` |
| Default description | current procurement default | "Turn voice notes, photos, and text into daily site report drafts…" | neutral two-offer sentence |
| Default social image | `/` hero social image (generated from `wood.webp` at 1200×630, as `index.astro` does) | `/og-image.png` (the existing app card) | `/og-image.png` until a neutral card exists (Q5) |
| `theme-color` | walnut masthead color from `luxury.css` (Q6) | `#e55d22` | `#e55d22` |

Page assignment:

| Page / layout | Section |
| --- | --- |
| `pages/index.astro` | procurement |
| `pages/procurement/guides.astro` | procurement |
| `layouts/ProcurementGuide.astro` (used by `how-to-buy-from-china`, `[slug]`) | procurement |
| `pages/reports/index.astro`, `roadmap.astro`, `account-deletion.astro`, `confirm.astro` | reports |
| `layouts/reports/DocsLayout.astro` (used by `docs/index`, `docs/guides/[...slug]`) | reports |
| `pages/privacy.astro` | shared (the notice covers the website and the app, per `design-site-product-url-organization.md`) |
| `pages/404.astro` | shared |

Section ownership is **explicit per page**, passed as a prop. It is not inferred from the URL at build time, so a misfiled page fails type-checking instead of silently using the wrong chrome. A pure `sectionForPath()` helper exists only for runtime callers, namely analytics and the 404 hint, plus a consistency test.

## 4. Component plan

### 4.1 `src/lib/site/sections.ts` (new, pure TypeScript, the single source of truth)

```ts
export type SiteSection = "procurement" | "reports" | "shared";

export interface NavLink { label: string; href: string; description?: string; icon?: IconName; external?: boolean }
export interface SectionConfig {
  id: SiteSection;
  label: string;                         // "Procurement" | "Site Reporting" | "Harpa Pro"
  home: string;                          // wordmark + breadcrumb root href
  breadcrumbRoot?: { name: string; path: string };
  menu?: { id: "procurement" | "site-reporting"; summary: string; icon: IconName;
           intro: { title: string; body: string }; links: NavLink[]; mobileLinks: NavLink[] };
  cta?: NavLink & { variant: "accent" | "primary" };
  crossLink?: NavLink & { to: SiteSection };
  footer: { tagline: string; columns: { label: string; links: NavLink[] }[] };
  meta: { title: string; description: string; image?: string; imageAlt: string; themeColor: string };
}

export const SECTIONS: Record<SiteSection, SectionConfig>;
export function sectionForPath(pathname: string): SiteSection; // /reports* → reports; / and /procurement* → procurement; else shared
export function breadcrumbTrail(section: SiteSection, trail: { name: string; path: string }[]):
  { name: string; path: string }[];      // prepends breadcrumbRoot, skipping it when trail[0].path === root.path
```

- Move the link data out of `Header.astro` and `Footer.astro` into this file without changing labels, hrefs, icons, or order, so the existing assertions keep holding.
- `APP_STORE_URL` continues to come from `lib/reports/links.ts`.
- The `IconName` type comes from `components/Icon.astro`'s existing name union. If that union is not exported, export it.

### 4.2 `components/site/Header.astro` (refactor, keep hooks)

- Add the prop `section: SiteSection` (required). The component renders `SECTIONS[section]`.
- Keep the existing DOM contract that CSS and tests rely on: `[data-site-header]`, `nav[aria-label="Primary"]`, `details[data-mega-menu="…"]`, `[data-mega-panel]`, `details.site-menu[data-mobile-menu]`, `[data-mobile-procurement]` / `[data-mobile-site-reporting]`, `[data-nav-icon]`, `[data-nav-item-icon]`, and the 64px row height.
- Leave the enhancement `<script>` as it is. It already iterates `[data-mega-menu]`, so it works with one menu or none.
- Add a cross-link anchor `a[data-audience-switch][data-audience-from=…][data-audience-to=…][data-audience-location="header"]`. Style it as a small, muted text link. It sits between the menu and the CTA on desktop (≥ md) and appears as the last mobile-menu item with `location="mobile_menu"`.
- For `shared`, render no `<details>` menus and show two plain links in the primary nav (desktop) and the mobile disclosure.
- Check the md (768px) width: with one menu, a cross-link, and a CTA, the header has less content than it does today, so overflow risk drops.

### 4.3 `components/site/Footer.astro` (refactor)

- Add the prop `section`. The component renders `footer.tagline`, `footer.columns`, and a final "Also from Harpa Pro" column with the cross-link (`data-audience-location="footer"`).
- The `shared` configuration reproduces today's three-column footer.
- Keep the `<footer>` element as a direct child of `.luxury-site` because `luxury.css:652` targets `.luxury-site > footer`.

### 4.4 `components/site/Wordmark.astro` (small change)

- Add the prop `href` (default `/`). `Header` passes `SECTIONS[section].home`.
- The optional sublabel waits for Q3. The existing test reads the wordmark font from `[data-site-header] > div > a span`, so keep the first `span` as the brand text.

### 4.5 `components/site/Breadcrumbs.astro` (new)

- The props are `section` and `trail` (excluding the root). It renders today's markup (`nav[aria-label="Breadcrumb"].docs-breadcrumbs`, `/` separators, and `aria-current="page"` on the last item).
- Export `breadcrumbJsonLd(site, pageUrl, items)` from `lib/site/sections.ts`, or from `lib/site/breadcrumbs.ts`, so the visible trail and the JSON-LD trail come from the same `breadcrumbTrail()` call. This removes three hand-maintained copies and keeps the `seo.spec.ts` invariant "visible == JSON-LD".

Resulting trails:

| Page | Trail |
| --- | --- |
| `/reports/docs` | Site Reporting › Guides |
| `/reports/docs/guides/x` | Site Reporting › Guides › *Title* |
| `/procurement/guides` | Procurement › Procurement guides |
| `/procurement/<slug>` | Procurement › Procurement guides › *Headline* |
| `/procurement/how-to-buy-from-china` | Procurement › *How to buy from China* |

Root label: "Procurement" replaces "Home" (Q2). Its target is still `/`.

### 4.6 `layouts/Layout.astro` (extend)

- Add the prop `section: SiteSection` (required). Any explicit `title`, `description`, `image`, or `imageAlt` overrides the section defaults from `SECTIONS[section].meta`.
- The procurement default image is resolved with `getImage()` from `assets/procurement/finishes/wood.webp` at 1200×630 PNG, matching `index.astro`. Extract that into a small helper, `lib/procurement/social-image.ts`, used by `index.astro`, `ProcurementGuide.astro`, and the default.
- Emit `<body data-site-section={section}>` for analytics and future CSS hooks.
- Make `<meta name="theme-color">` per-section.
- Leave the JSON-LD Organization and WebSite nodes unchanged.

### 4.7 Optional convenience: `layouts/SectionPage.astro` (new)

```astro
<Layout section {...layoutProps}><div class={wrapperClass}><Header section/><slot/><Footer section/></div></Layout>
```

- This removes the repeated Header and Footer import pairs from 10 pages and layouts.
- Pages that need custom wrappers (`index.astro` with `LuxuryEffects`, `confirm.astro` with `min-h-dvh flex`) pass `class` or use named slots.
- Recommended, but separable. Do it in the same PR only if the diff stays reviewable. Otherwise pass `section` to the three components directly.

### 4.8 `pages/404.astro` (rewrite content, same URL)

- The page uses `section="shared"` and keeps the `noindex` setting and the title "Page Not Found | Harpa Pro".
- Keep the H1 "That Page Is Not Here." and the copy line.
- Replace the button row with **two equal cards** in a 2-column grid (1 column below `sm`):
  - **Interior procurement**: Procurement Overview (`/`), Procurement guides (`/procurement/guides`), and Contact Us (`/#contact`).
  - **Site reporting app**: Harpa Pro App (`/reports`), Site Reporting Guides (`/reports/docs`), and Roadmap.
  - Every card link carries `data-audience-switch` with `from="shared"` and `location="not_found"`.
- Progressive hint: a tiny inline script calls `sectionForPath(location.pathname)`. If the result is `reports` or `procurement`, it sets `data-suggested` on that card, which adds an accent border and a "Looking for this?" label, and moves the card first with CSS `order`. Without JavaScript, the order is neutral: procurement left and reports right, matching the site root.
- Cloudflare Pages serves `404.html` for every unknown path, and it is static, so the hint must stay client-side.
- Alternative (Q7): add `src/pages/reports/404.astro`. Cloudflare Pages serves the nearest `404.html` walking up the path, so `/reports/**` misses would get a reports-chrome 404 with no JavaScript. Astro emits this as a normal page at `/reports/404`. It is not in the sitemap because `sitemap.xml.ts` is a hand-written list, it must be `noindex`, and `astro preview` will not emulate the nearest-404 behavior. Defer unless the owner wants it.

### 4.9 Analytics (`lib/analytics.ts`)

PostHog runs with `mask_all_text` and `mask_all_element_attributes`, so autocapture cannot tell which link was clicked. Add, mirroring `captureContact`:

- **Event `audience_switch_clicked`** with the fixed properties `{ page_path, from: SiteSection, to: SiteSection, location: 'header' | 'mobile_menu' | 'footer' | 'not_found' }`.
  - A delegated click listener on `[data-audience-switch]` captures it, the same way the existing `data-contact-event` listener works. It must never block navigation.
  - Validate the values against the literal unions before sending, and drop the event if any value is unknown.
- **Property `site_section`** on every event. `initAnalytics` reads `document.body.dataset.siteSection`, validates it against `SiteSection`, and `sanitizeAnalyticsEvent(event, campaign, section)` adds it.
  - Keep `sanitizeAnalyticsEvent` pure and add a unit-tested parameter for this.
  - This needs no persistence (`register()` is not used), so cookieless behavior is unchanged.
- `captureContact`'s `location: 'home_contact'` stays as it is.
- Campaign propagation already decorates internal links, so UTM labels carry across a section switch. Leave that unchanged.

### 4.10 Styling

- The procurement header and footer keep `.luxury-site` scoping. Add only `.luxury-site [data-audience-switch]` color and hover rules in `luxury.css`, next to lines 69–92. Add the light equivalent in `globals.css`.
- The 404 cards reuse existing tokens (`border-border`, `bg-card`, `ring-focus`). Add no new tokens.

## 5. File-by-file changes

| File | Change |
| --- | --- |
| `src/lib/site/sections.ts` | **New.** Section config, `sectionForPath`, `breadcrumbTrail`, and `breadcrumbJsonLd`. |
| `src/lib/site/sections.test.ts` | **New.** Vitest coverage for the section config, `sectionForPath`, and the breadcrumb helpers (see §6). |
| `src/lib/procurement/social-image.ts` | **New.** Shared `getImage(wood.webp, 1200×630 png)` helper. |
| `src/components/site/Header.astro` | Add the `section` prop, render nav from config, add the cross-link, and add the `shared` variant. Keep the script unchanged. |
| `src/components/site/Footer.astro` | Add the `section` prop, render the section tagline and columns, and add the cross-link column. |
| `src/components/site/Wordmark.astro` | Add the `href` prop. |
| `src/components/site/Breadcrumbs.astro` | **New.** Visible breadcrumb rendered from `breadcrumbTrail`. |
| `src/layouts/Layout.astro` | Add the `section` prop, per-section meta, image, and theme-color defaults, and `body[data-site-section]`. |
| `src/layouts/SectionPage.astro` | **New (optional, §4.7).** |
| `src/layouts/ProcurementGuide.astro` | Pass `section="procurement"`. Replace hand-built breadcrumbs (visible and JSON-LD) with the helpers. Use `social-image.ts` for the default hero social image. |
| `src/layouts/reports/DocsLayout.astro` | Pass `section="reports"`. Replace the `Home` breadcrumb with helpers rooted at `/reports`. |
| `src/pages/index.astro` | Pass `section="procurement"` to Layout, Header, and Footer. Use `social-image.ts`. |
| `src/pages/procurement/guides.astro` | Pass `section="procurement"`. Breadcrumbs come from the helpers. The social image now defaults to the procurement card (fixes the app card on a procurement page). |
| `src/pages/procurement/how-to-buy-from-china.astro`, `[slug].astro` | No change (they go through `ProcurementGuide`). |
| `src/pages/reports/{index,roadmap,account-deletion,confirm}.astro` | Pass `section="reports"`. |
| `src/pages/privacy.astro` | Pass `section="shared"`. |
| `src/pages/404.astro` | Neutral two-card layout, `section="shared"`, and the progressive hint script. |
| `src/lib/analytics.ts` (+ `analytics.test.ts`) | `audience_switch_clicked` and the `site_section` property. |
| `src/styles/luxury.css`, `src/styles/globals.css` | Cross-link and 404 card rules only. |
| `public/_redirects`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts` | **No change.** |
| `apps/site/README.md` | Update the "shared header/footer" description to section-scoped chrome and point to `lib/site/sections.ts`. |
| `docs/marketing/README.md` | Paragraph 2: "Shared header, footer, and wordmark live in `src/components/site`" becomes "section-scoped chrome configured in `src/lib/site/sections.ts`". Note the neutral 404. |
| `docs/marketing/deploy-cloudflare-pages.md` (line ~100) | Post-deploy check: an unknown path shows the neutral 404 with both offers. A `/reports/...` miss highlights the app card. |
| `docs/v4/design-public-site-audience-chrome.md` | **New.** This document (repo hard rule: the design doc lands before or with code). |
| `docs/v4/design-public-site-product-navigation.md`, `design-public-site-mega-navigation-and-evidence-disclosure.md`, `design-site-two-page-navigation.md` | Add a "Superseded in part by audience-scoped chrome" note at the top. Shared-menu statements no longer apply. Interaction requirements still do. |
| `docs/v4/design-public-site-posthog.md` | Add the `audience_switch_clicked` row and the `site_section` property. |
| `src/pages/privacy.astro` copy | Check only. If it lists analytics events explicitly, add the new non-personal event. |

## 6. Test plan

### 6.1 Unit tests (Vitest, `pnpm --filter site test`)

`src/lib/site/sections.test.ts` (new):

- `sectionForPath`:
  - `/`, `/#contact`, `/procurement/guides`, and `/procurement/x` return `procurement`.
  - `/reports`, `/reports/docs/guides/x`, and `/reports/confirm` return `reports`.
  - `/privacy`, `/nope`, and `/reportsx` return `shared`. The last case guards against prefix bugs.
- Page-to-section consistency: for every sitemap route, `sectionForPath(route)` equals the section passed by the page. Run this in Playwright via `body[data-site-section]` (see §6.2).
- `breadcrumbTrail`:
  - The root is prepended.
  - The root is not duplicated when the trail starts with it.
  - The reports root never points to `/`.
- `breadcrumbJsonLd` positions are 1..n and the last item equals the page URL.
- Config invariants:
  - Every internal `href` is root-relative.
  - Each non-shared section has exactly one `crossLink`, and it points to the other section's `home`.
  - The procurement menu has 5 links and the reports menu has 4, matching today's counts.

Changes to existing tests:

- `src/lib/analytics.test.ts`:
  - `sanitizeAnalyticsEvent` adds a valid `site_section` and drops an invalid one.
  - The audience-switch payload contains only the allowed keys and values.
- `src/__tests__/smoke.test.ts` (lines 151–161) asserts link strings in `Header.astro` and `Footer.astro`, which move to `sections.ts`.
  - Retarget those reads to `lib/site/sections.ts`, keeping the same `href="/"`, `/reports`, `Site Reporting`, and `/#contact` checks, with the strings expressed as config values.
  - Keep the `existsSync(404.astro)` check.

### 6.2 Playwright (`pnpm --filter site test:e2e`, Chromium and Firefox)

Existing specs that change, because their premise changes from both menus on `/` to one menu per section:

| Spec | Current assumption | Update |
| --- | --- | --- |
| `tests/agents.spec.ts` → "uses accessible mega navigation…" (lines 716–845) | `/` has both menus, 3 `[data-nav-icon]`, 8 item icons; footer has a Site Reporting column; mobile has both groups (7 icons) | Split into two tests. **On `/`:** 1 menu, the Procurement panel (5 links, hover, outside click, Escape with focus return), Contact Us, the cross-link to `/reports`, and the procurement footer. **On `/reports`:** the Site Reporting panel (4 links, Get the App `target=_blank`) and the same interaction checks. Adjust the icon counts (procurement: 2 `[data-nav-icon]` = menu + CTA; reports: 1 + CTA icon if kept). Mobile on each page: its own group, then the cross-link. |
| `tests/header.spec.ts` → "keeps procurement and reporting destinations usable without JavaScript" | Opens the site-reporting menu after navigating to the procurement guide | After the How-to-Buy click, follow the **cross-link** to `/reports` (no JavaScript), open its menu, then click Guides. Same widths (320/390/768/1440), 64px height, and overflow ≤1. Also verify the Dashboard-absent check on `/reports`. |
| `tests/procurement.spec.ts` (lines 15–19) | Procurement menu on the procurement page | Unchanged (still true). |
| `tests/docs.spec.ts` → "presents two core workflows…" | Breadcrumb "Site Reporting" → `/reports` | Unchanged, plus assert there is **no** breadcrumb link to `/`. |
| `tests/docs.spec.ts` → "uses the branded not-found page…" | "Procurement Overview" and "Site Reporting Guides" in main | Keep both link names. Add: both cards are visible, and on `/reports/docs/guides/not-a-real-guide` with JavaScript the app card has `data-suggested`. |
| `tests/seo.spec.ts` → breadcrumb block | visible == JSON-LD | Unchanged. It now validates the new roots for free. |
| `tests/navigation.spec.ts` → link crawl | All internal links resolve | Unchanged. It covers the new cross-links and 404 links automatically. |

New Playwright assertions (add to `navigation.spec.ts`):

1. **Section isolation:** for every sitemap route, `body[data-site-section]` matches `sectionForPath(pathname)`.
   - In `procurement` sections the header contains no `[data-mega-menu="site-reporting"]` and the footer contains no `/reports/roadmap` link, and the reverse holds for `reports`.
   - In both, exactly one `[data-audience-switch]` exists in the desktop header and one in the footer.
2. **Wordmark target:** `/reports/docs` links the wordmark to `/reports`, and `/procurement/guides` links it to `/`.
3. **Shared pages:** `/privacy` and the 404 show both offers in the header and nothing marked as the CTA.
4. **Metadata defaults** (in `seo.spec.ts`, no JavaScript):
   - Every `procurement` sitemap page has an `og:image` that is not `/og-image.png`. This catches today's `/procurement/guides` bug.
   - Every `reports` page without an explicit image uses `/og-image.png`.
   - `theme-color` matches the section.
   - Titles and descriptions stay unique, which the existing test enforces.
5. **Luxury theme intact:** the existing font and color test on `/procurement/how-to-buy-from-china` (`seo.spec.ts` lines 96–110) must pass unchanged. This proves the header hooks survived.

Analytics (`pnpm --filter site test:analytics`):

- Extend `tests/analytics.spec.ts`:
  - Clicking the header cross-link on `/` sends `audience_switch_clicked` with `{from:'procurement', to:'reports', location:'header'}` and `site_section:'procurement'`.
  - Navigation still succeeds when PostHog requests are blocked.
  - No browser storage is written, which the existing helper asserts.

Redirects (`pnpm --filter site test:redirects`):

- No changes expected. Run the suite unchanged to prove that `_redirects` and 404 status codes still behave. Unknown `/docs/*` paths still finish at 404, now rendered as the neutral page.

### 6.3 Manual and visual checks

- Screenshots at 390 and 1440 for `/`, `/procurement/guides`, `/reports`, `/reports/docs/guides/getting-started`, `/privacy`, and `/nope`.
- Keyboard tab order: wordmark → menu summary → cross-link → CTA.
- Optionally run a share-card preview (for example opengraph.xyz) on `/procurement/guides` and `/reports` after deploy to `dev`.

## 7. Rollout

1. Land the PR (against `dev`) with the design doc, `sections.ts` and its unit tests, the component refactor, page wiring, test updates, and docs.
2. Verify the `dev` Pages deploy using the `deploy-cloudflare-pages.md` checklist.
3. Watch `audience_switch_clicked` volume by `from` for 2–4 weeks. If cross-traffic is meaningful, revisit whether `/` should become a neutral chooser (out of scope here).

Risk is low: there are no URL changes, and every change is reversible by reverting one PR. The main risk is test churn in `agents.spec.ts` and `header.spec.ts`, and the plan above covers it.

## 8. Open questions for the owner

1. **Supersede the shared-menu decision?** Three accepted docs (§1) explicitly keep Site Reporting in the shared navigation on procurement pages. Confirm that procurement pages may drop the Site Reporting mega panel in favor of one quiet cross-link.
2. **Breadcrumb root label on procurement pages:** "Procurement" (recommended, because it is symmetrical with "Site Reporting") or keep "Home"? The target is `/` either way.
3. **Reports wordmark:** link to `/reports` (recommended, so foremen stay in their section). Should it also show a "Site Reporting" sublabel next to "Harpa Pro"?
4. **Reports footer copy and contact:** approve the tagline. Is there a support contact for app users (email or in-app)? Today the only "Contact" is the procurement WhatsApp and email section, which this design removes from reports chrome.
5. **Neutral social card:** commission a neutral `og` image for `/privacy` and 404 (and as the `shared` default), or keep the app card there?
6. **Per-section `theme-color`:** use the walnut masthead color on procurement pages (mobile browser chrome), or keep orange site-wide?
7. **Reports-scoped 404:** is the client-side hint on the neutral 404 enough, or should `/reports/404.html` provide a no-JavaScript, reports-chrome 404 using Cloudflare's nearest-`404.html` rule (§4.8)?
8. **Reports primary CTA:** "Get the App" (App Store) replaces "Contact Us". The panel also has Get the App. Is the duplication acceptable, or should the panel drop its fourth tile?
9. **Cross-link labels:** "Site reporting app" and "Interior procurement". The smoke test forbids "Harpa Pro procurement" in the homepage body, so the header avoids that phrase as well. Do you have preferred wording?
10. **`SectionPage` wrapper (§4.7):** do it in the same PR, or as a follow-up refactor?

## 9. Implementation decisions

The first implementation uses the recommended default for each open question,
or the most conservative option where §8 makes no recommendation. The owner
can change any of these without a URL change.

| # | Question | Default shipped |
| --- | --- | --- |
| 1 | Supersede the shared menu | Yes. Each audience shows only its own mega menu plus one quiet cross-link. The three earlier docs carry a "superseded in part" note. |
| 2 | Procurement breadcrumb root | "Procurement" (recommended). The target is still `/`. |
| 3 | Reports wordmark | Links to `/reports` (recommended). No "Site Reporting" sublabel (conservative). |
| 4 | Reports footer and support contact | Tagline "Daily site reports from voice notes, photos, and text." No new support contact; the reports chrome has no contact link. |
| 5 | Neutral social card | Not commissioned. `/privacy` and 404 keep the app card (`/og-image.png`). |
| 6 | Per-section `theme-color` | Kept `#e55d22` everywhere (conservative). The value is per-section config, so a walnut colour is a one-line change. |
| 7 | Reports-scoped 404 | Deferred (recommended). The neutral 404 uses the client-side hint. |
| 8 | Reports CTA duplication | Kept. The header CTA and the fourth panel tile both say Get the App. |
| 9 | Cross-link labels | "Site reporting app" and "Interior procurement" as proposed. |
| 10 | `SectionPage` wrapper | Deferred to a follow-up. Pages pass `section` to `Layout`, `Header`, and `Footer` directly. |

Differences from §4 to §6:

- Since the baseline, `/procurement/guides` already used the interior social
  image and `lib/social-images.ts` owns the app card. `Layout` now falls back
  to `lib/procurement/social-image.ts` only for procurement pages that pass no
  image.
- `Breadcrumbs.astro` takes the full trail returned by `breadcrumbTrail()`, so
  the page computes the trail once for both the visible breadcrumb and
  `breadcrumbJsonLd()`.
- `Icon.astro` accepts any Lucide name as a string, so the config uses `string`
  instead of an `IconName` union.
- The reports footer keeps today's Site Reporting column, including Get the
  App. Its Company column has only Privacy.
- Desktop shared pages show two plain links. The shared mobile menu shows both
  groups without a primary action.
- The 404 hint moves the suggested card first in the DOM, not only with CSS
  `order`, so keyboard and visual order match.
- `audience_switch_clicked` is sent with `send_instantly` because the click
  navigates away before the batch would flush.
- The theme colour stays orange, so the "theme-color matches the section"
  check asserts the single shared value.
