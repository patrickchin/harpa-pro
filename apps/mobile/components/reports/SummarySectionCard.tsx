/**
 * SummarySectionCard — titled prose card used for AI-generated
 * sections at the bottom of the report. Ported from
 * `../haru3-reports/apps/mobile/components/reports/SummarySectionCard.tsx`
 * on branch `dev`.
 */
import { Text } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import type { GeneratedReportSection } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { SECTION_ICONS } from '@/lib/reports/section-icons';
import { colors } from '@/lib/design-tokens/colors';

interface SummarySectionCardProps {
  section: GeneratedReportSection;
  reportNumber?: number;
  sectionIndex?: number;
  onEdit?: () => void;
}

export function SummarySectionCard({
  section,
  reportNumber,
  sectionIndex,
  onEdit,
}: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;
  const numStr = reportNumber ?? 'x';
  const idx = sectionIndex ?? 0;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title={section.title}
        icon={<Icon size={16} color={colors.foreground} />}
        trailing={
          onEdit ? (
            <EditPencilButton
              onPress={onEdit}
              accessibilityLabel={`Edit section ${section.title}`}
              testID={`btn-edit-section-${idx}`}
            />
          ) : undefined
        }
      />
      <Text
        className="mt-4 text-base leading-relaxed text-muted-foreground"
        testID={`report-summary-${numStr}-section-${idx}`}
      >
        {section.content}
      </Text>
    </Card>
  );
}
