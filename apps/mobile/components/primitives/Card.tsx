/**
 * Card primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/Card.tsx` on branch `dev`.
 *
 * Surface container with consistent border, radius, padding scale, and
 * shadow depth. Used as the visual unit for grouped content across
 * lists, dashboards, and report panels.
 */
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';
import { getSurfaceDepthStyle, type SurfaceDepth } from '@/lib/surface-depth';

export type CardVariant = 'default' | 'muted' | 'emphasis' | 'danger';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends ViewProps {
  className?: string;
  variant?: CardVariant;
  padding?: CardPadding;
  depth?: SurfaceDepth;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'border-border bg-card',
  muted: 'border-border bg-surface-muted',
  emphasis: 'border-border bg-surface-emphasis',
  danger: 'border-danger-border bg-danger-soft',
};

const paddingStyles: Record<CardPadding, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({
  className,
  variant = 'default',
  padding = 'md',
  depth,
  children,
  style,
  ...props
}: CardProps) {
  const resolvedDepth = depth ?? (variant === 'emphasis' ? 'floating' : 'raised');
  return (
    <View
      className={cn('rounded-lg border', variantStyles[variant], paddingStyles[padding], className)}
      style={[getSurfaceDepthStyle(resolvedDepth), style]}
      {...props}
    >
      {children}
    </View>
  );
}
