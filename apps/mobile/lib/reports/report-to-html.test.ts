/**
 * Smoke tests for the PDF HTML renderer. Asserts that the structural
 * pieces (title, summary, key-figure counts, weather, issues,
 * materials, next-step, custom sections) end up in the output, plus
 * basic XSS escaping. Exact CSS / pixel parity is reviewed manually
 * against mobile-old samples per docs/v4/plan-p4-hardening.md P4.3.
 */
import { describe, expect, it } from 'vitest';
import { reports } from '@harpa/api-contract';

import { reportToHtml } from './report-to-html';

function baseReport(): reports.ReportBody {
  return {
    meta: {
      title: 'Daily Progress',
      summary: 'Summary text',
      visitDate: '2026-04-20',
    },
    weather: {
      condition: 'Sunny',
      temperature: '22C',
      wind: null,
      impact: null,
    },
    workers: [{ role: 'Electrician', count: '4', hours: '32', notes: null }],
    materials: [
      {
        name: 'Cement',
        quantity: '10',
        unit: 'bags',
        condition: null,
        status: 'delivered',
        notes: null,
      },
    ],
    issues: [
      {
        title: 'Leaky pipe',
        severity: 'high',
        description: 'Found in basement',
        action: 'Call plumber',
      },
    ],
    nextSteps: ['Order more cement'],
    summarySections: [{ title: 'Progress', body: 'Walls up.' }],
  };
}

describe('reportToHtml', () => {
  it('renders title, summary, weather, issues, workers, materials, next steps, and sections', () => {
    const html = reportToHtml(baseReport());

    expect(html).toContain('<title>Daily Progress</title>');
    expect(html).toContain('Daily Progress');
    expect(html).toContain('Summary text');
    expect(html).toContain('Executive Summary');
    expect(html).toContain('Key Figures');
    expect(html).toContain('Weather Conditions');
    expect(html).toContain('Sunny');
    expect(html).toContain('Issues and Incidents');
    expect(html).toContain('Leaky pipe');
    expect(html).toContain('Call plumber');
    expect(html).toContain('Personnel Summary');
    expect(html).toContain('Electrician');
    expect(html).toContain('Materials');
    expect(html).toContain('Cement');
    expect(html).toContain('10 bags');
    expect(html).toContain('Recommended Actions');
    expect(html).toContain('Order more cement');
    expect(html).toContain('Progress');
    expect(html).toContain('Walls up.');
  });

  it('renders qualitative worker counts instead of a zero total', () => {
    const report = baseReport();
    report.workers = [{ role: 'Contractors', count: 'a few', hours: null, notes: null }];

    const html = reportToHtml(report);

    expect(html).toContain('Personnel on Site</td><td class="num">a few</td>');
    expect(html).toContain('<td>Contractors</td><td class="num">a few</td>');
  });

  it('omits the "Report Type" row that existed in v3', () => {
    const html = reportToHtml(baseReport());
    expect(html).not.toContain('Report Type');
  });

  it('escapes HTML special characters in user-supplied strings', () => {
    const report = baseReport();
    report.meta.title = '<script>alert(1)</script>';
    const html = reportToHtml(report);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('skips optional sections (weather, workers, materials, next steps) when empty', () => {
    const report: reports.ReportBody = {
      meta: {
        title: 'Sparse',
        summary: null,
        visitDate: null,
      },
      weather: null,
      workers: [],
      materials: [],
      issues: [],
      nextSteps: [],
      summarySections: [],
    };

    const html = reportToHtml(report);
    expect(html).not.toContain('Weather Conditions');
    expect(html).not.toContain('Personnel Summary');
    expect(html).not.toContain('Issues and Incidents');
    expect(html).not.toContain('Recommended Actions');
    expect(html).toContain('Key Figures');
  });

  it('renders branding metadata when supplied', () => {
    const html = reportToHtml(baseReport(), {
      companyName: 'Harpa Construction',
      logoUrl: 'file:///logo.png',
    });
    expect(html).toContain('Harpa Construction');
    expect(html).toContain('file:///logo.png');
    expect(html).toContain('Prepared By');
  });
});
