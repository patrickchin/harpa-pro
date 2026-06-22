import { describe, expect, it } from 'vitest';
import { isAppReviewEmail } from './app-review';

describe('isAppReviewEmail', () => {
  it('accepts the stable App Review address', () => {
    expect(isAppReviewEmail('app-review@harpapro.com')).toBe(true);
    expect(isAppReviewEmail(' APP-REVIEW@harpapro.com ')).toBe(true);
  });

  it('rejects regular or malformed emails', () => {
    expect(isAppReviewEmail('alice@example.com')).toBe(false);
    expect(isAppReviewEmail('app-review+abcdef12@harpapro.com')).toBe(false);
    expect(isAppReviewEmail('app-review+abcdef12@harpapro.com.evil.com')).toBe(false);
  });
});
