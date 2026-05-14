/**
 * Generates mobile app icon PNGs from the brand SVG.
 *
 * Run from repo root: `node scripts/gen-icons.mjs`
 * Re-run whenever the brand SVG changes.
 *
 * Outputs (all 1024x1024 except favicon which is 48):
 *  - apps/mobile/assets/icon.png          iOS icon (no alpha, flattened on accent)
 *  - apps/mobile/assets/adaptive-icon.png Android foreground (transparent bg)
 *  - apps/mobile/assets/splash-icon.png   Splash foreground (transparent bg)
 *  - apps/mobile/assets/favicon.png       Web favicon (48x48, flattened)
 *
 * Colors are pulled from --accent / --primary in
 * apps/marketing/src/styles/globals.css.
 */
import sharp from 'sharp';

const ACCENT = '#e55d22';   // oklch(0.646 0.182 41) — site --accent
const WHITE = '#ffffff';

const fullIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${ACCENT}" />
  <rect x="28.5" y="60.5" width="25" height="15" fill="${WHITE}" rx="2" />
  <rect x="28.5" y="42.5" width="25" height="15" fill="${WHITE}" rx="2" />
  <rect x="56.5" y="60.5" width="15" height="15" fill="${WHITE}" rx="2" />
  <rect x="28.5" y="24.5" width="15" height="15" fill="${WHITE}" rx="2" />
</svg>`;

// Android adaptive foreground: blocks only, transparent bg.
// Block cluster bbox: x 28.5–71.5, y 24.5–75.5 (43w x 51h). Already centered.
// Fits within the launcher safe zone (inner 66% of canvas) with margin.
const adaptiveFgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="28.5" y="60.5" width="25" height="15" fill="${WHITE}" rx="2" />
  <rect x="28.5" y="42.5" width="25" height="15" fill="${WHITE}" rx="2" />
  <rect x="56.5" y="60.5" width="15" height="15" fill="${WHITE}" rx="2" />
  <rect x="28.5" y="24.5" width="15" height="15" fill="${WHITE}" rx="2" />
</svg>`;

const out = 'apps/mobile/assets';

async function render(svg, path, size, opts = {}) {
  let img = sharp(Buffer.from(svg)).resize(size, size, {
    fit: 'contain',
    background: opts.bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (opts.flatten) img = img.flatten({ background: opts.flatten });
  await img.png().toFile(`${out}/${path}`);
  console.log(`wrote ${out}/${path}`);
}

await render(fullIconSvg, 'icon.png', 1024, { flatten: ACCENT });
await render(adaptiveFgSvg, 'adaptive-icon.png', 1024);
await render(adaptiveFgSvg, 'splash-icon.png', 1024);
await render(fullIconSvg, 'favicon.png', 48, { flatten: ACCENT });
