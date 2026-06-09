import { describe, it, expect } from 'vitest';
import {
  createNoteRequest,
  note,
  noteSource,
} from './notes.js';

describe('noteSource', () => {
  it('accepts known note source values', () => {
    const result = noteSource.safeParse('camera');
    expect(result.success).toBe(true);
  });

  it('rejects unknown source values', () => {
    const result = noteSource.safeParse('clipboard');
    expect(result.success).toBe(false);
  });
});

describe('note metadata', () => {
  it('returns source and meta on the wire without placement', () => {
    const result = note.safeParse({
      id: 'not_8h3kq2vp9w',
      reportId: 'rpt_8h3kq2vp9w',
      authorId: 'usr_8h3kq2vp9w',
      kind: 'image',
      body: null,
      fileId: null,
      thumbnailFileId: null,
      files: [],
      transcript: null,
      title: null,
      summary: null,
      durationSec: null,
      language: null,
      transcribeProvider: null,
      transcribedAt: null,
      source: 'camera',
      meta: { exifOrientation: 1 },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('placement' in result.data).toBe(false);
    }
  });
});

describe('createNoteRequest metadata', () => {
  it('accepts source and meta on note creation', () => {
    const result = createNoteRequest.safeParse({
      kind: 'image',
      files: [{ fileId: 'fil_8h3kq2vp9w', thumbnailFileId: null }],
      source: 'gallery',
      meta: { pickerAssetId: 'asset-1' },
    });
    expect(result.success).toBe(true);
  });
});
