/**
 * GenerateReportProvider — focused unit tests for pure helpers.
 *
 * NOTE(T7): `GenerateReportProvider.test.tsx` did not exist before T7.
 * Creating a full render harness for the provider would require
 * stubbing QueueProvider, AudioPlaybackProvider, react-query, and
 * Expo Router — significant scaffolding outside this task's scope.
 * Per the spec's fallback path we instead test the extracted pure
 * helper `remapAttachmentKeys` directly, and rely on the full mobile
 * test suite to cover the provider's integration behaviour.
 */
import { describe, it, expect } from 'vitest';

import { remapAttachmentKeys } from './GenerateReportProvider';
import type { Attachment } from '@/lib/notes/attachments';

function makeAtt(overrides: Partial<Attachment> = {}): Attachment {
  return {
    key: 'nf_default',
    fileId: null,
    thumbnailFileId: null,
    sourceUri: null,
    isPending: false,
    position: 0,
    ...overrides,
  };
}

describe('remapAttachmentKeys', () => {
  it('remaps saved attachment key to the pending synthetic job key', () => {
    const att = makeAtt({ key: 'nf_saved', fileId: 'fil_1' });
    const map = new Map([['fil_1', 'job_abc']]);
    const result = remapAttachmentKeys([att], map);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('job_abc');
    expect(result[0]!.fileId).toBe('fil_1');
  });

  it('leaves other attachment fields unchanged after remap', () => {
    const att = makeAtt({
      key: 'nf_saved',
      fileId: 'fil_1',
      thumbnailFileId: 'thmb_1',
      position: 2,
    });
    const map = new Map([['fil_1', 'job_abc']]);
    const [remapped] = remapAttachmentKeys([att], map);
    expect(remapped!.thumbnailFileId).toBe('thmb_1');
    expect(remapped!.position).toBe(2);
    expect(remapped!.isPending).toBe(false);
  });

  it('leaves key unchanged when fileId is not in the map', () => {
    const att = makeAtt({ key: 'nf_saved', fileId: 'fil_999' });
    const result = remapAttachmentKeys([att], new Map());
    expect(result[0]!.key).toBe('nf_saved');
  });

  it('leaves key unchanged when fileId is null', () => {
    const att = makeAtt({ key: 'job_pending', fileId: null });
    const map = new Map([['fil_1', 'job_abc']]);
    const result = remapAttachmentKeys([att], map);
    expect(result[0]!.key).toBe('job_pending');
  });

  it('handles an empty attachments array', () => {
    expect(remapAttachmentKeys([], new Map())).toEqual([]);
  });

  it('remaps multiple attachments independently', () => {
    const atts = [
      makeAtt({ key: 'nf_a', fileId: 'fil_a' }),
      makeAtt({ key: 'nf_b', fileId: 'fil_b' }),
      makeAtt({ key: 'nf_c', fileId: 'fil_c' }),
    ];
    // Only fil_b has a mapping
    const map = new Map([['fil_b', 'job_b']]);
    const result = remapAttachmentKeys(atts, map);
    expect(result[0]!.key).toBe('nf_a');
    expect(result[1]!.key).toBe('job_b');
    expect(result[2]!.key).toBe('nf_c');
  });
});
