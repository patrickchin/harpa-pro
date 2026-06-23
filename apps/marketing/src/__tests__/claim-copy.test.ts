import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..');

function readSource(path: string): string {
  return readFileSync(resolve(srcRoot, path), 'utf8');
}

describe('marketing claim copy', () => {
  it('does not publish stale or overbroad audited claims', () => {
    const files = [
      'components/landing/Hero.astro',
      'components/landing/HowItWorks.astro',
      'content/faq/02-offline.mdx',
      'content/faq/03-voice-privacy.mdx',
      'content/faq/04-when.mdx',
      'content/roadmap/01-android-pilot.mdx',
      'pages/confirm.astro',
    ];

    const corpus = files.map((file) => readSource(file)).join('\n');

    expect(corpus).not.toContain('24 hours');
    expect(corpus).not.toContain('No. Captures');
    expect(corpus).not.toContain('do not sell or share captures');
    expect(corpus).not.toContain('React Native, so');
    expect(corpus).not.toContain('React Native means');
    expect(corpus).not.toContain('both ship together');
    expect(corpus).not.toContain('AI report analysis');
    expect(corpus).not.toContain('No end-of-day paperwork');
    expect(corpus).not.toContain('Works in gloves and noise');
    expect(corpus).not.toContain('Analyze across jobs');
    expect(corpus).not.toContain('money across sites');
  });
});
