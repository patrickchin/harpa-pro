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
    <header className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-reading min-w-0">
        {eyebrow ? (
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words font-heading text-page-compact text-foreground sm:text-page [overflow-wrap:anywhere]">
            {title}
          </h1>
          {context}
        </div>
        {description ? (
          <p className="mt-3 max-w-prose break-words text-meta leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </header>
  );
}
