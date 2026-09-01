/**
 * MaterialsCard — list of materials with meta. Returns null when empty.
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/MaterialsCard.tsx`
 * on branch `dev`.
 */
import { View, Text } from 'react-native';
import { Package } from 'lucide-react-native';
import { reports } from '@harpa/api-contract';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { colors } from '@/lib/design-tokens/colors';
import { getItemMeta } from '@/lib/reports/report-ui';

interface MaterialsCardProps {
  materials: reports.ReportBody['materials'];
  onEdit?: () => void;
  editActionsDisabled?: boolean;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function MaterialsCard({
  materials,
  onEdit,
  editActionsDisabled = false,
}: MaterialsCardProps) {
  if (materials.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Materials"
        subtitle={`${formatCount(materials.length, 'material')} recorded.`}
        icon={<Package size={16} color={colors.foreground} />}
        trailing={
          onEdit ? (
            <EditPencilButton
              onPress={() => {
                if (editActionsDisabled) return;
                onEdit();
              }}
              disabled={editActionsDisabled}
              accessibilityLabel="Edit materials"
              testID="btn-edit-materials"
            />
          ) : undefined
        }
      />

      <View className="mt-4 gap-3">
        {materials.map((material, index) => {
          const meta = getItemMeta([
            material.quantity,
            material.unit,
            material.status,
            material.condition,
          ]);
          return (
            <View
              key={`${material.name}-${index}`}
              className="gap-1 rounded-md bg-surface-muted px-3 py-3"
            >
              <Text className="text-base font-medium text-foreground">
                {material.name}
              </Text>
              {meta ? (
                <Text className="text-sm text-muted-foreground">{meta}</Text>
              ) : null}
              {material.notes ? (
                <Text className="mt-1 text-sm text-muted-foreground">
                  {material.notes}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
