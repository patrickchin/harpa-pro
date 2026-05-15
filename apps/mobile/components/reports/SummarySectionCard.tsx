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
import { SECTION_ICONS } from '@/lib/section-icons';
import { colors } from '@/lib/design-tokens/colors';

interface SummarySectionCardProps {
  section: GeneratedReportSection;
}

export function SummarySectionCard({ section }: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title={section.title}
        icon={<Icon size={16} color={colors.foreground} />}
      />
      <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
        {section.content}
      </Text>
    </Card>
  );
}
