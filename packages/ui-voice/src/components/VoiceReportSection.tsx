import type { ReactNode } from 'react';
import { View, Text } from '../lib/primitives.js';
import { cn } from '../lib/cn.js';

export interface VoiceReportSectionProps {
  /**
   * Section label rendered as a small uppercase eyebrow above the body.
   * Example: "Summary", "Issues", "Workers".
   */
  title: string;
  /**
   * Optional sub-line shown next to the title (e.g. "3 items", "high
   * priority"). Rendered smaller and muted.
   */
  meta?: string;
  /**
   * Section body. Plain text passes as a string; complex layouts pass
   * RN nodes (e.g. a list of cards).
   */
  children: ReactNode;
  className?: string;
}

/**
 * Single section of a voice report. Used as the building block for
 * Summary / Issues / Workers / Materials / Next Steps / free-form
 * sections — keeps spacing + eyebrow styling consistent.
 */
export function VoiceReportSection({
  title,
  meta,
  children,
  className,
}: VoiceReportSectionProps) {
  return (
    <View className={cn('gap-3', className)}>
      <View className="flex-row items-baseline gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </Text>
        {meta ? (
          <Text className="text-xs text-muted-foreground/70">{meta}</Text>
        ) : null}
      </View>
      {typeof children === 'string' ? (
        <Text className="text-base leading-relaxed text-foreground">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
