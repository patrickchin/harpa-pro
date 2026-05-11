# New Project

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a project creation form. Top bar: "New Project" with back button. Form: labeled input "Name" (required), labeled input "Address" (optional), labeled input "Client Name" (optional), error state for Name field. Footer: full-width "Create Project" button. Use warm-paper palette. Output iOS sizing, keyboard-aware scrolling.

**Route:** `/(app)/projects/new`
**Reference screenshot:** ../../../apps/docs/public/screenshots/04-new-project.png
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/new.tsx

## Purpose
Create a new construction project. Collect name (required), address, and client name (both optional). Submit to API and navigate back to projects list.

## Layout (top → bottom)
1. **Header** — "New Project" title, back button to projects
2. **Form fields** — Name (label, required, placeholder "Project name", testID="input-project-name"), Address (label, optional, placeholder "Project address (optional)", testID="input-project-address"), Client Name (label, optional, placeholder "Client name (optional)", testID="input-client-name")
3. **Error message** — Appears below Name input if validation fails (red text or error style)
4. **API error box** — Shows if mutation fails, displays error message
5. **Create Project button** — Full-width, primary variant, testID="btn-submit-project", bottom sticky or in ScrollView footer

## Components
| Component | Type | Props / state |
|---|---|---|
| ScreenHeader | ScreenHeader (ui) | title="New Project", onBack={() => router.back()} |
| Input (name) | Input (ui) | testID="input-project-name", label, error state, autoFocus |
| Input (address) | Input (ui) | testID="input-project-address", label, optional |
| Input (client) | Input (ui) | testID="input-client-name", label, optional |
| Button | Button (ui) | testID="btn-submit-project", loading={createProject.isPending}, disabled={createProject.isPending} |

## Interactions
- Tap Name input → Focus, autofocus on mount, clear error on keystroke
- Tap Create Project (empty name) → Show error "Project name is required"
- Tap Create Project (valid name) → Trim whitespace, call `createProject.mutate()`, show loading state
- On success → Navigate to projects list
- On API error → Show error message in error box, keep form editable

## Data shown
- name — required, trimmed before submit
- address — optional, trimmed or undefined
- clientName — optional, trimmed or undefined
- nameError — validation error message
- createProject.isPending — from mutation state

## Visual tokens
- Background: `theme.colors.background`
- Input border: `theme.colors.input`, label: `theme.colors.foreground`
- Error text: `theme.colors.destructive`
- Button: `theme.colors.primary` bg, `theme.colors.primaryForeground` text, `theme.colors.accent` only for hero CTAs

## Acceptance checklist
- [ ] Matches 04-new-project.png at section level (form fields + CTA)
- [ ] testID="input-project-name", "input-project-address", "input-client-name", "btn-submit-project" render
- [ ] Validation error "Project name is required" shows when submitting empty name
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
