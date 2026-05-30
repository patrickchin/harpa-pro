/**
 * `processImageForUpload` — downscale + re-encode a captured/picked
 * image so we never present > 50 MB blobs to the presign endpoint
 * (the API enforces ≤ 50 MB and a SigV4-signed PUT cannot retry past
 * a Content-Length mismatch).
 *
 * Locked-in policy (`docs/v4/plan-camera-upload-pipeline.md`):
 *   - Longest edge ≤ 2048 px.
 *   - JPEG, starting quality 0.85.
 *   - Iterate quality down (0.85 → 0.7 → 0.55 → 0.4) and width down
 *     (×0.85 per pass after quality bottoms out) until the encoded
 *     blob is ≤ 2 MB or we hit ~6 passes. We never re-upscale, and
 *     we never compress below quality 0.4 / 768 px — at that point we
 *     accept the result regardless of size, because further compression
 *     destroys legibility on the report PDF.
 *   - Hard guard: if the final size is still > 50 MB (the server
 *     ceiling) we throw rather than enqueue a doomed presign.
 *
 * EXIF is stripped by `expo-image-manipulator`'s re-encode pass (it
 * only preserves orientation), which is the privacy-respecting
 * default we want for user-supplied photos.
 *
 * Test seam: the deps interface lets tests inject a fake manipulator
 * that returns a known size + uri without writing to disk. The
 * default wiring (Pitfall 13) is exercised by
 * `process-image.integration.test.ts` using the project-wide
 * `expo-image-manipulator` mock and `expo-file-system` `File` size
 * stub.
 */
import { File as FsFile } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

export const MAX_BYTES = 2 * 1024 * 1024;
export const SERVER_MAX_BYTES = 50 * 1024 * 1024;
export const MAX_DIMENSION = 2048;
export const MIN_DIMENSION = 768;
export const QUALITY_LADDER = [0.85, 0.7, 0.55, 0.4] as const;
export const SHRINK_FACTOR = 0.85;
export const MAX_PASSES = 6;

/**
 * Thumbnail-grid feature: render every photo as a small square tile
 * outside the fullscreen preview. We re-encode the source image once
 * at upload time into a tiny square JPEG so the grid surfaces fetch
 * ~50 KB instead of the full ~2 MB image. The thumbnail is uploaded
 * as a paired R2 object alongside the full image — see
 * `apps/mobile/lib/uploads/run-upload.ts` for the dual-pipeline flow
 * and `packages/api/migrations/0009_notes_thumbnail_file_id.sql` for
 * the persistence column.
 *
 * Center-cropped to a square then resized so portrait + landscape
 * originals both yield a uniform grid tile. EXIF is stripped by the
 * `expo-image-manipulator` re-encode.
 */
export const THUMBNAIL_DIMENSION = 256;
export const THUMBNAIL_QUALITY = 0.7;

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ProcessImageDeps {
  manipulate: (
    uri: string,
    actions: ImageManipulator.Action[],
    options: ImageManipulator.SaveOptions,
  ) => Promise<{ uri: string; width: number; height: number }>;
  statSize: (uri: string) => number;
}

export const defaultProcessImageDeps: ProcessImageDeps = {
  manipulate: (uri, actions, options) =>
    ImageManipulator.manipulateAsync(uri, actions, options),
  statSize: (uri) => {
    const size = new FsFile(uri).size;
    if (typeof size !== 'number' || size <= 0) {
      throw new Error(`processImageForUpload: cannot stat ${uri}`);
    }
    return size;
  },
};

interface PassPlan {
  width: number;
  quality: number;
}

function planPasses(): PassPlan[] {
  const plan: PassPlan[] = [];
  let width = MAX_DIMENSION;
  for (const quality of QUALITY_LADDER) {
    plan.push({ width, quality });
  }
  // Once quality bottoms out, shrink width by SHRINK_FACTOR per pass
  // while still ≥ MIN_DIMENSION.
  while (plan.length < MAX_PASSES) {
    width = Math.max(MIN_DIMENSION, Math.round(width * SHRINK_FACTOR));
    plan.push({ width, quality: QUALITY_LADDER[QUALITY_LADDER.length - 1]! });
    if (width <= MIN_DIMENSION) break;
  }
  return plan;
}

export async function processImageForUpload(
  inputUri: string,
  deps: ProcessImageDeps = defaultProcessImageDeps,
): Promise<ProcessedImage> {
  const passes = planPasses();
  let best: ProcessedImage | null = null;

  for (const { width, quality } of passes) {
    const out = await deps.manipulate(
      inputUri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    const sizeBytes = deps.statSize(out.uri);
    const candidate: ProcessedImage = {
      uri: out.uri,
      width: out.width,
      height: out.height,
      sizeBytes,
    };
    best = candidate;
    if (sizeBytes <= MAX_BYTES) {
      return candidate;
    }
  }

  // We ran out of passes — return the smallest result, but enforce the
  // server's hard ceiling. The queue would otherwise eat a 413 from
  // the API and burn the retry budget.
  if (!best) {
    throw new Error('processImageForUpload: no passes ran');
  }
  if (best.sizeBytes > SERVER_MAX_BYTES) {
    throw new Error(
      `processImageForUpload: ${best.sizeBytes} bytes exceeds 50 MB ` +
        `server limit even after compression`,
    );
  }
  return best;
}

/**
 * Generate a small square thumbnail for grid rendering.
 *
 * Single pass: ask `expo-image-manipulator` to read the source image,
 * report its real dimensions (we cannot trust caller-supplied
 * metadata — gallery picks may not have it), center-crop to a square,
 * then resize to `THUMBNAIL_DIMENSION` and encode JPEG at
 * `THUMBNAIL_QUALITY`. At 256 px / q=0.7 typical output is 15–40 KB,
 * well under the size we'd ever push back into the queue.
 *
 * The deps interface matches `processImageForUpload` so tests can
 * inject the same fake manipulator. Default wiring is exercised by
 * the integration test alongside the main image processor (Pitfall 13).
 */
export async function processImageThumbnail(
  inputUri: string,
  deps: ProcessImageDeps = defaultProcessImageDeps,
): Promise<ProcessedImage> {
  // First read the image's real dimensions by running a no-op
  // manipulate (the result includes width + height). Cheap because
  // `expo-image-manipulator` decodes once even for an empty action list.
  const probe = await deps.manipulate(inputUri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const side = Math.min(probe.width, probe.height);
  const originX = Math.max(0, Math.round((probe.width - side) / 2));
  const originY = Math.max(0, Math.round((probe.height - side) / 2));

  const out = await deps.manipulate(
    inputUri,
    [
      { crop: { originX, originY, width: side, height: side } },
      { resize: { width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION } },
    ],
    {
      compress: THUMBNAIL_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  const sizeBytes = deps.statSize(out.uri);
  return {
    uri: out.uri,
    width: out.width,
    height: out.height,
    sizeBytes,
  };
}
