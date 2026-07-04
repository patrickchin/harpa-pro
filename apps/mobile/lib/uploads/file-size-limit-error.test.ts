import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import {
  UploadFileSizeLimitError,
  uploadFileSizeLimitFromError,
} from './file-size-limit-error';

describe('UploadFileSizeLimitError', () => {
  it('parses the stable API code and typed details', () => {
    const parsed = uploadFileSizeLimitFromError(new ApiError({
      status: 413,
      code: 'file_size_limit_exceeded',
      message: 'localized server message',
      details: { sizeBytes: 6, limitBytes: 5, plan: 'free' },
    }));

    expect(parsed).toBeInstanceOf(UploadFileSizeLimitError);
    expect(parsed).toMatchObject({ sizeBytes: 6, limitBytes: 5, plan: 'free' });
  });

  it('does not match English text or malformed details', () => {
    expect(uploadFileSizeLimitFromError(new Error('file size limit exceeded'))).toBeNull();
    expect(uploadFileSizeLimitFromError(new ApiError({
      status: 413,
      code: 'file_size_limit_exceeded',
      message: 'too big',
      details: { sizeBytes: '6', limitBytes: 5, plan: 'free' },
    }))).toBeNull();
  });
});
