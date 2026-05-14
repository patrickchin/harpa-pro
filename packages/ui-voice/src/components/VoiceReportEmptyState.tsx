import { View, Text } from '../lib/primitives.js';
import { cn } from '../lib/cn.js';

export interface VoiceReportEmptyStateProps {
  title?: string;
  body?: string;
  className?: string;
}

export function VoiceReportEmptyState({
  title = 'No report yet',
  body = 'Record a voice note to generate a daily report.',
  className,
}: VoiceReportEmptyStateProps) {
  return (
    <View
      className={cn(
        'items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-12',
        className,
      )}
    >
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      <Text className="text-center text-sm text-muted-foreground">{body}</Text>
    </View>
  );
}
