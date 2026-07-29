# Cross-surface visual system

**Status:** approved direction for the mobile app, office dashboard, marketing
site, and docs site  
**Source of truth:** the shipped mobile app

## 1. Problem

The product currently presents three related but visibly different systems:

- mobile uses a compact warm-paper, navy, and orange system with 6–8 px
  controls and cards;
- the office dashboard introduced larger radii, a darker ink, a two-panel auth
  splash, and a separate report-editor palette;
- the public site approximates the brand with a third palette, Inter, multiple
  container widths, and inconsistent section primitives.

The result feels like separate products. It also makes spacing fixes local and
fragile. This design replaces the independent web foundations with one shared
web token package whose values are checked against mobile.

## 2. Boundary

Tokens are shared; rendering primitives stay platform-native.

- `apps/mobile` remains the normative visual reference and keeps React Native
  primitives.
- `packages/design-tokens` exposes the mobile values as CSS custom properties.
- `apps/dashboard` and `apps/site` consume those properties through their own
  DOM/Astro primitives.
- Feature styles may define layout, but may not define another base palette,
  radius scale, control height, or typography scale.

This avoids a cross-platform component abstraction while removing the drift
caused by duplicated foundations.

## 3. Foundation contract

### 3.1 Colour

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#f8f6f1` | app and page background |
| Ink / primary | `#2d3a5a` | headings, routine primary controls, active navigation |
| Card | `#ffffff` | raised content surfaces |
| Muted surface | `#f1eee6` | secondary bands, toolbars, selected quiet states |
| Emphasis surface | `#fffdf8` | draft/report emphasis without a new hue |
| Border / input | `#b9b4a8` | one-pixel structural boundaries |
| Accent | `#ea580c` | one dominant action or active emphasis |
| Muted ink | `#5f5b66` | supporting copy and metadata |
| Disabled ink | `#8a8693` | unavailable controls |
| Success | `#2f6f48` | completed/healthy state |
| Warning | `#b66916` | incomplete/attention state |
| Danger | `#b91c1c` | destructive/error state |
| Info | `#2a5a9f` | neutral informational state |

Orange is not general navigation chrome. Routine primary buttons are navy.
Orange is reserved for the single hero action on a screen, active focus
emphasis, or a small brand mark. Orange-filled controls use a large bold label
so the mobile colour pairing is not used for small body copy.

### 3.2 Typography

Use the native system stack on every surface:

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

| Token | Size / line height | Weight | Typical use |
| --- | --- | --- | --- |
| Display | 34 / 40 px | 700 | one marketing or auth statement |
| Title | 26 / 32 px | 700 | page heading |
| Title small | 20 / 26 px | 700 | card/section heading |
| Metric | 32 / 36 px | 700 | project statistics |
| Body large | 18 / 26 px | 400 | short introduction |
| Body | 16 / 24 px | 400 | default copy and form values |
| Label | 13 / 16 px | 700 | uppercase eyebrow, 0.08 em tracking |
| Meta | 14 / 20 px | 400 | dates, addresses, supporting details |

Desktop layouts may give text more horizontal room; they do not introduce a
larger unrelated type scale. Paragraph measure is capped at 68 characters.

### 3.3 Spacing and sizing

The primary rhythm is 4 px based, with 12, 16, and 20 px doing most of the
work.

- default mobile/web-small page gutter: 20 px;
- wide page gutter: 24 px, then 32 px above 1280 px;
- control minimum height: 44 px; prominent control: 52 px;
- card padding: 12, 16, or 20 px;
- list/card gap: 12 px; section-internal gap: 16 px;
- major section separation: 32 or 48 px;
- icon/avatar tile: 40 × 40 px;
- sidebar: 268 px;
- application content maximum: 1380 px;
- public content maximum: 1152 px;
- readable prose maximum: 720 px.

Large empty bands are not a substitute for hierarchy. Marketing sections use
64 px vertical padding on wide screens and 48 px on small screens. Docs use a
24 px page start, 32 px between major groups, and 16 px within a group.
Browser application roots reserve a stable vertical scrollbar gutter so
classic desktop scrollbars do not create a horizontal shift at narrow widths.

### 3.4 Shape, border, and depth

