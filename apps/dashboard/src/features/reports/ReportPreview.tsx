import type { reports } from '@harpa/api-contract';

import { formatDate } from './format';
import { displayReportTitle } from './report-body';

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') {
    return null;
  }
  return (
    <div className="reports-preview-value">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AttachmentReference({ attachments }: { attachments?: reports.ReportAttachments }) {
  const imageCount = attachments?.images?.length ?? 0;
  const documentCount = attachments?.documents?.length ?? 0;
  if (imageCount + documentCount === 0) return null;
  return (
    <p className="reports-attachment-reference">
      {imageCount > 0 ? `${imageCount} photo${imageCount === 1 ? '' : 's'}` : null}
      {imageCount > 0 && documentCount > 0 ? ' · ' : null}
      {documentCount > 0 ? `${documentCount} document${documentCount === 1 ? '' : 's'}` : null}
    </p>
  );
}

export function ReportPreview({ body }: { body: reports.ReportBody }) {
  return (
    <article
      className="reports-preview"
      data-testid="report-preview"
      aria-label="Live report preview"
    >
      <header className="reports-preview__header">
        <p className="reports-eyebrow">Live preview</p>
        <h2>{displayReportTitle(body)}</h2>
        <p>{formatDate(body.meta.visitDate)}</p>
      </header>

      {body.meta.summary ? (
        <section>
          <h3>Summary</h3>
          <p>{body.meta.summary}</p>
        </section>
      ) : null}

      {body.weather ? (
        <section>
          <h3>Weather</h3>
          <dl className="reports-preview-grid">
            <Value label="Condition">{body.weather.condition}</Value>
            <Value label="Temperature">{body.weather.temperature}</Value>
            <Value label="Wind">{body.weather.wind}</Value>
            <Value label="Impact">{body.weather.impact}</Value>
          </dl>
        </section>
      ) : null}

      {body.workers.length > 0 ? (
        <section>
          <h3>Workers</h3>
          <div className="reports-preview-list">
            {body.workers.map((worker, index) => (
              <div key={`worker-${index}`}>
                <h4>{worker.role || `Worker ${index + 1}`}</h4>
                <p>
                  {[worker.count, worker.hours ? `${worker.hours} hours` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Details not recorded'}
                </p>
                {worker.notes ? <p>{worker.notes}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {body.materials.length > 0 ? (
        <section>
          <h3>Materials</h3>
          <div className="reports-preview-list">
            {body.materials.map((material, index) => (
              <div key={`material-${index}`}>
                <h4>{material.name || `Material ${index + 1}`}</h4>
                <p>
                  {[
                    [material.quantity, material.unit].filter(Boolean).join(' '),
                    material.status,
                    material.condition,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Details not recorded'}
                </p>
                {material.notes ? <p>{material.notes}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {body.issues.length > 0 ? (
        <section>
          <h3>Issues</h3>
          <div className="reports-preview-list">
            {body.issues.map((issue, index) => (
              <div key={`issue-${index}`}>
                <p className="reports-preview__tag">{issue.severity || 'Severity not set'}</p>
                <h4>{issue.title || `Issue ${index + 1}`}</h4>
                {issue.description ? <p>{issue.description}</p> : null}
                {issue.action ? (
                  <p>
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
        <section>
          <h3>Next steps</h3>
          <ol>
            {body.nextSteps.map((step, index) => (
              <li key={`step-${index}`}>{step || 'Next step not entered'}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {body.summarySections.map((section, index) => (
        <section key={`section-${index}`}>
          <h3>{section.title || `Other section ${index + 1}`}</h3>
          <p>{section.body}</p>
          <AttachmentReference attachments={section.attachments} />
        </section>
      ))}
    </article>
  );
}
