import { View, Text } from 'react-native';
import { FileText } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { colors } from '@/lib/design-tokens/colors';

interface SummaryLeadProps {
  summary: string | null | undefined;
}

export function SummaryLead({ summary }: SummaryLeadProps) {
  const trimmed = summary?.trim();
  if (!trimmed) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Summary"
        icon={<FileText size={16} color={colors.foreground} />}
      />
      <View className="mt-4">
        <Text className="text-base leading-relaxed text-muted-foreground">
          {trimmed}
        </Text>
      </View>
    </Card>
  );
}
