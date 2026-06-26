import { describe, it, expect } from 'vitest';
import { reportBodyToGeneratedReport, generatedReportToReportBody } from './report-body-adapter';

const emptyMeta = {
  title: null,
  summary: null,
  visitDate: null,
};

const baseBody = {
  meta: emptyMeta,
  weather: null,
  workers: [],
  materials: [],
  issues: [],
  nextSteps: [],
  summarySections: [],
};

describe('reportBodyToGeneratedReport — meta mapping', () => {
  it('copies populated meta 1:1 into the UI shape', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      meta: {
        title: 'My Title',
        summary: 'My summary.',
        visitDate: '2026-05-28T00:00:00Z',
      },
    });
    expect(out.report.meta.title).toBe('My Title');
    expect(out.report.meta.summary).toBe('My summary.');
    expect(out.report.meta.visitDate).toBe('2026-05-28T00:00:00Z');
  });

  it('renders all-null meta as empty UI fields', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.meta.title).toBe('');
    expect(out.report.meta.summary).toBe('');
  });

  it('shims a legacy body with top-level visitDate', () => {
    const legacyBody: any = {
      visitDate: '2026-04-01T00:00:00Z',
      weather: null,
      workers: [],
      materials: [],
      issues: [],
      nextSteps: [],
      summarySections: [],
    };
    const out = reportBodyToGeneratedReport(legacyBody);
    expect(out.report.meta.visitDate).toBe('2026-04-01T00:00:00Z');
  });
});

describe('reportBodyToGeneratedReport — weather mapping', () => {
  it('appends °C / km/h to numeric strings', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      weather: { condition: 'wet', temperature: '20°C', wind: '12.5 km/h', impact: null },
    });
    expect(out.report.weather!.temperature).toBe('20°C');
    expect(out.report.weather!.wind).toBe('12.5 km/h');
    expect(out.report.weather!.conditions).toBe('wet');
  });

  it('passes free-text weather strings through verbatim', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      weather: { condition: null, temperature: 'around 20°C', wind: null, impact: null },
    });
    expect(out.report.weather!.temperature).toBe('around 20°C');
    expect(out.report.weather!.wind).toBeNull();
  });

  it('null weather stays null', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.weather).toBeNull();
  });

  it('empty-string weather passes through (DB migration handles legacy)', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      weather: { condition: null, temperature: null, wind: null, impact: null },
    });
    expect(out.report.weather!.temperature).toBeNull();
    expect(out.report.weather!.wind).toBeNull();
  });
});

describe('reportBodyToGeneratedReport — workers mapping', () => {
  it('sums numeric workers count + hours into totals', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      workers: [
        { role: 'A', count: '4', hours: '8', notes: null },
        { role: 'B', count: '2', hours: '6.5', notes: null },
      ],
    });
    expect(out.report.workers!.totalWorkers).toBe(6);
    expect(out.report.workers!.workerHours).toBe('14.5h total');
    expect(out.report.workers!.roles).toHaveLength(2);
  });

  it('non-numeric count strings collapse to 0 in totals', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      workers: [
        { role: 'A', count: 'a few', hours: null, notes: null },
        { role: 'B', count: '3', hours: null, notes: null },
      ],
    });
    expect(out.report.workers!.totalWorkers).toBe(3);
    expect(out.report.workers!.workerHours).toBeNull();
  });

  it('preserves free-text count strings on the role row', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      workers: [{ role: 'Contractors', count: 'a few', hours: null, notes: null }],
    });
    expect(out.report.workers!.totalWorkers).toBeNull();
    expect(out.report.workers!.roles[0]!.count).toBe('a few');
  });

  it('empty workers array → null workers block', () => {
    const out = reportBodyToGeneratedReport(baseBody);
    expect(out.report.workers).toBeNull();
  });
});

