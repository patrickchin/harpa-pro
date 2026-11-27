import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..');
const read = (path: string) => readFileSync(resolve(srcRoot, path), 'utf8');

function lossyWebpSize(path: string): string {
  const webp = readFileSync(resolve(srcRoot, path));
  expect(webp.toString('ascii', 12, 16)).toBe('VP8 ');
  return `${webp.readUInt16LE(26) & 0x3fff}x${webp.readUInt16LE(28) & 0x3fff}`;
}

describe('site image performance', () => {
  it('ships a pre-cropped product example instead of a 300vw CSS crop', () => {
    const evidence = read('components/procurement/ProcurementEvidence.astro');

    expect(evidence).not.toContain('300vw');
    expect(evidence).not.toMatch(/w-\[300%\]/);
    expect(evidence).toContain('rongshuo-shower-p02-sw011.webp');
    expect(
      lossyWebpSize('assets/procurement/factories/catalogues/rongshuo-shower-p02-sw011.webp'),
    ).toBe('754x471');
    for (const match of evidence.matchAll(/widths=\{\[([^\]]+)\]\}/g)) {
      const widths = (match[1] ?? '').split(',').map(Number);
      expect(Math.max(...widths), match[0]).toBeLessThanOrEqual(1200);
    }
  });

  it('ships a pre-cropped AIS factory photo instead of a CSS scale crop', () => {
    expect(lossyWebpSize('assets/procurement/factories/ais-factory-exterior-photo.webp')).toBe(
      '871x478',
    );
    for (const path of [
      'components/procurement/ProcurementEvidence.astro',
      'components/procurement/ProcurementConsiderations.astro',
    ]) {
      const source = read(path);
      expect(source, path).toContain('ais-factory-exterior-photo.webp');
      expect(source, path).not.toContain('ais-factory-exterior.webp"');
      expect(source, path).not.toMatch(/scale-\[/);
      expect(source, path).not.toContain('embedded-caption');
    }
  });

  it('opens lightboxes on optimised derivatives, never the original source file', () => {
    const helper = read('lib/lightbox-image.ts');
    const maxWidth = Number(helper.match(/LIGHTBOX_MAX_WIDTH = (\d+)/)?.[1]);
    expect(maxWidth).toBeGreaterThanOrEqual(1600);
    expect(maxWidth).toBeLessThanOrEqual(2000);
    expect(helper).toContain("format: 'webp'");

    for (const path of [
      'components/procurement/ProcurementConsiderations.astro',
      'components/procurement/FactoryDocumentGrid.astro',
    ]) {
      const source = read(path);
      expect(source, path).toContain('lightboxImage(');
      expect(source, path).not.toMatch(/data-evidence-image-src=\{[^}]*\.image\.src\}/);
    }

    const guideMedia = read('components/reports/docs/GuideStepMedia.astro');
    expect(guideMedia).toContain('lightboxImage(');
    expect(guideMedia).not.toMatch(/(href|data-docs-screenshot-src)=\{image\.src\}/);
  });

  it('keeps the progressive preview to full swap in both lightboxes', () => {
    expect(read('components/procurement/EvidenceImageDialog.astro')).toContain(
      'evidenceImageState = hasPreview ? "preview" : "full"',
    );
    expect(read('components/reports/docs/DocsScreenshotDialog.astro')).toContain(
      'docsScreenshotState = hasPreview ? "preview" : "full"',
    );
  });
});
