/**
 * WorkersCard — totals + per-role breakdown with proportional bars.
 * Returns null when workers are absent. Ported from
 * `../haru3-reports/apps/mobile/components/reports/WorkersCard.tsx` on
 * branch `dev`.
 */
import { View, Text } from 'react-native';
import { Users } from 'lucide-react-native';
import { reports } from '@harpa/api-contract';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { EditPencilButton } from '@/components/reports/edit/EditPencilButton';
import { colors } from '@/lib/design-tokens/colors';
import { getWorkerDisplaySummaryFromWorkers } from '@/lib/reports/report-body';

interface WorkersCardProps {
  workers: reports.ReportBody['workers'];
  onEdit?: () => void;
  editActionsDisabled?: boolean;
}

function countNumber(count: string | null): number {
  if (!count) return 0;
  const n = Number.parseFloat(count);
  return Number.isFinite(n) ? n : 0;
}

export function WorkersCard({ workers, onEdit, editActionsDisabled = false }: WorkersCardProps) {
  if (workers.length === 0) return null;

  const summary = getWorkerDisplaySummaryFromWorkers(workers);
  const maxCount = Math.max(...workers.map((worker) => countNumber(worker.count)), 1);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Workers"
        subtitle={
          summary.totalWorkers !== null
            ? `${summary.totalWorkers} on site.`
            : 'Crew breakdown recorded.'
        }
        icon={<Users size={16} color={colors.foreground} />}
        trailing={
          onEdit ? (
            <EditPencilButton
              onPress={() => {
                if (editActionsDisabled) return;
                onEdit();
              }}
              disabled={editActionsDisabled}
              accessibilityLabel="Edit workers"
              testID="btn-edit-workers"
            />
          ) : undefined
        }
      />

      <View className="mt-4 gap-3">
        {workers.map((worker, index) => {
          const count = countNumber(worker.count);
          const countLabel = worker.count ?? '—';
          const pct = Math.max(Math.round((count / maxCount) * 100), countLabel === '—' ? 0 : 12);
          return (
            <View
              key={`${worker.role}-${index}`}
              className="gap-1.5 rounded-md bg-surface-muted px-3 py-3"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-foreground">{worker.role}</Text>
                <Text className="text-base font-medium text-muted-foreground">{countLabel}</Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-secondary">
                <View className="h-2 rounded-full bg-foreground" style={{ width: `${pct}%` }} />
              </View>
              {worker.hours ? (
                <Text className="text-sm text-muted-foreground">Hours: {worker.hours}</Text>
              ) : null}
              {worker.notes ? (
                <Text className="text-sm text-muted-foreground">{worker.notes}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {summary.workerHours ? (
        <Text className="mt-4 text-base text-muted-foreground">Hours: {summary.workerHours}</Text>
      ) : null}
    </Card>
  );
}
