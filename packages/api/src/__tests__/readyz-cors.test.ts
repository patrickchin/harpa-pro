import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const ADMIN_ORIGIN = 'http://localhost:3102';

describe('GET /readyz admin CORS', () => {
  it('allows only the configured admin origin to read the readiness probe', async () => {
    const app = createApp();
    const allowed = await app.request('/readyz', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'GET',
      },
    });
    const rejected = await app.request('/readyz', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(allowed.headers.get('access-control-allow-methods')).toContain('GET');
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });
});
