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
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="page-title-line">
          <h1>{title}</h1>
          {context}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </header>
  );
}
