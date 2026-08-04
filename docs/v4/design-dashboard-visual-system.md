# Dashboard visual system

**Status:** approved direction for the office dashboard  
**Source of truth:** the shipped mobile app

## 1. Scope

This contract applies to `apps/dashboard` only. The public marketing and docs
site in `apps/site` keeps its existing visual system and is not coupled to the
dashboard token package.

The dashboard is a desktop companion to the mobile app, so it should feel like
the same product while using the extra room for review, administration, and
keyboard-first report editing. Desktop density and layout may differ; the
brand foundation should not.

## 2. Boundary

- `apps/mobile` remains the normative visual reference.
- `packages/design-tokens` mirrors the relevant mobile values as CSS custom
  properties for the dashboard.
- `apps/dashboard` owns DOM layout and responsive behavior.
- Dashboard feature styles may define layout, but may not introduce another
  base palette, radius scale, control height, or typography scale.

This avoids a cross-platform component abstraction while preventing the
dashboard shell and report editor from drifting into separate visual systems.

## 3. Foundation contract

### Colour

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#f8f6f1` | application background |
| Ink / primary | `#2d3a5a` | headings, primary controls, active navigation |
| Card | `#ffffff` | content surfaces |
| Muted surface | `#f1eee6` | toolbars and selected quiet states |
| Emphasis surface | `#fffdf8` | draft/report emphasis |
| Border / input | `#b9b4a8` | structural boundaries |
| Accent | `#ea580c` | one dominant action or active emphasis |
| Muted ink | `#5f5b66` | supporting copy and metadata |
| Success | `#2f6f48` | completed/healthy state |
| Warning | `#b66916` | incomplete/attention state |
| Danger | `#b91c1c` | destructive/error state |
| Info | `#2a5a9f` | neutral informational state |

Orange is not general navigation chrome. Routine primary buttons are navy.
Orange is reserved for the dominant action, focus emphasis, or a small brand
mark.

### Typography

Use the native system stack:

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

| Token | Size / line height | Weight | Typical use |
| --- | --- | --- | --- |
| Display | 34 / 40 px | 700 | auth statement |
| Title | 26 / 32 px | 700 | object-detail heading |
| Title small | 20 / 26 px | 700 | ordinary route or card heading |
| Metric | 32 / 36 px | 700 | project statistics |
| Body large | 18 / 26 px | 400 | short introduction |
| Body | 16 / 24 px | 400 | default copy and form values |
| Label | 13 / 16 px | 700 | uppercase eyebrow, 0.08 em tracking |
| Meta | 14 / 20 px | 400 | dates and supporting details |

Desktop layouts may give text more horizontal room; they do not introduce an
unrelated type scale. Paragraph measure is capped at 68 characters.

### Spacing and sizing

The primary rhythm is 4 px based, with 12, 16, and 20 px doing most of the
work.

- small-screen page gutter: 20 px;
- wide page gutter: 24 px, then 32 px above 1280 px;
- control minimum height: 44 px; prominent control: 52 px;
- card padding: 12, 16, or 20 px;
- list/card gap: 12 px; section-internal gap: 16 px;
- ordinary major section separation: 24 px;
- 32 or 48 px separation only between genuinely independent desktop regions;
- icon/avatar tile: 40 × 40 px;
- sidebar: 268 px;
- application content maximum: 1380 px;
- readable prose maximum: 720 px.

### Shape, border, and depth

- controls: 6 px radius;
- cards and navigation items: 8 px radius;
- exceptional floating surface: 12 px radius;
- default border: 1 px;
- raised surface: `0 2px 8px rgb(26 26 46 / 8%)`;
- floating surface: `0 4px 14px rgb(26 26 46 / 12%)`.

Depth communicates layering, not decoration.

## 4. Component mapping

### Buttons and fields

- Controls keep a 44 px minimum target and 6 px radius.
- Primary controls use navy; one dominant action may use orange.
- Secondary controls use white or muted fill with a visible border.
- Form labels use the label token in muted ink and sentence case. Uppercase is
  reserved for eyebrows, table headings, and compact status metadata.
- Form values remain regular weight; label typography must not inherit into
  inputs, textareas, or selects.
- Buttons use semibold labels, matching the mobile primitive.
- Focus is visible and offset from the control edge.
- Editor text stays at 16/24 px for comfortable keyboard editing.

### Cards, rows, and tabs

- Cards use an 8 px radius, one-pixel border, and restrained shadow.
- Object rows use a 40 px icon/avatar, 4 px text stack, and 12–16 px padding.
- Tabs sit in a bordered 8 px container.
- The active tab is filled navy with paper text; state is never colour-only.

### Page headers

- Long report and project titles wrap instead of truncating.
- Actions form a compact 12 px cluster and wrap below the title when needed.
- Auth routes use a narrow centred column rather than a separate marketing
  splash panel.

## 5. Report workspace

- The feature owns the editor/preview grid and sticky behavior only.
- Palette, fields, buttons, tabs, notices, and cards resolve to dashboard
  tokens.
- At 1280 px and above, editor, source, and preview may use three regions.
- From 1024–1279 px, preview collapses behind a control.
- Below 1024 px, content stacks without horizontal clipping.

## 6. Responsive and quality checks

Review representative states at 1440, 1280, 1024, 768, and 390 px, including
long names, empty states, dense tables, validation errors, and multi-paragraph
report text.

Acceptance requires:

- no content-container horizontal overflow;
- keyboard-visible focus and logical tab order;
- 44 px minimum interactive targets;
- meaningful heading hierarchy and readable line length;
- the dashboard visual contract test passing;
- browser screenshots reviewed for auth, project/member pages, and the report
  workspace.
