# Dashboard typography and density correction

**Status:** approved correction for PR #211 on 2026-08-05
**Applies to:** `apps/dashboard` only
**Visual source of truth:** the checked-in mobile implementation

## 1. Problem

The dashboard adopted the mobile type sizes and colours, but it did not preserve
the mobile hierarchy. Too many web elements use `font-bold`, the member surface
introduces `font-extrabold`, and the shared web `Field` applies its label weight,
tracking, and uppercase transform to the entire `<label>` subtree. Inputs,
textareas, and selects therefore inherit display-label typography instead of the
mobile input typography.

The dashboard also promotes ordinary route titles to the 26 px detail-title
token and uses 32 px page gaps broadly. Mobile ordinary routes use the 20 px
`text-title-sm` screen header and 12–20 px content rhythm.

## 2. Canonical mobile mapping

The implementation must follow these checked-in sources:

- `apps/mobile/tailwind.config.js` for the system font and named type tokens;
- `apps/mobile/components/primitives/Input.tsx` for sentence-case muted labels
  and regular-weight form values;
- `apps/mobile/components/primitives/Button.tsx` for 600-weight control labels;
- `apps/mobile/components/primitives/ScreenHeader.tsx` for ordinary 20 px route
  titles;
- `apps/mobile/screens/project-members.tsx` for 600-weight member names and
  compact 12 px row spacing;
- `apps/mobile/components/reports/detail/ReportReviewPane.tsx` for a flat review
  pane with bordered comment cards;
- `apps/mobile/components/primitives/SectionHeader.tsx` for compact report-card
  headings.

## 3. Weight contract

| Weight | Dashboard use                                                                            |
| ------ | ---------------------------------------------------------------------------------------- |
| 700    | Named `display`, `title`, `title-sm`, `metric`, and `label` tokens; rare avatar initials |
| 600    | Buttons, tabs, navigation, row names, comment authors, and secondary actions             |
| 500    | Rare supporting emphasis only                                                            |
| 400    | Body copy, form values, select values, textareas, dates, and supporting metadata         |

`font-extrabold` is not part of the dashboard/mobile parity contract.

Form-label presentation belongs on the label text node, never the wrapper.
Labels remain 13/16 px, 700, tracked, sentence case, and muted. Uppercase is
reserved for eyebrows, table headings, and compact status metadata.

Default buttons retain the mobile primitive's 16 px, 600-weight label; the
explicitly small button remains 14 px. OTP values use regular input typography,
without a dashboard-only bold or tracked treatment. Project-row titles retain
the mobile title emphasis at 700 in both card and desktop-table presentations.

## 4. Scale and spacing contract

- Ordinary project, report-list, member, and settings route titles use
  `text-title-sm` (20/26, 700).
- A report or project detail title may use `text-title` when the title itself is
  the primary object being reviewed.
- Auth and onboarding may use `text-display`.
- Default route stacks use 24 px between major regions and 12–16 px within a
  region. Use 32 px only to separate genuinely independent desktop regions.
- Cards default to 16 px padding. Use 20 px for prose or editing surfaces that
  benefit from it, not for every row or empty state.
- The review pane is flat; individual comments retain bordered cards.

## 5. Tailwind boundary

React component styling uses Tailwind utilities. `globals.css` remains only for
the shared token import, Tailwind theme mapping, document defaults, focus,
reduced motion, and other genuinely global browser behaviour. It must not hold
component typography or spacing rules. The skip link can be expressed directly
in its JSX utilities.

This correction does not change `apps/site`.

## 6. Acceptance

- Computed form-control weight is 400 and controls do not inherit uppercase or
  label tracking.
- Computed default-button size is 16 px; button, tab, navigation, and
  member-name weight is 600.
- Ordinary page headings compute to 20/26 px at 700.
- No `font-extrabold` class is applied by production dashboard components.
- Report preview section headings follow the compact mobile section-header
  hierarchy rather than repeating 20 px bold headings.
- Auth, projects, members, reports, and review surfaces pass the Playwright
  typography-parity journey in every configured browser.
- Dashboard components contain no CSS modules, inline style objects, or style
  tags; `globals.css` contains no component visual selector.
