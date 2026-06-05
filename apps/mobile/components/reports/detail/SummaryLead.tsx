import { View, Text } from 'react-native';
import { FileText } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { colors } from '@/lib/design-tokens/colors';

interface SummaryLeadProps {
  summary: string | null | undefined;
  onEdit?: () => void;
}

export function SummaryLead({ summary, onEdit }: SummaryLeadProps) {
  const trimmed = summary?.trim();
  if (!trimmed && !onEdit) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Summary"
        icon={<FileText size={16} color={colors.foreground} />}
        trailing={
          onEdit ? (
            <EditPencilButton
              onPress={onEdit}
              accessibilityLabel="Edit summary and meta"
              testID="btn-edit-meta"
            />
          ) : undefined
        }
      />
      <View className="mt-4">
        <Text className="text-base leading-relaxed text-muted-foreground">
          {trimmed || ''}
        </Text>
      </View>
    </Card>
  );
}
