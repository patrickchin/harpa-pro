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
      'components/procurement/ProcurementEvidence.astro',
      'components/site/Header.astro',
      'components/reports/Features.astro',
      'components/reports/WaitlistForm.astro',
      'components/reports/WaitlistFormIsland.tsx',
      'components/reports/VoiceDemo.tsx',
      'components/reports/HowItWorks.astro',
      'content/reports/features/04-exports.mdx',
      'content/reports/features/05-jobsite.mdx',
      'content/reports/features/06-drafts.mdx',
      'content/reports/faq/02-offline.mdx',
      'content/reports/faq/03-voice-privacy.mdx',
      'content/reports/faq/04-when.mdx',
      'content/reports/faq/05-cost.mdx',
      'content/reports/roadmap/00-ai-reports.mdx',
      'content/reports/roadmap/01-android-pilot.mdx',
      'content.config.ts',
      'layouts/Layout.astro',
      'pages/index.astro',
      'pages/reports/index.astro',
      'pages/reports/confirm.astro',
      'pages/reports/roadmap.astro',
      'lib/reports/links.ts',
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
    expect(corpus).not.toContain('Join waitlist');
    expect(corpus).not.toContain('Join the waitlist');
    expect(corpus).not.toContain('Get Harpa Pro before everyone else');
    expect(corpus).not.toContain('early-access list');
    expect(corpus).not.toContain('try the beta');
    expect(corpus).not.toContain('Real live demo coming soon');
    expect(corpus).not.toContain('App Store review');
    expect(corpus).not.toContain('submitted to the App Store');
    expect(corpus).not.toContain('when iOS opens');
    expect(corpus).not.toContain('launch update');
    expect(corpus).not.toMatch(/now available for iPhone/i);
    expect(corpus).not.toMatch(/iPhone app is live/i);
    expect(corpus).not.toMatch(/first iPhone release/i);
    expect(corpus).not.toMatch(/after the iPhone launch/i);
    expect(corpus).not.toMatch(/core iPhone workflow/i);
    expect(corpus).not.toContain('Download iOS app');
    expect(corpus).not.toMatch(/immediately generate/i);
    expect(corpus).not.toMatch(/you approve/i);
    expect(corpus).not.toMatch(/glove-friendly|without taking off your gloves/i);
    expect(corpus).not.toContain('no formatting work');
    expect(corpus).not.toContain('status: z.enum(["pilot", "later"])');
    expect(corpus).not.toContain('status: "pilot"');
    expect(corpus).not.toContain('status: "later"');
    expect(corpus).toContain('https://apps.apple.com/us/app/harpa-pro/id6776759817');
    expect(corpus).toContain('Get the app');
    expect(corpus).toContain('Product updates');
  });
});
