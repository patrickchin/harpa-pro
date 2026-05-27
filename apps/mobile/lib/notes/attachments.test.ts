import { describe, it, expect } from 'vitest';
import { buildAttachments, attachmentFromSavedFile } from './attachments';
import type { NoteEntry } from './note-entry';

describe('buildAttachments', () => {
  it('returns entry.attachments directly when set', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      attachments: [
        { key: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, sourceUri: null, isPending: false, position: 0 },
        { key: 'nf_b', fileId: 'fil_b', thumbnailFileId: 'fil_bt', sourceUri: null, isPending: false, position: 1 },
      ],
    };
    const result = buildAttachments(entry);
    expect(result).toBe(entry.attachments);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'nf_b']);
  });

  it('returns entry.attachments with mixed saved and pending tiles', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      attachments: [
        { key: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, sourceUri: null, isPending: false, position: 0 },
        { key: 'job_1', fileId: null, thumbnailFileId: null, sourceUri: 'file:///1.jpg', isPending: true, jobId: 'job_1', status: 'uploading', progress: 0.4, position: 1 },
      ],
    };
    const result = buildAttachments(entry);
    expect(result).toBe(entry.attachments);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'job_1']);
  });

  it('falls back to fileId when attachments is absent', () => {
    const entry: NoteEntry = {
      id: 'not_X',
      text: '',
      addedAt: 0,
      source: 'image',
      fileId: 'fil_solo',
      thumbnailFileId: 'fil_solo_t',
    };
    const result = buildAttachments(entry);
    expect(result).toEqual([
      {
        key: 'not_X',
        fileId: 'fil_solo',
        thumbnailFileId: 'fil_solo_t',
        sourceUri: null,
        isPending: false,
        position: 0,
      },
    ]);
  });

  it('returns an empty array when attachments is an empty array and no fileId', () => {
    const entry: NoteEntry = { text: '', addedAt: 0, source: 'image', attachments: [] };
    expect(buildAttachments(entry)).toEqual([]);
  });

  it('returns an empty array for entries with no photo data', () => {
    const entry: NoteEntry = { text: 'hi', addedAt: 0, source: 'text' };
    expect(buildAttachments(entry)).toEqual([]);
  });
});

describe('attachmentFromSavedFile', () => {
  it('maps a saved file input to a completed Attachment', () => {
    const att = attachmentFromSavedFile({ id: 'fil_1', fileId: 'fil_1', thumbnailFileId: 'fil_thumb' });
    expect(att).toMatchObject({
      key: 'fil_1',
      fileId: 'fil_1',
      thumbnailFileId: 'fil_thumb',
      sourceUri: null,
      isPending: false,
      status: 'completed',
      progress: 1,
      position: 0,
    });
  });

  it('uses the supplied position argument', () => {
    const att = attachmentFromSavedFile({ id: 'fil_2', fileId: 'fil_2', thumbnailFileId: null }, 3);
    expect(att.position).toBe(3);
  });

  it('falls back to null when thumbnailFileId is omitted', () => {
    const att = attachmentFromSavedFile({ id: 'fil_3', fileId: 'fil_3' });
    expect(att.thumbnailFileId).toBeNull();
  });
});