describe('reportBodyToGeneratedReport — materials & issues', () => {
  it('passes through material quantity + unit unchanged', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      materials: [
        {
          name: 'Concrete',
          quantity: '50',
          unit: 'm³',
          status: null,
          condition: null,
          notes: null,
        },
      ],
    });
    expect(out.report.materials[0]!.quantity).toBe('50');
    expect(out.report.materials[0]!.quantityUnit).toBe('m³');
  });

  it('normalises severity — known stays, unknown → medium', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      issues: [
        { title: 'A', severity: 'low', description: null, action: null },
        { title: 'B', severity: 'CRITICAL', description: null, action: null },
        { title: 'C', severity: null, description: null, action: null },
      ],
    });
    expect(out.report.issues[0]!.severity).toBe('low');
    expect(out.report.issues[1]!.severity).toBe('medium');
    expect(out.report.issues[2]!.severity).toBe('medium');
  });

  it('copies issue and section attachments into the UI report shape', () => {
    const out = reportBodyToGeneratedReport({
      ...baseBody,
      issues: [
        {
          title: 'A',
          severity: 'high',
          description: 'crack',
          action: null,
          attachments: { images: ['not_img_issue'], documents: ['not_doc_issue'] },
        },
      ],
      summarySections: [
        {
          title: 'Photos',
          body: 'Evidence.',
          attachments: { images: ['not_img_section'] },
        },
      ],
    });

    expect(out.report.issues[0]!.attachments).toEqual({
      images: ['not_img_issue'],
      documents: ['not_doc_issue'],
    });
    expect(out.report.sections[0]!.attachments).toEqual({
      images: ['not_img_section'],
    });
  });
});

describe('generatedReportToReportBody — inverse adapter', () => {
  const uiBase = {
    report: {
      meta: { title: '', summary: '', visitDate: null },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  } as any;

  it('passes weather strings through unchanged (units in value)', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        weather: { conditions: 'wet', temperature: '20°C', wind: '12.5 km/h', impact: null },
      },
    });
    expect(out.weather!.temperature).toBe('20°C');
    expect(out.weather!.wind).toBe('12.5 km/h');
  });

  it('preserves free-text user input through the round-trip', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        weather: { conditions: null, temperature: 'around 20°C', wind: null, impact: null },
      },
    });
    expect(out.weather!.temperature).toBe('around 20°C');
  });

  it('preserves UI count strings back to the wire body', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        workers: {
          headcount: 6,
          workerHours: null,
          notes: null,
          roles: [
            { role: 'A', count: '4', notes: null },
            { role: 'B', count: null, notes: 'one' },
          ],
        },
      },
    });
    expect(out.workers[0]!.count).toBe('4');
    expect(out.workers[1]!.count).toBeNull();
  });

  it('preserves free-text role counts back to the wire body', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        workers: {
          totalWorkers: null,
          workerHours: null,
          notes: null,
          roles: [{ role: 'Contractors', count: 'a few', notes: null }],
        },
      },
    } as any);
    expect(out.workers[0]!.count).toBe('a few');
  });

  it('round-trips materials quantity + drops dropped fields', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        materials: [
          {
            name: 'Concrete',
            quantity: '50',
            quantityUnit: 'm³',
            status: null,
            condition: null,
            notes: null,
          },
        ],
      },
    });
    expect(out.materials[0]!).toEqual({
      name: 'Concrete',
      quantity: '50',
      unit: 'm³',
      status: null,
      condition: null,
      notes: null,
    });
  });

  it('coerces UI free-text severity to enum default', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        issues: [
          {
            title: 'A',
            category: 'other',
            severity: 'high',
            status: 'open',
            details: '',
            actionRequired: null,
          },
          {
            title: 'B',
            category: 'other',
            severity: 'urgent',
            status: 'open',
            details: '',
            actionRequired: null,
          },
        ],
      },
    });
    expect(out.issues[0]!.severity).toBe('high');
    expect(out.issues[1]!.severity).toBe('medium');
  });

  it('preserves issue and section attachments when mapping UI edits to the wire body', () => {
    const out = generatedReportToReportBody({
      ...uiBase,
      report: {
        ...uiBase.report,
        issues: [
          {
            title: 'A',
            category: 'other',
            severity: 'high',
            status: 'open',
            details: 'crack',
            actionRequired: null,
            attachments: { images: ['not_img_issue'], documents: ['not_doc_issue'] },
          },
        ],
        sections: [
          {
            title: 'Photos',
            content: 'Evidence.',
            attachments: { images: ['not_img_section'] },
          },
        ],
      },
    });

    expect(out.issues[0]!.attachments).toEqual({
      images: ['not_img_issue'],
      documents: ['not_doc_issue'],
    });
    expect(out.summarySections[0]!.attachments).toEqual({
      images: ['not_img_section'],
    });
  });
});
