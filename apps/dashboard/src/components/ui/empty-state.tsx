import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { BrandMark } from './brand-mark';
import { Card } from './card';

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description: string;
  title: string;
}

export function EmptyState({
  action,
  className,
  description,
  title,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'grid min-h-44 place-items-center content-center gap-3 p-5 text-center',
        className,
      )}
    >
      <BrandMark className="mb-1 size-12" decorative />
      <h2 className="text-title-sm">{title}</h2>
      <p className="max-w-lg text-muted-foreground">{description}</p>
      {action}
    </Card>
  );
}
