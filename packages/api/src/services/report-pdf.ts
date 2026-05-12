/**
 * Report PDF renderer.
 *
 * Fixture/CI mode (the only path exercised by tests in P1.7): produces a
 * deterministic, network-free byte payload that starts with the PDF magic
 * header (`%PDF-1.4`) so it round-trips through `app.files` without
 * tripping content-type sniffing. The bytes embed the report id +
 * structured body verbatim, which keeps the output stable across runs
 * (no clocks, no UUIDs) and makes test assertions trivial.
 *
 * Live mode (P1 follow-up): replaced with a real headless renderer
 * (Playwright/Puppeteer or @react-pdf/renderer). That's gated on
 * AI_LIVE / R2_FIXTURE_MODE !== 'replay' and is intentionally NOT wired
 * here so CI never has to install Chromium — see arch-storage.md
 * §Fixture mode ("no R2 calls in CI") and arch-ai-fixtures.md.
 */
import type { ReportRow } from './reports.js';

export function renderReportPdf(report: Pick<ReportRow, 'id' | 'body'>): Uint8Array {
  const payload = JSON.stringify(report.body ?? {});
  const text =
    `%PDF-1.4\n` +
    `% harpa-pro fixture report ${report.id}\n` +
    `% body=${payload}\n` +
    `%%EOF\n`;
  return new TextEncoder().encode(text);
}
