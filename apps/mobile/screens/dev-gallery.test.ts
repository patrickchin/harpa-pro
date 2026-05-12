/**
 * P2.0b — snapshot test for the empty dev-gallery skeleton.
 *
 * The component itself is a thin react-native wrapper; the
 * structural surface that drift-watching cares about lives in the
 * pure row builder. We snapshot both the empty case (zero
 * registered screens) and a small mixed case (verifies grouping +
 * sort) so future ports notice changes to the listing semantics.
 */
import { describe, expect, it } from 'vitest';

import { buildGalleryRows, type GalleryEntry } from './dev-gallery.rows.js';

describe('buildGalleryRows', () => {
  it('emits a single empty-state row when no screens are registered', () => {
    expect(buildGalleryRows([])).toMatchSnapshot();
  });

  it('groups entries, sorts groups (misc last) and entries by name', () => {
    const registry: GalleryEntry[] = [
      { name: 'projects-list', href: '/(dev)/projects', group: 'app' },
      { name: 'login', href: '/(dev)/login', group: 'auth', description: 'Phone OTP entry' },
      { name: 'verify', href: '/(dev)/verify', group: 'auth' },
      { name: 'sandbox', href: '/(dev)/sandbox' },
    ];
    expect(buildGalleryRows(registry)).toMatchSnapshot();
  });
});
