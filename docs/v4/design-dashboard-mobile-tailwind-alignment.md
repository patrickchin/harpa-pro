# Dashboard mobile alignment and Tailwind migration

**Status:** approved for implementation on 2026-08-04

**Applies to:** `apps/dashboard` only

**Visual source of truth:** the shipped mobile app

## 1. Goal

The office dashboard must read as the desktop companion to the mobile app.
It keeps desktop advantages such as persistent project navigation, tables where
they improve scanning, and a keyboard-first report workspace, but it uses the
same brand mark, visual hierarchy, spacing rhythm, control language, and
responsive fallbacks as mobile.

The public marketing and documentation site in `apps/site` is explicitly out of
scope. Its source, font stack, palette, components, and layout must not change as
part of this work.

## 2. User journeys

- As a Harpa Pro user, I see the same Harpa Pro logo on dashboard sign-in,
  onboarding, empty states, and application navigation that I see in mobile.
- As a project manager, I can move between projects, members, reports, and
  settings without pages changing their spacing or control language.
- As a report editor, I can work with a physical keyboard in a roomy desktop
  layout while buttons, fields, tabs, cards, and status treatments still match
  mobile.
- As a user on a narrow browser, I get stacked cards and wrapped actions instead
  of desktop tables that require page-level horizontal scrolling.

## 3. Canonical mobile references

- Brand mark: `apps/mobile/assets/icon.svg` and
  `apps/mobile/components/primitives/Logo.tsx`.
- Colour: `apps/mobile/lib/design-tokens/colors.ts`.
- Type, spacing, radii, and control heights:
  `apps/mobile/tailwind.config.js`.
- Buttons, inputs, cards, and page headers:
  `apps/mobile/components/primitives/`.
- Report tabs:
  `apps/mobile/components/reports/detail/ReportDetailTabBar.tsx`.

Dashboard CSS variables continue to come from
`packages/design-tokens/src/tokens.css`. The dashboard may not introduce a
second palette, type scale, radius scale, or control-height scale.

## 4. Tooling contract

The dashboard uses the established web equivalents of the mobile NativeWind
stack:

- Tailwind CSS v4 through the official `@tailwindcss/vite` integration for all
  ordinary layout and visual styling;
- `@headlessui/react` for complex accessible interactions such as dialogs,
  menus, and tabs;
- `lucide-react` for interface icons;
- `clsx` and `tailwind-merge` behind one `cn()` helper for conditional and
  override-safe utility composition;
- the existing React Router, TanStack Query, and Zod integrations for routing,
  server state, and validation.

Native HTML remains preferred for simple buttons, links, labels, inputs,
textareas, and selects. Do not add a large component framework or a second
styling runtime.

## 5. Tailwind boundary

`apps/dashboard/src/globals.css` may contain only:

- the dashboard token import;
- the Tailwind import and `@theme inline` token mapping;
- document-level base rules, focus defaults, reduced-motion handling, the skip
  link, and screen-reader-only behavior.

React components own visual styling through Tailwind utilities. Shared
dashboard primitives live under `apps/dashboard/src/components/ui/` and cover
the brand mark, button, card, field, badge, empty state, page header, dialog,
tabs, and table shell.

A small report layout stylesheet may remain for rules that are materially
clearer than utility strings: sticky editor/preview offsets, named grid
templates, section scroll margins, and print-only report behavior. It must not
define another button, field, card, badge, dialog, or typography system.

## 6. Visual decisions

### Brand

- Replace every textual `HP` tile with the exact mobile app icon geometry.
- Render the mark as an image with the accessible name `Harpa Pro` when it is
  meaningful and empty alternative text when adjacent wordmark text already
  names the product.
- Auth and onboarding use the same 48 px rounded mark as mobile.

### Page rhythm

- Small viewport gutter: 20 px (`px-5`).
- Default page stack: 24 px between major sections, 16 px within sections, and
  12 px between related controls or rows. Reserve 32 px for independent desktop
  regions rather than ordinary route rhythm.
- Ordinary page titles use the mobile title-small scale; object-detail titles
  may use the title scale; auth statements use the display scale.
- Long project and report titles wrap. Action groups wrap beneath the title
  before they compress controls.

### Components

- Controls have a 44 px minimum target, 6 px radius, and visible focus ring.
- Form labels are sentence-case label text in muted ink. Values stay regular
  weight and never inherit label uppercase or tracking.
- Buttons, tabs, navigation, and member names use semibold rather than bold or
  extrabold.
- Cards use 8 px radius, one-pixel border, 16 px default padding, and the mobile
  raised shadow. Use 12 or 20 px only where the content density warrants it.
- Routine primary actions are navy. Orange is reserved for one dominant
  act-here action per view, such as generating or updating a report.
- Report and review tabs use the mobile segmented-control treatment: bordered
  muted container with a navy active segment.
- Destructive actions use the semantic danger treatment and never rely on red
  text alone.

### Navigation

- Desktop keeps project navigation because it improves office workflows, but
  the rail is visually quiet: warm canvas, real logo, compact 44 px rows, navy
  active state, muted inactive state, and Lucide icons.
- Below the desktop breakpoint, navigation becomes a compact top surface with
  horizontally scrollable project sections and a Headless UI account menu.
- Navigation must not consume more visual weight than the active page header.

## 7. Responsive contract

- `>= 1280 px`: fixed desktop rail, 32 px content gutter, report editor and
  preview may sit side by side.
- `1024-1279 px`: compact rail and stacked auxiliary report content; preview may
  be toggled.
- `< 1024 px`: top navigation and stacked report workspace without page-level
  horizontal clipping.
- `<= 768 px`: projects, members, recent reports, and reports use stacked row
  cards; desktop tables are not the only representation.
- `390 px`: actions can become full-width, titles wrap, and every control keeps
  its 44 px target.

## 8. Acceptance

- No textual `HP` placeholder remains in rendered dashboard UI.
- The dashboard build uses Tailwind v4 through `@tailwindcss/vite`.
- Shared visual primitives no longer depend on the legacy `.button`, `.surface`,
  `.reports-button`, `.reports-field`, `.reports-badge`, or modal CSS systems.
- `apps/site` has no diff against the refreshed `dev` base from this task.
- Unit tests cover logo usage and shared primitive variants.
- Existing behavior tests remain green after the markup migration.
- Playwright covers auth, project/member/report surfaces and verifies no content
  overflow at 1280, 768, 390, and 280 px, plus desktop landscape behavior.
- Manual preview review confirms page rhythm, typography, focus, dense data,
  long text, empty states, and the report workspace.
