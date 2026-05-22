/**
 * `pickAndEnqueueGalleryImages` — single entry point for the gallery
 * attachment sheet.
 *
 *   request permission → launchImageLibraryAsync (multi-select) →
 *   enqueueCameraUris → return per-URI settlement
 *
 * The route caller drives the user-facing error surface (the report
 * generate screen's `uploadError` banner) — this helper resolves a
 * structured result so the caller can format messages once.
 *
 * Pitfall 13: callers must pass the **real** `enqueueCameraUris` from
 * `useCameraUploads()`. The helper exists to keep `generate.tsx` thin,
 * not to introduce a DI seam — `expo-image-picker` is the project-wide
 * default in `vitest.setup.ts`.
 */
import type { UploadResult } from '@/lib/uploads/types';

export type PickAndEnqueueOutcome =
  | { kind: 'permission-denied' }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | {
      kind: 'enqueued';
      total: number;
      results: ReadonlyArray<PromiseSettledResult<UploadResult>>;
    };

export interface PickAndEnqueueOptions {
  reportId: string;
  enqueueCameraUris: (
    uris: ReadonlyArray<string>,
    opts: { reportId: string },
  ) => Promise<ReadonlyArray<PromiseSettledResult<UploadResult>>>;
}

export async function pickAndEnqueueGalleryImages(
  options: PickAndEnqueueOptions,
): Promise<PickAndEnqueueOutcome> {
  const ImagePicker = await import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { kind: 'permission-denied' };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes:
      (ImagePicker as { MediaType?: { Images: 'images' } }).MediaType?.Images ??
      'images',
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (result.canceled) return { kind: 'cancelled' };
  const uris = result.assets
    .map((a) => a.uri)
    .filter((u): u is string => Boolean(u));
  if (uris.length === 0) return { kind: 'empty' };
  const results = await options.enqueueCameraUris(uris, {
    reportId: options.reportId,
  });
  return { kind: 'enqueued', total: uris.length, results };
}
