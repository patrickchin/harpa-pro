/**
 * SectionHeader primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/SectionHeader.tsx` on
 * branch `dev`. Used inside report cards for the iconified title row.
 */
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  trailing,
  className,
}: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-start justify-between gap-3', className)}>
      <View className="flex-1 flex-row items-start gap-3">
        {icon ? (
          <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-sm border border-border bg-card">
            {icon}
          </View>
        ) : null}
        <View className="flex-1 gap-1">
          <Text className="text-label text-foreground">{title}</Text>
          {subtitle ? (
            <Text className="text-sm text-muted-foreground">{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  );
}
