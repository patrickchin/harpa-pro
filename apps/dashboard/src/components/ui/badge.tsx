import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'owner'
  | 'editor'
  | 'viewer'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-muted text-muted-foreground',
  owner: 'border-warning-border bg-warning-soft text-warning-text',
  editor: 'border-info-border bg-info-soft text-info-text',
  viewer: 'border-border bg-surface-muted text-muted-foreground',
  success: 'border-success-border bg-success-soft text-success-text',
  warning: 'border-warning-border bg-warning-soft text-warning-text',
  danger: 'border-danger-border bg-danger-soft text-danger-text',
  info: 'border-info-border bg-info-soft text-info-text',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold leading-none tracking-wider uppercase',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
