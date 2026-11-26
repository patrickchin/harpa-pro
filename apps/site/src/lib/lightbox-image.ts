import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

export const LIGHTBOX_MAX_WIDTH = 1800;
export const LIGHTBOX_QUALITY = 85;

export interface LightboxImage {
  src: string;
  width: number;
  height: number;
}

/**
 * Optimised full-view derivative for lightboxes, so dialogs never ship the
 * original source file (docs PNGs are ~1 MB each).
 */
export async function lightboxImage(image: ImageMetadata): Promise<LightboxImage> {
  const width = Math.min(image.width, LIGHTBOX_MAX_WIDTH);
  const full = await getImage({
    src: image,
    width,
    format: 'webp',
    quality: LIGHTBOX_QUALITY,
  });

  return {
    src: full.src,
    width: Number(full.attributes.width ?? width),
    height: Number(
      full.attributes.height ?? Math.round((image.height * width) / image.width),
    ),
  };
}
