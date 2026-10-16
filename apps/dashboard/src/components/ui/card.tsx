import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('rounded-card-ui border border-border/40 bg-card', className)} {...props} />
  );
}