- controls: 6 px radius;
- cards and navigation items: 8 px radius;
- exceptional floating/emphasis surface: 12 px radius;
- default border: 1 px;
- raised surface: `0 2px 8px rgb(26 26 46 / 8%)`;
- floating surface: `0 4px 14px rgb(26 26 46 / 12%)`.

Twenty-pixel marketing-card radii and deep decorative shadows are removed.
Depth communicates layering, not decoration.

## 4. Component mapping

### Buttons

- 44 px minimum height, 6 px radius, 16 px horizontal padding.
- Primary: navy fill and paper text.
- Hero: orange fill, white 18 px bold label, one per view.
- Secondary: white or muted fill with visible border.
- Quiet: transparent fill; still keeps a 44 px target.
- Destructive: danger colour and explicit text, never colour alone.

### Fields

- 44 px minimum height, 6 px radius, 16 px horizontal and 12 px vertical
  padding.
- Labels use the label token.
- Focus uses a visible navy ring with a 2 px offset.
- Text areas may grow; editor text remains 16/24 px for comfortable keyboard
  editing.

### Cards and rows

- 8 px radius, visible border, white/emphasis surface, restrained raised
  shadow.
- Standard object row uses a 40 px icon/avatar, a 4 px text stack, and 12–16 px
  padding.
- Create/add affordances use the mobile dashed-card pattern rather than a
  floating marketing button.

### Tabs and filters

- Tabs sit inside a bordered 8 px container.
- Active tab/chip is filled navy with paper text.
- Inactive tabs are quiet; underline-only report tabs are removed.
- Active state has text/icon reinforcement and is not colour-only.

### Page headers

- A 44 px control row may be followed by a stacked title row.
- Long report titles wrap fully instead of truncating.
- Actions remain a compact 12 px cluster and wrap below the title when needed.

## 5. Surface-specific application

### Office dashboard

- Signed-out routes use the same narrow, centred auth column as mobile. The
  large dark marketing split panel is removed.
- The shell may use a desktop sidebar, but its rows, cards, controls, stats,
  and headers use the mobile grammar.
- Project, member, and report pages keep 20–32 px gutters and 12 px list
  rhythm.
- Desktop-only value is density and keyboard reach, especially the report text
  editor; it is not a second visual identity.

### Report workspace

- The feature owns the editor/preview grid and sticky behaviour only.
- Palette, fields, buttons, tabs, notices, and cards resolve to shared tokens.
- At 1280 px and above, editor/source/preview may be three regions.
- From 1024–1279 px, preview collapses behind a control.
- Below 1024 px, content stacks without horizontal clipping.

### Marketing

- Keep one clear hero action and the product story, but use the shared type,
  shape, control, and section rhythm.
- All sections use the shared `Container`, `Section`, and `Button` primitives.
- Decorative scale must not create a different brand system.

### Docs

- Header, sidebar, search, cards, screenshots, prose, and pager use the same
  6/8/12 px shape scale.
- The desktop sidebar and main column share the standard 24–32 px gutter.
- Prose stays within 720 px; screenshots may extend wider without creating
  arbitrary empty space.
- On small screens, navigation becomes a 44 px disclosure and content uses a
  20 px gutter.

## 6. Responsive and quality checks

Review representative states at:

- dashboard: 1440, 1280, 1024, 768, and 390 px;
- marketing/docs: 1440, 1024, and 390 px;
- long project/report names, empty states, dense tables, validation errors, and
  text areas containing long unbroken and multi-paragraph content.

Acceptance requires:

- no horizontal overflow;
- keyboard-visible focus and logical tab order;
- no layout shift when fonts or screenshots load;
- 44 px minimum interactive targets;
- meaningful heading hierarchy and readable line length;
- shared token contract test passing;
- browser screenshots reviewed for dashboard auth, a dashboard page, report
  workspace, marketing home, docs home, and a docs guide.

## 7. Delivery phases

1. Establish shared tokens and regression checks.
2. Align dashboard foundation and signed-out experience.
3. Remove the report workspace’s local design system.
4. Align marketing primitives and section rhythm.
5. Align docs layout, prose, cards, and responsive navigation.
6. Run multi-viewport browser review and keep the screenshots with the PR
   evidence.
