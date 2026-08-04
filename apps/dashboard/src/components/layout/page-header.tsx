import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  context?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  context,
  action,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-reading min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-label font-bold tracking-label text-accent-ink uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-title font-bold text-foreground">{title}</h1>
          {context}
        </div>
        {description ? (
          <p className="mt-1 text-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>
      ) : null}
    </header>
  );
}
