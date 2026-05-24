/**
 * Shared geometry for the Project Members screen + skeleton.
 *
 * Centralising these constants keeps the skeleton wrapper, the
 * loaded ScrollView's contentContainerStyle, and the row height
 * placeholder in lockstep so landmark probes
 * (`project-members:first-row`) land on the same Y in both frames.
 */
export const PROJECT_MEMBERS_LAYOUT = {
  paddingHorizontal: 20,
  paddingTop: 8,
  paddingBottom: 16,
  gap: 12,
  /**
   * Card padding="md" → p-4 (16+16=32) + 1px border top/bottom (2)
   * + inner column max-height ≈ 42 (text-base name row 20 + gap 2 +
   * text-sm phone 20). Avatar is 40×40 so the inner column drives
   * the height.
   */
  memberRowHeight: 76,
} as const;
