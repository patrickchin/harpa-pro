import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone =
  'neutral' | 'owner' | 'editor' | 'viewer' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-border/40 bg-surface-muted text-muted-foreground',
  owner: 'border-warning-border/40 bg-warning-soft text-warning-text',
  editor: 'border-info-border/40 bg-info-soft text-info-text',
  viewer: 'border-border/40 bg-surface-muted text-muted-foreground',
  success: 'border-success-border/40 bg-success-soft text-success-text',
  warning: 'border-warning-border/40 bg-warning-soft text-warning-text',
  danger: 'border-danger-border bg-danger-soft text-danger-text',
  info: 'border-info-border/40 bg-info-soft text-info-text',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
