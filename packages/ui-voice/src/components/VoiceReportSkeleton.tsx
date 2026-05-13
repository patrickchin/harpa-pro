import { View } from 'react-native';
import { cn } from '../lib/cn.js';

export interface VoiceReportSkeletonProps {
  className?: string;
}

/**
 * Pulse placeholder shown while a report payload is being generated.
 * No animation imports — uses NativeWind's `animate-pulse` which
 * compiles to the right thing on both web and native.
 */
export function VoiceReportSkeleton({ className }: VoiceReportSkeletonProps) {
  return (
    <View
      className={cn(
        'gap-6 rounded-xl border border-border bg-card p-6',
        className,
      )}
      accessibilityRole="progressbar"
      aria-label="Generating report"
    >
      {[0, 1, 2].map((row) => (
        <View key={row} className="gap-3">
          <View className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          <View className="h-4 w-full animate-pulse rounded bg-muted" />
          <View className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <View className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </View>
      ))}
    </View>
  );
}
