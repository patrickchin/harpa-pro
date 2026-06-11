/**
 * SummarySectionCard — titled prose card used for AI-generated
 * sections at the bottom of the report. Ported from
 * `../haru3-reports/apps/mobile/components/reports/SummarySectionCard.tsx`
 * on branch `dev`.
 */
import { Text, View } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import type { GeneratedReportSection } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { AddAttachmentsButton } from '@/components/reports/detail/AddAttachmentsButton';
import { PlacedPhotoStrip } from '@/components/reports/detail/PlacedPhotoStrip';
import { SECTION_ICONS } from '@/lib/reports/section-icons';
import { colors } from '@/lib/design-tokens/colors';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

interface SummarySectionCardProps {
  section: GeneratedReportSection;
  reportNumber?: number;
  sectionIndex?: number;
  onEdit?: () => void;
  /**
   * Optional photo groups placed onto this section. Renders as an
   * inline strip below the section content.
   */
  placedGroups?: ReadonlyArray<PhotoGroup>;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  onEditPlacement?: (noteId: string) => void;
  onAddAttachments?: () => void;
}

export function SummarySectionCard({
  section,
  reportNumber,
  sectionIndex,
  onEdit,
  placedGroups,
  onOpenPhoto,
  onEditPlacement,
  onAddAttachments,
}: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;
  const numStr = reportNumber ?? 'x';
  const idx = sectionIndex ?? 0;
  const hasHeaderActions = Boolean(onAddAttachments || onEdit);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title={section.title}
        icon={<Icon size={16} color={colors.foreground} />}
        trailing={
          hasHeaderActions ? (
            <View
              className="flex-row items-center gap-2"
              testID={`report-section-actions-${idx}`}
            >
              {onAddAttachments ? (
                <AddAttachmentsButton
                  onPress={onAddAttachments}
                  accessibilityLabel={`Add attachments to section ${section.title}`}
                  testID={`btn-add-attachments-section-${idx}`}
                />
              ) : null}
              {onEdit ? (
                <EditPencilButton
                  onPress={onEdit}
                  accessibilityLabel={`Edit section ${section.title}`}
                  testID={`btn-edit-section-${idx}`}
                />
              ) : null}
            </View>
          ) : undefined
        }
      />
      <Text
        className="mt-4 text-base leading-relaxed text-muted-foreground"
        testID={`report-summary-${numStr}-section-${idx}`}
      >
        {section.content}
      </Text>
      {placedGroups && placedGroups.length > 0 ? (
        <PlacedPhotoStrip
          groups={placedGroups}
          onOpenPhoto={onOpenPhoto}
          onEditPlacement={onEditPlacement}
          testID={`placed-photos-section-${idx}`}
        />
      ) : null}
    </Card>
  );
}
