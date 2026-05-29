/**
 * Pure HTML renderer for `GeneratedSiteReport`. Output is fed to
 * `expo-print`'s `printToFileAsync` to produce the exported PDF.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/report-to-html.ts` on
 * branch `dev` (commit dbaa4c1) and adapted for the v4
 * `@harpa/report-core` schema, which has no `meta.reportType` field.
 */
import type {
  GeneratedSiteReport,
  GeneratedReportIssue,
  GeneratedReportWorkers,
  GeneratedReportMaterial,
} from '@harpa/report-core';

export interface PdfBranding {
  companyName?: string;
  logoUrl?: string;
  accentColor?: string;
}

// ── Helpers ────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Section numbering ──────────────────────────────────────────

function createCounter() {
  let major = 0;
  return {
    next(): string {
      major += 1;
      return `${major}`;
    },
  };
}

// ── Render helpers ─────────────────────────────────────────────

function renderWorkers(
  workers: GeneratedReportWorkers | null,
  heading: string | null,
): string {
  if (!workers) return '';
  const rows = workers.roles
    .map(
      (r) =>
        `<tr><td>${esc(r.role)}</td><td class="num">${r.count ?? '\u2014'}</td><td>${esc(r.notes ?? '')}</td></tr>`,
    )
    .join('');

  return `
    <div class="section">
      ${heading ? `<h2>${heading}</h2>` : ''}
      ${workers.totalWorkers !== null ? `<p><strong>Total personnel on site:</strong> ${workers.totalWorkers}</p>` : ''}
      ${workers.workerHours ? `<p><strong>Worker hours:</strong> ${esc(workers.workerHours)}</p>` : ''}
      ${workers.notes ? `<p>${esc(workers.notes)}</p>` : ''}
      ${
        rows
          ? `<table><thead><tr><th>Role</th><th class="num">Count</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
          : ''
      }
    </div>`;
}

function renderIssueTable(
  issues: readonly GeneratedReportIssue[],
  heading: string | null,
): string {
  if (issues.length === 0) return '';
  const rows = issues
    .map(
      (issue) => `
        <tr>
          <td>${esc(issue.title)}</td>
          <td>${toTitleCase(issue.category)}</td>
          <td class="severity-${issue.severity.toLowerCase()}">${toTitleCase(issue.severity)}</td>
          <td>${toTitleCase(issue.status)}</td>
        </tr>
        <tr class="detail-row">
          <td colspan="4">
            ${esc(issue.details)}
            ${issue.actionRequired ? `<br/><strong>Action Required:</strong> ${esc(issue.actionRequired)}` : ''}
          </td>
        </tr>`,
    )
    .join('');

  return `
    <div class="section">
      ${heading ? `<h2>${heading}</h2>` : ''}
      <table>
        <thead><tr><th>Issue</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMaterials(
  materials: readonly GeneratedReportMaterial[],
  heading: string | null,
): string {
  if (materials.length === 0) return '';
  const rows = materials
    .map((m) => {
      const qty = [m.quantity, m.quantityUnit].filter(Boolean).join(' ') || '\u2014';
      return `<tr><td>${esc(m.name)}</td><td>${esc(qty)}</td><td>${esc(m.status ? toTitleCase(m.status) : '\u2014')}</td><td>${esc(m.notes ?? '')}</td></tr>`;
    })
    .join('');
  return `
    <div class="section">
      ${heading ? `<h2>${heading}</h2>` : `<p class="sub-heading">Materials</p>`}
      <table><thead><tr><th>Name</th><th>Quantity</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

function renderNextSteps(steps: readonly string[], heading: string): string {
  if (steps.length === 0) return '';
  const items = steps
    .map((s, i) => `<tr><td class="num">${i + 1}.</td><td>${esc(s)}</td></tr>`)
    .join('');
  return `
    <div class="section">
      <h2>${heading}</h2>
      <table><tbody>${items}</tbody></table>
    </div>`;
}

function renderSections(
  sections: GeneratedSiteReport['report']['sections'],
  counter: ReturnType<typeof createCounter>,
): string {
  if (sections.length === 0) return '';
  return sections
    .map(
      (s) => `
      <div class="section">
        <h2>${counter.next()}. ${esc(s.title)}</h2>
        <p>${esc(s.content)}</p>
      </div>`,
    )
    .join('');
}

// ── Main export ────────────────────────────────────────────────

export function reportToHtml(
  report: GeneratedSiteReport,
  branding: PdfBranding = {},
): string {
  const { companyName, logoUrl } = branding;
  const { meta, weather, workers, materials, issues, nextSteps, sections } =
    report.report;
  const counter = createCounter();

  // ── Title page / header ──────────────────────────────────────

  const headerHtml = `
    <header>
      ${logoUrl ? `<img src="${esc(logoUrl)}" class="logo" alt="" />` : ''}
      ${companyName ? `<p class="company">${esc(companyName)}</p>` : ''}
      <h1>${esc(meta.title)}</h1>
      <table class="title-meta">
        <tbody>
          ${meta.visitDate ? `<tr><td class="label">Date of Visit</td><td>${formatDate(meta.visitDate)}</td></tr>` : ''}
          ${companyName ? `<tr><td class="label">Prepared By</td><td>${esc(companyName)}</td></tr>` : ''}
        </tbody>
      </table>
    </header>`;

  // ── Executive Summary ────────────────────────────────────────

  const summaryNum = counter.next();
  const summaryHtml = meta.summary
    ? `<div class="section"><h2>${summaryNum}. Executive Summary</h2><p>${esc(meta.summary)}</p></div>`
    : '';

  // ── Key Figures + Weather (side by side) ─────────────────────

  const figuresNum = counter.next();
  const figuresCol = `
    <div class="section">
      <h2>${figuresNum}. Key Figures</h2>
      <table>
        <thead><tr><th>Metric</th><th class="num">Value</th></tr></thead>
        <tbody>
          <tr><td>Personnel on Site</td><td class="num">${workers?.totalWorkers ?? 0}</td></tr>
          <tr><td>Materials</td><td class="num">${materials.length}</td></tr>
          <tr><td>Issues Recorded</td><td class="num">${issues.length}</td></tr>
        </tbody>
      </table>
    </div>`;

  let weatherCol = '';
  if (weather) {
    const weatherNum = counter.next();
    const weatherRows = [
      weather.conditions ? ['Conditions', weather.conditions] : null,
      weather.temperature ? ['Temperature', weather.temperature] : null,
      weather.wind ? ['Wind', weather.wind] : null,
      weather.impact ? ['Impact on Works', weather.impact] : null,
    ]
      .filter((r): r is [string, string] => r !== null)
      .map((r) => `<tr><td class="label">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`)
      .join('');
    weatherCol = `
      <div class="section">
        <h2>${weatherNum}. Weather Conditions</h2>
        <table><tbody>${weatherRows}</tbody></table>
      </div>`;
  }

  const figuresWeatherHtml = weatherCol
    ? `<div class="two-col">${figuresCol}${weatherCol}</div>`
    : figuresCol;

  // ── Issues ───────────────────────────────────────────────────

  const issuesNum = issues.length > 0 ? counter.next() : '';
  const issuesHtml = renderIssueTable(
    issues,
    issuesNum ? `${issuesNum}. Issues and Incidents` : null,
  );

  // ── Workers ──────────────────────────────────────────────────

  const workersNum = workers ? counter.next() : '';
  const workersHtml = renderWorkers(
    workers,
    workersNum ? `${workersNum}. Personnel Summary` : null,
  );

  // ── Materials ────────────────────────────────────────────────

  const materialsNum = materials.length > 0 ? counter.next() : '';
  const materialsHtml = renderMaterials(
    materials,
    materialsNum ? `${materialsNum}. Materials` : null,
  );

  // ── Next Steps ───────────────────────────────────────────────

  const stepsNum = nextSteps.length > 0 ? counter.next() : '';
  const stepsHtml = renderNextSteps(
    nextSteps,
    stepsNum ? `${stepsNum}. Recommended Actions` : '',
  );

  // ── Additional Sections ──────────────────────────────────────

  const sectionsHtml = renderSections(sections, counter);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(meta.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Georgia', 'Times New Roman', 'Times', serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #111;
      background: #f5f5f5;
    }

    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 18mm 22mm;
      background: white;
    }

    /* ── Header / title block ─────────────────────────────── */

    header {
      text-align: left;
      margin-bottom: 16pt;
      padding-bottom: 10pt;
      border-bottom: 1.5pt solid #111;
    }

    .logo { height: 32pt; margin-bottom: 6pt; }

    .company {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 3pt;
      color: #555;
      margin-bottom: 4pt;
    }

    h1 {
      font-size: 15pt;
      font-weight: 700;
      margin-bottom: 8pt;
      line-height: 1.25;
    }

    .title-meta { font-size: 9pt; border: none; }
    .title-meta td { padding: 1pt 8pt 1pt 0; border: none; }

    /* ── Section headings ─────────────────────────────────── */

    h2 {
      font-size: 11pt;
      font-weight: 700;
      margin: 18pt 0 6pt;
      padding-bottom: 3pt;
      border-bottom: 1.5pt solid #111;
      page-break-after: avoid;
    }

    h3 {
      font-size: 10pt;
      font-weight: 700;
      margin: 10pt 0 3pt;
      page-break-after: avoid;
    }

    .sub-heading {
      font-size: 9pt;
      font-weight: 700;
      font-style: italic;
      margin: 8pt 0 2pt;
    }

    /* ── Body text ────────────────────────────────────────── */

    p { margin: 3pt 0; text-align: justify; }
    ul { margin: 2pt 0 2pt 16pt; }
    li { margin-bottom: 1pt; }

    /* ── Tables ───────────────────────────────────────────── */

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin: 4pt 0;
    }

    th {
      text-align: left;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      border-top: 0.75pt solid #999;
      border-bottom: 0.75pt solid #999;
      padding: 3pt 5pt;
    }

    td {
      padding: 2.5pt 5pt;
      border-bottom: 0.5pt solid #ccc;
      vertical-align: top;
    }

    td.num, th.num { text-align: right; }

    td.label {
      font-weight: 700;
      white-space: nowrap;
      width: 1%;
    }

    .detail-row td {
      font-size: 8.5pt;
      color: #333;
      padding: 2pt 5pt 5pt;
      border-bottom: 0.75pt solid #999;
    }

    /* ── Severity indicators (text only) ──────────────────── */

    .severity-high { font-weight: 700; }
    .severity-medium { font-weight: 600; }
    .severity-low { color: #555; }

    .section { margin-bottom: 2pt; }

    /* ── Side-by-side layout ────────────────────────────────── */

    .two-col { display: flex; gap: 16pt; align-items: flex-start; }
    .two-col > .section { flex: 1; min-width: 0; }

    /* ── Footer ───────────────────────────────────────────── */

    footer {
      margin-top: 20pt;
      padding-top: 8pt;
      border-top: 0.75pt solid #999;
      font-size: 8pt;
      color: #777;
      text-align: center;
    }

    /* ── Print ────────────────────────────────────────────── */

    @media print {
      body { background: white; }
      .page { max-width: none; padding: 15mm 18mm; margin: 0; }
      .page-break-before { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${headerHtml}
    ${summaryHtml}
    ${figuresWeatherHtml}
    ${issuesHtml}
    ${workersHtml}
    ${materialsHtml}
    ${stepsHtml}
    ${sectionsHtml}
    <footer>
      This report was generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
      ${companyName ? `Prepared by ${esc(companyName)}.` : ''}
      Page 1 of 1.
    </footer>
  </div>
</body>
</html>`;
}
