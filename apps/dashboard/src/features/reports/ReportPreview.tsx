import type { reports } from '@harpa/api-contract';

import { Badge } from '@/components/ui';

import { formatDate } from './format';
import { displayReportTitle } from './report-body';

const previewSectionClassName = 'grid gap-3 border-t border-border pt-4';
const previewListClassName = 'grid gap-3';
const previewItemClassName = 'rounded-card-ui bg-surface-emphasis p-3';

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') {
    return null;
  }
  return (
    <div className="min-w-0">
      <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 break-words">{children}</dd>
    </div>
  );
}

function AttachmentReference({ attachments }: { attachments?: reports.ReportAttachments }) {
  const imageCount = attachments?.images?.length ?? 0;
  const documentCount = attachments?.documents?.length ?? 0;
  if (imageCount + documentCount === 0) return null;
  return (
    <p className="text-meta text-muted-foreground">
      {imageCount > 0 ? `${imageCount} photo${imageCount === 1 ? '' : 's'}` : null}
      {imageCount > 0 && documentCount > 0 ? ' · ' : null}
      {documentCount > 0 ? `${documentCount} document${documentCount === 1 ? '' : 's'}` : null}
    </p>
  );
}

export function ReportPreview({ body }: { body: reports.ReportBody }) {
  return (
    <article
      className="grid gap-5 rounded-card-ui border border-border bg-card p-4 shadow-raised-ui"
      data-testid="report-preview"
      aria-label="Live report preview"
    >
      <header className="grid gap-2">
        <p className="text-label font-bold tracking-label text-accent-ink uppercase">
          Live preview
        </p>
        <h2 className="break-words text-title-sm font-bold">{displayReportTitle(body)}</h2>
        <p className="text-muted-foreground">{formatDate(body.meta.visitDate)}</p>
      </header>

      {body.meta.summary ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Summary</h3>
          <p className="whitespace-pre-wrap">{body.meta.summary}</p>
        </section>
      ) : null}

      {body.weather ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Weather</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Value label="Condition">{body.weather.condition}</Value>
            <Value label="Temperature">{body.weather.temperature}</Value>
            <Value label="Wind">{body.weather.wind}</Value>
            <Value label="Impact">{body.weather.impact}</Value>
          </dl>
        </section>
      ) : null}

      {body.workers.length > 0 ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Workers</h3>
          <div className={previewListClassName}>
            {body.workers.map((worker, index) => (
              <div className={previewItemClassName} key={`worker-${index}`}>
                <h4 className="font-bold">{worker.role || `Worker ${index + 1}`}</h4>
                <p>
                  {[worker.count, worker.hours ? `${worker.hours} hours` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Details not recorded'}
                </p>
                {worker.notes ? <p className="mt-2 whitespace-pre-wrap">{worker.notes}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {body.materials.length > 0 ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Materials</h3>
          <div className={previewListClassName}>
            {body.materials.map((material, index) => (
              <div className={previewItemClassName} key={`material-${index}`}>
                <h4 className="font-bold">{material.name || `Material ${index + 1}`}</h4>
                <p>
                  {[
                    [material.quantity, material.unit].filter(Boolean).join(' '),
                    material.status,
                    material.condition,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Details not recorded'}
                </p>
                {material.notes ? (
                  <p className="mt-2 whitespace-pre-wrap">{material.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {body.issues.length > 0 ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Issues</h3>
          <div className={previewListClassName}>
            {body.issues.map((issue, index) => (
              <div className={previewItemClassName} key={`issue-${index}`}>
                <Badge className="mb-2" tone="warning">
                  {issue.severity || 'Severity not set'}
                </Badge>
                <h4 className="font-bold">{issue.title || `Issue ${index + 1}`}</h4>
                {issue.description ? (
                  <p className="mt-2 whitespace-pre-wrap">{issue.description}</p>
                ) : null}
                {issue.action ? (
                  <p className="mt-2 whitespace-pre-wrap">
                    <strong>Required action:</strong> {issue.action}
                  </p>
                ) : null}
                <AttachmentReference attachments={issue.attachments} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {body.nextSteps.length > 0 ? (
        <section className={previewSectionClassName}>
          <h3 className="text-title-sm font-bold">Next steps</h3>
          <ol className="grid list-decimal gap-2 pl-5">
            {body.nextSteps.map((step, index) => (
              <li key={`step-${index}`}>{step || 'Next step not entered'}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {body.summarySections.map((section, index) => (
        <section className={previewSectionClassName} key={`section-${index}`}>
          <h3 className="text-title-sm font-bold">
            {section.title || `Other section ${index + 1}`}
          </h3>
          <p className="whitespace-pre-wrap">{section.body}</p>
          <AttachmentReference attachments={section.attachments} />
        </section>
      ))}
    </article>
  );
}
