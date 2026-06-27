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

import WaitlistFormIsland, { LAUNCH_UPDATE_SOURCE } from './WaitlistFormIsland';

describe('WaitlistFormIsland', () => {
  it('collects email and optional launch-update details only', () => {
    const html = renderToStaticMarkup(<WaitlistFormIsland />);

    expect(html).toContain('Email');
    expect(html).not.toContain('Work email');
    expect(html).not.toContain('<select');
    expect(html).toContain('About your work');
    expect(html).toContain(
      'Company, role, jobsite type, or current reporting setup are all optional.',
    );
    expect(html).toContain('Get launch update');
    expect(html).not.toContain(
      'Tell us about your work and what you want Harpa Pro to help with',
    );
  });

  it('tags submissions as iOS App Review launch updates', () => {
    expect(LAUNCH_UPDATE_SOURCE).toBe('ios-app-review-launch-update');
  });
});
