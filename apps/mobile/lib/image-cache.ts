/**
 * Image cache utilities for `expo-image`.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/image-cache.ts`
 * (branch `dev`). `expo-image` keeps two caches (memory + disk); both
 * must be cleared on sign-out so a different account can't see the
 * previous user's photos by remounting a `<CachedImage cacheKey={…}>`
 * with a known storage path.
 *
 * `prefetchImages` is a thin wrapper around `Image.prefetch` so callers
 * don't have to import `expo-image` directly and so tests can mock
 * the module surface.
 */
import { Image } from 'expo-image';

export async function clearImageCachesOnSignOut(): Promise<void> {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}

/**
 * Warm the disk cache for a list of remote URIs. Failures are swallowed
 * (network may be flaky) — a missing prefetch only means the image will
 * load slightly slower the first time it is rendered.
 */
export async function prefetchImages(
  urls: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const valid = urls.filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  if (valid.length === 0) return;
  try {
    await Image.prefetch(valid, 'disk');
  } catch {
    // Best-effort — prefetch failures should not surface to callers.
  }
}
