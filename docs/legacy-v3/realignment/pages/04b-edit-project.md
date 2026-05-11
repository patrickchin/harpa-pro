# Edit Project

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a project editing form. Top bar: "Edit Project" with back button. Form: labeled input "Name" (required), labeled input "Address" (optional), labeled input "Client Name" (optional), all pre-filled from current project data. Below form: red destructive "Delete Project" button. Use warm-paper palette. Output iOS sizing, form pre-fill with soft delete dialog.

**Route:** `/(app)/projects/[projectId]/edit`
**Reference screenshot:** (none)
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/[projectId]/edit.tsx

## Purpose
Edit existing project details (name, address, client name). Owner/admin only (enforced server-side). Delete project with confirmation dialog.

## Layout (top → bottom)
1. **Header** — "Edit Project" title, back button
2. **Form fields** — Identical to new-project (Name, Address, Client Name), but pre-populated from `useProject(projectId)`
3. **Loading skeleton** — While project data loads, show skeleton input fields
4. **Delete button** — Full-width, destructive variant, red text, "Delete Project", testID=(?)
5. **Delete confirmation** — AppDialogSheet on tap, "Confirm delete project?", destructive button, cancel button

## Components
| Component | Type | Props / state |
|---|---|---|
| ScreenHeader | ScreenHeader (ui) | title="Edit Project", onBack={() => router.back() |
| Input (name) | Input (ui) | pre-populated from project.name |
| Input (address) | Input (ui) | pre-populated from project.address |
| Input (client) | Input (ui) | pre-populated from project.clientName |
| Button (Delete) | Button (ui) | variant="destructive", opens AppDialogSheet |
| AppDialogSheet | AppDialogSheet (ui) | confirm-delete, destructive action |

## Interactions
- On mount → Load project data via `useProject(projectId)`, pre-fill form
- Tap input field → Focus, clear validation error on keystroke
- Tap Save / Update button → Validate, call `updateProject.mutate()`, navigate back on success **(?)** — update button not in read source
- Tap Delete Project → Open AppDialogSheet with confirmation "Are you sure? This cannot be undone."
- Confirm delete → Call `deleteProject.mutate(projectId)`, navigate to projects list on success

## Data shown
- project.name, address, clientName — pre-filled on mount
- updateProject / deleteProject — mutation states (isPending, error)

## Visual tokens
- Background: `theme.colors.background`
- Input border: `theme.colors.input`
- Delete button: `theme.colors.destructive` bg, `theme.colors.destructiveForeground` text
- Dialog: AppDialogSheet tone="danger" for delete confirmation

## Acceptance checklist
- [ ] Matches project edit pattern (pre-filled form + delete action)
- [ ] Form pre-populates from `useProject()` on mount
- [ ] Save/Update button works (or update via form blur autosave) **(?)** — behavior not fully specified
- [ ] Delete button opens AppDialogSheet with destruction warning
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
