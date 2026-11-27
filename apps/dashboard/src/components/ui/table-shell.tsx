import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function TableShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn('overflow-x-auto rounded-card-ui border border-border/40 bg-card', className)}
      {...props}
    />
  );
}

export const tableClassName =
  'w-full border-collapse text-left [&_tbody_tr:last-child>td]:border-b-0 [&_tbody_tr:last-child>th]:border-b-0';
export const tableHeadClassName =
  'border-b border-border/40 bg-surface-emphasis px-6 py-4 text-xs font-semibold whitespace-nowrap text-muted-foreground';
export const tableCellClassName = 'border-b border-border/30 px-6 py-5 align-middle text-meta';
