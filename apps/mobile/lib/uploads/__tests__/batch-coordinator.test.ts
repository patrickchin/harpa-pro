import { describe, expect, it } from 'vitest';
import { createBatchCoordinator, nextBatchKey } from '../batch-coordinator';

describe('BatchCoordinator', () => {
  it('generates unique batch keys', () => {
    const a = nextBatchKey();
    const b = nextBatchKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^batch_/);
  });

  it('first job creates note, second appends', async () => {
    const coord = createBatchCoordinator();
    coord.registerBatch(['job1', 'job2'], 'rpt_abc');

    const createNote = async () => 'not_xyz';
    const appendFiles = async (_noteId: string) => {};

    // First job creates
    const noteId1 = await coord.resolveNoteForJob('job1', createNote, appendFiles);
    expect(noteId1).toBe('not_xyz');

    // Second job appends
    let appendedTo: string | undefined;
    const noteId2 = await coord.resolveNoteForJob(
      'job2',
      async () => {
        throw new Error('should not create');
      },
      async (noteId) => {
        appendedTo = noteId;
      },
    );
    expect(noteId2).toBe('not_xyz');
    expect(appendedTo).toBe('not_xyz');
  });

  it('non-batch job just creates', async () => {
    const coord = createBatchCoordinator();
    const noteId = await coord.resolveNoteForJob(
      'solo',
      async () => 'not_solo',
      async () => {
        throw new Error('should not append');
      },
    );
    expect(noteId).toBe('not_solo');
  });

  it('removeBatch cleans up', () => {
    const coord = createBatchCoordinator();
    const key = coord.registerBatch(['j1', 'j2'], 'rpt_1');
    expect(coord.getBatchKey('j1')).toBe(key);
    coord.removeBatch(key);
    expect(coord.getBatchKey('j1')).toBeUndefined();
    expect(coord.getBatchForJob('j1')).toBeUndefined();
  });
});
