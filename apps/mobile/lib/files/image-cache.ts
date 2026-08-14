/**
 * Image cache utilities for `expo-image`.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/image-cache.ts`
 * (branch `dev`). `expo-image` keeps two caches (memory + disk); both
 * must be cleared on sign-out so a different account can't see the
 * previous user's photos by remounting a `<CachedImage cacheKey={…}>`
 * with a known storage path.
 */
import { Image } from 'expo-image';

export async function clearImageCachesOnSignOut(): Promise<void> {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}
