import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function TableShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-card-ui border border-border bg-card shadow-raised-ui',
        className,
      )}
      {...props}
    />
  );
}

export const tableClassName = 'w-full border-collapse text-left';
export const tableHeadClassName =
  'bg-surface-muted px-4 py-3 text-label font-bold tracking-label text-muted-foreground uppercase';
export const tableCellClassName = 'border-b border-border px-4 py-3 align-middle text-meta';
