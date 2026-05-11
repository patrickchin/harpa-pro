# Project Home

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a project overview screen. Top bar: project name (left), edit pencil button (right). Below: two copy-to-clipboard rows (client name, address with MapPin icon, both swapping Check/Copy icon on tap). Stat row: "Reports" count + "Drafts" count (warning tone if > 0). "Last report" muted card. Four action cards with 40×40 icon box + title + description + chevron-right: "Reports", "Documents [Soon]", "Materials & Equipment [Soon]", "Members". Use warm-paper palette. Output iOS sizing, scrollable content.

**Route:** `/(app)/projects/[projectId]`
**Reference screenshot:** ../../../apps/docs/public/screenshots/05-project-home.png
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/[projectId]/index.tsx

## Purpose
Display project overview: key stats, copy-friendly metadata, action shortcuts to Reports/Members/future features.

## Layout (top → bottom)
1. **Header** — Project name (title), pencil Edit button (testID="btn-edit-project"), onPress navigates to edit
2. **Metadata rows** — Client name (if present, Pressable, testID="btn-copy-client", swaps Copy/Check icon on tap), Address (MapPin icon, testID="btn-copy-address", swaps Copy/Check icon on tap)
3. **Stats card** — Two columns: "Reports" count (value bold) + "Drafts" count (tone=warning if > 0)
4. **Last report card** — Muted tone, label "Last report", value "{relative time}"
5. **Action cards** — FlatList or static View of 4 cards (Reports, Documents [Soon], Materials & Equipment [Soon], Members). Each: 40×40 icon box (border), title, description, chevron-right (disabled if comingSoon)

## Components
| Component | Type | Props / state |
|---|---|---|
| ScreenHeader | ScreenHeader (ui) | title={project.name}, trailing={Pencil button} |
| Pressable (copy rows) | Pressable + View | testID="btn-copy-client" / "btn-copy-address", flex-row layout, Copy/Check icon toggles |
| StatTile (2x) | StatTile (ui) | value={count}, label, tone=warning for Drafts if > 0 |
| Card (last report) | Card (ui) | variant="muted", label + relative-time value |
| ActionRow | Pressable + View | 40×40 icon box, title, description, chevron, disabled if comingSoon, testID="btn-open-reports" / "btn-open-members" |

## Interactions
- Tap client/address Pressable → Copy to clipboard via `useCopyToClipboard()`, swap icon to Check briefly
- Tap Edit button → Navigate to edit screen
- Tap Reports action → Navigate to reports list
- Tap Members action → Navigate to members screen
- Tap Documents/Materials (comingSoon) → No action (disabled)
- Pull-to-refresh → Refetch project and reports

## Data shown
- project.name, clientName, address — from `useProject()`
- reports array — from `useReports()`, count total, count drafts, find most recent
- lastReportAt — derived from reports, formatted as relative time via `formatRelativeTime()`
- isCopied("client") / isCopied("address") — from `useCopyToClipboard()` state, resets after brief delay

## Visual tokens
- Background: `theme.colors.background`
- Card: `theme.colors.card`, border: `theme.colors.border`
- Icon box: 40×40, border: `theme.colors.border`, bg: `theme.colors.card`, icon color: `theme.colors.mutedForeground`
- Stat value: bold, `theme.colors.foreground`
- Stat label: `theme.colors.mutedForeground`
- Warning tone (Drafts if > 0): `theme.colors.warning`
- Last report card variant: "muted"

## Acceptance checklist
- [ ] Matches 05-project-home.png at section level (copy rows with client/address, stats, last-report card, 4 action cards)
- [ ] testID="btn-edit-project", "btn-copy-client", "btn-copy-address", "btn-open-reports", "btn-open-members" render
- [ ] Copy buttons swap icon to Check, revert after ~2s
- [ ] Stats row shows warning tone on Drafts if > 0
- [ ] Documents/Materials cards show [Soon] badge, not tappable
- [ ] Pull-to-refresh reloads project and reports
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
