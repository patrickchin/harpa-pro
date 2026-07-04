import { describe, expect, it } from 'vitest';
import * as auth from './auth.js';

describe('account deletion schemas', () => {
  it('accepts the deletion preview response used by mobile confirmation UI', () => {
    const preview = {
      email: 'alice@example.com',
      soloProjectsDeleted: [{ id: 'prj_1234abcd', name: 'Solo' }],
      sharedProjectsTransferred: [
        {
          id: 'prj_2345bcde',
          name: 'Shared',
          newOwnerId: 'usr_3456cdef',
          newOwnerEmail: 'owner@example.com',
        },
      ],
      sharedProjectsLeft: [{ id: 'prj_4567defg', name: 'Member' }],
      personalFilesDeleted: 2,
    };

    expect(() => auth.accountDeletionPreviewResponse.parse(preview)).not.toThrow();
  });
});

describe('usage schemas', () => {
  it('preserves the effective file-size limit for new clients', () => {
    const parsed = auth.usageResponse.parse({
      months: [],
      totals: {
        reports: 0,
        voiceNotes: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        inputSeconds: 0,
        calls: 0,
      },
      usageTokens: [],
      usageByModel: [],
      plan: 'free',
      limits: [],
      fileSizeLimitBytes: 5 * 1024 * 1024,
    });

    expect(parsed.fileSizeLimitBytes).toBe(5 * 1024 * 1024);
  });
});
