import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: () => <div data-testid="turnstile" />,
}));

vi.mock('../../lib/env', () => ({
  getPublicEnv: () => ({
    apiBaseUrl: 'https://api.example.test',
    turnstileSiteKey: 'test-site-key',
  }),
}));

import WaitlistFormIsland from './WaitlistFormIsland';

describe('WaitlistFormIsland', () => {
  it('collects email and optional broad product-update details only', () => {
    const html = renderToStaticMarkup(<WaitlistFormIsland />);

    expect(html).toContain('Email');
    expect(html).not.toContain('Work email');
    expect(html).not.toContain('Company');
    expect(html).not.toContain('<select');
    expect(html).toContain('About your work');
    expect(html).toContain(
      'Android, web, team rollout, or reporting pain points are all optional.',
    );
    expect(html).toContain('Get updates →');
    expect(html).not.toContain(
      'Tell us about your work and what you want Harpa Pro to help with',
    );
  });
});
