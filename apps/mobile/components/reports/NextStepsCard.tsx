/**
 * NextStepsCard — numbered follow-up list. Returns null when empty so
 * `ReportView` can mount unconditionally. Ported from
 * `../haru3-reports/apps/mobile/components/reports/NextStepsCard.tsx`
 * on branch `dev`.
 */
import { View, Text } from 'react-native';
import { ClipboardList } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { colors } from '@/lib/design-tokens/colors';

interface NextStepsCardProps {
  steps: readonly string[];
}

export function NextStepsCard({ steps }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Next Steps"
        subtitle={
          steps.length === 1
            ? '1 follow-up action.'
            : `${steps.length} follow-up actions.`
        }
        icon={<ClipboardList size={16} color={colors.foreground} />}
      />
      <View className="mt-4 gap-3">
        {steps.map((step, index) => (
          <View key={`step-${index}`} className="flex-row items-start gap-3">
            <Text className="min-w-[18px] text-base font-semibold text-foreground">
              {index + 1}.
            </Text>
            <Text className="flex-1 text-base leading-relaxed text-muted-foreground">
              {step}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
