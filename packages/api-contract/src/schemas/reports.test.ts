import { describe, it, expect } from 'vitest';
import {
  placeReportAttachmentRequest,
  reportBody,
} from './reports.js';

describe('reportBody with meta envelope', () => {
  it('accepts a populated meta object', () => {
    const result = reportBody.safeParse({
      meta: {
        title: 'Site Visit — Wet Weather',
        summary: 'Wet conditions delayed concrete pour.',
        visitDate: '2026-05-28T00:00:00Z',
      },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts all-null meta fields', () => {
    const result = reportBody.safeParse({
      meta: { title: null, summary: null, visitDate: null },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
  });

  it('strips top-level visitDate (moved into meta)', () => {
    const result = reportBody.safeParse({
      visitDate: '2026-05-28T00:00:00Z',
      meta: { title: null, summary: null, visitDate: null },
      weather: null, workers: [], materials: [], issues: [],
      nextSteps: [], summarySections: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).visitDate).toBeUndefined();
    }
  });

  it('accepts image attachments on issues and summary sections', () => {
    const result = reportBody.safeParse({
      meta: { title: null, summary: null, visitDate: null },
      weather: null,
      workers: [],
      materials: [],
      issues: [
        {
          title: 'Ceiling leak',
          severity: 'high',
          description: 'Water ingress above lobby.',
          action: 'Open ceiling bay.',
          attachments: { images: ['not_8h3kq2vp9w'] },
        },
      ],
      nextSteps: [],
      summarySections: [
        {
          title: 'Lobby',
          body: 'Lobby inspection completed.',
          attachments: { images: ['not_7h3kq2vp9x'], documents: [] },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown attachment keys inside body targets', () => {
    const result = reportBody.safeParse({
      meta: { title: null, summary: null, visitDate: null },
      weather: null,
      workers: [],
      materials: [],
      issues: [
        {
          title: 'Ceiling leak',
          severity: 'high',
          description: null,
          action: null,
          attachments: { videos: ['not_8h3kq2vp9w'] },
        },
      ],
      nextSteps: [],
      summarySections: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('placeReportAttachmentRequest', () => {
  it('accepts placing a note batch on an issue', () => {
    const result = placeReportAttachmentRequest.safeParse({
      noteId: 'not_8h3kq2vp9w',
      target: { kind: 'issue', index: 0 },
      expectedBodyVersion: '2026-06-09T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts target null to remove placement', () => {
    const result = placeReportAttachmentRequest.safeParse({
      noteId: 'not_8h3kq2vp9w',
      target: null,
      expectedBodyVersion: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-range negative target indices', () => {
    const result = placeReportAttachmentRequest.safeParse({
      noteId: 'not_8h3kq2vp9w',
      target: { kind: 'section', index: -1 },
      expectedBodyVersion: '2026-06-09T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
