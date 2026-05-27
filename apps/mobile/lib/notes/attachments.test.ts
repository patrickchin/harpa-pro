import { describe, it, expect } from 'vitest';
import { buildAttachments } from './attachments';
import type { NoteEntry } from './note-entry';

describe('buildAttachments', () => {
  it('returns saved files first, sorted by position, mapped to attachments', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      files: [
        { id: 'nf_b', fileId: 'fil_b', thumbnailFileId: 'fil_bt', position: 1, caption: null },
        { id: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, position: 0, caption: null },
      ],
    };
    const result = buildAttachments(entry);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'nf_b']);
    expect(result[0]).toMatchObject({
      fileId: 'fil_a',
      thumbnailFileId: null,
      isPending: false,
      sourceUri: null,
      position: 0,
    });
    expect(result[1]!.thumbnailFileId).toBe('fil_bt');
  });

  it('appends pending files after saved files, preserving queue order', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      files: [
        { id: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, position: 0, caption: null },
      ],
      pendingFiles: [
        { jobId: 'job_1', sourceUri: 'file:///1.jpg', status: 'uploading', progress: 0.4 },
        { jobId: 'job_2', sourceUri: 'file:///2.jpg', status: 'pending', progress: 0 },
      ],
    };
    const result = buildAttachments(entry);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'job_1', 'job_2']);
    expect(result[1]).toMatchObject({
      key: 'job_1',
      isPending: true,
      sourceUri: 'file:///1.jpg',
      status: 'uploading',
      progress: 0.4,
      fileId: null,
    });
  });

  it('falls back to legacy single pendingUpload when pendingFiles is absent', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      pendingUpload: {
        jobId: 'job_solo',
        sourceUri: 'file:///s.jpg',
        status: 'uploading',
        progress: 0.7,
      },
    };
    const result = buildAttachments(entry);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'job_solo', isPending: true, progress: 0.7 });
  });

  it('falls back to legacy single fileId when there is no batch info', () => {
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

  it('returns an empty array for entries with no photo data', () => {
    const entry: NoteEntry = { text: 'hi', addedAt: 0, source: 'text' };
    expect(buildAttachments(entry)).toEqual([]);
  });
});
