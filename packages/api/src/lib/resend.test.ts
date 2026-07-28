import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'development',
    RESEND_LIVE: '0',
  },
}));

import {
  createResendClient,
  getFakeResendSends,
  resetFakeResendSends,
} from './resend.js';

beforeEach(() => {
  resetFakeResendSends();
  vi.restoreAllMocks();
});

describe('fake Resend diagnostics', () => {
  it('logs delivery metadata without message or recipient secrets', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const email = 'private.person+preview@buildco.example';
    const otp = '918273';
    const token = 'RAW_CONFIRMATION_TOKEN_SENTINEL';
    const url = `https://harpapro.com/confirm?token=${token}`;
    const bodySentinel = 'PRIVATE_RENDERED_EMAIL_BODY_SENTINEL';
    const params = {
      to: email,
      subject: 'Confirm your Harpa Pro product updates',
      html: `<p>${bodySentinel}</p><a href="${url}">Confirm</a>`,
      text: `${bodySentinel}\nOTP: ${otp}\n${url}`,
    };

    const result = await createResendClient().send(params);

    const output = [...logSpy.mock.calls, ...infoSpy.mock.calls].flat().join(' ');
    expect(output).not.toContain(email);
    expect(output).not.toContain(otp);
    expect(output).not.toContain(token);
    expect(output).not.toContain(url);
    expect(output).not.toContain(bodySentinel);
    expect(output).toContain('fake_resend_send');
    expect(output).toContain('buildco.example');

    expect(result.id).toBe('fake-1');
    expect(getFakeResendSends()).toEqual([params]);
  });
});
