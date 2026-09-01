import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('documentation screenshot dialog', () => {
  it('leaves panel sizing to CSS', () => {
    const component = readFileSync(
      resolve(here, '../components/docs/DocsScreenshotDialog.astro'),
      'utf8',
    );

    expect(component).not.toContain('getBoundingClientRect');
    expect(component).not.toContain('getComputedStyle');
    expect(component).not.toContain('.style.width');
    expect(component).not.toContain('removeProperty("width")');
    expect(component).not.toContain('setProperty("width")');
  });

  it('keeps every registered screenshot on the shared portrait ratio', () => {
    const registry = readFileSync(
      resolve(here, '../lib/docs-screenshots.ts'),
      'utf8',
    );
    const imagePaths = [
      ...registry.matchAll(/from ['"](\.\.\/assets\/docs\/[^'"]+\.png)['"]/g),
    ].flatMap((match) => (match[1] ? [match[1]] : []));

    expect(imagePaths).not.toHaveLength(0);
    for (const imagePath of imagePaths) {
      const png = readFileSync(resolve(here, '../lib', imagePath));
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(
        '1290x2796',
      );
    }
  });
});
