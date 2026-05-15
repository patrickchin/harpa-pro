/**
 * WorkersCard — totals + per-role breakdown with proportional bars.
 * Returns null when workers are absent. Ported from
 * `../haru3-reports/apps/mobile/components/reports/WorkersCard.tsx` on
 * branch `dev`.
 */
import { View, Text } from 'react-native';
import { Users } from 'lucide-react-native';
import type { GeneratedReportWorkers } from '@harpa/report-core';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { colors } from '@/lib/design-tokens/colors';

interface WorkersCardProps {
  workers: GeneratedReportWorkers | null;
}

export function WorkersCard({ workers }: WorkersCardProps) {
  if (!workers) return null;

  const hasRoles = workers.roles.length > 0;
  const maxCount = Math.max(...workers.roles.map((r) => r.count ?? 0), 1);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Workers"
        subtitle={
          workers.totalWorkers !== null
            ? `${workers.totalWorkers} on site.`
            : 'Crew breakdown recorded.'
        }
        icon={<Users size={16} color={colors.foreground} />}
      />

      {hasRoles && (
        <View className="mt-4 gap-3">
          {workers.roles.map((role, index) => {
            const count = role.count ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <View
                key={`${role.role}-${index}`}
                className="gap-1.5 rounded-md bg-surface-muted px-3 py-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-base text-foreground">{role.role}</Text>
                  <Text className="text-base font-medium text-muted-foreground">
                    {count}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-secondary">
                  <View
                    className="h-2 rounded-full bg-foreground"
                    style={{ width: `${pct}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {workers.workerHours ? (
        <Text className="mt-4 text-base text-muted-foreground">
          Hours: {workers.workerHours}
        </Text>
      ) : null}
      {workers.notes ? (
        <Text className="mt-2 text-base text-muted-foreground">
          {workers.notes}
        </Text>
      ) : null}
    </Card>
  );
}
