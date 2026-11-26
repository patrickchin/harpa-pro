import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import woodInteriorImg from "../../assets/procurement/finishes/wood.webp";

/** The 1200x630 PNG social card that procurement pages build from interior imagery. */
export function getProcurementSocialImage(src: ImageMetadata = woodInteriorImg) {
  return getImage({ src, width: 1200, height: 630, format: "png" });
}
