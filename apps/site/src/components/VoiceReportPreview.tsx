import type { ReactNode } from 'react';

import type { DemoReport } from '../fixtures/demoReport';

type Severity = 'low' | 'medium' | 'high';

const severityLabel: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const severityClass: Record<Severity, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-accent/15 text-accent-ink',
  high: 'bg-destructive/15 text-destructive',
};

function severityKey(value: string | null): Severity {
  const key = (value ?? '').toLowerCase().trim();
  if (key === 'low' || key === 'medium' || key === 'high') return key;
  return 'medium';
}

function formatVisitDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface VoiceReportPreviewProps {
  report: DemoReport;
}

export function VoiceReportPreview({ report }: VoiceReportPreviewProps) {
  const visitLabel = formatVisitDate(report.meta?.visitDate ?? null);
  const issueCount = report.issues.length;
  const workerHeadcount = report.workers.reduce((sum, worker) => {
    const count = worker.count == null ? 0 : Number.parseFloat(worker.count);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  return (
    <article className="relative space-y-6 rounded-xl border border-border bg-card p-6">
      <header className="space-y-1">
        <h3 className="text-lg font-bold text-foreground">Site report</h3>
        {visitLabel ? <p className="text-sm text-muted-foreground">{visitLabel}</p> : null}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Issues" value={String(issueCount)} />
        <StatTile label="Workers" value={String(workerHeadcount)} />
        <StatTile label="Materials" value={String(report.materials.length)} />
        <StatTile label="Next steps" value={String(report.nextSteps.length)} />
      </div>

      {report.weather ? (
        <ReportSection title="Weather">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {report.weather.condition ? (
              <span className="text-foreground">{report.weather.condition}</span>
            ) : null}
            {report.weather.temperature ? (
              <span className="text-muted-foreground">{report.weather.temperature}</span>
            ) : null}
            {report.weather.wind ? (
              <span className="text-muted-foreground">Wind {report.weather.wind}</span>
            ) : null}
          </div>
          {report.weather.impact ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{report.weather.impact}</p>
          ) : null}
        </ReportSection>
      ) : null}

      {report.issues.length > 0 ? (
        <ReportSection title="Issues" meta={`${issueCount} flagged`}>
          <div className="space-y-3">
            {report.issues.map((issue, index) => {
              const severity = severityKey(issue.severity);
              return (
                <div
                  key={`${issue.title}-${index}`}
                  className="space-y-2 rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${severityClass[severity]}`}
                    >
                      {severityLabel[severity]}
                    </span>
                    <h4 className="min-w-0 flex-1 text-base font-semibold text-foreground">
                      {issue.title}
                    </h4>
                  </div>
                  {issue.description ? (
                    <p className="text-sm leading-relaxed text-foreground">{issue.description}</p>
                  ) : null}
                  {issue.action ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <strong className="font-semibold text-foreground">Action. </strong>
                      {issue.action}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ReportSection>
      ) : null}

      {report.workers.length > 0 ? (
        <ReportSection title="Workers" meta={`${workerHeadcount} on site`}>
          <div className="space-y-2">
            {report.workers.map((worker, index) => (
              <div
                key={`${worker.role}-${index}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">{worker.role}</p>
                  {worker.notes ? (
                    <p className="text-xs text-muted-foreground">{worker.notes}</p>
                  ) : null}
                </div>
                <p className="text-sm tabular-nums text-foreground">
                  {worker.count ? `${worker.count}x | ` : ''}
                  {worker.hours ? `${worker.hours}h` : '-'}
                </p>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      {report.materials.length > 0 ? (
        <ReportSection title="Materials">
          <div className="space-y-2">
            {report.materials.map((material, index) => (
              <div
                key={`${material.name}-${index}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">{material.name}</p>
                  {material.notes ? (
                    <p className="text-xs text-muted-foreground">{material.notes}</p>
                  ) : null}
                </div>
                <div className="space-y-0.5 text-right">
                  {material.quantity ? (
                    <p className="text-sm tabular-nums text-foreground">
                      {material.quantity}
                      {material.unit ? ` ${material.unit}` : ''}
                    </p>
                  ) : null}
                  {material.status ? (
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {material.status}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      {report.nextSteps.length > 0 ? (
        <ReportSection title="Next steps">
          <div className="space-y-2">
            {report.nextSteps.map((step, index) => (
              <div key={`${index}`} className="flex gap-3">
                <span className="w-5 text-sm font-semibold tabular-nums text-accent-ink">
                  {index + 1}.
                </span>
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      {report.summarySections.length > 0 ? (
        <div className="space-y-4">
          {report.summarySections.map((section, index) => (
            <ReportSection key={`${section.title}-${index}`} title={section.title}>
              <p className="text-base leading-relaxed text-foreground">{section.body}</p>
            </ReportSection>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ReportSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h4>
        {meta ? <p className="text-xs text-muted-foreground/70">{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}
