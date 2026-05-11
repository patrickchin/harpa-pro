# Projects List

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a projects list screen. Top bar: "Projects" title (left), profile icon button (right, testID="btn-open-profile"). Below: a list of project cards. First card is a dashed-outline "Add new project" card (Plus icon, testID="btn-new-project"). Subsequent cards: project name, role badge (uppercase), MapPin + address, Clock + "Updated {date}". Use warm-paper palette. Output iOS sizing, list scrolling.

**Route:** `/(app)/projects`
**Reference screenshot:** ../../../apps/docs/public/screenshots/03-projects-list.png
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/index.tsx

## Purpose
Display all projects user is member of (via RLS). Action to create new project. Tap a project row to navigate to project overview.

## Layout (top → bottom)
1. **Header** — "Projects" title (left), UserCircle icon button (right, testID="btn-open-profile")
2. **Add card** — Dashed border, Plus icon, text "Add new project", testID="btn-new-project", pressed state dims
3. **Project rows** — FlatList items, each: name (bold), role badge (uppercase), MapPin + address (muted), Clock + "Updated {date}" (muted), testID="project-row-{index}"

## Components
| Component | Type | Props / state |
|---|---|---|
| Header | ScreenHeader (ui) | title="Projects", trailing={UserCircle button} |
| Add Card | Pressable + View | testID="btn-new-project", dashed border, Plus icon |
| Project Card | Pressable + View | testID="project-row-{index}", flex row/col layout, role badge styled |
| FlatList | FlatList (RN) | data={projects}, onRefresh={refetch}, refreshing={isRefetching}, pull-to-refresh |

## Interactions
- Tap Add new project → Navigate to `/(app)/projects/new`
- Tap project row → Navigate to `/(app)/projects/{projectId}`
- Tap profile icon → Navigate to `/(app)/profile`
- Pull-to-refresh → Refetch projects list

## Data shown
- project.name — from API
- project.role — enum (owner, admin, editor, viewer), badge shows uppercase
- project.address — from API, optional
- project.updatedAt — ISO string, formatted as "Updated {relative date}"

## Visual tokens
- Background: `theme.colors.background`
- Card: `theme.colors.card`, border: `theme.colors.border`
- Name: `theme.colors.foreground`, bold
- Address/date: `theme.colors.mutedForeground`, MapPin/Clock icon: `theme.colors.mutedForeground`
- Role badge: text uppercase, colored background (?) **(?)** — not specified in v3 source

## Acceptance checklist
- [ ] Matches 03-projects-list.png at section level (dashed "Add new project" header card, project rows with name/role/address/date)
- [ ] testID="btn-new-project", "project-row-{index}", "btn-open-profile" render
- [ ] Pull-to-refresh works
- [ ] Empty state shows if no projects
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
