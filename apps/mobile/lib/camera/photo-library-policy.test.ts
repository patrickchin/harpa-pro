import { describe, expect, it } from 'vitest';

import { isPhotoLibraryPickingEnabled } from './photo-library-policy';

describe('isPhotoLibraryPickingEnabled', () => {
  it('disables device photo-library reads on iOS', () => {
    expect(isPhotoLibraryPickingEnabled('ios')).toBe(false);
  });

  it('preserves photo-library picking on Android', () => {
    expect(isPhotoLibraryPickingEnabled('android')).toBe(true);
  });
});
