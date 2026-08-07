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
  });
});
