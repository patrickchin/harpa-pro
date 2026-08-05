import { describe, expect, it } from 'vitest';

import { cookieAttributesForAuthUrl } from './auth.js';

describe('dashboard session cookie attributes', () => {
  it('allows HTTPS dashboard previews to keep a partitioned cross-site session', () => {
    expect(cookieAttributesForAuthUrl('https://api.example.com')).toEqual({
      httpOnly: true,
      partitioned: true,
      sameSite: 'none',
      secure: true,
    });
  });

  it('keeps local HTTP development cookies usable', () => {
    expect(cookieAttributesForAuthUrl('http://localhost:8787')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
  });
});
