// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { ReportPreview } from '../ReportPreview';
import { createEmptyReportBody } from '../report-body';
import { render } from './dom';
import { reportBodyFixture } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe('ReportPreview', () => {
  it('uses compact mobile section headers and semibold row names', async () => {
    const rendered = await render(<ReportPreview body={reportBodyFixture} />);
    cleanups.push(rendered.cleanup);

    const preview = rendered.container.querySelector('[data-testid="report-preview"]');
    expect(preview).toHaveClass('gap-4', 'rounded-card-ui', 'bg-card', 'shadow-raised-ui');
    const sectionHeadings = [...rendered.container.querySelectorAll('section > h3')];
    expect(sectionHeadings.length).toBeGreaterThan(0);
    sectionHeadings.forEach((heading) => {
      expect(heading).toHaveClass('text-label');
      expect(heading).not.toHaveClass('text-title-sm', 'font-bold', 'tracking-label');
    });
    const rowHeadings = [...rendered.container.querySelectorAll('section h4')];
    expect(rowHeadings.length).toBeGreaterThan(0);
    rowHeadings.forEach((heading) => {
      expect(heading).toHaveClass('font-semibold');
      expect(heading).not.toHaveClass('font-bold');
    });
    expect(rendered.container.querySelector('.bg-warning-soft')).toHaveTextContent('medium');
    expect(
      Array.from(rendered.container.querySelectorAll<HTMLElement>('[class]')).flatMap((element) =>
        element.className.split(/\s+/),
      ),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^reports-/)]));
  });

  it('renders a safe untitled report for an empty canonical body', async () => {
    const rendered = await render(<ReportPreview body={createEmptyReportBody()} />);
    cleanups.push(rendered.cleanup);

    expect(rendered.container.textContent).toContain('Untitled report');
    expect(rendered.container.textContent).not.toContain('Workers');
    expect(rendered.container.textContent).not.toContain('Weather');
  });

  it('preserves free text values and read-only attachment references', async () => {
    const body = structuredClone(reportBodyFixture);
    body.workers[0]!.count = 'a few';
    body.workers[0]!.hours = null;
    body.issues[0]!.attachments = {
      images: ['not_01234567'],
      documents: ['not_12345678', 'not_23456789'],
    };
    body.summarySections[0]!.attachments = {
      documents: ['not_3456789a'],
    };

    const rendered = await render(<ReportPreview body={body} />);
    cleanups.push(rendered.cleanup);

    expect(rendered.container.textContent).toContain('a few');
    expect(rendered.container.textContent).toContain('1 photo · 2 documents');
    expect(rendered.container.textContent).toContain('1 document');
  });
});
