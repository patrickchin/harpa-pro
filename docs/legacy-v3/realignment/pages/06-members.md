# Members

> **Prompt for design tool:** Generate a high-fidelity mobile UI for a project members list. Top bar: "Members" title, back button. Below: role filter chips (All, Owner, Admin, Editor, Viewer), each with count. Member list: cards with name + phone, role badge (colored), current user pinned at top with "You" badge. Admin/owner can remove members (except themselves, except owner). "Add member" button or sheet. Use warm-paper palette. Output iOS sizing, filtered list.

**Route:** `/(app)/projects/[projectId]/members`
**Reference screenshot:** ../../../apps/docs/public/screenshots/06-members.png
**v3 source file(s):** apps/mobile-v3/app/(app)/projects/[projectId]/members.tsx

## Purpose
Display project members by role. Filter by role. Current user pinned. Admins/owners can remove members. Add member via sheet.

## Layout (top → bottom)
1. **Header** — "Members" title, back button
2. **Filter chips** — Horizontal scroll row of role filter chips (All, Owner, Admin, Editor, Viewer), each shows count, active chip highlighted
3. **Member list** — Current user pinned at top (no remove button, "You" badge). Other members: card with name (large), phone (small, gray), role badge (colored box), remove button if admin/owner and target is not owner
4. **Add member** — Floating button or "Add member" button at bottom, opens AddMemberSheet

## Components
| Component | Type | Props / state |
|---|---|---|
| ScreenHeader | ScreenHeader (ui) | title="Members", onBack |
| Filter chips | Pressable + Text | role filter selector, activeFilter highlights chip, count per role |
| Member card | Card (ui) | name, phone (optional), role badge (colored), remove button (icon button) |
| Remove confirm | AppDialogSheet | "Remove this member?", destructive action, cancel |
| Add member sheet | AddMemberSheet (ui) | testID=(?) **(?)** — not fully specified |

## Interactions
- Tap filter chip → Set activeFilter, re-sort and filter members list
- Tap member's remove button → Open AppDialogSheet confirmation
- Confirm remove → Call `removeMember.mutate({projectId, userId})`, member removed from list
- Tap "Add member" → Open sheet (AddMemberSheet) with invite form **(?)** — behavior not fully specified
- Pull-to-refresh → Refetch members

## Data shown
- members array — from `useMembers(projectId)`, sorted with currentUser first
- currentUserId — from `useAuth().user?.id`
- currentMember.role — to determine if user can remove others
- activeFilter — role type (all / owner / admin / editor / viewer)
- roleCounts — derived map of role → count

## Visual tokens
- Background: `theme.colors.background`
- Card: `theme.colors.card`, border: `theme.colors.border`
- Name: `theme.colors.foreground`, bold
- Phone: `theme.colors.mutedForeground`, small
- Role badge colors (from roleBadgeColor function in source):
  - owner: #2f6f48 (green)
  - admin: #2a5a9f (blue)
  - editor: #b66916 (orange)
  - viewer: #5f5b66 (muted)
- "You" badge: background tbd, text "You"
- Filter chip active: `theme.colors.primary` bg
- Filter chip inactive: `theme.colors.secondary` bg

## Acceptance checklist
- [ ] Matches 06-members.png at section level (filter chips, member cards with role badges, "You" pinned)
- [ ] Role filter chips work (All, Owner, Admin, Editor, Viewer) with counts
- [ ] Current user pinned at top with "You" badge
- [ ] Remove button visible only for non-owner members if current user is admin/owner
- [ ] Remove confirmation dialog works
- [ ] Role badges colored per specification
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added
